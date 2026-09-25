import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import WebSocket from 'ws'
import { createApp } from '../server/index.mjs'

const edge = process.env.EDGE_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
let baseUrl = process.env.PREVIEW_URL || ''
const outputDir = resolve(process.env.CAPTURE_DIR || 'artifacts/mobile-audit')
let session = process.env.QA_SESSION || ''
let itemId = process.env.QA_ITEM_ID || ''
const widths = (process.env.CAPTURE_WIDTHS || '320,375,390,430').split(',').map(Number).filter(Boolean)
const remotePort = Number(process.env.CDP_PORT || 9231)
const sportsCompetition = process.env.QA_SPORTS_COMPETITION || ''
const profileDir = await mkdtemp(join(tmpdir(), 'together-notes-cdp-'))
let qaApp

const wait = ms => new Promise(resolveWait => setTimeout(resolveWait, ms))

async function waitForText(page, expected, timeout = 10000) {
  const started = Date.now()
  let observed = ''
  while (Date.now() - started < timeout) {
    try {
      const result = await page.call('Runtime.evaluate', {
        expression: `({ matches: Boolean(document.body && document.body.innerText.includes(${JSON.stringify(expected)})), text: String(document.body?.innerText || '').slice(0, 500) })`,
        returnByValue: true,
      })
      observed = result.result.value.text
      if (result.result.value.matches) return
    } catch {}
    await wait(150)
  }
  throw new Error(`Timed out waiting for text: ${expected}\nObserved: ${observed}`)
}

async function getJson(url, options) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(url, options)
      if (response.ok) return response.json()
    } catch {}
    await wait(150)
  }
  throw new Error(`Unable to reach Chrome DevTools at ${url}`)
}

async function apiRequest(path, method = 'GET', data, token = '') {
  const response = await fetch(new URL(path, baseUrl), {
    method,
    headers: {
      ...(data ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: data ? JSON.stringify(data) : undefined,
  })
  const body = await response.json()
  if (!response.ok) throw new Error(body.message || `QA API request failed: ${response.status}`)
  return body
}

async function apiFileUpload(name, bytes, token) {
  const response = await fetch(new URL('/api/files', baseUrl), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/octet-stream',
      'X-File-Name': encodeURIComponent(name),
    },
    body: bytes,
  })
  const body = await response.json()
  if (!response.ok) throw new Error(body.message || `QA file upload failed: ${response.status}`)
  return body
}

async function buildQaH5() {
  const npmCli = process.env.npm_execpath
  const command = npmCli ? process.execPath : process.platform === 'win32' ? 'npm.cmd' : 'npm'
  const args = npmCli ? [npmCli, 'run', 'build:h5'] : ['run', 'build:h5']
  await new Promise((resolveBuild, reject) => {
    const build = spawn(command, args, {
      stdio: 'inherit',
      windowsHide: true,
      env: { ...process.env, VITE_API_BASE: '/api', VITE_QA_APP_LOGIN: '1', VITE_QA_MP_CREDENTIAL: '1', VITE_QA_READER_SAMPLE: '1' },
    })
    build.once('error', reject)
    build.once('exit', code => code === 0 ? resolveBuild() : reject(new Error(`H5 QA build failed with exit code ${code}`)))
  })
}

class Cdp {
  constructor(url) {
    this.socket = new WebSocket(url)
    this.nextId = 1
    this.pending = new Map()
  }

  async open() {
    await new Promise((resolveOpen, reject) => {
      this.socket.once('open', resolveOpen)
      this.socket.once('error', reject)
    })
    this.socket.on('message', raw => {
      const message = JSON.parse(String(raw))
      if (!message.id) return
      const pending = this.pending.get(message.id)
      if (!pending) return
      this.pending.delete(message.id)
      if (message.error) pending.reject(new Error(message.error.message))
      else pending.resolve(message.result)
    })
  }

