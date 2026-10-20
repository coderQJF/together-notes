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
let paperId = process.env.QA_PAPER_ID || ''
let ledgerId = process.env.QA_LEDGER_ID || ''
const classicBodyText = '经典备忘正文可以输入、编辑并在重新打开后保留。\n这是一段用于检查 App 和网页正文输入框的文字。'
const classicLinkText = 'https://example.com/classic-input'
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

async function auditHoldSelection(page, width, screenName) {
  const evaluate = async expression => (await page.call('Runtime.evaluate', { expression, returnByValue: true })).result.value
  const state = () => evaluate(`(() => {const scroll=document.querySelector('.feed-scroll .uni-scroll-view-scrollbar-hidden');const card=document.querySelector('.hold-pressed');return {selecting:Boolean(document.querySelector('.bulk-selection-bar')),selected:document.querySelectorAll('.selected-card').length,scroll:scroll?.scrollTop||0,pressed:Boolean(card),scale:card?new DOMMatrixReadOnly(getComputedStyle(card).transform).a:1};})()`)
  const target = () => evaluate(`(() => {const viewport=document.querySelector('.feed-scroll').getBoundingClientRect();const cards=[...document.querySelectorAll('.feed-list .selectable-card')];const node=cards.find(node=>{const r=node.getBoundingClientRect();return r.top>=viewport.top+2&&r.bottom<=viewport.bottom-2})||cards.find(node=>{const r=node.getBoundingClientRect();return r.bottom>viewport.top+70&&r.top<viewport.bottom-70});if(!node)return null;const r=node.getBoundingClientRect();return {x:r.left+Math.min(45,r.width/3),y:Math.max(viewport.top+24,Math.min(r.top+Math.min(70,r.height/2),viewport.bottom-24))};})()`)
  const touch = (type, point) => page.call('Input.dispatchTouchEvent', { type, touchPoints: point ? [point] : [] })
  let point = await target()
  if (!point) throw new Error('No visible card for selection audit')
  await touch('touchStart', point)
  await wait(400)
  const shortHold = await state()
  if (shortHold.selecting || !shortHold.pressed || shortHold.scale > .99 || shortHold.scale < .96) throw new Error('400ms must show press feedback without selecting: '+JSON.stringify(shortHold))
  const pressShot = await page.call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
  await writeFile(join(outputDir, `${width}-${screenName}-press.png`), Buffer.from(pressShot.data, 'base64'))
  await touch('touchCancel')
  await wait(340)
  if ((await state()).selecting || (await state()).pressed) throw new Error('Cancelled short hold leaked selection or press feedback')
  point = await target()
  const scrollBefore = (await state()).scroll
  await touch('touchStart', point)
  await wait(90)
  await touch('touchMove', { ...point, y: point.y - 32 })
  await wait(850)
  await touch('touchMove', { ...point, y: point.y - 75 })
  await wait(200)
  await touch('touchEnd')
  await wait(220)
  const swipe = await state()
  if (swipe.selecting || swipe.pressed) throw new Error('Slow scrolling with a pause incorrectly selected a card: '+JSON.stringify(swipe))
  if (swipe.scroll <= scrollBefore + 1) throw new Error('Gesture fixture did not actually scroll: '+JSON.stringify({ scrollBefore, swipe }))
  console.log(`${width} ${screenName}: short hold and scroll passed`)
  point = await target()
  const anchoredScroll = (await state()).scroll
  await touch('touchStart', point)
  await wait(700)
  await touch('touchEnd')
  await waitForText(page, '已选择 1 项')
  await wait(350)
  const selected = await state()
  console.log(`${width} ${screenName}: intentional hold passed`)
  if (selected.selected !== 1 || Math.abs(selected.scroll - anchoredScroll) > 1) throw new Error('Intentional hold moved the list or failed to preserve one selected card: '+JSON.stringify({ anchoredScroll, selected }))
  const rightToggle = await evaluate(`(() => {const card=document.querySelector('.selected-card'),button=card?.querySelector('.selection-toggle');if(!button)return null;const c=card.getBoundingClientRect(),b=button.getBoundingClientRect();return {width:b.width,height:b.height,right:b.right<=c.right,offset:b.left-c.left,cardWidth:c.width};})()`)
  if (!rightToggle || rightToggle.width < 44 || rightToggle.height < 44 || !rightToggle.right || rightToggle.offset < rightToggle.cardWidth / 2) throw new Error('Selection indicator is not a right-side 44px control: '+JSON.stringify(rightToggle))
  // Android may cancel the touch or background the WebView while a system panel
  // opens. Replay both interruption signals and verify the durable selection UI.
  await touch('touchStart', point)
  await touch('touchCancel')
  await evaluate(`window.dispatchEvent(new Event('blur'));document.dispatchEvent(new Event('visibilitychange'))`)
  await wait(100)
  await evaluate(`window.dispatchEvent(new Event('focus'))`)
  await wait(200)
  const resumed = await state()
  console.log(`${width} ${screenName}: interruption resumed`)
  if (!resumed.selecting || resumed.selected !== 1 || resumed.pressed || Math.abs(resumed.scroll - selected.scroll) > 1) throw new Error('System interruption cleared selection or changed the scroll position: '+JSON.stringify(resumed))
  for (const expected of [0, 1]) {
    await touch('touchStart', point)
    await wait(50)
    await touch('touchEnd')
    await wait(200)
    if ((await state()).selected !== expected) throw new Error('Fresh card tap could not toggle selection after a cancelled/system-interrupted hold')
  }
  await evaluate(`document.querySelector('.bulk-selection-toolbar .selection-all').click()`)
  const all = await evaluate(`({count:document.querySelectorAll('.selected-card').length,cards:document.querySelectorAll('.selectable-card:not(.selection-locked)').length,checked:Boolean(document.querySelector('.selection-all .status-icon.checked'))})`)
  if (!all.checked || all.count !== all.cards || all.count < 2) throw new Error('Select-all did not select only available cards: '+JSON.stringify(all))
  await evaluate(`document.querySelector('.bulk-selection-toolbar .selection-all').click()`)
  if ((await state()).selected !== 0 || !(await state()).selecting) throw new Error('Deselect-all should retain the explicit selection mode')
  await evaluate(`document.querySelector('.selection-cancel').click()`)
  if ((await state()).selecting) throw new Error('Explicit cancel did not leave selection mode')
  point = await target()
  await touch('touchStart', point)
  await wait(700)
  await touch('touchEnd')
  await waitForText(page, '已选择 1 项')
  await evaluate(`document.querySelector('.bulk-selection-toolbar .selection-delete').click()`)
  await waitForText(page, '删除选中的 1 条内容？')
  await evaluate(`document.querySelector('.uni-modal__btn_default').click()`)
  await wait(200)
  if (!(await state()).selecting || (await state()).selected !== 1) throw new Error('Cancelling deletion lost the selected items')
  return { shortHoldMs: 400, selectionHoldMs: 700, scale: shortHold.scale, swipeScroll: swipe.scroll - scrollBefore, preservedScroll: resumed.scroll, rightToggle, interruptedSelectionPreserved: true, selectAll: all.count }
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
    this.exceptions = []
    this.apiRequests = []
  }

  async open() {
    await new Promise((resolveOpen, reject) => {
      this.socket.once('open', resolveOpen)
      this.socket.once('error', reject)
    })
    this.socket.on('message', raw => {
      const message = JSON.parse(String(raw))
      if (message.method === 'Network.requestWillBeSent' && new URL(message.params.request.url).pathname.startsWith('/api/')) this.apiRequests.push(message.params.request.url)
      if (message.method === 'Runtime.exceptionThrown') this.exceptions.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text)
      if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') this.exceptions.push(message.params.args.map(arg=>arg.description || arg.value).join(' '))
      if (!message.id) return
      const pending = this.pending.get(message.id)
      if (!pending) return
      this.pending.delete(message.id)
      clearTimeout(pending.timer)
      if (message.error) pending.reject(new Error(message.error.message))
      else pending.resolve(message.result)
    })
  }

  call(method, params = {}) {
    const id = this.nextId++
    return new Promise((resolveCall, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`CDP command timed out: ${method}`)) }, 20000)
      this.pending.set(id, { resolve: resolveCall, reject, timer })
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
  await apiRequest('/api/me/app-credentials', 'PUT', { username: 'guest-qa', password: 'Guest-QA-password-2026', acceptedTerms: true }, session)
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
  const ledger = await apiRequest('/api/items', 'POST', {
    kind: 'note', title: '旅行记账', content: await readFile(resolve('test/fixtures/travel-ledger.txt'), 'utf8'), links: [], scope: 'mine', noteFormat: 'classic',
  }, session)
  ledgerId = ledger.id
  const paper = await apiRequest('/api/items', 'POST', {
    kind: 'note', title: '旅行灵感纸', content: '出发前清单\n买120+80 赢50\n带上相机', links: ['https://example.com/trip'], attachments: [attachments[0]], scope: 'mine', pinned: false, noteFormat: 'paper',
    blocks: [
      { id: 'qa-p1', type: 'paragraph', text: '出发前清单\n买120+80 赢50', style: { bold: true, align: 'left', list: 'none', color: '#b04432' } },
      { id: 'qa-t1', type: 'todo', text: '带上相机', checked: false },
      { id: 'qa-i1', type: 'image', attachmentId: attachments[0].id },
      { id: 'qa-l1', type: 'link', text: '旅行资料', url: 'https://example.com/trip' },
    ],
  }, session)
  paperId = paper.id
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
  for (const kind of ['note', 'reminder']) {
    for (let index = 1; index <= 5; index += 1) {
      await apiRequest('/api/items', 'POST', {
        kind, title: `${kind === 'note' ? '旅途随记' : '出行待办'} ${index}`,
        content: '长列表中可以慢慢滑动、停顿，只有原地持续长按才进入选择。', links: [], scope: 'mine',
        ...(kind === 'reminder' ? { nextAt: new Date(Date.now() + (index + 3) * 86400000).toISOString(), repeat: 'none', recipient: 'me', advance: 0 } : {}),
      }, session)
    }
  }

}

