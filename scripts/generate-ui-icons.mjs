import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import WebSocket from 'ws'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const sourceDir = resolve(root, 'src/static/nav-icons/source')
const outputDir = resolve(root, 'src/static/nav-icons')
const edge = process.env.EDGE_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const remotePort = Number(process.env.ICON_CDP_PORT || 9232)
const profileDir = await mkdtemp(join(tmpdir(), 'together-notes-icons-'))
const icons = [
  ['note.svg', 'note-inactive.png', '#fff9e9'],
  ['note.svg', 'note-active.png', '#494032'],
  ['bell.svg', 'bell-inactive.png', '#fff9e9'],
  ['bell.svg', 'bell-active.png', '#494032'],
  ['search.svg', 'search-inactive.png', '#fff9e9'],
  ['search.svg', 'search-active.png', '#494032'],
  ['heart.svg', 'heart-inactive.png', '#fff9e9'],
  ['heart.svg', 'heart-active.png', '#494032'],
  ['attachment.svg', 'attachment-active.png', '#494032'],
  ['link.svg', 'link-active.png', '#494032'],
  ['location.svg', 'location-active.png', '#8b6b25'],
  ['refresh.svg', 'refresh-active.png', '#786d5b'],
  ['heart-filled.svg', 'heart-filled.png', '#494032'],
]

const wait = ms => new Promise(resolveWait => setTimeout(resolveWait, ms))

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
}

await mkdir(outputDir, { recursive: true })
const browser = spawn(edge, [
  '--headless=new',
  '--disable-gpu',
  '--remote-allow-origins=*',
  `--remote-debugging-port=${remotePort}`,
  `--user-data-dir=${profileDir}`,
  'about:blank',
], { stdio: 'ignore', windowsHide: true })

try {
  const target = await getJson(`http://127.0.0.1:${remotePort}/json/new?${encodeURIComponent('about:blank')}`, { method: 'PUT' })
  const page = new Cdp(target.webSocketDebuggerUrl)
  await page.open()
  await page.call('Page.enable')
  await page.call('Emulation.setDeviceMetricsOverride', { width: 72, height: 72, deviceScaleFactor: 1, mobile: false })
  await page.call('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } })
  const frameTree = await page.call('Page.getFrameTree')
  const frameId = frameTree.frameTree.frame.id

  for (const [sourceName, outputName, color] of icons) {
    const source = (await readFile(resolve(sourceDir, sourceName), 'utf8'))
      .replaceAll('currentColor', color)
      .replace('width="24" height="24"', 'width="72" height="72"')
    const html = `<style>html,body{width:72px;height:72px;margin:0;background:transparent;overflow:hidden}</style>${source}`
    await page.call('Page.setDocumentContent', { frameId, html })
    await wait(50)
    const shot = await page.call('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: true,
      clip: { x: 0, y: 0, width: 72, height: 72, scale: 1 },
    })
    await writeFile(resolve(outputDir, outputName), Buffer.from(shot.data, 'base64'))
  }

  const version = await getJson(`http://127.0.0.1:${remotePort}/json/version`)
  const browserPage = new Cdp(version.webSocketDebuggerUrl)
  await browserPage.open()
  await browserPage.call('Browser.close')
  console.log(`Generated ${icons.length} UI icons in ${outputDir}`)
} finally {
  browser.kill()
  await wait(300)
  await rm(profileDir, { recursive: true, force: true }).catch(() => {})
}