  call(method, params = {}) {
    const id = this.nextId++
    return new Promise((resolveCall, reject) => {
      this.pending.set(id, { resolve: resolveCall, reject })
      this.socket.send(JSON.stringify({ id, method, params }))
    })
  }

  close() {
    this.socket.close()
  }
}

if (!baseUrl) {
  if (process.env.QA_SKIP_BUILD !== '1') await buildQaH5()
  const qaFetch = async (input, init = {}) => {
    if (String(input).endsWith('/chat/completions')) {
      const body = JSON.parse(String(init.body || '{}'))
      const query = String(body.messages?.at(-1)?.content || '')
      if (query.includes('不存在的外部事实')) throw new TypeError('QA upstream unavailable')
      return Response.json({ model: 'qa-search-model', choices: [{ message: { role: 'assistant', content: '现实中的猪不会自主飞行；乘坐飞机运输或在虚构故事中，才会出现“猪会飞”的情形。' }, finish_reason: 'stop' }] })
    }
    if (String(input).endsWith('/responses')) {
      const body = JSON.parse(String(init.body || '{}'))
      const local = JSON.parse(body.input?.[1]?.content?.[0]?.text || '{}')
      return Response.json({ model: 'qa-search-model', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify({ answer: '周末可以一起去看展，出发时间已经记在小记里。', source_ids: [local.documents?.[0]?.id].filter(Boolean) }), annotations: [] }] }] })
    }
    throw new Error(`Unexpected QA network request: ${input}`)
  }
  qaApp = createApp({ dbPath: ':memory:', testAuth: true, publicDir: resolve('dist/build/h5'), fetchImpl: qaFetch, aiConfig: { apiKey: 'qa-key', apiType: 'chat_completions', baseUrl: 'https://models.example/v1', model: 'qa-search-model', rateLimitPerMinute: 100 } })
  await new Promise((resolveListen, reject) => {
    qaApp.server.once('error', reject)
    qaApp.server.listen(0, '127.0.0.1', resolveListen)
  })
  const address = qaApp.server.address()
  baseUrl = `http://127.0.0.1:${address.port}/`
  const auth = await apiRequest('/api/auth/test', 'POST', { name: '我' })
  session = auth.token
  const qaImageFiles = ['book-active.png', 'note-active.png', 'heart-active.png']
  const attachments = []
  for (const [index, filename] of qaImageFiles.entries()) {
    attachments.push(await apiFileUpload(`示例图片-${index + 1}.png`, await readFile(resolve('src/static/nav-icons', filename)), session))
  }
  const note = await apiRequest('/api/items', 'POST', {
    kind: 'note',
    title: '周末一起去看展',
    content: '把想看的展览和出发时间记在这里。',
    links: ['https://example.com/exhibition'],
    attachments,
    scope: 'mine',
    pinned: true,
  }, session)
  itemId = note.id
  await apiRequest('/api/items', 'POST', {
    kind: 'reminder',
    title: '别忘了给花浇水',
    content: '回家以后一起照顾阳台的小花。',
    links: [],
    scope: 'mine',
    nextAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    repeat: 'weekly',
    recipient: 'me',
    advance: 0,
  }, session)
  await apiRequest('/api/items', 'POST', {
    kind: 'reminder',
    title: '已经收好纪念票',
    content: '完成状态用于检查圆形对号是否视觉居中。',
    links: [],
    scope: 'mine',
    nextAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
    repeat: 'none',
    recipient: 'me',
    advance: 0,
    done: true,
  }, session)
}

function route(path, nonce) {
  const url = new URL(baseUrl)
  url.searchParams.set('__audit', String(nonce))
  url.hash = path
  return url.href
}

