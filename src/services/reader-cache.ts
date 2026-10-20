import { NOVEL_PARSER_VERSION } from '../../server/novel-chapters.mjs'
import type { CloudNovelCatalog, CloudNovelChapter } from './api'

export interface ReaderCacheIdentity { owner: string; session: string; vip: boolean; vipExpiresAt?: string | null }
interface CacheEntry { key: string; owner: string; book: string; kind: 'catalog' | 'chapter'; revision: string; size: number; used: number }
interface CacheStorage { read(key: string): unknown; write(key: string, value: unknown): void; remove(key: string): void }
interface CacheOptions {
  storage: CacheStorage
  identity(): ReaderCacheIdentity | null
  catalog(id: string): Promise<CloudNovelCatalog>
  chapter(id: string, index: number): Promise<CloudNovelChapter>
  now?: () => number
  maxCharacters?: number
  maxChapters?: number
  maxCatalogs?: number
}
export interface ReaderCatalogOptions {
  expectedUpdatedAt?: string
  onUpdate?: (catalog: CloudNovelCatalog) => void
  onError?: (reason: unknown) => void
}

const INDEX_KEY = 'reader-cloud-cache-v1'
const AUTHORIZATION_MS = 60_000
const REFRESH_AFTER_MS = 15_000

/** Used for content invalidation, never for authorizing access to a book. */
export function readerCatalogRevision(catalog: Pick<CloudNovelCatalog, 'updatedAt' | 'chapters'>) {
  const metadata = JSON.stringify([NOVEL_PARSER_VERSION, catalog.updatedAt, catalog.chapters.map(chapter => [chapter.chapterIndex, chapter.title, chapter.characterCount])])
  // Keep the global LRU index small even for books with thousands of chapters.
  let first = 2166136261
  let second = 2246822519
  for (let index = 0; index < metadata.length; index++) {
    const code = metadata.charCodeAt(index)
    first = Math.imul(first ^ code, 16777619)
    second = Math.imul(second ^ code, 3266489917)
  }
  return `${NOVEL_PARSER_VERSION}:${catalog.updatedAt}:${metadata.length}:${first >>> 0}:${second >>> 0}`
}

function cacheError(message: string, code: string, status = 403) { return Object.assign(new Error(message), { status, code }) }
function denied(reason: unknown) { return [401, 403, 404].includes(Number((reason as { status?: number })?.status)) }
function validCatalog(value: unknown, id: string): value is CloudNovelCatalog {
  const catalog = value as CloudNovelCatalog | null
  return Boolean(catalog && catalog.id === id && typeof catalog.updatedAt === 'string' && Array.isArray(catalog.chapters) && catalog.chapters.length && catalog.chapters.every(chapter => Number.isInteger(chapter.chapterIndex) && typeof chapter.title === 'string' && Number.isFinite(chapter.characterCount)))
}