function route(path, nonce) {
  const url = new URL(baseUrl)
  url.searchParams.set('__audit', String(nonce))
  url.hash = path
  return url.href
}

const screenNames = new Set((process.env.CAPTURE_SCREENS || '').split(',').map(value => value.trim()).filter(Boolean))
const screens = [
  { name: 'water-empty', path: '/pages/water/water', ready: '喝一杯，冒个泡', anonymous: true, water: 'empty' },
  { name: 'water-flow', path: '/pages/index/index', ready: '随手记下', anonymous: true, water: 'flow' },
  { name: 'water-cloud', path: '/pages/water/water', ready: '喝一杯，冒个泡', water: 'cloud' },
  { name: 'water-share', path: '/pages/water/water', ready: '喝一杯，冒个泡', anonymous: true },
  { name: 'water-share-legacy', path: '/pages/water-share/water-share', ready: '喝一杯，冒个泡', anonymous: true },
  { name: 'index-login', path: '/pages/index/index?login=1', ready: '以前用过微信小程序', anonymous: true },
  { name: 'guest-index', path: '/pages/index/index', ready: '从第一件小事开始', anonymous: true, guest: true },
  { name: 'guest-search', path: '/pages/index/index', ready: '游客本机搜索', anonymous: true, guest: true, guestSeed: true, click: '搜搜', clicked: '搜搜我们的小记', ask: '游客', answered: '相关内容' },
  { name: 'guest-login-cancel', path: '/pages/index/index?login=1', ready: '以前用过微信小程序', anonymous: true, cancelLogin: true },
  { name: 'guest-note-flow', path: '/pages/editor/editor?kind=note', ready: '标题', anonymous: true, guest: true, offlineSave: '游客本机小记', guestCrud: true },
  { name: 'guest-reminder-flow', path: '/pages/editor/editor?kind=reminder', ready: '提醒时间', anonymous: true, guest: true, offlineSave: '游客本机待办', guestCrud: true },
  { name: 'guest-paper-todo', path: '/pages/editor/editor?kind=note', ready: '标题', anonymous: true, guest: true, paperEmpty: true, newTodoChecked: true },
  { name: 'guest-import-accept', path: '/pages/index/index?login=1', ready: '以前用过微信小程序', anonymous: true, guestImport: 'accept' },
  { name: 'guest-import-decline', path: '/pages/index/index?login=1', ready: '以前用过微信小程序', anonymous: true, guestImport: 'decline' },
  { name: 'index-notes', path: '/pages/index/index', ready: '周末一起去看展' },
  { name: 'index-notes-selection', path: '/pages/index/index', ready: '周末一起去看展', holdSelection: true },
  { name: 'index-reminders', path: '/pages/index/index', ready: '周末一起去看展', click: '提醒', clicked: '别忘了这些小事' },
  { name: 'index-reminders-selection', path: '/pages/index/index', ready: '周末一起去看展', click: '提醒', clicked: '别忘了这些小事', holdSelection: true },
  { name: 'index-search', path: '/pages/index/index', ready: '周末一起去看展', click: '搜搜', clicked: '搜搜我们的小记' },
  { name: 'index-search-result', path: '/pages/index/index', ready: '周末一起去看展', click: '搜搜', clicked: '搜搜我们的小记', ask: '周末看什么？', answered: '相关内容' },
  { name: 'index-search-model', path: '/pages/index/index', ready: '周末一起去看展', click: '搜搜', clicked: '搜搜我们的小记', ask: '猪什么时候会飞', answered: '现实中的猪不会自主飞行' },
  { name: 'index-search-empty', path: '/pages/index/index', ready: '周末一起去看展', click: '搜搜', clicked: '搜搜我们的小记', ask: '不存在的外部事实 9988', answered: '没有找到相关数据' },
  { name: 'index-us', path: '/pages/us/us', ready: '有各自的小记' },
  { name: 'guest-us', path: '/pages/us/us', ready: '推荐给朋友', anonymous: true, guest: true },
  { name: 'index-us-edit', path: '/pages/us/us', ready: '有各自的小记', click: '编辑', clicked: '保存' },
  { name: 'index-us-phone', path: '/pages/us/us', ready: 'Stock Platform 联动', click: '绑定', clicked: '中国大陆手机号' },
  { name: 'index-us-app-login', path: '/pages/us/us', ready: '在 Android App 登录', click: '设置', clicked: 'App 登录密码' },
  ...(itemId ? [{ name: 'detail-note', path: `/pages/detail/detail?id=${encodeURIComponent(itemId)}`, ready: '周末一起去看展' }] : []),
  ...(itemId ? [{ name: 'detail-note-gallery', path: `/pages/detail/detail?id=${encodeURIComponent(itemId)}`, ready: '附件', preClickSelector: '.thumbnail' }] : []),
  ...(ledgerId ? [{ name: 'detail-note-ledger', path: `/pages/detail/detail?id=${encodeURIComponent(ledgerId)}`, ready: '记账汇总', ledgerSummary: true }] : []),
  ...(paperId ? [{ name: 'detail-note-paper', path: `/pages/detail/detail?id=${encodeURIComponent(paperId)}`, ready: '旅行灵感纸' }] : []),
  { name: 'editor-note', path: '/pages/editor/editor?kind=note', ready: '标题', classicBody: true },
  ...(ledgerId ? [{ name: 'editor-note-ledger', path: `/pages/editor/editor?id=${encodeURIComponent(ledgerId)}`, ready: '记账汇总', ledgerSummary: true }] : []),
  { name: 'editor-note-offline', path: '/pages/editor/editor?kind=note', ready: '标题', offline: true, offlineSave: '断网也能记下' },
  { name: 'editor-reminder-offline', path: '/pages/editor/editor?kind=reminder', ready: '提醒时间', offline: true, offlineSave: '断网提醒' },
  { name: 'editor-paper-empty', path: '/pages/editor/editor?kind=note', ready: '标题', paperEmpty: true },
  { name: 'editor-paper-new-todo-checked', path: '/pages/editor/editor?kind=note', ready: '标题', paperEmpty: true, newTodoChecked: true },
  ...(paperId ? [{ name: 'editor-note-paper', path: `/pages/editor/editor?id=${encodeURIComponent(paperId)}`, ready: '灵感纸' }] : []),
  ...(paperId ? [{ name: 'editor-note-paper-todo-checked', path: `/pages/editor/editor?id=${encodeURIComponent(paperId)}`, ready: '灵感纸', preClickSelector: '.todo-row uni-button' }] : []),
  ...(paperId ? [{ name: 'editor-note-paper-todo-flow', path: `/pages/editor/editor?id=${encodeURIComponent(paperId)}`, ready: '灵感纸', todoFlow: true }] : []),
  ...(paperId ? [{ name: 'editor-note-paper-keyboard', path: `/pages/editor/editor?id=${encodeURIComponent(paperId)}`, ready: '灵感纸', keyboardScenario: true }] : []),
  ...(paperId ? [{ name: 'editor-note-paper-settings', path: `/pages/editor/editor?id=${encodeURIComponent(paperId)}`, ready: '灵感纸', paperSettings: true }] : []),
  ...(paperId ? [{ name: 'editor-note-handwriting', path: `/pages/editor/editor?id=${encodeURIComponent(paperId)}`, ready: '灵感纸', click: '手写', clicked: '清空', drawSelector: '.pad-canvas' }] : []),
  { name: 'editor-note-format', path: '/pages/editor/editor?kind=note', ready: '标题', click: '格式', clicked: '备忘录格式' },
  ...(paperId ? [{ name: 'detail-note-paper-todo-checked', path: `/pages/detail/detail?id=${encodeURIComponent(paperId)}`, ready: '旅行灵感纸', preClickSelector: '.todo' }] : []),
  { name: 'editor-reminder', path: '/pages/editor/editor?kind=reminder', ready: '提醒时间' },
  { name: 'sports-provider-error', path: '/pages/sports/sports', ready: '赛事数据获取失败' },
  { name: 'match-provider-error', path: '/pages/match-detail/match-detail?id=unavailable', ready: '无法显示这场比赛' },
  { name: 'news-provider-error', path: '/pages/news/news', ready: '新闻数据获取失败' },
  { name: 'news-detail-error', path: '/pages/news-detail/news-detail?id=unavailable', ready: '无法显示这条新闻' },
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
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-sync',
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
  await page.call('Network.enable')
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
      const apiRequestStart = page.apiRequests.length
      const remoteCountBefore = screen.offlineSave ? (await apiRequest('/api/items', 'GET', undefined, session)).filter(item => item.title === screen.offlineSave).length : 0
      await page.call('Network.setBlockedURLs', { urls: screen.offline ? ['*/api/*'] : [] })
      if (session && !screen.anonymous) {
        await page.call('Runtime.evaluate', {
          expression: `localStorage.setItem('session', ${JSON.stringify(session)})`,
        })
      } else if (screen.anonymous) {
        await page.call('Runtime.evaluate', {
          expression: "localStorage.removeItem('session')",
        })
      }
      if (screen.guest || screen.guestImport) await page.call('Runtime.evaluate', { expression: `localStorage.removeItem('guest-items-v1')` })
      if (screen.guestSeed) await page.call('Runtime.evaluate',{expression:`localStorage.setItem('guest-items-v1',JSON.stringify({type:'object',data:[{id:'local-qa-search',owner:'local-guest',kind:'note',title:'游客本机搜索',content:'没有联网',scope:'mine',links:[]}]}))`})
      if (screen.guestImport) await page.call('Runtime.evaluate', { expression: `localStorage.setItem('guest-items-v1',JSON.stringify({type:'object',data:[{id:'local-${Date.now().toString(16)}-${width.toString(16)}${screen.guestImport==='accept'?'a':'d'}',owner:'local-guest',kind:'note',title:'游客导入-${width}-${screen.guestImport}',content:'只在确认后同步',scope:'mine',links:[],syncPending:false}]}))` })
      await page.call('Page.navigate', { url: route(screen.path, ++navigationNonce) })
      await wait(500)
      await waitForText(page, screen.ready)
      if (screen.water) {
        if(screen.water!=='cloud')await page.call('Runtime.evaluate', { expression: `localStorage.removeItem('water-v1:local-guest')` })
        if(screen.water==='flow'){
          await page.call('Runtime.evaluate',{expression:`document.querySelector('.water-entry').click()`})
          await waitForText(page,'喝一杯，冒个泡')
        }
        if (screen.water !== 'empty') {
          const before=await page.call('Runtime.evaluate',{expression:`Number(document.querySelector('.count').textContent)`,returnByValue:true})
          await page.call('Runtime.evaluate',{expression:`document.querySelector('.cup-hit').click()`})
          await wait(150)
          if(screen.water==='flow'){
            await page.call('Runtime.evaluate',{expression:`document.querySelector('.cup-hit').click();document.querySelector('.cup-hit').click();document.querySelector('.cup-hit').click()`})
            await wait(200)
          }
          const expected=screen.water==='flow'?4:before.result.value+1
          if(screen.water==='cloud'){
            let uploaded=false
            for(let attempt=0;attempt<60;attempt++){const records=await apiRequest('/api/water/entries','GET',undefined,session);if(records.filter(entry=>!entry.deleted).length>=expected){uploaded=true;break}await wait(100)}
            if(!uploaded)throw new Error('Water event was not synced to the account')
          }
          await page.call('Page.reload', { ignoreCache: true })
          await waitForText(page, '喝一杯，冒个泡')
          await wait(600)
          const total = await page.call('Runtime.evaluate', { expression: `Number(document.querySelector('.count').textContent)`, returnByValue: true })
          if (total.result.value !== expected) throw new Error('Water entries did not survive reload')
          if(screen.water==='flow')await waitForText(page,'鼓起来了')
          if(screen.water==='flow'){
            await wait(600)
            const shot=await page.call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false})
            await writeFile(join(outputDir,`${width}-water-overflow.png`),Buffer.from(shot.data,'base64'))
          }
          await page.call('Runtime.evaluate', { expression: `document.querySelector('.undo').click()` })
          await waitForText(page,'瘪嘴了')
          await wait(200)
          const remaining = await page.call('Runtime.evaluate', { expression: `Number(document.querySelector('.count').textContent)`, returnByValue: true })
          if (remaining.result.value !== expected-1) throw new Error('Undo did not update cup count')
          if(screen.water==='flow'){
            const shot=await page.call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false})
            await writeFile(join(outputDir,`${width}-water-undo.png`),Buffer.from(shot.data,'base64'))
          }
          if(screen.water==='flow'){
            // Sharing should open the share UI and stay on the current log.
            await page.call('Runtime.evaluate',{expression:`document.querySelector('.header-action').click()`})
            await wait(200)
            const shared=await page.call('Runtime.evaluate',{expression:`({route:location.hash,cups:Number(document.querySelector('.count').textContent),badge:!!document.querySelector('.header-action-badge'),label:document.querySelector('.page-mark')?.textContent})`,returnByValue:true})
            if(!shared.result.value.route.includes('/pages/water/water')||shared.result.value.cups!==3||!shared.result.value.badge||shared.result.value.label)throw new Error('Direct sharing changed route/count or retained the redundant badge')
          }
        } else {
          await page.call('Page.reload', { ignoreCache: true })
          await waitForText(page, '干巴巴')
        }
        await wait(1000)
      }
      if (screen.cancelLogin) {
        await page.call('Runtime.evaluate', { expression: `document.querySelector('.guest-back').click()` })
        await waitForText(page, '随手记下')
        const cancelled = await page.call('Runtime.evaluate', { expression: `!document.querySelector('.login-card')&&!localStorage.getItem('session')`, returnByValue: true })
        if (!cancelled.result.value) throw new Error('Cancelling login did not restore guest access')
      }
      if (screen.guestImport) {
        await page.call('Runtime.evaluate', { expression: `(() => { const fields=document.querySelectorAll('.auth-form input'); for(const [i,value] of ['guest-qa','Guest-QA-password-2026'].entries()){Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(fields[i],value);fields[i].dispatchEvent(new Event('input',{bubbles:true}))}document.querySelector('.consent').click();document.querySelector('.login-card .primary').click() })()` })
        await waitForText(page, '同步本机游客记录？')
        await page.call('Runtime.evaluate', { expression: `document.querySelector(${JSON.stringify(screen.guestImport === 'accept' ? '.uni-modal__btn_primary' : '.uni-modal__btn_default')}).click()` })
        await waitForText(page, '随手记下')
        const title = `游客导入-${width}-${screen.guestImport}`
        if (screen.guestImport === 'accept') {
          await waitForText(page, title)
          let imported = false
          for(let i=0;i<50;i++){const records=await apiRequest('/api/items','GET',undefined,session);if(records.some(item=>item.title===title&&item.scope==='mine')){imported=true;break}await wait(150)}
          if(!imported)throw new Error('Accepted guest import did not reach account')
        } else {
          const records=await apiRequest('/api/items','GET',undefined,session)
          if(records.some(item=>item.title===title))throw new Error('Declined guest record was uploaded')
          const kept=await page.call('Runtime.evaluate',{expression:`JSON.parse(localStorage.getItem('guest-items-v1')).data.some(item=>item.title===${JSON.stringify(title)})`,returnByValue:true})
          if(!kept.result.value)throw new Error('Declined guest record was lost')
        }
      }
      if (screen.paperEmpty) {
        await page.call('Runtime.evaluate', { expression: `(() => { const buttons=[...document.querySelectorAll('uni-button')]; buttons.find(node=>node.textContent.trim()==='格式').click() })()` })
        await waitForText(page, '备忘录格式')
        await page.call('Runtime.evaluate', { expression: `(() => { [...document.querySelectorAll('.format-picker > uni-button')].find(node=>node.textContent.includes('灵感纸')).click() })()` })
        await waitForText(page, '灵感纸')
      }
      if (screen.offlineSave) {
        await page.call('Runtime.evaluate', { expression: `(() => { const input=document.querySelector('.form input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(screen.offlineSave)}); input.dispatchEvent(new Event('input',{bubbles:true})); })()` })
        await page.call('Runtime.evaluate', { expression: `(() => { for (const [selector,value] of [['.content-input textarea',${JSON.stringify(classicBodyText)}],['.links-input textarea',${JSON.stringify(classicLinkText)}]]) { const field=document.querySelector(selector); if(!field || field.getBoundingClientRect().height<44) throw new Error('Classic textarea is absent or not editable: '+selector); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(field,value);field.dispatchEvent(new Event('input',{bubbles:true,composed:true})); } })()` })
        await wait(100)
        await page.call('Runtime.evaluate', { expression: `document.querySelector('.form .primary').click()` })
        await waitForText(page, '已保存到本机')
        await page.call('Page.navigate', { url: route('/pages/index/index', ++navigationNonce) })
        if (screen.path.includes('reminder')) {
          await waitForText(page, '随手记下')
          await page.call('Runtime.evaluate', { expression: `(() => { [...document.querySelectorAll('.dock uni-button')].find(node=>node.textContent.trim()==='提醒').click() })()` })
        }
        await waitForText(page, screen.offlineSave)
        // Reloading the document while API requests are blocked verifies durable storage.
        await page.call('Page.reload', { ignoreCache: true })
        await waitForText(page, '随手记下')
        if (screen.path.includes('reminder')) await page.call('Runtime.evaluate', { expression: `(() => { [...document.querySelectorAll('.dock uni-button')].find(node=>node.textContent.trim()==='提醒').click() })()` })
        await waitForText(page, screen.offlineSave)
        await page.call('Runtime.evaluate', { expression: `(() => { [...document.querySelectorAll('.feed-list .card')].find(node=>node.textContent.includes(${JSON.stringify(screen.offlineSave)})).click() })()` })
        await waitForText(page, screen.offlineSave)
        await waitForText(page, '编辑')
        await waitForText(page, classicBodyText.split('\n')[0])
        await waitForText(page, classicLinkText)
      }
      if (screen.classicBody) {
        const classicInput = await page.call('Runtime.evaluate', { expression: `(() => {const field=document.querySelector('.content-input textarea'); const frame=document.querySelector('.content-input .textarea-frame'); const links=document.querySelector('.links-input textarea'); if(!field||!frame||!links)return null; const rect=field.getBoundingClientRect(); const outer=frame.getBoundingClientRect(); field.focus(); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(field,${JSON.stringify(classicBodyText)});field.dispatchEvent(new Event('input',{bubbles:true,composed:true})); return {width:rect.width,height:rect.height,frameHeight:outer.height,inside:rect.top>=outer.top && rect.bottom<=outer.bottom,linksHeight:links.getBoundingClientRect().height,focused:document.activeElement===field};})()`, returnByValue: true })
        const value = classicInput.result.value
        if (!value || value.width < 100 || value.height < 44 || value.frameHeight !== 148 || !value.inside || value.linksHeight < 44 || !value.focused) throw new Error('Classic note body or links are absent, clipped, or unfocusable: '+JSON.stringify(value))
        await page.call('Runtime.evaluate', { expression: 'document.activeElement?.blur()' })
      }
      if (screen.paperSettings) {
        const before = await apiRequest(`/api/items/${encodeURIComponent(paperId)}`, 'GET', undefined, session)
        await page.call('Runtime.evaluate', { expression: `document.querySelector('.paper-meta .pin-setting').click()` })
        for (const scope of ['我们俩', '仅自己']) {
          await page.call('Runtime.evaluate', { expression: `document.querySelector('.paper-meta uni-picker').click()` })
          await wait(150)
          await page.call('Runtime.evaluate', { expression: `(() => {[...document.querySelectorAll('.uni-picker-select .uni-picker-item')].find(node=>node.textContent.trim()===${JSON.stringify(scope)}).click()})()` })
          await wait(150)
          const selected = await page.call('Runtime.evaluate', { expression: `document.querySelector('.paper-meta .scope-field').textContent.trim()`, returnByValue: true })
          if (selected.result.value !== scope) throw new Error('Inline paper visibility did not update: '+selected.result.value)
        }
        for (const format of ['经典备忘', '灵感纸']) {
          await page.call('Runtime.evaluate', { expression: `(() => {[...document.querySelectorAll('uni-button')].find(node=>node.textContent.trim()==='格式').click()})()` })
          await waitForText(page, '备忘录格式')
          await page.call('Runtime.evaluate', { expression: `(() => {[...document.querySelectorAll('.format-picker > uni-button')].find(node=>node.textContent.includes(${JSON.stringify(format)})).click()})()` })
          await waitForText(page, format === '经典备忘' ? '可见范围' : '灵感纸')
        }
        await page.call('Runtime.evaluate', { expression: `document.querySelector('.paper-save').click()` })
        await waitForText(page, '已保存')
        const saved = await apiRequest(`/api/items/${encodeURIComponent(paperId)}`, 'GET', undefined, session)
        if (saved.scope !== 'mine' || saved.pinned !== !before.pinned || JSON.stringify(saved.blocks) !== JSON.stringify(before.blocks) || JSON.stringify(saved.links) !== JSON.stringify(before.links) || JSON.stringify(saved.attachments) !== JSON.stringify(before.attachments)) throw new Error('Inline settings or note content failed to survive format switching and saving')
        await page.call('Page.navigate', { url: route(screen.path, ++navigationNonce) })
        await waitForText(page, '灵感纸')
        const inline = await page.call('Runtime.evaluate', { expression: `(() => {const row=document.querySelector('.paper-meta'),scope=row?.querySelector('.scope-field'),pin=row?.querySelector('.pin-setting');return {scopeHeight:scope?.getBoundingClientRect().height,pinHeight:pin?.getBoundingClientRect().height,pinWidth:pin?.getBoundingClientRect().width,contained:pin?.getBoundingClientRect().right<=innerWidth,modal:Boolean(document.querySelector('.format-picker-layer')),checked:Boolean(pin?.querySelector('.uni-switch-input-checked'))};})()`, returnByValue: true })
        const value = inline.result.value
        if (!value || value.scopeHeight < 44 || value.pinHeight < 44 || value.pinWidth < 44 || !value.contained || value.modal || value.checked !== saved.pinned) throw new Error('Paper settings are not directly usable inline after reopening: '+JSON.stringify(value))
        await page.call('Runtime.evaluate', { expression: `(() => {[...document.querySelectorAll('uni-button')].find(node=>node.textContent.trim()==='格式').click()})()` })
        await waitForText(page, '备忘录格式')
        await page.call('Runtime.evaluate', { expression: `(() => {[...document.querySelectorAll('.format-picker > uni-button')].find(node=>node.textContent.includes('经典备忘')).click()})()` })
        await waitForText(page, '可见范围')
        const editedBody = await page.call('Runtime.evaluate', { expression: `(() => {const field=document.querySelector('.content-input textarea');const text=field.value+'\\n经典模式追加的正文必须保留';Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(field,text);field.dispatchEvent(new Event('input',{bubbles:true,composed:true}));return text})()`, returnByValue: true })
        await page.call('Runtime.evaluate', { expression: `(() => {[...document.querySelectorAll('uni-button')].find(node=>node.textContent.trim()==='格式').click()})()` })
        await waitForText(page, '备忘录格式')
        await page.call('Runtime.evaluate', { expression: `(() => {[...document.querySelectorAll('.format-picker > uni-button')].find(node=>node.textContent.includes('灵感纸')).click()})()` })
        await waitForText(page, '灵感纸')
        const editedTextVisible = await page.call('Runtime.evaluate', { expression: `[...document.querySelectorAll('.paragraph-input textarea')].some(field=>field.value.includes('经典模式追加的正文必须保留'))`, returnByValue: true })
        if (!editedTextVisible.result.value) throw new Error('Switching back to paper silently discarded the edited classic body')
        await page.call('Runtime.evaluate', { expression: `document.querySelector('.paper-save').click()` })
        await waitForText(page, '已保存')
        const editedSaved = await apiRequest(`/api/items/${encodeURIComponent(paperId)}`, 'GET', undefined, session)
        if (editedSaved.content !== editedBody.result.value || JSON.stringify(editedSaved.links) !== JSON.stringify(saved.links) || JSON.stringify(editedSaved.attachments) !== JSON.stringify(saved.attachments)) throw new Error('Edited classic body, attachments, or links failed to survive saving as paper')
        // Keep the shared todo fixture intact for the remaining viewport checks.
        await apiRequest(`/api/items/${encodeURIComponent(paperId)}`, 'PUT', saved, session)
        await page.call('Runtime.evaluate', { expression: `localStorage.removeItem('home-snapshot-v1')` })
        await page.call('Page.navigate', { url: route(screen.path, ++navigationNonce) })
        await waitForText(page, '灵感纸')
      }
      if (screen.ledgerSummary) {
        const ledger = await page.call('Runtime.evaluate', { expression: `document.querySelector('.ledger-summary')?.innerText`, returnByValue: true })
        if (!ledger.result.value?.includes('已识别 16 条记录') || !ledger.result.value.includes('-¥9,545')) throw new Error('Travel ledger summary missing from classic note: '+ledger.result.value)
      }
      if (screen.newTodoChecked) {
        await page.call('Runtime.evaluate', { expression: `document.querySelector('.paper-toolbar [aria-label="待办"]').click()` })
        await wait(150)
        await page.call('Runtime.evaluate', { expression: `document.querySelector('.todo-row [aria-label="切换待办状态"]').click()` })
        await wait(150)
        await page.call('Runtime.evaluate', { expression: `(() => { const field=document.querySelector('.todo-row input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(field,'新建时勾选后仍可编辑'); field.dispatchEvent(new Event('input',{bubbles:true,composed:true})); })()` })
        await wait(150)
        const checked = await page.call('Runtime.evaluate', { expression: `(() => {const row=document.querySelector('.todo-row');return row.classList.contains('checked') && Boolean(row.querySelector('.status-icon.checked')) && row.querySelector('input').value==='新建时勾选后仍可编辑' && !row.querySelector('input').disabled;})()`, returnByValue: true })
        if (!checked.result.value) throw new Error('New paper todo cannot be checked and edited')
      }
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
      const holdAudit = screen.holdSelection ? await auditHoldSelection(page, width, screen.name) : undefined
      if (screen.todoFlow) {
        await page.call('Runtime.evaluate', { expression: `(() => { const field=document.querySelector('.todo-row input'); field.focus(); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(field,'回车继续下一项'); field.dispatchEvent(new Event('input',{bubbles:true,composed:true})); })()` })
        const before = await page.call('Runtime.evaluate', { expression: `document.querySelectorAll('.todo-row input').length`, returnByValue: true })
        await page.call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 })
        await page.call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 })
        await wait(150)
        const continued = await page.call('Runtime.evaluate', { expression: `({ count:document.querySelectorAll('.todo-row input').length, focused:document.activeElement?.closest('.todo-row')!==null, value:document.activeElement?.value })`, returnByValue: true })
        if (continued.result.value.count !== before.result.value + 1 || !continued.result.value.focused || continued.result.value.value !== '') throw new Error('Todo Enter did not create and focus the next item')
        await page.call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 })
        await page.call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 })
        await wait(150)
        const exited = await page.call('Runtime.evaluate', { expression: `document.activeElement?.tagName==='TEXTAREA' && document.querySelectorAll('.todo-row input').length===${before.result.value}`, returnByValue: true })
        if (!exited.result.value) throw new Error('Empty todo Enter did not continue into a paragraph')
      }
      if (screen.drawSelector) {
        const drawResult = await page.call('Runtime.evaluate', {
          expression: `(() => { const node = document.querySelector(${JSON.stringify(screen.drawSelector)}); if (!node) return null; const rect = node.getBoundingClientRect(); return { left: rect.left, top: rect.top, width: rect.width, height: rect.height } })()`,
          returnByValue: true,
        })
        const rect = drawResult.result.value
        if (!rect) throw new Error(`Could not draw on: ${screen.drawSelector}`)
        const points = [[.2, .28], [.3, .38], [.42, .32], [.53, .48], [.65, .36], [.76, .52]].map(([x, y]) => ({ x: rect.left + rect.width * x, y: rect.top + rect.height * y }))
        await page.call('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [points[0]] })
        for (const point of points.slice(1)) await page.call('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [point] })
        await page.call('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
        await wait(180)
        const inkAudit = await page.call('Runtime.evaluate', {
          expression: `(() => { const host=document.querySelector(${JSON.stringify(screen.drawSelector)}); const canvas=host?.querySelector('canvas') || host; const context=canvas?.getContext?.('2d'); if(!context) return null; const pixels=context.getImageData(0,0,canvas.width,canvas.height).data; let cornerInk=0,totalInk=0; for(let y=0;y<canvas.height;y++)for(let x=0;x<canvas.width;x++){const i=(y*canvas.width+x)*4; if(pixels[i+3]>0 && pixels[i]<100 && pixels[i+1]<100 && pixels[i+2]<100){totalInk++;if(x<canvas.width*.12 && y<canvas.height*.12)cornerInk++;}} return {cornerInk,totalInk}; })()`, returnByValue: true,
        })
        if (!inkAudit.result.value || inkAudit.result.value.cornerInk || !inkAudit.result.value.totalInk) throw new Error('Handwriting drew stray origin lines or no ink')
      }
      if (screen.keyboardScenario) {
        await page.call('Runtime.evaluate', { expression: `(() => { const field=document.querySelector('.paragraph-input textarea'); field.focus(); const value='长正文回归检查\\n'.repeat(60); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(field,value); field.setSelectionRange(value.length,value.length); Object.defineProperty(window.visualViewport,'height',{configurable:true,value:500}); window.visualViewport.dispatchEvent(new Event('resize')); field.dispatchEvent(new Event('input',{bubbles:true,composed:true})); })()` })
        let caretVisible = false
        for (let attempt=0; attempt<20; attempt++) {
          await wait(150)
          const visible=await page.call('Runtime.evaluate',{expression:`document.querySelector('.paragraph-input').getBoundingClientRect().bottom <= document.querySelector('.paper-toolbar').getBoundingClientRect().top - 8`,returnByValue:true})
          if(visible.result.value) { caretVisible=true; break }
        }
        if(!caretVisible) throw new Error('Long-paragraph caret hidden: '+JSON.stringify(page.exceptions))
        const before = await page.call('Runtime.evaluate', { expression: 'window.scrollY', returnByValue: true })
        await page.call('Runtime.evaluate', { expression: `window.visualViewport.dispatchEvent(new Event('resize'))` })
        await wait(300)
        const state = await page.call('Runtime.evaluate', { expression: `({scroll:window.scrollY,bottom:document.querySelector('.paper-toolbar').getBoundingClientRect().bottom,caretBottom:document.querySelector('.paragraph-input').getBoundingClientRect().bottom,toolbarTop:document.querySelector('.paper-toolbar').getBoundingClientRect().top})`, returnByValue: true })
        if (Math.abs(state.result.value.scroll - before.result.value) > 1 || Math.abs(state.result.value.bottom - 500) > 2 || state.result.value.caretBottom > state.result.value.toolbarTop - 8) throw new Error('Keyboard docking or repeated long-paragraph layout is unstable: '+JSON.stringify(state.result.value))
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

      if (screen.name === 'index-us' || screen.name === 'guest-us') {
        const recommendation = await page.call('Runtime.evaluate', { expression: `(() => {const card=document.querySelector('.recommend-card');const button=card?.querySelector('.recommend-button');return {cards:document.querySelectorAll('.recommend-card').length,width:button?.getBoundingClientRect().width,height:button?.getBoundingClientRect().height}})()`,returnByValue:true })
        const value = recommendation.result.value
        if(value.cards!==1||value.width<44||value.height<44)throw new Error('Recommendation card is duplicated or has a small hit area: '+JSON.stringify(value))
      }

      if (screen.name.startsWith('editor-paper') || screen.name.startsWith('editor-note-paper')) {
        const geometry = await page.call('Runtime.evaluate', { expression: `(() => { const row=document.querySelector('.todo-row');const icon=document.querySelector('.paper-save .tool-icon');const circle=row?.querySelector('.status-icon');const hit=row?.querySelector('button');return {rowHeight:row?.getBoundingClientRect().height,blockPadding:row?getComputedStyle(row.closest('.block')).paddingTop:null,saveBackground:icon?getComputedStyle(icon).backgroundColor:null,saveWidth:icon?.getBoundingClientRect().width,saveHeight:icon?.getBoundingClientRect().height,saveBare:Boolean(icon?.querySelector('.save-check'))&&!document.querySelector('.paper-save .status-icon'),circleOffset:circle?circle.getBoundingClientRect().left-row.getBoundingClientRect().left:0,hitWidth:hit?.getBoundingClientRect().width,hitHeight:hit?.getBoundingClientRect().height}; })()`, returnByValue: true })
        if (geometry.result.value.rowHeight && geometry.result.value.rowHeight !== 44) throw new Error('Paper todo row is not compact: '+JSON.stringify(geometry.result.value))
        if (geometry.result.value.blockPadding && geometry.result.value.blockPadding !== '0px') throw new Error('Paper todo still has block padding')
        if (geometry.result.value.saveBackground && geometry.result.value.saveBackground !== 'rgba(0, 0, 0, 0)') throw new Error('Save icon still has a filled background')
        const value = geometry.result.value
        if (!value.saveBare || value.saveWidth !== 25 || value.saveHeight !== 25) throw new Error('Save must be a bare check in the shared 25px icon box')
        if (Math.abs(value.circleOffset) > 1 || (value.hitWidth && value.hitWidth < 44) || (value.hitHeight && value.hitHeight < 44)) throw new Error('Todo circle alignment or hit area regressed: '+JSON.stringify(value))
      }
      if (screen.name.startsWith('detail-note-paper')) {
        const alignment = await page.call('Runtime.evaluate', { expression: `(() => {const row=document.querySelector('.todo');const circle=row?.querySelector('.status-icon');return circle?circle.getBoundingClientRect().left-row.getBoundingClientRect().left:0})()`, returnByValue: true })
        if (Math.abs(alignment.result.value) > 1) throw new Error('Reading todo circle is not left aligned')
      }

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
      report.push({ width, screen: screen.name, ...audit.result.value, ...(holdAudit ? { holdAudit } : {}) })
      if (screen.guestCrud) {
        await page.call('Runtime.evaluate',{expression:`document.querySelector('.actions .primary').click()`})
        await waitForText(page,'标题')
        await page.call('Runtime.evaluate',{expression:`(() => {const field=document.querySelector('.content-input textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(field,'游客修改后的正文');field.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('.form .primary').click()})()`})
        await waitForText(page,'已保存到本机')
        await page.call('Page.reload',{ignoreCache:true})
        await waitForText(page,'游客修改后的正文')
        if (screen.path.includes('reminder')) {
          await page.call('Page.navigate',{url:route('/pages/index/index',++navigationNonce)})
          await waitForText(page,'随手记下')
          await page.call('Runtime.evaluate',{expression:`[...document.querySelectorAll('.dock uni-button')].find(node=>node.textContent.trim()==='提醒').click()`})
          await waitForText(page,screen.offlineSave)
          await page.call('Runtime.evaluate',{expression:`document.querySelector('.feed-list .done').click()`})
          await waitForText(page,'已完成')
          await page.call('Page.reload',{ignoreCache:true})
          await waitForText(page,'随手记下')
          await page.call('Runtime.evaluate',{expression:`[...document.querySelectorAll('.dock uni-button')].find(node=>node.textContent.trim()==='提醒').click()`})
          await waitForText(page,'已完成')
          await page.call('Runtime.evaluate',{expression:`document.querySelector('.feed-list .card').click()`})
          await waitForText(page,'编辑')
        }
        await page.call('Runtime.evaluate',{expression:`document.querySelector('.actions .danger').click()`})
        await waitForText(page,'删除这条内容？')
        await page.call('Runtime.evaluate',{expression:`document.querySelector('.uni-modal__btn_primary').click()`})
        await waitForText(page,'已删除')
        const remaining=await page.call('Runtime.evaluate',{expression:`(() => {const stored=JSON.parse(localStorage.getItem('guest-items-v1')||'[]');return (stored.data||stored).length})()`,returnByValue:true})
        if(remaining.result.value!==0)throw new Error('Guest deletion did not persist')
      }
      if (screen.guest && page.apiRequests.length !== apiRequestStart) throw new Error('Guest flow contacted an API: '+JSON.stringify(page.apiRequests.slice(apiRequestStart)))
      if (screen.keyboardScenario) await page.call('Runtime.evaluate', { expression: `delete window.visualViewport.height; window.visualViewport.dispatchEvent(new Event('resize'));` })
      if (screen.offlineSave && !screen.anonymous) {
        await page.call('Network.setBlockedURLs', { urls: [] })
        await page.call('Page.navigate', { url: route('/pages/index/index', ++navigationNonce) })
        let synced = false
        for (let attempt = 0; attempt < 60; attempt += 1) {
          const count = (await apiRequest('/api/items', 'GET', undefined, session)).filter(item => item.title === screen.offlineSave).length
          if (count === remoteCountBefore + 1) { synced = true; break }
          if (count > remoteCountBefore + 1) throw new Error('Offline sync created a duplicate item')
          await wait(150)
        }
        if (!synced) throw new Error(`Offline item did not sync after reconnecting: ${screen.offlineSave}`)
      }
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