const screenNames = new Set((process.env.CAPTURE_SCREENS || '').split(',').map(value => value.trim()).filter(Boolean))
const screens = [
  { name: 'index-login', path: '/pages/index/index', ready: '以前用过微信小程序', anonymous: true },
  { name: 'index-notes', path: '/pages/index/index', ready: '周末一起去看展' },
  { name: 'index-reminders', path: '/pages/index/index', ready: '周末一起去看展', click: '提醒', clicked: '别忘了这些小事' },
  { name: 'index-search', path: '/pages/index/index', ready: '周末一起去看展', click: '搜搜', clicked: '搜搜我们的小记' },
  { name: 'index-search-result', path: '/pages/index/index', ready: '周末一起去看展', click: '搜搜', clicked: '搜搜我们的小记', ask: '周末看什么？', answered: '相关内容' },
  { name: 'index-search-model', path: '/pages/index/index', ready: '周末一起去看展', click: '搜搜', clicked: '搜搜我们的小记', ask: '猪什么时候会飞', answered: '现实中的猪不会自主飞行' },
  { name: 'index-search-empty', path: '/pages/index/index', ready: '周末一起去看展', click: '搜搜', clicked: '搜搜我们的小记', ask: '不存在的外部事实 9988', answered: '没有找到相关数据' },
  { name: 'index-us', path: '/pages/us/us', ready: '有各自的小记' },
  { name: 'index-us-edit', path: '/pages/us/us', ready: '有各自的小记', click: '编辑', clicked: '保存' },
  { name: 'index-us-phone', path: '/pages/us/us', ready: 'Stock Platform 联动', click: '绑定', clicked: '中国大陆手机号' },
  { name: 'index-us-app-login', path: '/pages/us/us', ready: '在 Android App 登录', click: '设置', clicked: 'App 登录密码' },
  ...(itemId ? [{ name: 'detail-note', path: `/pages/detail/detail?id=${encodeURIComponent(itemId)}`, ready: '周末一起去看展' }] : []),
  ...(itemId ? [{ name: 'detail-note-gallery', path: `/pages/detail/detail?id=${encodeURIComponent(itemId)}`, ready: '附件', preClickSelector: '.thumbnail' }] : []),
  { name: 'editor-note', path: '/pages/editor/editor?kind=note', ready: '标题' },
  { name: 'editor-reminder', path: '/pages/editor/editor?kind=reminder', ready: '提醒时间' },
  { name: 'sports-provider-error', path: '/pages/sports/sports', ready: '赛事数据获取失败' },
  { name: 'match-provider-error', path: '/pages/match-detail/match-detail?id=unavailable', ready: '无法显示这场比赛' },
  { name: 'news-provider-error', path: '/pages/news/news', ready: '新闻数据获取失败' },
  { name: 'news-detail-error', path: '/pages/news-detail/news-detail?id=unavailable', ready: '无法显示这条新闻' },
  { name: 'library', path: '/pages/library/library', ready: '窗边的小灯' },
  { name: 'reader', path: '/pages/reader/reader?id=starter-window-light', ready: '晚归的人' },
  { name: 'reader-controls', path: '/pages/reader/reader?id=starter-window-light', ready: '晚归的人', preClickSelector: '.reading-surface' },
  { name: 'reader-directory', path: '/pages/reader/reader?id=starter-window-light', ready: '晚归的人', preClickSelector: '.reading-surface', click: '目录', clicked: '第二章 留下的话' },
  { name: 'reader-settings', path: '/pages/reader/reader?id=starter-window-light', ready: '晚归的人', preClickSelector: '.reading-surface', click: '阅读设置', clicked: '阅读背景' },
  { name: 'pair-invite', path: '/pages/pair/pair?mode=invite', ready: '把小记' },
  { name: 'pair-join', path: '/pages/pair/pair?mode=join', ready: '加入彼此' },
  { name: 'inbox', path: '/pages/inbox/inbox', ready: '到时间了' },
  { name: 'legal-terms', path: '/pages/legal/legal?document=terms', ready: '服务说明' },
  { name: 'legal-privacy', path: '/pages/legal/legal?document=privacy', ready: '我们处理的信息' },
].filter(screen => !screenNames.size || screenNames.has(screen.name))
if (!screens.length) throw new Error('CAPTURE_SCREENS did not match any known screen')

