import assert from 'node:assert/strict'
import test from 'node:test'
import { localReminderPlan, reminderTargetsUser, stockSystemNotificationPlans } from '../src/services/local-reminder-rules.ts'
import type { Item, Message, User } from '../src/services/api.ts'

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

test('a newly synced stock recommendation becomes an immediate system notification', () => {
  const item: Item = {
    ...base,
    id: 'stock-daily',
    title: '当日股票推荐',
    content: '1. 示例股票（600001）｜+3.25%',
    sourceKey: 'stock-platform:daily:2026-09-24',
    nextAt: '2026-09-24T08:00:00.000Z',
  }
  const message: Message = { id: 'message-1', title: item.title, due: item.nextAt!, seen: 0 }
  const earlierItem: Item = { ...item, id: 'stock-initial', sourceKey: 'stock-platform:initial:2026-09-24', nextAt: '2026-09-24T01:35:00.000Z' }
  const earlierMessage: Message = { id: 'message-0', title: item.title, due: earlierItem.nextAt!, seen: 0 }
  const plans = stockSystemNotificationPlans([earlierItem, item], [earlierMessage, message], [], Date.parse('2026-09-24T08:00:05.000Z'))

  assert.equal(plans.length, 1)
  assert.equal(plans[0].messageId, 'message-1')
  assert.equal(plans[0].triggerAt, Date.parse('2026-09-24T08:00:06.000Z'))
  assert.equal(plans[0].route, '/pages/detail/detail?id=stock-daily')
  assert.equal(stockSystemNotificationPlans([item], [message], ['message-1']).length, 0)
  assert.equal(stockSystemNotificationPlans([item], [{ ...message, seen: 1 }], []).length, 0)
})
