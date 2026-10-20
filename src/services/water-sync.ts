import { cachedHome, request } from './api'
import { waterStore, type WaterEntry } from './water'

export function currentWaterStore() {
  const home = cachedHome()
  // Never silently mix an authenticated account with the guest log.
  if (uni.getStorageSync('session') && !home) throw new Error('请先返回首页加载账号')
  return waterStore(home?.user.id || 'local-guest', { read: key => uni.getStorageSync(key), write: (key, value) => uni.setStorageSync(key, value) })
}
const jobs = new Map<string, Promise<void>>()
export function syncWater(): Promise<void> {
  const session = String(uni.getStorageSync('session') || ''), home = cachedHome()
  if (!session || !home || home.user.guest) return Promise.resolve()
  const existing = jobs.get(session)
  if (existing) return existing
  const store = currentWaterStore()
  let completed=false
  const job = (async () => {
    const check = () => { if (session !== String(uni.getStorageSync('session') || '')) throw new Error('账号已切换') }
    // Push pending events first. A delete tombstone always wins over an old upload.
    await store.flush(async op => { check(); await request(`/water/entries/${encodeURIComponent(op.id)}`, op.entry ? 'PUT' : 'DELETE', op.entry || undefined); check() })
    const remote = await request<WaterEntry[]>('/water/entries')
    check(); store.merge(remote); completed=true
  })().finally(() => {jobs.delete(session);if(completed&&store.pending().length&&session===String(uni.getStorageSync('session')||''))void syncWater().catch(()=>{})})
  jobs.set(session, job)
  return job
}
