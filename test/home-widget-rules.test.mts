import assert from 'node:assert/strict'
import test from 'node:test'
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