/** Persistent content is untrusted until this session has successfully authorized its catalog. */
export function createReaderCloudCache(options: CacheOptions) {
  const now = options.now || Date.now
  const maxCharacters = options.maxCharacters ?? 1_200_000
  const maxChapters = options.maxChapters ?? 32
  const maxCatalogs = options.maxCatalogs ?? 8
  const authorizations = new Map<string, { session: string; at: number; revision: string }>()
  const jobs = new Map<string, Promise<unknown>>()
  const rejected = new Set<string>()
  const denialVersions = new Map<string, number>()
  let previousSession = ''
  let previousOwner = ''
  let index: CacheEntry[] = []
  try {
    const stored = options.storage.read(INDEX_KEY) as { parserVersion?: number; entries?: CacheEntry[] } | null
    if (stored && Array.isArray(stored.entries)) {
      const entries = stored.entries.filter(entry => entry && typeof entry.key === 'string' && entry.key.startsWith(INDEX_KEY + ':') && typeof entry.owner === 'string' && typeof entry.book === 'string' && ['catalog', 'chapter'].includes(entry.kind) && typeof entry.revision === 'string' && Number.isFinite(entry.size) && entry.size >= 0 && Number.isFinite(entry.used))
      if (stored.parserVersion === NOVEL_PARSER_VERSION) index = entries
      else for (const entry of entries) { try { options.storage.remove(entry.key) } catch {} }
    }
  } catch {}

  function saveIndex() { try { options.storage.write(INDEX_KEY, { parserVersion: NOVEL_PARSER_VERSION, entries: index }); return true } catch { return false } }
  function removeEntries(predicate: (entry: CacheEntry) => boolean) {
    index = index.filter(entry => {
      if (!predicate(entry)) return true
      try { options.storage.remove(entry.key) } catch {}
      return false
    })
    saveIndex()
  }
  function trim() {
    const count = (kind: string) => index.filter(entry => entry.kind === kind).length
    while (index.reduce((sum, entry) => sum + entry.size, 0) > maxCharacters || count('chapter') > maxChapters || count('catalog') > maxCatalogs) {
      const overChapters = count('chapter') > maxChapters
      const overCatalogs = count('catalog') > maxCatalogs
      const oldest = index.filter(entry => !overChapters && !overCatalogs || entry.kind === (overChapters ? 'chapter' : 'catalog')).sort((a, b) => a.used - b.used)[0]
      if (!oldest) break
      removeEntries(entry => entry.key === oldest.key)
    }
  }
  trim()

  function context() {
    const identity = options.identity()
    if (!identity?.owner || !identity.session || !identity.vip || identity.vipExpiresAt && !(Date.parse(identity.vipExpiresAt) > now())) {
      authorizations.clear()
      throw cacheError('请重新验证阅读权限', 'READER_ACCESS_REQUIRED')
    }
    if (previousSession !== identity.session || previousOwner !== identity.owner) {
      authorizations.clear()
      rejected.clear()
      previousSession = identity.session
      previousOwner = identity.owner
    }
    return identity
  }
  function sameSession(identity: ReaderCacheIdentity) {
    const current = context()
    if (current.owner !== identity.owner || current.session !== identity.session) throw cacheError('账号已切换，请重新打开书籍', 'SESSION_CHANGED', 409)
  }
  function bookKey(identity: ReaderCacheIdentity, id: string) { return `${identity.owner}:${id}` }
  function storageKey(identity: ReaderCacheIdentity, id: string, kind: string, chapter?: number) {
    return `${INDEX_KEY}:${encodeURIComponent(identity.owner)}:${encodeURIComponent(id)}:${kind}${chapter === undefined ? '' : ':' + chapter}`
  }
  function read<T>(key: string, revision?: string): T | null {
    const entry = index.find(entry => entry.key === key && (revision === undefined || entry.revision === revision))
    if (!entry) return null
    try {
      const value = options.storage.read(key) as T | undefined
      if (value == null) return null
      entry.used = now()
      saveIndex()
      return value
    } catch { return null }
  }
  function write(identity: ReaderCacheIdentity, id: string, kind: CacheEntry['kind'], value: unknown, revision: string, chapter?: number) {
    const key = storageKey(identity, id, kind, chapter)
    const size = JSON.stringify(value).length
    if (size > maxCharacters) return
    index = index.filter(entry => entry.key !== key)
    index.push({ key, owner: identity.owner, book: id, kind, revision, size, used: now() })
    trim()
    if (!index.some(entry => entry.key === key)) return
    try { options.storage.write(key, value) }
    catch {
      // A quota failure must never turn a successful chapter fetch into a reading failure.
      removeEntries(entry => entry.key === key)
    }
    if (!saveIndex()) {
      index = index.filter(entry => entry.key !== key)
      try { options.storage.remove(key) } catch {}
    }
  }
  function invalidate(identity: ReaderCacheIdentity, id: string, reason: unknown) {
    const status = Number((reason as { status?: number })?.status)
    if (!denied(reason)) return
    denialVersions.set(identity.owner, (denialVersions.get(identity.owner) || 0) + 1)
    rejected.add(bookKey(identity, id))
    if (status === 401 || status === 403) {
      authorizations.clear()
      removeEntries(entry => entry.owner === identity.owner)
    } else {
      authorizations.delete(bookKey(identity, id))
      removeEntries(entry => entry.owner === identity.owner && entry.book === id)
    }
  }
  function permitted(identity: ReaderCacheIdentity, id: string, revision: string) {
    const grant = authorizations.get(bookKey(identity, id))
    return !rejected.has(bookKey(identity, id)) && grant?.session === identity.session && grant.revision === revision && now() - grant.at < AUTHORIZATION_MS
  }
  function dedupe<T>(key: string, task: () => Promise<T>): Promise<T> {
    const existing = jobs.get(key)
    if (existing) return existing as Promise<T>
    const job = task().finally(() => { if (jobs.get(key) === job) jobs.delete(key) })
    jobs.set(key, job)
    return job
  }
  function refreshCatalog(identity: ReaderCacheIdentity, id: string) {
    return dedupe(`catalog:${identity.session}:${bookKey(identity, id)}`, async () => {
      try {
        sameSession(identity)
        const denialVersion = denialVersions.get(identity.owner) || 0
        const catalog = await options.catalog(id)
        sameSession(identity)
        if ((denialVersions.get(identity.owner) || 0) !== denialVersion) throw cacheError('阅读权限已变化，请重新打开书籍', 'READER_ACCESS_CHANGED', 409)
        if (!validCatalog(catalog, id)) throw new Error('云端小说目录不完整')
        const revision = readerCatalogRevision(catalog)
        removeEntries(entry => entry.owner === identity.owner && entry.book === id && entry.revision !== revision)
        authorizations.set(bookKey(identity, id), { session: identity.session, at: now(), revision })
        rejected.delete(bookKey(identity, id))
        write(identity, id, 'catalog', catalog, revision)
        return catalog
      } catch (reason) { invalidate(identity, id, reason); throw reason }
    })
  }
  async function getCatalog(id: string, catalogOptions: ReaderCatalogOptions = {}) {
    const identity = context()
    const stored = read<CloudNovelCatalog>(storageKey(identity, id, 'catalog'))
    const cached = validCatalog(stored, id) ? stored : null
    const revision = cached ? readerCatalogRevision(cached) : ''
    if (cached && (!catalogOptions.expectedUpdatedAt || cached.updatedAt === catalogOptions.expectedUpdatedAt) && permitted(identity, id, revision)) {
      const grant = authorizations.get(bookKey(identity, id))!
      if (now() - grant.at >= REFRESH_AFTER_MS) {
        void refreshCatalog(identity, id).then(updated => {
          if (readerCatalogRevision(updated) !== revision) catalogOptions.onUpdate?.(updated)
        }).catch(reason => { catalogOptions.onError?.(reason) })
      }
      return cached
    }
    // No stale fallback: a failed/revoked catalog cannot authorize cached private text.
    return refreshCatalog(identity, id)
  }
  async function getChapter(catalog: CloudNovelCatalog, index: number): Promise<CloudNovelChapter> {
    const identity = context()
    const chapter = catalog.chapters[index]
    if (!chapter) throw new Error('章节不存在')
    const revision = readerCatalogRevision(catalog)
    if (!permitted(identity, catalog.id, revision)) {
      const updated = await getCatalog(catalog.id)
      sameSession(identity)
      if (readerCatalogRevision(updated) !== revision) throw cacheError('小说目录已更新，请重新打开书籍', 'READER_CATALOG_CHANGED', 409)
      if (!permitted(identity, catalog.id, revision)) throw cacheError('阅读权限已变化，请重新打开书籍', 'READER_ACCESS_CHANGED', 409)
    }
    const cached = read<CloudNovelChapter>(storageKey(identity, catalog.id, 'chapter', chapter.chapterIndex), revision)
    if (cached && typeof cached.content === 'string' && cached.chapterIndex === chapter.chapterIndex && cached.title === chapter.title && cached.characterCount === chapter.characterCount) return cached
    return dedupe(`chapter:${identity.session}:${bookKey(identity, catalog.id)}:${revision}:${chapter.chapterIndex}`, async () => {
      try {
        sameSession(identity)
        const value = await options.chapter(catalog.id, chapter.chapterIndex)
        sameSession(identity)
        const latest = authorizations.get(bookKey(identity, catalog.id))
        if (rejected.has(bookKey(identity, catalog.id)) || latest?.revision !== revision) throw cacheError('小说目录已更新，请重新打开书籍', 'READER_CATALOG_CHANGED', 409)
        if (typeof value?.content !== 'string' || value.chapterIndex !== chapter.chapterIndex || value.title !== chapter.title || value.characterCount !== chapter.characterCount) throw cacheError('小说目录已更新，请重新打开书籍', 'READER_CATALOG_CHANGED', 409)
        write(identity, catalog.id, 'chapter', value, revision, chapter.chapterIndex)
        return value
      } catch (reason) { invalidate(identity, catalog.id, reason); throw reason }
    })
  }
  async function prefetch(catalog: CloudNovelCatalog, currentIndex: number) {
    // Sequential low-priority requests avoid flooding a slow mobile connection.
    const identity = context()
    for (let index = currentIndex + 1; index < Math.min(catalog.chapters.length, currentIndex + 4); index++) {
      try { sameSession(identity); await getChapter(catalog, index) }
      catch { break }
    }
  }
  return { getCatalog, getChapter, prefetch }
}
