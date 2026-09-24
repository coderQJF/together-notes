import type { Item, Message, User } from './api'

export interface LocalReminderPlan {
  id: string
  title: string
  content: string
  triggerAt: number
  repeat: 'none' | 'daily' | 'weekly'
  route: string
}

export interface StockSystemNotificationPlan extends LocalReminderPlan {
  messageId: string
}

const repeatInterval = (repeat?: string) => repeat === 'daily' ? 86400000 : repeat === 'weekly' ? 7 * 86400000 : 0

export function reminderTargetsUser(item: Item, user: User) {
  if (item.kind !== 'reminder' || item.done || !item.id) return false
  if (item.recipient === 'both') return true
  return item.owner === user.id ? item.recipient === 'me' : item.recipient === 'partner'
}

export function localReminderPlan(item: Item, user: User, now = Date.now()): LocalReminderPlan | null {
  if (!reminderTargetsUser(item, user)) return null
  const eventAt = Date.parse(item.nextAt || '')
  if (!Number.isFinite(eventAt)) return null
  const repeat = item.repeat === 'daily' || item.repeat === 'weekly' ? item.repeat : 'none'
  let triggerAt = eventAt - (item.advance || 0) * 60000
  const interval = repeatInterval(repeat)
  if (triggerAt <= now && interval) {
    while (triggerAt <= now) triggerAt += interval
  }
  if (triggerAt <= now) return null
  return {
    id: item.id!,
    title: item.title.trim().slice(0, 100) || '小记提醒',
    content: item.content.trim().slice(0, 500),
    triggerAt,
    repeat,
    route: `/pages/detail/detail?id=${encodeURIComponent(item.id!)}`,
  }
}

export function stockSystemNotificationPlans(
  items: Item[],
  messages: Message[],
  deliveredMessageIds: string[],
  now = Date.now(),
): StockSystemNotificationPlan[] {
  const delivered = new Set(deliveredMessageIds)
  const stockItems = items.filter(item => item.id && item.kind === 'reminder' && item.sourceKey?.startsWith('stock-platform:'))
  const candidates = messages.flatMap(message => {
    if (message.seen || delivered.has(message.id)) return []
    const due = Date.parse(message.due)
    if (!Number.isFinite(due)) return []
    const item = stockItems.find(candidate => candidate.title === message.title && Date.parse(candidate.nextAt || '') === due)
    if (!item?.id) return []
    return [{ message, item, due }]
  })
  const latestDue = Math.max(...candidates.map(candidate => candidate.due), Number.NEGATIVE_INFINITY)
  return candidates.filter(candidate => candidate.due === latestDue).map(({ message, item }) => ({
    messageId: message.id,
    id: `stock-message:${message.id}`,
    title: item.title.trim().slice(0, 100) || '小记消息',
    content: item.content.trim().slice(0, 500),
    triggerAt: now + 1000,
    repeat: 'none' as const,
    route: `/pages/detail/detail?id=${encodeURIComponent(item.id!)}`,
  }))
}
