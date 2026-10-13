import assert from 'node:assert/strict'
import test from 'node:test'
import { offlineItems } from '../src/services/offline-items.ts'
import type { Item } from '../src/services/api.ts'

const note: Item = { kind: 'note', title: '离线备忘', content: '正文', scope: 'mine', links: [] }
function fixture() {
  const values = new Map<string, unknown>()
  const storage = { read: (key: string) => structuredClone(values.get(key)), write: (key: string, value: unknown) => { values.set(key, structuredClone(value)) } }
  return { storage, store: offlineItems('me', storage) }
}

test('personal drafts survive reload and remain isolated from another account', () => {
  const { store, storage } = fixture()
  const saved = store.save(note)
  assert.equal(saved.owner, 'me')
  assert.equal(saved.syncPending, true)
  assert.equal(offlineItems('me', storage).merge([])[0].content, '正文')
  assert.deepEqual(offlineItems('partner', storage).merge([]), [])
  assert.equal(store.merge([{ ...saved, title: '旧的网络返回' }])[0].title, note.title)
})

test('failed sync retains data and retries with a stable client id', async () => {
  const { store } = fixture()
  const saved = store.save(note)
  await assert.rejects(store.flush(async () => { throw new Error('offline') }))
  assert.equal(store.pending().length, 1)
  const synced = await store.flush(async (path, method, data) => {
    assert.equal(path, '/items'); assert.equal(method, 'POST')
    assert.equal((data as Item & { clientId: string }).clientId, saved.id)
    return { ...(data as Item), id: saved.id }
  })
  assert.equal(synced[0].syncPending, false)
  assert.equal(store.pending().length, 0)
})

test('editing during sync keeps the newer revision and subsequent sync updates the same item', async () => {
  const { store } = fixture()
  const first = store.save(note)
  await store.flush(async (_path, _method, data) => {
    store.save({ ...first, title: '继续编辑' })
    return data as Item
  })
  assert.equal(store.pending()[0].create, false)
  assert.equal(store.merge([])[0].title, '继续编辑')
  await store.flush(async (path, method, data) => {
    assert.equal(path, `/items/${first.id}`); assert.equal(method, 'PUT')
    return data as Item
  })
  assert.equal(store.pending().length, 0)
})

test('delete during create sync leaves a tombstone; missing remote deletes are idempotent', async () => {
  const { store } = fixture()
  const saved = store.save(note)
  await store.flush(async (_path, _method, data) => {
    store.remove(saved.id!)
    return data as Item
  })
  assert.deepEqual(store.merge([saved]), [])
  await store.flush(async (path, method) => {
    assert.equal(path, `/items/${saved.id}`); assert.equal(method, 'DELETE')
    throw Object.assign(new Error('not found'), { status: 404 })
  })
  assert.equal(store.pending().length, 0)
})

test('storage exhaustion fails the save instead of claiming success', () => {
  const store = offlineItems('me', { read: () => [], write: () => { throw new Error('quota') } })
  assert.throws(() => store.save(note), /quota/)
})

test('successful acknowledgements remain visible even when the next queued item fails', async () => {
  const { store } = fixture()
  const first = store.save(note)
  const second = store.save({ ...note, title: '第二条' })
  const acknowledged: Item[] = []
  await assert.rejects(store.flush(async (_path, _method, data) => {
    if ((data as Item).id === second.id) throw new Error('offline')
    return data as Item
  }, item => { acknowledged.push(item) }))
  assert.equal(acknowledged[0].id, first.id)
  assert.equal(store.pending().length, 1)
  assert.equal(store.pending()[0].id, second.id)
})

test('editing during image sync keeps the uploaded ids and the latest paragraph', async () => {
  const { store } = fixture()
  const first = store.save({ ...note, attachments: [{ id: 'local-file-one', name: 'image.png', size: 10, localPath: 'file:///image.png' }], blocks: [{ id: 'block', type: 'image', attachmentId: 'local-file-one' }] })
  await store.flush(async () => {
    store.save({ ...first, title: '修改后的标题' })
    return { ...first, attachments: [{ id: 'uploaded', name: 'image.png', size: 10, localPath: 'file:///image.png' }] }
  })
  const latest = store.pending()[0].item!
  assert.equal(latest.title, '修改后的标题')
  assert.equal(latest.attachments![0].id, 'uploaded')
  assert.equal(latest.blocks![0].attachmentId, 'uploaded')
})
