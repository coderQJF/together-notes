import assert from 'node:assert/strict'
import test from 'node:test'
import { createReaderCloudCache, readerCatalogRevision, type ReaderCacheIdentity } from '../src/services/reader-cache.ts'
import type { CloudNovelCatalog, CloudNovelChapter } from '../src/services/api.ts'

const failure = (status: number) => Object.assign(new Error(`HTTP ${status}`), { status })
const deferred = <T>() => {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}
function fixture(limits: { maxChapters?: number; maxCharacters?: number; maxCatalogs?: number } = {}) {
  const storage = new Map<string, unknown>()
  let identity: ReaderCacheIdentity | null = { owner: 'user-a', session: 'session-a', vip: true }
  let time = 100_000
  let catalogCalls = 0
  const chapterCalls: number[] = []
  let current: CloudNovelCatalog = {
    id: 'novel', title: '测试小说', author: '作者', createdAt: '2026-10-01', updatedAt: '2026-10-20', chapterCount: 7,
    chapters: Array.from({ length: 7 }, (_, chapterIndex) => ({ chapterIndex, title: `第${chapterIndex + 1}章`, characterCount: 8 })),
  }
  let catalogFetch = async () => structuredClone(current)
  let chapterFetch = async (index: number): Promise<CloudNovelChapter> => ({ ...current.chapters[index], content: `正文第${index}章节内容` })
  let storageFails = false
  const options = {
    ...limits,
    now: () => time,
    identity: () => identity,
    storage: {
      read(key: string) { if (storageFails) throw new Error('unavailable'); return structuredClone(storage.get(key)) },
      write(key: string, value: unknown) { if (storageFails) throw new Error('quota'); storage.set(key, structuredClone(value)) },
      remove(key: string) { storage.delete(key) },
    },
    async catalog(id: string) { assert.equal(id, current.id); ++catalogCalls; return catalogFetch() },
    async chapter(id: string, index: number) { assert.equal(id, current.id); chapterCalls.push(index); return chapterFetch(index) },
  }
  return {
    storage, options, cache: createReaderCloudCache(options),
    get catalogCalls() { return catalogCalls }, chapterCalls,
    get current() { return current },
    updateCatalog(value: Partial<CloudNovelCatalog>) { current = { ...current, ...value } },
    setIdentity(value: ReaderCacheIdentity | null) { identity = value },
    catalogFetch(value: typeof catalogFetch) { catalogFetch = value },
    chapterFetch(value: typeof chapterFetch) { chapterFetch = value },
    tick(value: number) { time += value },
    failStorage() { storageFails = true },
  }
}

test('repeat reader openings reuse catalog and persist chapter bodies across cache instances', async () => {
  const f = fixture()
  const firstCatalog = await f.cache.getCatalog('novel')
  const chapter = await f.cache.getChapter(firstCatalog, 0)
  const reopened = await f.cache.getCatalog('novel')
  assert.equal((await f.cache.getChapter(reopened, 0)).content, chapter.content)
  assert.equal(f.catalogCalls, 1, 'Library and reader must not request the same fresh catalog twice')
  assert.deepEqual(f.chapterCalls, [0])
  const restarted = createReaderCloudCache(f.options)
  await restarted.getChapter(await restarted.getCatalog('novel'), 0)
  assert.equal(f.catalogCalls, 2, 'A cold launch revalidates per-book access instead of trusting a disk authorization')
  assert.deepEqual(f.chapterCalls, [0], 'Disk text survives reader/app reopening')
  assert.ok(!JSON.stringify([...f.storage.values()]).includes('session-a'), 'Cache does not persist bearer tokens')
})

test('prefetch prepares exactly the next three chapters and shares in-flight foreground requests', async () => {
  const f = fixture()
  const catalog = await f.cache.getCatalog('novel')
  const pending = deferred<CloudNovelChapter>()
  f.chapterFetch(async index => index === 1 ? pending.promise : { ...catalog.chapters[index], content: '预取正文内容内容' })
  const prefetch = f.cache.prefetch(catalog, 0)
  const foreground = f.cache.getChapter(catalog, 1)
  const secondPrefetch = f.cache.prefetch(catalog, 0)
  pending.resolve({ ...catalog.chapters[1], content: '正文内容内容内容' })
  await Promise.all([prefetch, foreground, secondPrefetch])
  assert.deepEqual(f.chapterCalls, [1, 2, 3])
  await f.cache.getChapter(catalog, 2)
  assert.deepEqual(f.chapterCalls, [1, 2, 3])
})

