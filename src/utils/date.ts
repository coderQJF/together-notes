const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

type DateValue = string | number | Date | null

const asDate = (value?: DateValue) => {
  if (value === undefined || value === null || value === '') return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

const pad = (value: number) => String(value).padStart(2, '0')

/**
 * 微信小程序的 JavaScript 运行时对 Intl/toLocaleString 的支持并不一致。
 * 所有面向用户的日期都在这里手工拼接，避免退化成 GMT 原始字符串。
 */
export function formatDayHeading(value: DateValue = new Date()) {
  const date = asDate(value)
  if (!date) return ''
  return `${date.getMonth() + 1}月${date.getDate()}日 ${WEEKDAYS[date.getDay()]}`
}

export function formatDateTime(value?: DateValue) {
  const date = asDate(value)
  if (!date) return ''
  return `${date.getMonth() + 1}月${date.getDate()}日 ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function formatListDateTime(value?: DateValue) {
  const date = asDate(value)
  if (!date) return ''
  return `${date.getMonth() + 1}月${date.getDate()}日 · ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function formatFullDateTime(value?: DateValue) {
  const date = asDate(value)
  if (!date) return ''
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 ${WEEKDAYS[date.getDay()]} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function formatCompactDateTime(value?: DateValue) {
  const date = asDate(value)
  if (!date) return ''
  return `${date.getMonth() + 1}月${date.getDate()}日 ${WEEKDAYS[date.getDay()]} · ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function formatClock(value?: DateValue) {
  const date = asDate(value)
  return date ? `${pad(date.getHours())}:${pad(date.getMinutes())}` : ''
}

export function formatRelativeTime(value?: DateValue, now = new Date()) {
  const date = asDate(value)
  if (!date) return ''
  const minutes = Math.max(0, Math.round((now.getTime() - date.getTime()) / 60000))
  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes}分钟前`
  if (minutes < 24 * 60) return `${Math.floor(minutes / 60)}小时前`
  return formatDayHeading(date)
}

export function dateInputValue(value?: DateValue) {
  const date = asDate(value)
  if (!date) return ''
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function timeInputValue(value?: DateValue) {
  const date = asDate(value)
  return date ? `${pad(date.getHours())}:${pad(date.getMinutes())}` : ''
}
