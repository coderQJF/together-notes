export function errorMessage(reason: unknown, fallback = '请求失败') {
  if (reason instanceof Error && reason.message.trim()) return reason.message.trim()
  if (typeof reason === 'string' && reason.trim()) return reason.trim()
  if (reason && typeof reason === 'object') {
    const value = reason as { message?: unknown; errMsg?: unknown }
    const message = typeof value.message === 'string' ? value.message.trim() : ''
    if (message) return message
    const errMsg = typeof value.errMsg === 'string' ? value.errMsg.trim() : ''
    if (errMsg) return errMsg.replace(/^\w+:fail\s*/i, '') || fallback
  }
  return fallback
}
