import test from 'node:test'
import assert from 'node:assert/strict'
import { drawInkDot, drawInkSegment } from '../src/services/handwriting.ts'
import { keyboardDockOffset, paperScrollTarget } from '../src/services/paper-layout.ts'
import { classicToPaperBlocks, materializeNoteBlocks } from '../src/services/note-blocks.ts'
import type { NoteBlock } from '../src/services/api.ts'

test('format switching preserves unchanged structure and uses edited classic text without stale todos', () => {
  let nextId = 0
  const createId = () => `new-${++nextId}`
  const blocks: NoteBlock[] = [
    { id: 'p', type: 'paragraph', text: '原来的正文', style: { bold: true } },
    { id: 't', type: 'todo', text: '带上相机', checked: true },
    { id: 'i', type: 'image', attachmentId: 'photo' },
    { id: 'd', type: 'drawing', attachmentId: 'ink' },
    { id: 'l', type: 'link', text: '旅行资料', url: 'https://example.com/trip' },
  ]
  const attachments = [{ id: 'photo', name: '照片', size: 1 }, { id: 'ink', name: '手写', size: 1 }]
  const classic = materializeNoteBlocks(blocks)
  assert.deepEqual(classicToPaperBlocks(classic.content, classic.links, attachments, blocks, createId), blocks)
  const edited = '编辑后的正文\n[已完成] 带上相机\n旅行资料'
  const rebuilt = classicToPaperBlocks(edited, classic.links, attachments, blocks, createId)
  assert.equal(materializeNoteBlocks(rebuilt).content, edited)
  assert.deepEqual(rebuilt.filter(block => ['image', 'drawing', 'link'].includes(block.type)), [blocks[4], blocks[2], blocks[3]])
  assert.ok(!rebuilt.some(block => block.type === 'todo'))
  assert.ok(!rebuilt.some(block => block.text?.includes('原来的正文')))
})

test('classic attachment and link edits replace removed media while preserving text', () => {
  let nextId = 0
  const retained: NoteBlock[] = [{ id: 'p', type: 'paragraph', text: '正文' }, { id: 'old', type: 'image', attachmentId: 'removed' }, { id: 'l', type: 'link', url: 'https://example.com/old' }]
  const attachments = [{ id: 'new-photo', name: '新照片', size: 2 }]
  const next = classicToPaperBlocks('正文', ['https://example.com/new'], attachments, retained, () => `new-${++nextId}`)
  assert.ok(!next.some(block => block.attachmentId === 'removed' || block.url === 'https://example.com/old'))
  assert.ok(next.some(block => block.attachmentId === 'new-photo'))
  assert.ok(next.some(block => block.url === 'https://example.com/new'))
  assert.ok(materializeNoteBlocks(next).content.startsWith('正文'))
  const linkLabel: NoteBlock[] = [{ id: 'p', type: 'paragraph', text: '正文' }, { id: 'l', type: 'link', text: '保留在正文的资料名', url: 'https://example.com/old' }]
  const plain = materializeNoteBlocks(linkLabel).content
  const removedLink = classicToPaperBlocks(plain, [], [], linkLabel, () => `new-${++nextId}`)
  assert.equal(materializeNoteBlocks(removedLink).content, plain)
  assert.ok(!removedLink.some(block => block.type === 'link'))
})

test('keyboard docking accounts for overlay, resize and partially resized viewports', () => {
  assert.equal(keyboardDockOffset(300, 844, 844), 300)
  assert.equal(keyboardDockOffset(300, 844, 544), 0)
  assert.equal(keyboardDockOffset(300, 844, 644), 100)
  assert.equal(keyboardDockOffset(0, 844, 844), 0)
  assert.equal(keyboardDockOffset(300, 844, 500), 0)
  assert.equal(paperScrollTarget(100, 500, 548, 80, 450), 198)
  assert.equal(paperScrollTarget(100, 40, 88, 80, 450), 60)
  assert.equal(paperScrollTarget(100, 200, 248, 80, 450), null)
  assert.equal(paperScrollTarget(100, -300, 448, 80, 450), null)
  assert.equal(paperScrollTarget(100, -300, 500, 80, 450), 150)
})

test('each handwriting batch resets its path to the previous touch, never the canvas origin', () => {
  let path: number[][] = []
  let width = 0
  const segments: number[][][] = []
  const context = {
    setStrokeStyle() {}, setFillStyle() {}, setLineCap() {}, setLineJoin() {},
    setLineWidth(value: number) { width = value },
    beginPath() { path = [] },
    moveTo(x: number, y: number) { path.push([x, y]) },
    lineTo(x: number, y: number) { if (!path.length) path.push([0, 0]); path.push([x, y]) },
    stroke() { assert.equal(width, 2.6); segments.push([...path]) },
    draw(reserve: boolean) { assert.equal(reserve, true); path = []; width = 1 },
    arc(x: number, y: number) { path.push([x, y]) },
    fill() { segments.push([...path]) },
  }
  drawInkSegment(context, { x: 40, y: 60 }, { x: 70, y: 80 })
  drawInkSegment(context, { x: 70, y: 80 }, { x: 90, y: 100 })
  drawInkSegment(context, { x: 160, y: 180 }, { x: 170, y: 190 })
  drawInkDot(context, { x: 210, y: 220 })
  assert.deepEqual(segments, [[[40, 60], [70, 80]], [[70, 80], [90, 100]], [[160, 180], [170, 190]], [[210, 220]]])
})