test('chapter LRU and total stored characters remain bounded; reading a recent page keeps it', async () => {
  const f = fixture({ maxChapters: 2, maxCharacters: 4000 })
  const catalog = await f.cache.getCatalog('novel')
  await f.cache.getChapter(catalog, 0)
  f.tick(1)
  await f.cache.getChapter(catalog, 1)
  f.tick(1)
  await f.cache.getChapter(catalog, 0)
  f.tick(1)
  await f.cache.getChapter(catalog, 2)
  let entries = (f.storage.get('reader-cloud-cache-v1') as { entries: { key: string; kind: string; size: number }[] }).entries
  assert.equal(entries.filter(entry => entry.kind === 'chapter').length, 2)
  assert.ok(entries.reduce((sum, entry) => sum + entry.size, 0) <= 4000)
  await f.cache.getChapter(catalog, 0)
  assert.deepEqual(f.chapterCalls, [0, 1, 2])
  await f.cache.getChapter(catalog, 1)
  assert.deepEqual(f.chapterCalls, [0, 1, 2, 1], 'Least recently used chapter refetches after eviction')
  const small = fixture({ maxCharacters: 50 })
  const largeCatalog = await small.cache.getCatalog('novel')
  assert.ok((await small.cache.getChapter(largeCatalog, 0)).content)
  entries = (small.storage.get('reader-cloud-cache-v1') as { entries: typeof entries }).entries
  assert.ok(entries.reduce((sum, entry) => sum + entry.size, 0) <= 50)
})

test('catalog refresh runs in background, updates metadata, and invalidates outdated chapter bodies', async () => {
  const f = fixture()
  const catalog = await f.cache.getCatalog('novel')
  await f.cache.getChapter(catalog, 0)
  f.tick(16_000)
  const pending = deferred<CloudNovelCatalog>()
  f.catalogFetch(() => pending.promise)
  const updated = { ...catalog, updatedAt: '2026-10-21', chapters: catalog.chapters.map((chapter, index) => index ? chapter : { ...chapter, title: '新版第一章' }) }
  let received: CloudNovelCatalog | undefined
  const warm = await f.cache.getCatalog('novel', { onUpdate(value) { received = value } })
  assert.equal(warm.updatedAt, catalog.updatedAt, 'Revalidation must not delay a warm render')
  f.updateCatalog(updated)
  pending.resolve(updated)
  await new Promise(resolve => setImmediate(resolve))
  assert.deepEqual(received, updated)
  assert.notEqual(readerCatalogRevision(updated), readerCatalogRevision(catalog))
  await f.cache.getChapter(updated, 0)
  assert.deepEqual(f.chapterCalls, [0, 0])
  assert.equal([...f.storage.keys()].filter(key => key.endsWith(':chapter:0')).length, 1)
})

test('expected updatedAt, chapter metadata, and parser version invalidate persistent text', async () => {
  const f = fixture()
  const catalog = await f.cache.getCatalog('novel')
  await f.cache.getChapter(catalog, 0)
  f.updateCatalog({ updatedAt: '2026-10-22' })
  await f.cache.getChapter(await f.cache.getCatalog('novel', { expectedUpdatedAt: '2026-10-22' }), 0)
  assert.equal(f.catalogCalls, 2)
  assert.deepEqual(f.chapterCalls, [0, 0])
  f.tick(61_000)
  f.updateCatalog({ chapters: f.current.chapters.map((chapter, index) => index ? chapter : { ...chapter, characterCount: 9 }) })
  await f.cache.getChapter(await f.cache.getCatalog('novel'), 0)
  assert.deepEqual(f.chapterCalls, [0, 0, 0], 'Metadata changes invalidate content even when updatedAt remains the same')
  const index = f.storage.get('reader-cloud-cache-v1') as { parserVersion: number }
  f.storage.set('reader-cloud-cache-v1', { ...index, parserVersion: index.parserVersion - 1 })
  const migrated = createReaderCloudCache(f.options)
  await migrated.getChapter(await migrated.getCatalog('novel'), 0)
  assert.deepEqual(f.chapterCalls, [0, 0, 0, 0])
})

test('catalog authorization failures never fall back to cached text and invalidate it', async () => {
  for (const status of [401, 403, 404]) {
    const f = fixture()
    const catalog = await f.cache.getCatalog('novel')
    await f.cache.getChapter(catalog, 0)
    f.tick(61_000)
    f.catalogFetch(async () => { throw failure(status) })
    await assert.rejects(f.cache.getCatalog('novel'), { status })
    assert.equal([...f.storage.keys()].filter(key => key.includes(':novel:')).length, 0)
    await assert.rejects(f.cache.getChapter(catalog, 0), { status })
    assert.deepEqual(f.chapterCalls, [0])
  }
})

