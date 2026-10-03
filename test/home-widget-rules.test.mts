import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { buildHomeWidgetNotes } from '../src/services/home-widget-rules.ts'
import type { Item } from '../src/services/api.ts'

const note = (overrides: Partial<Item> = {}): Item => ({
  id: 'note-1',
  kind: 'note',
  title: '世界杯',
  content: '6-12：买42 赢0',
  scope: 'mine',
  links: [],
  updatedAt: '2026-09-12T04:00:00.000Z',
  ...overrides,
})

test('home widget only exposes saved notes and prefers pinned content', () => {
  const result = buildHomeWidgetNotes([
    note({ id: 'newer', title: '更新的小记', updatedAt: '2026-09-23T04:00:00.000Z' }),
    note({ id: 'pinned', title: '置顶的小记', pinned: true, updatedAt: '2026-09-10T04:00:00.000Z' }),
    note({ id: 'reminder', kind: 'reminder', title: '提醒' }),
    note({ id: undefined, title: '尚未保存' }),
  ])

  assert.deepEqual(result.map(item => item.id), ['pinned', 'newer'])
})

test('home widget normalizes card text and supplies safe fallbacks', () => {
  const [result] = buildHomeWidgetNotes([
    note({ title: '   ', content: '第一行\r\n\r\n\r\n第二行', updatedAt: 'not-a-date' }),
  ])

  assert.equal(result.title, '未命名小记')
  assert.equal(result.content, '第一行\n\n第二行')
  assert.equal(result.date, '最近更新')
  assert.deepEqual(result.images, [])
})

test('home widget keeps up to ten image attachments for the native carousel', () => {
  const attachments = Array.from({ length: 12 }, (_, index) => ({ id: `image-${index}`, name: `照片-${index}.jpg`, size: 100 }))
  attachments.push({ id: 'document', name: '说明.txt', size: 100 })
  const [result] = buildHomeWidgetNotes([note({ attachments })])

  assert.equal(result.images.length, 10)
  assert.equal(result.images[0].id, 'image-0')
  assert.equal(result.images.some(item => item.id === 'document'), false)
})

test('home widget limits native cache size and text length', () => {
  const notes = Array.from({ length: 70 }, (_, index) => note({
    id: `note-${index}`,
    title: `标题${index}`.repeat(30),
    content: '正文'.repeat(3_000),
    updatedAt: `2026-09-${String((index % 20) + 1).padStart(2, '0')}T04:00:00.000Z`,
  }))
  const result = buildHomeWidgetNotes(notes)

  assert.equal(result.length, 60)
  assert.ok(result.every(item => item.title.length <= 100))
  assert.ok(result.every(item => item.content.length <= 4_000))
})

test('quote widget keeps one deterministic quote for each half-hour slot', () => {
  const interval = 30 * 60 * 1_000
  const quoteIndex = (now: number, appWidgetId: number, count: number) => {
    const slot = Math.floor(now / interval)
    return ((slot + appWidgetId * 37) % count + count) % count
  }
  const start = Date.UTC(2026, 9, 3, 8, 0, 0)

  assert.equal(quoteIndex(start, 12, 48), quoteIndex(start + interval - 1, 12, 48))
  assert.notEqual(quoteIndex(start, 12, 48), quoteIndex(start + interval, 12, 48))
  assert.equal(quoteIndex(start + interval, 12, 48), quoteIndex(start + interval * 2 - 1, 12, 48))
  assert.notEqual(quoteIndex(start + interval, 12, 48), quoteIndex(start + interval * 2, 12, 48))
  assert.notEqual(quoteIndex(start, 12, 48), quoteIndex(start, 13, 48))
})

test('Android quote mode is widget-only, locally curated, and always configurable', async () => {
  const native = await readFile('src/uni_modules/together-home-widget/utssdk/app-android/TogetherHomeWidgetNative.kt', 'utf8')
  const catalog = await readFile('src/uni_modules/together-home-widget/utssdk/app-android/TogetherQuoteCatalog.kt', 'utf8')
  const rotation = await readFile('src/uni_modules/together-home-widget/utssdk/app-android/TogetherQuoteRotation.kt', 'utf8')
  const renderer = await readFile('src/uni_modules/together-home-widget/utssdk/app-android/TogetherQuoteWidgetRenderer.kt', 'utf8')
  const home = await readFile('src/pages/index/index.vue', 'utf8')
  const pages = await readFile('src/pages.json', 'utf8')
  const provider = await readFile('src/uni_modules/together-home-widget/utssdk/app-android/res/xml/together_note_widget_info.xml', 'utf8')
  const provider31 = await readFile('src/uni_modules/together-home-widget/utssdk/app-android/res/xml-v31/together_note_widget_info.xml', 'utf8')

  assert.match(rotation, /QUOTE_ROTATION_INTERVAL_MS = 30L \* 60L \* 1000L/)
  assert.match(rotation, /nowMillis \/ QUOTE_ROTATION_INTERVAL_MS/)
  assert.match(rotation, /mixedSlot % quoteCount\.toLong\(\)/)
  assert.doesNotMatch(rotation, /Math\.floor(?:Div|Mod)/)
  assert.match(rotation, /appWidgetId\.toLong\(\) \* 37L/)
  assert.ok((catalog.match(/TogetherWidgetQuote\(/g) || []).length >= 48)
  assert.doesNotMatch(catalog, /https?:\/\//)
  assert.match(native, /list\.addView\(quoteCard\(\)\)[^]*if \(notes\.isEmpty\(\)\) list\.addView\(emptyState\(\)\)/)
  assert.match(native, /QUOTE_SELECTION_ID = "__together_quote__"/)
  assert.match(renderer, /PendingIntent\.getBroadcast/)
  assert.doesNotMatch(renderer, /EXTRA_ROUTE|pages\//)
  assert.match(provider, /updatePeriodMillis="1800000"/)
  assert.match(provider31, /updatePeriodMillis="1800000"/)
  assert.doesNotMatch(home, /句读/)
  assert.doesNotMatch(pages, /句读/)
})

test('Android release validation requires the quote layout and half-hour provider update', async () => {
  const packager = await readFile('scripts/package-android-beta.mjs', 'utf8')
  assert.match(packager, /res\/layout\/together_quote_widget\.xml/)
  assert.match(packager, /Number\(numericRefresh\) === 1_800_000/)
  assert.match(packager, /30 分钟句读刷新配置/)
})
