export function scheduleLocalReminder(id: string, title: string, content: string, triggerAt: number, repeat: string, route: string): boolean
export function cancelLocalReminder(id: string): boolean
export function cancelAllLocalReminders(): boolean
export function hasLocalNotificationPermission(): boolean
export function requestLocalNotificationPermission(): boolean
export function canScheduleExactLocalReminders(): boolean
export function openExactLocalReminderSettings(): boolean
