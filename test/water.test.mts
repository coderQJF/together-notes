import assert from 'node:assert/strict'
import test from 'node:test'
import { waterDay, waterStore } from '../src/services/water.ts'

test('water records persist, stay isolated by owner, and sum per local calendar day', () => {
  const data = new Map<string, unknown>()
  const storage = { read: (key: string) => data.get(key), write: (key: string, value: unknown) => { data.set(key, value) } }
  const now = new Date(2026, 9, 20, 0, 1)
  const store = waterStore('a', storage)
  store.add('2026-10-19', 330, now)
  const entry = store.add(waterDay(now), 250, now)
  store.add(waterDay(now), 500, now)
  const reloaded = waterStore('a', storage)
  assert.equal(reloaded.entries().filter(entry => entry.day === waterDay(now)).reduce((sum, entry) => sum + entry.amount, 0), 750)
  assert.equal(waterStore('b', storage).entries().length, 0)
  assert.equal(waterStore('', storage).entries().length, 0)
  reloaded.remove(entry.id)
  assert.equal(store.entries().length, 2)
  for (const amount of [0, -1, 1.5, NaN, Infinity, 5001]) assert.throws(() => store.add(waterDay(now), amount, now))
  for (const day of ['2026-02-30', '2026-10-21', 'invalid']) assert.throws(() => store.add(day, 250, now))
  assert.equal(store.entries().length, 2)
})

test('storage failures are surfaced rather than reported as successful saves', () => {
  const store = waterStore('a', { read: () => [], write: () => { throw new Error('storage full') } })
  assert.throws(() => store.add(waterDay(), 250), /storage full/)
  const broken = waterStore('a', { read: () => 'broken', write: () => assert.fail('must not overwrite unreadable data') })
  assert.throws(() => broken.add(waterDay(), 250), /读取失败/)
})
