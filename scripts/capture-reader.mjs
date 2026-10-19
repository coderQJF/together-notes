import { spawn } from 'node:child_process'
import { cp, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import WebSocket from 'ws'
import { createApp } from '../server/index.mjs'
import { parseNovelChapters, NOVEL_PARSER_VERSION } from '../server/novel-chapters.mjs'

// Reader routes are App-only. Expose them only in this isolated browser build.
const output = resolve('artifacts/reader-audit')
await mkdir(output, { recursive: true })
const root = await mkdtemp(join(output, 'run-'))
await Promise.all(['index.html', 'vite.config.ts', 'package.json'].map(file => cp(resolve(file), join(root, file))))
const input = join(root, 'src')
await cp(resolve('src'), input, { recursive: true, filter: path => !path.includes('emulatorjs') })
await mkdir(join(root, 'server'))
await cp(resolve('server/novel-chapters.mjs'), join(root, 'server/novel-chapters.mjs'))
const pageConfig = await readFile(join(input, 'pages.json'), 'utf8')
await writeFile(join(input, 'pages.json'), pageConfig.replace('// #ifdef APP-PLUS', '// #ifdef H5'))
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
  : '题词。\n序 章\n开始。\n第一幕\n' + Array.from({ length: 400 }, (_, index) => `第${index}段，左右翻页后应能继续阅读。When you feel most lonely, the door opens.\n\n\n`).join('\n') + '\n第二幕\n结束。'
const parsed = parseNovelChapters(source)
const now = new Date().toISOString()
const longTitle = '龙族旧版全套 共七册（不含龙五）这是一段用于检查书名不会挤压操作按钮的超长标题'
const book = { id: 'qa-reader', title: longTitle, author: '江南', chapters: parsed, createdAt: now, updatedAt: now, progress: { chapterIndex: 0, scrollTop: 0, updatedAt: now }, parserVersion: NOVEL_PARSER_VERSION }
const twoChapters = { ...book, id: 'qa-two', title: '仅两章的长正文', chapters: [{ title: '第一章 这是一段很长的章节标题用于检查顶部胶囊省略和操作按钮边界', content: Array.from({ length: 150 }, (_, index) => `第${index}段。这是只有两个目录项时仍然可以左右翻页的长正文。\tMixed English + 中文，所有文字都应该留在当前页内。`).join('\n\n\n') }, { title: '尾声', content: '结束。' }] }
const directoryBook = { ...book, id: 'qa-directory', title: longTitle, chapters: Array.from({ length: 25 }, (_, index) => ({ title: `第${index + 1}章 目录内滚动与十章分页检查`, content: '章节正文。' })) }
const insertNovel = app.db.prepare('INSERT INTO novels(id,title,author,filename,content,published,created_at,updated_at) VALUES(?,?,?,?,?,1,?,?)')
for (const [id, title] of [['long-cloud', longTitle], ['short-cloud', '龙族I']]) insertNovel.run(id, title, '江南', title + '.txt', '第一章\n测试正文。', Date.now(), Date.now())
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
  const evaluate = async expression => {
    const result = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text + ': ' + expression)
    return result.result.value
  }
  const until = async expression => { for (let i = 0; i < 80; i++) { if (await evaluate(expression)) return; await wait(100) } throw new Error(`Reader QA timed out: ${expression}\n${await evaluate('document.body.innerText')}`) }
  const click = selector => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`)
  const capture = async name => { const shot = await call('Page.captureScreenshot', { format: 'png' }); await writeFile(join(output, name + '.png'), Buffer.from(shot.data, 'base64')) }
  const store = (key, value) => evaluate(`localStorage.setItem(${JSON.stringify(key)},JSON.stringify({type:'object',data:${JSON.stringify(value)}}))`)
  const swipe = async (x1, y1, x2, y2) => {
    await call('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x1, y: y1 }] })
    for (let step = 1; step <= 12; step++) {
      await call('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x1 + (x2 - x1) * step / 12, y: y1 + (y2 - y1) * step / 12 }] })
      await wait(18)
    }
    await call('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await wait(400)
  }
  const leaf = '.reader-leaf:not(.reader-leaf-preview)'
  const offset = () => evaluate(`Number(document.querySelector(${JSON.stringify(leaf)}).dataset.start)`)
  const pageMetrics = () => evaluate(`(()=>{const leaf=document.querySelector(${JSON.stringify(leaf)}),viewport=document.querySelector('.reader-page-viewport').getBoundingClientRect(),lines=[...leaf.querySelectorAll('.reader-line')];return {start:Number(leaf.dataset.start),end:Number(leaf.dataset.end),page:Number(leaf.dataset.page),count:Number(leaf.dataset.pages),bottom:Math.max(...lines.map(line=>line.getBoundingClientRect().bottom)),viewportBottom:viewport.bottom,viewportTop:viewport.top,lines:lines.length,overflow:lines.some(line=>{const range=document.createRange();range.selectNodeContents(line);return range.getBoundingClientRect().right>viewport.right+1}),bodyScroll:Math.max(scrollY,document.body.scrollTop),scrollWidth:document.documentElement.scrollWidth}})()`)
  const assertPage = async (current, width) => {
    const metrics = await pageMetrics()
    const rendered = await evaluate(`[...document.querySelector(${JSON.stringify(leaf)}).querySelectorAll('.reader-line')].map(line=>line.textContent).join('')`)
    const content = current.chapters[await evaluate('Number(document.querySelector(".reader-meta").textContent.match(/第 (\\d+)/)[1])-1')].content
    const expected = content.slice(metrics.start, metrics.end).replace(/\n/g, '').replace(/\t/g, '  ')
    if (rendered !== expected) throw new Error('Page dropped or duplicated text: ' + JSON.stringify({ rendered, expected, metrics }))
    if (metrics.bottom > metrics.viewportBottom + .5 || metrics.overflow || metrics.bodyScroll > 1 || metrics.scrollWidth > width) throw new Error('Page overflow: ' + JSON.stringify(metrics))
    return metrics
  }
  const report = []
  await call('Page.enable')
  await call('Page.navigate', { url: base })
  await wait(700)
  await evaluate(`localStorage.setItem('session',${JSON.stringify(auth.token)})`)
  await store('reader-library-v1', [book, twoChapters, directoryBook])
  for (const width of [320, 390, 430]) {
    await call('Emulation.setDeviceMetricsOverride', { width, height: 844, deviceScaleFactor: 1, mobile: true })
    await call('Emulation.setTouchEmulationEnabled', { enabled: true })
    for (const current of [book, twoChapters]) {
      const chapterIndex = current === book ? current.chapters.findIndex(chapter => chapter.content.length > 1000) : 0
      if (chapterIndex < 0) throw new Error('Fixture needs a long chapter')
      await store('reader-progress-v1', { [current.id]: { chapterIndex, scrollTop: 0, characterOffset: 0, updatedAt: now } })
      await store('reader-settings-v2', { fontSize: 21, lineHeight: 2.15, theme: 'butter', dayTheme: 'butter', pageSound: false })
      const url = base + '/?qa=' + width + current.id + '#/pages/reader/reader?id=' + current.id
      await call('Page.navigate', { url })
      await until(`Boolean(document.querySelector('${leaf} .reader-line')) && Number(document.querySelector('${leaf}').dataset.pages)>1`)
      await wait(250)
      await assertPage(current, width)
      await capture(`${width}-${current.id}-day`)
      if (width === 390 && current === book) {
        await call('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: width * .82, y: 400 }] })
        await call('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: width * .5, y: 402 }] })
        await wait(70)
        await capture(`${width}-page-turn-preview`)
        await call('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] })
        await wait(520)
      }
      await swipe(width * .82, 400, width * .18, 402)
      const second = await assertPage(current, width)
      if (second.page !== 2 || second.start <= 0) throw new Error('Horizontal swipe did not advance exactly one page')
      const savedOffset = second.start
      await click('.reader-page-viewport')
      await until(`Boolean(document.querySelector('.reader-chrome'))`)
      const chromeBefore = await evaluate(`JSON.stringify([...document.querySelectorAll('.top-chrome,.bottom-chrome')].map(node=>({top:node.getBoundingClientRect().top,height:node.getBoundingClientRect().height})))`)
      await swipe(width / 2, 640, width / 2, 220)
      const chromeAfter = await evaluate(`JSON.stringify([...document.querySelectorAll('.top-chrome,.bottom-chrome')].map(node=>({top:node.getBoundingClientRect().top,height:node.getBoundingClientRect().height})))`)
      if (chromeBefore !== chromeAfter || await offset() !== savedOffset) throw new Error('Vertical gesture moved controls or reading position')
      const markBounds = await evaluate(`(()=>{const mark=document.querySelector('.top-chrome .page-mark').getBoundingClientRect();return {left:mark.left,right:mark.right,height:mark.height}})()`)
      if (markBounds.left < 75 || markBounds.right > width || markBounds.height < 28) throw new Error('Long title escapes header: ' + JSON.stringify(markBounds))
      await capture(`${width}-${current.id}-controls`)
      await click('[aria-label="切换夜间模式"]')
      await until(`Boolean(document.querySelector('.theme-night'))`)
      await capture(`${width}-${current.id}-night-controls`)
      await click('[aria-label="打开目录"]')
      await until(`Boolean(document.querySelector('.directory-sheet'))`)
      await capture(`${width}-${current.id}-night-directory`)
      await click('[aria-label="关闭目录"]')
      await click('[aria-label="打开阅读设置"]')
      await until(`Boolean(document.querySelector('.settings-sheet'))`)
      for (let size = 21; size < 26; size++) await click('[aria-label="放大正文字号"]')
      await wait(250)
      await capture(`${width}-${current.id}-night-settings`)
      await click('[aria-label="关闭阅读设置"]')
      await click('.reader-page-viewport')
      await until(`!document.querySelector('.reader-chrome')`)
      const enlarged = await assertPage(current, width)
      if (!(enlarged.start <= savedOffset && enlarged.end > savedOffset)) throw new Error('Font resize lost the original passage')
      await capture(`${width}-${current.id}-night-font26`)
      await call('Page.navigate', { url: url.replace('?qa=', '?reopen=') })
      await until(`Boolean(document.querySelector('${leaf} .reader-line'))`)
      const reopened = await assertPage(current, width)
      if (reopened.start !== enlarged.start || !await evaluate(`Boolean(document.querySelector('.theme-night'))`)) throw new Error('Reopening lost position or night mode')
      await click('.reader-page-viewport')
      await click('[aria-label="切换白天模式"]')
      if (!await evaluate(`Boolean(document.querySelector('.theme-butter'))`)) throw new Error('Day mode did not restore selected paper background')
      // At the final page, the next button crosses to the following chapter.
      const endOffset = current.chapters[chapterIndex].content.length - 1
      await store('reader-progress-v1', { [current.id]: { chapterIndex, scrollTop: 0, characterOffset: endOffset, updatedAt: now } })
      await call('Page.navigate', { url: url.replace('?qa=', '?last=') })
      await until(`Boolean(document.querySelector('${leaf} .reader-line'))`)
      await assertPage(current, width)
      await click('.reader-page-viewport')
      await click('[aria-label="下一页"]')
      await until(`document.querySelector('.reader-meta')?.textContent.includes('第 ${chapterIndex + 2} /')`)
      await click('[aria-label="上一页"]')
      await until(`document.querySelector('.reader-meta')?.textContent.includes('第 ${chapterIndex + 1} /')`)
      const previousLast = await pageMetrics()
      if (previousLast.page !== previousLast.count) throw new Error('Previous page did not return to previous chapter ending')
      report.push({ width, fixture: current.id, pageCount21: second.count, pageCount26: enlarged.count, anchor: savedOffset, reopenedStart: reopened.start, fixedControls: true, noOverflow: true })
    }
    // A scrollable directory must still accept a native vertical gesture.
    await call('Emulation.setDeviceMetricsOverride', { width, height: 640, deviceScaleFactor: 1, mobile: true })
    await call('Page.navigate', { url: base + '/?directory=' + width + '#/pages/reader/reader?id=qa-directory' })
    await until(`Boolean(document.querySelector('${leaf} .reader-line'))`)
    await click('.reader-page-viewport')
    await click('[aria-label="打开目录"]')
    const directoryScroll = '.directory-scroll .uni-scroll-view .uni-scroll-view'
    const before = await evaluate(`document.querySelector('${directoryScroll}').scrollTop`)
    const rect = await evaluate(`(()=>{const r=document.querySelector('${directoryScroll}').getBoundingClientRect();return {top:r.top,bottom:r.bottom}})()`)
    await swipe(width / 2, rect.bottom - 30, width / 2, rect.top + 25)
    const after = await evaluate(`document.querySelector('${directoryScroll}').scrollTop`)
    if (after < before + 30) {
      console.log(await evaluate(`JSON.stringify([...document.querySelectorAll('html,body,uni-page,uni-page-wrapper,uni-page-body,.reader-shell,.sheet-layer,.sheet,.directory-scroll,.directory-scroll *')].map(node=>({tag:node.tagName,cls:node.className,touch:getComputedStyle(node).touchAction,overflowY:getComputedStyle(node).overflowY,height:node.getBoundingClientRect().height,scrollHeight:node.scrollHeight,scrollTop:node.scrollTop})))`))
      throw new Error('Directory cannot scroll by touch: ' + JSON.stringify({ width, rect, before, after }))
    }
    if (await evaluate('Math.max(scrollY,document.body.scrollTop)') > 1) throw new Error('Directory moved document')
    await capture(`${width}-directory-touch-scroll`)
    await click('.directory-pagination uni-button:last-child')
    await until(`document.querySelector('.directory-summary')?.textContent.includes('第 11–20 章')`)
    await click('[aria-label="关闭目录"]')
    await call('Emulation.setDeviceMetricsOverride', { width, height: 844, deviceScaleFactor: 1, mobile: true })
    await call('Page.navigate', { url: base + '/?library=' + width + '#/pages/library/library' })
    await until(`document.querySelectorAll('.cloud-library .row-action').length===2`)
    const actions = await evaluate(`[...document.querySelectorAll('.cloud-library .row-action')].map(node=>{const rect=node.getBoundingClientRect();return {left:rect.left,right:rect.right,width:rect.width,height:rect.height,whiteSpace:getComputedStyle(node).whiteSpace}})`)
    if (actions.some(action => action.right > width || action.height < 44 || action.whiteSpace !== 'nowrap') || actions[0].width !== actions[1].width || actions[0].height !== actions[1].height) throw new Error('Book title changes action shape: ' + JSON.stringify(actions))
    await capture(`${width}-library-titles`)
  }
  await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2))
  console.log('Reader pages, source text, font anchors, day/night, fixed controls, directory touch scroll and title bounds passed at 320/390/430px')
} finally {
  socket?.close()
  browser.kill()
  await new Promise(done => app.server.close(done))
  app.db.close()
}