await mkdir(outputDir, { recursive: true })
const browser = spawn(edge, [
  '--headless=new',
  '--disable-gpu',
  '--hide-scrollbars',
  '--disable-web-security',
  '--remote-allow-origins=*',
  `--remote-debugging-port=${remotePort}`,
  `--user-data-dir=${profileDir}`,
  'about:blank',
], { stdio: 'ignore', windowsHide: true })

let page
try {
  const target = await getJson(`http://127.0.0.1:${remotePort}/json/new?${encodeURIComponent('about:blank')}`, { method: 'PUT' })
  page = new Cdp(target.webSocketDebuggerUrl)
  await page.open()
  await page.call('Page.enable')
  await page.call('Runtime.enable')
  await page.call('Page.navigate', { url: baseUrl })
  await wait(700)
  if (session) {
    await page.call('Runtime.evaluate', {
      expression: `localStorage.setItem('session', ${JSON.stringify(session)}); localStorage.removeItem('saved-news-stories'); ${sportsCompetition ? `localStorage.setItem('sports-competition', ${JSON.stringify(sportsCompetition)})` : "localStorage.removeItem('sports-competition')"}`,
    })
    // The first page load happens before the QA session exists. Reload once so
    // the entry page runs its authentication-aware onLoad hook with the token.
    await page.call('Page.reload', { ignoreCache: true })
    await wait(500)
  }

  const report = []
  let navigationNonce = 0
  for (const width of widths) {
    await page.call('Emulation.setDeviceMetricsOverride', {
      width,
      height: 844,
      deviceScaleFactor: 1,
      mobile: true,
      screenWidth: width,
      screenHeight: 844,
    })
    await page.call('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 })

    for (const screen of screens) {
      if (session && !screen.anonymous) {
        await page.call('Runtime.evaluate', {
          expression: `localStorage.setItem('session', ${JSON.stringify(session)})`,
        })
      } else if (screen.anonymous) {
        await page.call('Runtime.evaluate', {
          expression: "localStorage.removeItem('session')",
        })
      }
      await page.call('Page.navigate', { url: route(screen.path, ++navigationNonce) })
      await wait(500)
      await waitForText(page, screen.ready)
      if (screen.preClickSelector) {
        const preClickResult = await page.call('Runtime.evaluate', {
          expression: `(() => { const node = document.querySelector(${JSON.stringify(screen.preClickSelector)}); if (!node) return false; node.click(); return true })()`,
          returnByValue: true,
        })
        if (!preClickResult.result.value) throw new Error(`Could not find pre-click target: ${screen.preClickSelector}`)
        await wait(120)
      }
      if (screen.click) {
        const targetAlreadyVisible = await page.call('Runtime.evaluate', {
          expression: `Boolean(document.body && document.body.innerText.includes(${JSON.stringify(screen.clicked)}))`,
          returnByValue: true,
        })
        if (!targetAlreadyVisible.result.value) {
          const clickResult = await page.call('Runtime.evaluate', {
            expression: `(() => { const expected = ${JSON.stringify(screen.click)}; const selector = ${JSON.stringify(screen.selector || '')}; const controls = [...document.querySelectorAll('uni-button, button')]; const node = (selector ? document.querySelector(selector) : null) || controls.find(item => item.textContent.trim() === expected) || controls.find(item => String(item.getAttribute('aria-label') || '').startsWith(expected)) || controls.find(item => item.textContent.trim().includes(expected)); if (!node) return false; if (typeof node.click === 'function') node.click(); else node.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, composed: true })); return true })()`,
            returnByValue: true,
          })
          if (!clickResult.result.value) throw new Error(`Could not find control: ${screen.click}`)
          await waitForText(page, screen.clicked)
        }
      }
      if (screen.ask) {
        const askResult = await page.call('Runtime.evaluate', {
          expression: `(() => { const field = document.querySelector('textarea'); if (!field) return false; const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set; setter?.call(field, ${JSON.stringify(screen.ask)}); field.dispatchEvent(new Event('input', { bubbles: true, composed: true })); field.dispatchEvent(new Event('change', { bubbles: true, composed: true })); return true })()`,
          returnByValue: true,
        })
        if (!askResult.result.value) throw new Error(`Could not fill AI question: ${screen.ask}`)
        await wait(100)
        const submitResult = await page.call('Runtime.evaluate', {
          expression: `(() => { const controls = [...document.querySelectorAll('uni-button, button')]; const node = controls.find(item => String(item.getAttribute('aria-label') || '').startsWith('发送问题')); if (!node) return false; node.click(); return true })()`,
          returnByValue: true,
        })
        if (!submitResult.result.value) throw new Error('Could not submit AI question')
        await waitForText(page, screen.answered, 15000)
      }
      await wait(120)

      const audit = await page.call('Runtime.evaluate', {
        expression: `(() => {
          const root = document.documentElement
          const all = [...document.querySelectorAll('body *')]
          const overflow = all.map(node => {
            const rect = node.getBoundingClientRect()
            return { tag: node.tagName.toLowerCase(), cls: String(node.className || '').slice(0, 100), text: String(node.textContent || '').trim().slice(0, 50), left: Math.round(rect.left), right: Math.round(rect.right), width: Math.round(rect.width) }
          }).filter(item => item.width > 0 && (item.left < -1 || item.right > innerWidth + 1)).slice(0, 30)
          const tinyControls = all.filter(node => ['BUTTON', 'INPUT', 'TEXTAREA'].includes(node.tagName)).map(node => {
            const rect = node.getBoundingClientRect()
            return { tag: node.tagName.toLowerCase(), cls: String(node.className || '').slice(0, 100), text: String(node.textContent || '').trim().slice(0, 40), width: Math.round(rect.width), height: Math.round(rect.height) }
          }).filter(item => item.width > 0 && (item.width < 40 || item.height < 40)).slice(0, 30)
          return { viewport: innerWidth, scrollWidth: root.scrollWidth, overflow, tinyControls }
        })()`,
        returnByValue: true,
      })
      const metrics = await page.call('Page.getLayoutMetrics')
      const height = Math.min(5000, Math.max(844, Math.ceil(metrics.cssContentSize.height)))
      const shot = await page.call('Page.captureScreenshot', {
        format: 'png',
        captureBeyondViewport: true,
        clip: { x: 0, y: 0, width, height, scale: 1 },
      })
      await writeFile(join(outputDir, `${width}-${screen.name}.png`), Buffer.from(shot.data, 'base64'))
      report.push({ width, screen: screen.name, ...audit.result.value })
    }
  }
  await writeFile(join(outputDir, 'layout-report.json'), `${JSON.stringify(report, null, 2)}\n`)
  console.log(`Captured ${report.length} mobile screens in ${outputDir}`)
  console.log(`Overflow cases: ${report.filter(item => item.scrollWidth > item.viewport).length}`)
} finally {
  if (page) page.close()
  try {
    const version = await getJson(`http://127.0.0.1:${remotePort}/json/version`)
    const browserCdp = new Cdp(version.webSocketDebuggerUrl)
    await browserCdp.open()
    await browserCdp.call('Browser.close')
  } catch {
    // Browser may already be closing.
  }
  browser.kill()
  await wait(300)
  for (let attempt = 0; attempt < 12; attempt += 1) {
    try {
      await rm(profileDir, { recursive: true, force: true })
      break
    } catch (error) {
      if (attempt === 11) console.warn(`Could not remove temporary browser profile: ${error.message}`)
      else await wait(400)
    }
  }
  if (qaApp) {
    await new Promise(resolveClose => qaApp.server.close(resolveClose))
    qaApp.db.close()
  }
}
