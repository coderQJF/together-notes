import { getCloudNovelCatalog, getCloudNovelChapter, readHomeSnapshot, type CloudNovelCatalog } from './api'
import { createReaderCloudCache, type ReaderCatalogOptions } from './reader-cache'
import type { ReaderBook } from './reader'

const cache = createReaderCloudCache({
  storage: {
    read: key => uni.getStorageSync(key),
    write: (key, value) => uni.setStorageSync(key, value),
    remove: key => uni.removeStorageSync(key),
  },
  identity() {
    const session = String(uni.getStorageSync('session') || '')
    const user = readHomeSnapshot(session)?.user
    return user && !user.guest ? { owner: user.id, session, vip: user.vip, vipExpiresAt: user.vipExpiresAt } : null
  },
  catalog: getCloudNovelCatalog,
  chapter: getCloudNovelChapter,
})

export function getCachedReaderCatalog(id: string, options?: ReaderCatalogOptions) { return cache.getCatalog(id, options) }

function bookCatalog(book: ReaderBook): CloudNovelCatalog {
  if (!book.cloudId) throw new Error('云端小说目录不完整')
  return {
    id: book.cloudId, title: book.title, author: book.author, createdAt: book.createdAt, updatedAt: book.updatedAt,
    chapterCount: book.chapters.length,
    chapters: book.chapters.map((chapter, index) => ({ chapterIndex: chapter.remoteIndex ?? index, title: chapter.title, characterCount: chapter.characterCount || 0 })),
  }
}

export function getCachedReaderChapter(book: ReaderBook, index: number) { return cache.getChapter(bookCatalog(book), index) }
export function prefetchReaderChapters(book: ReaderBook, index: number) { return cache.prefetch(bookCatalog(book), index) }
