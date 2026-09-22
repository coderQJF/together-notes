import assert from 'node:assert/strict'
import test from 'node:test'
import { localReminderPlan, reminderTargetsUser } from '../src/services/local-reminder-rules.ts'
import type { Item, User } from '../src/services/api.ts'

const me: User = { id: 'me', nickname: '我', partner: { id: 'partner', nickname: '另一半' } }
const base: Item = {
  id: 'reminder-1', owner: 'me', kind: 'reminder', title: '出门', content: '记得带钥匙', scope: 'shared',
  links: [], nextAt: '2026-09-23T02:00:00.000Z', repeat: 'none', recipient: 'me', advance: 30, done: false,
}

test('local reminder recipient rules distinguish creator and partner', () => {
  assert.equal(reminderTargetsUser(base, me), true)
  assert.equal(reminderTargetsUser({ ...base, recipient: 'partner' }, me), false)
  assert.equal(reminderTargetsUser({ ...base, owner: 'partner', recipient: 'partner' }, me), true)
  assert.equal(reminderTargetsUser({ ...base, owner: 'partner', recipient: 'me' }, me), false)
  assert.equal(reminderTargetsUser({ ...base, recipient: 'both' }, me), true)
  assert.equal(reminderTargetsUser({ ...base, done: true }, me), false)
})

test('local reminder plan applies advance and preserves a detail route', () => {
  const plan = localReminderPlan(base, me, Date.parse('2026-09-23T00:00:00.000Z'))
  assert.equal(plan?.triggerAt, Date.parse('2026-09-23T01:30:00.000Z'))
  assert.equal(plan?.repeat, 'none')
  assert.equal(plan?.route, '/pages/detail/detail?id=reminder-1')
})

test('recurring reminder rolls forward locally while an expired one-shot is skipped', () => {
  const now = Date.parse('2026-09-24T00:00:00.000Z')
  assert.equal(localReminderPlan(base, me, now), null)
  const daily = localReminderPlan({ ...base, repeat: 'daily' }, me, now)
  assert.equal(daily?.triggerAt, Date.parse('2026-09-24T01:30:00.000Z'))
})
