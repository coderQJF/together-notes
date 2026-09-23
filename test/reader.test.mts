import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createReaderBook,
  getReaderBook,
  loadReaderLibrary,
  parseReaderChapters,
  removeReaderBook,
  saveReaderProgress,
} from '../src/services/reader.ts'
import { decodeReaderText, readerTitleFromFileName } from '../src/services/reader-import.ts'

test('reader file import decodes common Chinese TXT encodings and derives a title', () => {
  const utf8Body = new TextEncoder().encode('第一章\r\n从这里开始。')
  const utf8 = new Uint8Array(utf8Body.length + 3)
  utf8.set([0xef, 0xbb, 0xbf])
  utf8.set(utf8Body, 3)
  assert.equal(decodeReaderText(utf8.buffer), '第一章\n从这里开始。')
  assert.equal(decodeReaderText(Uint8Array.from([0xd6, 0xd0, 0xce, 0xc4]).buffer), '中文')
  assert.equal(readerTitleFromFileName('/Download/%E7%AA%97%E8%BE%B9%E7%9A%84%E5%B0%8F%E7%81%AF.txt'), '窗边的小灯')
})

test('reader parser recognizes common Chinese chapter headings and keeps a preface', () => {
  const chapters = parseReaderChapters(`写在前面\n\n第一章 相遇\n第一章正文。\n\n第二章\n第二章正文。`)
  assert.deepEqual(chapters.map(item => item.title), ['正文前', '第一章 相遇', '第二章'])
  assert.equal(chapters[1].content, '第一章正文。')
})

test('reader parser splits long heading-free text without losing paragraphs', () => {
  const first = '甲'.repeat(4_000)
  const second = '乙'.repeat(4_000)
  const chapters = parseReaderChapters(`${first}\n\n${second}`)
  assert.equal(chapters.length, 2)
  assert.equal(chapters[0].content, first)
  assert.equal(chapters[1].content, second)
})

test('reader parser normalizes newlines and rejects blank content', () => {
  assert.deepEqual(parseReaderChapters('  \r\n '), [])
  assert.equal(parseReaderChapters('\uFEFF序章\r\n从这里开始。')[0].content, '从这里开始。')
})

test('local reader storage creates books, saves progress, and removes content', () => {
  const storage = new Map<string, unknown>()
  const target = globalThis as typeof globalThis & { uni?: unknown }
  const original = target.uni
  target.uni = {
    getStorageSync(key: string) { return storage.get(key) },
    setStorageSync(key: string, value: unknown) { storage.set(key, value) },
  }
  try {
    const now = new Date().toISOString()
    storage.set('reader-library-v1', [{ id: 'starter-window-light', title: '窗边的小灯', author: '小记原创示例', chapters: [{ title: '正文', content: '示例' }], createdAt: now, updatedAt: now, progress: { chapterIndex: 0, scrollTop: 0, updatedAt: now } }])
    assert.equal(loadReaderLibrary().length, 0)
    assert.deepEqual(storage.get('reader-library-v1'), [])
    const book = createReaderBook({ title: '测试书', text: '第一章 开始\n内容。\n第二章 继续\n更多内容。' })
    assert.equal(book.chapters.length, 2)
    saveReaderProgress(book.id, 1, 360)
    assert.deepEqual(getReaderBook(book.id)?.progress.chapterIndex, 1)
    assert.deepEqual(getReaderBook(book.id)?.progress.scrollTop, 360)
    removeReaderBook(book.id)
    assert.equal(getReaderBook(book.id), null)
  } finally {
    if (original === undefined) delete target.uni
    else target.uni = original
  }
})
