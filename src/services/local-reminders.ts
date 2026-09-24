import type { Item, Message, User } from './api'
import { localReminderPlan, stockSystemNotificationPlans } from './local-reminder-rules'

const STOCK_SYSTEM_NOTIFICATION_IDS_KEY = 'stock-system-notification-ids'

// #ifdef APP-PLUS
import {
  cancelAllLocalReminders as nativeCancelAll,
  cancelLocalReminder as nativeCancel,
  canScheduleExactLocalReminders,
  hasLocalNotificationPermission,
  openExactLocalReminderSettings,
  requestLocalNotificationPermission,
  scheduleLocalReminder as nativeSchedule,
} from '@/uni_modules/together-local-reminder'
// #endif

function runNativeSafely<T>(fallback: T, action: () => T) {
  try { return action() }
  catch { return fallback }
}

export function scheduleLocalReminderForUser(item: Item, user: User) {
// #ifdef APP-PLUS
  if (!item.id) return false
  const plan = localReminderPlan(item, user)
  if (!plan) return runNativeSafely(false, () => nativeCancel(item.id!))
  return runNativeSafely(false, () => nativeSchedule(plan.id, plan.title, plan.content, plan.triggerAt, plan.repeat, plan.route))
  // #endif
  // #ifndef APP-PLUS
  return false
  // #endif
}

export function syncLocalReminders(items: Item[], user: User) {
  // #ifdef APP-PLUS
  return runNativeSafely(0, () => {
    nativeCancelAll()
    let scheduled = 0
    for (const item of items) {
      const plan = localReminderPlan(item, user)
      if (plan && nativeSchedule(plan.id, plan.title, plan.content, plan.triggerAt, plan.repeat, plan.route)) scheduled += 1
    }
    return scheduled
  })
  // #endif
  // #ifndef APP-PLUS
  return 0
  // #endif
}

export function syncStockSystemNotifications(items: Item[], messages: Message[]) {
  // #ifdef APP-PLUS
  return runNativeSafely(0, () => {
    if (!hasLocalNotificationPermission()) {
      requestLocalNotificationPermission()
      return 0
    }
    const stored = uni.getStorageSync(STOCK_SYSTEM_NOTIFICATION_IDS_KEY)
    const deliveredIds = Array.isArray(stored) ? stored.map(value => String(value)) : []
    const plans = stockSystemNotificationPlans(items, messages, deliveredIds)
    const delivered = new Set(deliveredIds)
    let scheduled = 0
    for (const plan of plans) {
      if (!nativeSchedule(plan.id, plan.title, plan.content, plan.triggerAt, plan.repeat, plan.route)) continue
      delivered.add(plan.messageId)
      scheduled += 1
    }
    if (scheduled) uni.setStorageSync(STOCK_SYSTEM_NOTIFICATION_IDS_KEY, [...delivered].slice(-200))
    return scheduled
  })
  // #endif
  // #ifndef APP-PLUS
  return 0
  // #endif
}

export function cancelLocalReminder(id?: string) {
  // #ifdef APP-PLUS
  return id ? runNativeSafely(false, () => nativeCancel(id)) : false
  // #endif
  // #ifndef APP-PLUS
  return false
  // #endif
}

export function clearLocalReminders() {
  // #ifdef APP-PLUS
  return runNativeSafely(false, nativeCancelAll)
  // #endif
  // #ifndef APP-PLUS
  return false
  // #endif
}

export function requestLocalReminderPermissions() {
  // #ifdef APP-PLUS
  return runNativeSafely({ notification: false, exact: false }, () => {
    const notification = hasLocalNotificationPermission() || requestLocalNotificationPermission()
    const exact = canScheduleExactLocalReminders() || openExactLocalReminderSettings()
    return { notification, exact }
  })
  // #endif
  // #ifndef APP-PLUS
  return { notification: false, exact: false }
  // #endif
}
