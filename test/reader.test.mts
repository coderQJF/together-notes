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
    assert.equal(loadReaderLibrary().length, 1)
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
