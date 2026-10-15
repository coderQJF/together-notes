import type { Item, User } from './api'
import type { offlineItems, ItemStorage } from './offline-items'

export const GUEST_ITEMS_KEY = 'guest-items-v1'
export const guestUser: User = { id: 'local-guest', nickname: '游客', vip: false, partner: null, guest: true }

// Guest content never enters an account outbox without an explicit import action.
export function guestWorkspace(storage: ItemStorage) {
  const items = (): Item[] => {
    const value = storage.read(GUEST_ITEMS_KEY)
    return Array.isArray(value) ? value : []
  }
  function save(item: Item): Item {
    if (item.scope !== 'mine' || (item.kind === 'reminder' && item.recipient !== 'me')) throw new Error('双人共享需要登录；当前内容仍可仅保存在本机')
    if (item.id && !items().some(value => value.id === item.id)) throw new Error('本机记录不存在')
    const next = { ...item, id: item.id || `local-${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 14)}`, owner: guestUser.id, syncPending: false, updatedAt: new Date().toISOString() }
    storage.write(GUEST_ITEMS_KEY, [...items().filter(value => value.id !== next.id), next])
    return next
  }
  function remove(id: string) { storage.write(GUEST_ITEMS_KEY, items().filter(value => value.id !== id)) }
  function importInto(owner: string, target: ReturnType<typeof offlineItems>) {
    if (!owner || owner === guestUser.id) throw new Error('请先登录账号')
    const source = items()
    // Stable ids make retries safe even if a storage write is interrupted.
    for (const item of source) target.save({ ...item, owner, scope: 'mine', recipient: 'me' }, true)
    storage.write(GUEST_ITEMS_KEY, [])
    return source.length
  }
  return { items, save, remove, importInto }
}
