import type { Item, User } from './api'

export interface LocalReminderPlan {
  id: string
  title: string
  content: string
  triggerAt: number
  repeat: 'none' | 'daily' | 'weekly'
  route: string
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
