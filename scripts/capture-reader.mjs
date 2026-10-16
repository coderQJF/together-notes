import { spawn } from 'node:child_process'
import { cp, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import WebSocket from 'ws'
import { createApp } from '../server/index.mjs'
import { parseNovelChapters, NOVEL_PARSER_VERSION } from '../server/novel-chapters.mjs'

// Isolate App-only routes in a browser QA build; production routing is untouched.
const output = resolve('artifacts/reader-audit')
await mkdir(output, { recursive: true })
const root = await mkdtemp(join(output, 'run-'))
await Promise.all(['index.html', 'vite.config.ts', 'package.json'].map(file => cp(resolve(file), join(root, file))))
const input = join(root, 'src')
await cp(resolve('src'), input, { recursive: true, filter: path => !path.includes('emulatorjs') })
await mkdir(join(root, 'server'))
await cp(resolve('server/novel-chapters.mjs'), join(root, 'server/novel-chapters.mjs'))
const pages = await readFile(join(input, 'pages.json'), 'utf8')
await writeFile(join(input, 'pages.json'), pages.replace('// #ifdef APP-PLUS', '// #ifdef H5'))
const publicDir = process.env.QA_READER_PUBLIC_DIR || join(root, 'h5')
if (!process.env.QA_READER_PUBLIC_DIR) await new Promise((done, reject) => {
  const build = spawn(process.execPath, [resolve('node_modules/@dcloudio/vite-plugin-uni/bin/uni.js'), 'build'], {
    windowsHide: true, stdio: 'inherit', cwd: root,
    env: { ...process.env, VITE_ROOT_DIR: root, UNI_INPUT_DIR: input, UNI_OUTPUT_DIR: publicDir, VITE_API_BASE: '/api' },
  })
  build.on('error', reject)
  build.on('exit', code => code === 0 ? done() : reject(new Error(`Reader QA build failed: ${code}`)))
})

const app = createApp({ dbPath: ':memory:', testAuth: true, publicDir })
await new Promise(done => app.server.listen(0, '127.0.0.1', done))
const base = `http://127.0.0.1:${app.server.address().port}`
const auth = await (await fetch(base + '/api/auth/test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: '我' }) })).json()
const source = process.env.QA_READER_TXT ? await readFile(process.env.QA_READER_TXT, 'utf8')
  : '题词。\n序 章\n开始。\n第一幕\n' + Array.from({ length: 400 }, (_, index) => `第${index}段，向下滑动后应能继续阅读。`).join('\n') + '\n第二幕\n结束。'
const parsed = parseNovelChapters(source)
const now = new Date().toISOString()
const book = { id: 'qa-reader', title: '长篇 TXT 阅读检查', author: 'QA', chapters: parsed, createdAt: now, updatedAt: now, progress: { chapterIndex: 0, scrollTop: 0, updatedAt: now }, parserVersion: NOVEL_PARSER_VERSION }
const twoChapters = { ...book, id: 'qa-two', title: '仅两章的长正文', chapters: [{ title: '第一章', content: Array.from({ length: 150 }, (_, index) => `第${index}段。这是只有两个目录项时仍然可以向下阅读的长正文。`).join('\n') }, { title: '尾声', content: '结束。' }] }
const port = Number(process.env.CDP_PORT || 9234)
const browser = spawn(process.env.EDGE_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', ['--headless=new', '--disable-gpu', `--remote-debugging-port=${port}`, `--user-data-dir=${join(root, 'profile')}`, '--no-first-run', 'about:blank'], { windowsHide: true, stdio: 'ignore' })
const wait = ms => new Promise(done => setTimeout(done, ms))
let socket
try {
  let target
  for (let attempt = 0; attempt < 60; attempt++) {
    try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find(item => item.type === 'page'); if (target) break } catch {}
    await wait(150)
  }
  if (!target) throw new Error('Unable to open QA browser')
  socket = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise(done => socket.once('open', done))
  let id = 0
  const pending = new Map()
  socket.on('message', raw => { const message = JSON.parse(String(raw)); if (!message.id) return; const job = pending.get(message.id); pending.delete(message.id); message.error ? job.reject(new Error(message.error.message)) : job.done(message.result) })
  const call = (method, params = {}) => new Promise((done, reject) => { const next = ++id; pending.set(next, { done, reject }); socket.send(JSON.stringify({ id: next, method, params })) })
  const swipeUp = async width => {
    await call('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: width / 2, y: 650 }] })
    for (let y = 625; y >= 200; y -= 25) {
      await call('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: width / 2, y }] })
      await wait(20)
    }
    await call('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  }
  const evaluate = async expression => (await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result.value
  const until = async expression => { for (let i = 0; i < 70; i++) { if (await evaluate(expression)) return; await wait(100) } throw new Error(`Reader QA timed out: ${expression}\n${await evaluate('document.body.innerText')}`) }
  const click = selector => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`)
  const capture = async name => { const shot = await call('Page.captureScreenshot', { format: 'png' }); await writeFile(join(output, name + '.png'), Buffer.from(shot.data, 'base64')) }
  await call('Page.enable')
  await call('Page.navigate', { url: base })
  await wait(700)
  await evaluate(`localStorage.setItem('session', ${JSON.stringify(auth.token)});localStorage.setItem('reader-library-v1', JSON.stringify({type:'object',data:${JSON.stringify([book, twoChapters])}}))`)
  const report = []
  for (const width of [320, 390, 430]) {
    await call('Emulation.setDeviceMetricsOverride', { width, height: 844, deviceScaleFactor: 1, mobile: true })
    await call('Emulation.setTouchEmulationEnabled', { enabled: true })
    for (const current of [book, twoChapters]) {
      const index = current === book ? current.chapters.findIndex(chapter => chapter.content.length > 1000) : 0
      if (index < 0) throw new Error('Fixture needs a long chapter')
      await evaluate(`localStorage.setItem('reader-progress-v1',JSON.stringify({type:'object',data:{${JSON.stringify(current.id)}:{chapterIndex:${index},scrollTop:0,updatedAt:${JSON.stringify(now)}}}}))`)
      await call('Page.navigate', { url: base + '/?qa=' + width + current.id + '#/pages/reader/reader?id=' + current.id })
      await until(`Boolean(document.querySelector('.reader-copy'))`)
      await wait(400)
      await capture(`${width}-${current.id}-top`)
      await swipeUp(width)
      if (await evaluate('Math.max(window.scrollY,document.body.scrollTop)') < 100) throw new Error('Long chapter does not scroll before opening sheets')
      await evaluate('window.scrollTo(0,0);document.body.scrollTop=0')
      await wait(300)
      await click('.reading-surface')
      await click('[aria-label="打开目录"]')
      await until(`Boolean(document.querySelector('.directory-sheet'))`)
      await capture(`${width}-${current.id}-directory`)
      const before = await evaluate('Math.max(window.scrollY, document.body.scrollTop)')
      await swipeUp(width)
      await wait(300)
      const locked = await evaluate('Math.max(window.scrollY, document.body.scrollTop)')
      if (Math.abs(locked - before) > 1) throw new Error('Directory moved the underlying reading page')
      await click('[aria-label="关闭目录"]')
      await click('[aria-label="打开阅读设置"]')
      await until(`Boolean(document.querySelector('.settings-sheet'))`)
      await click('[aria-label="关闭阅读设置"]')
      await until(`!document.querySelector('.sheet-layer')`)
      await wait(250)
      await swipeUp(width)
      await wait(400)
      const after = await evaluate('Math.max(window.scrollY, document.body.scrollTop)')
      if (after < before + 100) {
        await capture(`${width}-${current.id}-failed-scroll`)
        console.log(await evaluate(`JSON.stringify([...document.querySelectorAll('html,body,uni-page,uni-page-wrapper,uni-page-body,.shell,.reading-surface')].map(node=>({tag:node.tagName,cls:node.className,style:node.getAttribute('style'),height:node.getBoundingClientRect().height,overflow:getComputedStyle(node).overflow,touch:getComputedStyle(node).touchAction,scroll:node.scrollHeight})))`))
        throw new Error(`Reading remains locked after closing sheets at ${width}px: ${after}`)
      }
      await click('.reading-surface')
      await until(`!document.querySelector('.reader-chrome')`)
      await capture(`${width}-${current.id}-scrolled`)
      await evaluate('window.scrollTo(0,document.documentElement.scrollHeight);document.body.scrollTop=document.body.scrollHeight')
      await wait(350)
      await capture(`${width}-${current.id}-bottom`)
      const metrics = await evaluate(`({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,scrollTop:Math.max(window.scrollY,document.body.scrollTop),height:document.documentElement.scrollHeight,bottomVisible:document.querySelector('.tap-hint').getBoundingClientRect().bottom <= innerHeight})`)
      if (metrics.scrollWidth > width || !metrics.bottomVisible) throw new Error('Reader overflow or inaccessible ending: ' + JSON.stringify(metrics))
      report.push({ fixture: current.id, ...metrics })
    }
  }
  await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2))
  console.log('Reader scroll, sheet recovery and bottom access passed at 320/390/430px')
} finally {
  socket?.close()
  browser.kill()
  await new Promise(done => app.server.close(done))
  app.db.close()
}
