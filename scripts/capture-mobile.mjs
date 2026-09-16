import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
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

async function buildQaH5() {
  const npmCli = process.env.npm_execpath
  const command = npmCli ? process.execPath : process.platform === 'win32' ? 'npm.cmd' : 'npm'
  const args = npmCli ? [npmCli, 'run', 'build:h5'] : ['run', 'build:h5']
  await new Promise((resolveBuild, reject) => {
    const build = spawn(command, args, {
      stdio: 'inherit',
      windowsHide: true,
      env: { ...process.env, VITE_API_BASE: '/api' },
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
  qaApp = createApp({ dbPath: ':memory:', testAuth: true, publicDir: resolve('dist/build/h5') })
  await new Promise((resolveListen, reject) => {
    qaApp.server.once('error', reject)
    qaApp.server.listen(0, '127.0.0.1', resolveListen)
  })
  const address = qaApp.server.address()
  baseUrl = `http://127.0.0.1:${address.port}/`
  const auth = await apiRequest('/api/auth/test', 'POST', { name: '我' })
  session = auth.token
  const note = await apiRequest('/api/items', 'POST', {
    kind: 'note',
    title: '周末一起去看展',
    content: '把想看的展览和出发时间记在这里。',
    links: ['https://example.com/exhibition'],
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
}

function route(path, nonce) {
  const url = new URL(baseUrl)
  url.searchParams.set('__audit', String(nonce))
  url.hash = path
  return url.href
}

const screenNames = new Set((process.env.CAPTURE_SCREENS || '').split(',').map(value => value.trim()).filter(Boolean))
const screens = [
  { name: 'index-notes', path: '/pages/index/index', ready: '周末一起去看展' },
  { name: 'index-reminders', path: '/pages/index/index', ready: '周末一起去看展', click: '提醒', clicked: '别忘了这些小事' },
  { name: 'index-us', path: '/pages/index/index', ready: '周末一起去看展', click: '我们', clicked: '我们的小空间' },
  ...(itemId ? [{ name: 'detail-note', path: `/pages/detail/detail?id=${encodeURIComponent(itemId)}`, ready: '周末一起去看展' }] : []),
  { name: 'editor-note', path: '/pages/editor/editor?kind=note', ready: '标题' },
  { name: 'editor-reminder', path: '/pages/editor/editor?kind=reminder', ready: '提醒时间' },
  { name: 'sports-provider-error', path: '/pages/sports/sports', ready: '赛事数据获取失败' },
  { name: 'match-provider-error', path: '/pages/match-detail/match-detail?id=unavailable', ready: '无法显示这场比赛' },
  { name: 'news-provider-error', path: '/pages/news/news', ready: '新闻数据获取失败' },
  { name: 'news-detail-error', path: '/pages/news-detail/news-detail?id=unavailable', ready: '无法显示这条新闻' },
  { name: 'pair-invite', path: '/pages/pair/pair?mode=invite', ready: '把小记' },
  { name: 'pair-join', path: '/pages/pair/pair?mode=join', ready: '加入彼此' },
  { name: 'inbox', path: '/pages/inbox/inbox', ready: '到时间了' },
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
      await page.call('Page.navigate', { url: route(screen.path, ++navigationNonce) })
      await wait(500)
      await waitForText(page, screen.ready)
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
