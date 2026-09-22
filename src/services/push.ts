import { request } from './api'

const STORAGE_KEY = 'app-push-client-id'
let listening = false

function parsePayload(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object') return value as Record<string, unknown>
  if (typeof value !== 'string') return {}
  try { const parsed = JSON.parse(value); return parsed && typeof parsed === 'object' ? parsed : {} } catch { return {} }
}

export function initPushHandling() {
  // #ifdef APP-PLUS
  if (listening || typeof (uni as any).onPushMessage !== 'function') return
  listening = true
  ;(uni as any).onPushMessage((message: any) => {
    const payload = parsePayload(message?.data?.payload ?? message?.data)
    const route = typeof payload.route === 'string' ? payload.route : ''
    if (message?.type === 'click' && /^\/pages\/[\w/-]+(?:\?[^\s]*)?$/.test(route)) {
      setTimeout(() => uni.navigateTo({ url: route, fail: () => uni.reLaunch({ url: route }) }), 120)
      return
    }
    if (message?.type === 'receive') uni.showToast({ title: '收到一条新提醒', icon: 'none' })
  })
  // #endif
}

export async function syncPushDevice() {
  // #ifdef APP-PLUS
  if (!uni.getStorageSync('session') || typeof (uni as any).getPushClientId !== 'function') return
  const clientId = await new Promise<string>((resolve, reject) => (uni as any).getPushClientId({
    success: (result: any) => resolve(String(result?.cid || '').trim()),
    fail: reject,
  })).catch(() => '')
  if (!clientId) return
  await request('/push/devices', 'POST', { clientId, platform: 'android' })
  uni.setStorageSync(STORAGE_KEY, clientId)
  // #endif
}

export function storedPushClientId() {
  return String(uni.getStorageSync(STORAGE_KEY) || '')
}

export function clearStoredPushClientId() {
  uni.removeStorageSync(STORAGE_KEY)
}