test('chapter denial invalidates sibling prefetched content and background catalog denial notifies reader', async () => {
  for (const status of [401, 403, 404]) {
    const f = fixture()
    const catalog = await f.cache.getCatalog('novel')
    await f.cache.getChapter(catalog, 0)
    f.chapterFetch(async () => { throw failure(status) })
    await assert.rejects(f.cache.getChapter(catalog, 1), { status })
    assert.equal([...f.storage.keys()].filter(key => key.includes(':novel:')).length, 0)
  }
  const f = fixture()
  await f.cache.getCatalog('novel')
  f.tick(16_000)
  let notified: unknown
  f.catalogFetch(async () => { throw failure(404) })
  await f.cache.getCatalog('novel', { onError(reason) { notified = reason } })
  await new Promise(resolve => setImmediate(resolve))
  assert.equal((notified as { status: number }).status, 404)
  await assert.rejects(f.cache.getCatalog('novel'), { status: 404 })
})

test('an older in-flight successful catalog cannot overwrite a newer authorization denial', async () => {
  const f = fixture()
  const catalog = await f.cache.getCatalog('novel')
  await f.cache.getChapter(catalog, 0)
  f.tick(16_000)
  const pending = deferred<CloudNovelCatalog>()
  f.catalogFetch(() => pending.promise)
  let refreshError: unknown
  await f.cache.getCatalog('novel', { onError(reason) { refreshError = reason } })
  f.chapterFetch(async () => { throw failure(403) })
  await assert.rejects(f.cache.getChapter(catalog, 1), { status: 403 })
  pending.resolve(catalog)
  await new Promise(resolve => setImmediate(resolve))
  assert.equal((refreshError as { code: string }).code, 'READER_ACCESS_CHANGED')
  assert.equal([...f.storage.keys()].filter(key => key.includes(':novel:')).length, 0)
  f.catalogFetch(async () => { throw failure(403) })
  await assert.rejects(f.cache.getChapter(catalog, 0), { status: 403 })
  assert.deepEqual(f.chapterCalls, [0, 1])
})

test('network failure permits only a recent session authorization; expiry and logout block cached content', async () => {
  const f = fixture()
  const catalog = await f.cache.getCatalog('novel')
  await f.cache.getChapter(catalog, 0)
  f.catalogFetch(async () => { throw failure(0) })
  assert.ok((await f.cache.getChapter(catalog, 0)).content, 'Recently authorized session may continue a cached chapter')
  f.tick(61_000)
  await assert.rejects(f.cache.getCatalog('novel'), { status: 0 })
  await assert.rejects(f.cache.getChapter(catalog, 0), { status: 0 })
  f.setIdentity({ owner: 'user-a', session: 'session-a', vip: true, vipExpiresAt: '1970-01-01' })
  await assert.rejects(f.cache.getChapter(catalog, 0), { code: 'READER_ACCESS_REQUIRED' })
  f.setIdentity(null)
  await assert.rejects(f.cache.getChapter(catalog, 0), { code: 'READER_ACCESS_REQUIRED' })
})

test('accounts are isolated and in-flight prefetch cannot persist into a changed session', async () => {
  const f = fixture()
  const catalog = await f.cache.getCatalog('novel')
  await f.cache.getChapter(catalog, 0)
  const pending = deferred<CloudNovelChapter>()
  f.chapterFetch(() => pending.promise)
  const oldJob = f.cache.prefetch(catalog, 0)
  f.setIdentity({ owner: 'user-b', session: 'session-b', vip: true })
  const secondCatalog = await f.cache.getCatalog('novel')
  pending.resolve({ ...catalog.chapters[1], content: '旧账号响应正文' })
  await oldJob
  assert.equal([...f.storage.keys()].filter(key => key.includes(':user-b:novel:chapter:')).length, 0)
  assert.equal([...f.storage.keys()].filter(key => key.includes(':user-a:novel:chapter:1')).length, 0)
  f.chapterFetch(async index => ({ ...catalog.chapters[index], content: '新账号正文内容' }))
  assert.equal((await f.cache.getChapter(secondCatalog, 0)).content, '新账号正文内容')
  assert.deepEqual(f.chapterCalls, [0, 1, 0])
  f.setIdentity({ owner: 'user-b', session: 'new-session-b', vip: true })
  f.catalogFetch(async () => { throw failure(403) })
  await assert.rejects(f.cache.getChapter(secondCatalog, 0), { status: 403 })
})

test('storage quota/read failures and corrupt cache entries do not prevent network reading', async () => {
  const f = fixture()
  const catalog = await f.cache.getCatalog('novel')
  await f.cache.getChapter(catalog, 0)
  f.storage.set('reader-cloud-cache-v1:user-a:novel:catalog', { ...catalog, chapters: 'broken' })
  f.storage.set('reader-cloud-cache-v1:user-a:novel:chapter:0', { ...catalog.chapters[0], content: 42 })
  await f.cache.getChapter(await f.cache.getCatalog('novel'), 0)
  assert.equal(f.catalogCalls, 2)
  assert.deepEqual(f.chapterCalls, [0, 0])
  f.failStorage()
  assert.ok((await f.cache.getChapter(await f.cache.getCatalog('novel'), 0)).content)
  assert.ok((await createReaderCloudCache(f.options).getCatalog('novel')).chapters.length)
})
