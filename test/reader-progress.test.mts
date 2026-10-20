import assert from 'node:assert/strict'
import test from 'node:test'
import { saveReaderProgress, type ReaderBook, type ReaderProgress } from '../src/services/reader.ts'

test('page-turn progress uses the open book without reading the full TXT library', () => {
  const storage = new Map<string, unknown>()
  const target = globalThis as typeof globalThis & { uni?: unknown }
  const original = target.uni
  const reads: string[] = []
  target.uni = {
    getStorageSync(key: string) {
      reads.push(key)
      assert.notEqual(key, 'reader-library-v1', 'A page turn must not decode all stored novel bodies')
      return storage.get(key)
    },
    setStorageSync(key: string, value: unknown) { storage.set(key, value) },
  }
  const book: Pick<ReaderBook, 'id' | 'chapters' | 'progress'> = {
    id: 'open-book',
    chapters: Array.from({ length: 4 }, (_, index) => ({ title: `第${index + 1}章`, content: '长正文' })),
    progress: { chapterIndex: 1, scrollTop: 0, updatedAt: '2026-10-20T00:00:00.000Z', readChapterIndexes: [0, 1] },
  }
  try {
    const first = saveReaderProgress(book.id, 2, -1, 478.9, book)!
    assert.equal(first.chapterIndex, 2)
    assert.equal(first.scrollTop, 0)
    assert.equal(first.characterOffset, 478)
    assert.deepEqual(first.readChapterIndexes, [0, 1, 2])
    const second = saveReaderProgress(book.id, 999, 50.8, 960, book)!
    assert.equal(second.chapterIndex, 3)
    assert.equal(second.scrollTop, 50)
    assert.equal(second.characterOffset, 960)
    assert.deepEqual(second.readChapterIndexes, [0, 1, 2, 3], 'Repeated writes merge persisted progress even if the supplied book has an older snapshot')
    const third = saveReaderProgress(book.id, -5, 0, 0, book)!
    assert.equal(third.chapterIndex, 0)
    assert.deepEqual(third.readChapterIndexes, [0, 1, 2, 3])
    assert.deepEqual((storage.get('reader-progress-v1') as Record<string, ReaderProgress>)[book.id], third)
    assert.deepEqual(reads, ['reader-progress-v1', 'reader-progress-v1', 'reader-progress-v1'])
  } finally { if (original === undefined) delete target.uni; else target.uni = original }
})

test('progress falls back to the library when supplied book identity does not match', () => {
  const target = globalThis as typeof globalThis & { uni?: unknown }
  const original = target.uni
  const now = '2026-10-20T00:00:00.000Z'
  const libraryBook: ReaderBook = {
    id: 'real-book', title: '目标小说', author: '作者', createdAt: now, updatedAt: now, parserVersion: 2,
    chapters: [{ title: '第一章', content: '正文' }, { title: '第二章', content: '正文' }],
    progress: { chapterIndex: 0, scrollTop: 0, updatedAt: now, readChapterIndexes: [0] },
  }
  const storage = new Map<string, unknown>([['reader-library-v1', [libraryBook]]])
  let libraryReads = 0
  target.uni = {
    getStorageSync(key: string) { if (key === 'reader-library-v1') libraryReads++; return storage.get(key) },
    setStorageSync(key: string, value: unknown) { storage.set(key, value) },
  }
  try {
    const unrelatedBook = { ...libraryBook, id: 'unrelated-book', chapters: [...libraryBook.chapters, { title: '额外章', content: '正文' }] }
    const saved = saveReaderProgress(libraryBook.id, 999, 0, undefined, unrelatedBook)!
    assert.equal(libraryReads, 1)
    assert.equal(saved.chapterIndex, 1, 'Chapter bounds must belong to the requested book')
    assert.deepEqual(saved.readChapterIndexes, [0, 1])
    assert.equal(saveReaderProgress('missing-book', 0, 0, 0, unrelatedBook), null)
    assert.equal(libraryReads, 2)
  } finally { if (original === undefined) delete target.uni; else target.uni = original }
})
