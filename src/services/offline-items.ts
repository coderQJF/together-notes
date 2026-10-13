import type { Item } from './api'

export interface PendingItem { id: string; item: Item | null; create: boolean; revision: string }
export interface ItemStorage { read(key: string): unknown; write(key: string, value: unknown): void }
export type ItemTransport = (path: string, method: 'POST' | 'PUT' | 'DELETE', data?: unknown) => Promise<Item>

// Keep the outbox separate from the disposable home snapshot, scoped to the account.
export function offlineItems(owner: string, storage: ItemStorage) {
  const key = `offline-items-v1:${owner}`
  const read = (): PendingItem[] => {
    const value = storage.read(key)
    return Array.isArray(value) ? value : []
  }
  const write = (entries: PendingItem[]) => storage.write(key, entries)
  function merge(items: Item[]) {
    const result = new Map(items.map(item => [item.id, item]))
    for (const entry of read()) {
      if (entry.item) result.set(entry.id, { ...entry.item, syncPending: true })
      else result.delete(entry.id)
    }
    return [...result.values()]
  }
  function save(item: Item, create = !item.id): Item {
    const id = item.id || `local-${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 14)}`
    const entries = read(), previous = entries.find(entry => entry.id === id)
    const next = { ...item, id, owner, syncPending: true, updatedAt: new Date().toISOString() }
    write([...entries.filter(entry => entry.id !== id), { id, item: next, create: previous?.create ?? create, revision: `${Date.now()}-${Math.random()}` }])
    return next
  }
  function remove(id: string) {
    const entries = read(), previous = entries.find(entry => entry.id === id)
    // A create may already be in flight; retain a tombstone so it gets deleted afterward.
    write([...entries.filter(entry => entry.id !== id), { id, item: null, create: previous?.create ?? false, revision: `${Date.now()}-${Math.random()}` }])
  }
  async function flush(send: ItemTransport, onSynced?: (item: Item) => void) {
    const synced: Item[] = []
    for (const entry of read()) {
      let saved: Item
      try {
        saved = await send(entry.item && entry.create ? '/items' : `/items/${encodeURIComponent(entry.id)}`, entry.item ? entry.create ? 'POST' : 'PUT' : 'DELETE', entry.item ? { ...entry.item, clientId: entry.create ? entry.id : undefined, wechatSubscribe: false } : undefined)
      } catch (reason) {
        if (!(entry.item === null && (reason as { status?: number }).status === 404)) throw reason
        saved = { id: entry.id } as Item
      }
      const latest = read()
      const current = latest.find(value => value.id === entry.id)
      if (current?.revision === entry.revision) {
        write(latest.filter(value => value.id !== entry.id))
        if (entry.item) {
          const item = { ...saved, syncPending: false }
          synced.push(item)
          onSynced?.(item)
        }
      } else if (current && entry.item) {
        const uploaded = new Map((entry.item.attachments || []).map((file, index) => [file.id, saved.attachments?.[index]]))
        const item = current.item ? {
          ...current.item,
          attachments: current.item.attachments?.map(file => uploaded.get(file.id) || file),
          blocks: current.item.blocks?.map(block => ({ ...block, attachmentId: uploaded.get(block.attachmentId || '')?.id || block.attachmentId })),
        } : null
        write(latest.map(value => value.id === entry.id ? { ...value, item, create: false } : value))
      }
    }
    return synced
  }
  return { merge, save, remove, flush, pending: read }
}
