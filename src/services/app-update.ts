import { apiAssetUrl } from './api'
import { canInstallResourceUpdate, type AppUpdateMetadata } from './app-update-rules'

const LAST_CHECK_KEY = 'app-resource-update-last-check'
const CHECK_INTERVAL = 6 * 60 * 60 * 1000

function resourceVersion(): Promise<string> {
  return new Promise(resolve => plus.runtime.getProperty(String(plus.runtime.appid || ''), info => resolve(String(info.version || '0.0.0'))))
}

function metadata(): Promise<AppUpdateMetadata> {
  return new Promise((resolve, reject) => uni.request({
    url: apiAssetUrl('/app-updates/latest.json'),
    timeout: 10000,
    success: response => response.statusCode === 200 ? resolve(response.data as AppUpdateMetadata) : reject(new Error('UPDATE_METADATA_UNAVAILABLE')),
    fail: () => reject(new Error('UPDATE_METADATA_UNAVAILABLE')),
  }))
}

function download(url: string): Promise<string> {
  return new Promise((resolve, reject) => uni.downloadFile({
    url: apiAssetUrl(url),
    timeout: 60000,
    success: result => result.statusCode === 200 ? resolve(result.tempFilePath) : reject(new Error('UPDATE_DOWNLOAD_FAILED')),
    fail: () => reject(new Error('UPDATE_DOWNLOAD_FAILED')),
  }))
}

function install(path: string): Promise<void> {
  return new Promise((resolve, reject) => plus.runtime.install(path, { force: false }, () => resolve(), reject))
}

export async function checkForAppResourceUpdate(force = false) {
  // #ifdef APP-PLUS
  try {
    const lastCheck = Number(uni.getStorageSync(LAST_CHECK_KEY) || 0)
    if (!force && Date.now() - lastCheck < CHECK_INTERVAL) return false
    uni.setStorageSync(LAST_CHECK_KEY, Date.now())
    const update = await metadata()
    const current = {
      appId: String(plus.runtime.appid || ''),
      nativeVersion: String(plus.runtime.version || '0.0.0'),
      resourceVersion: await resourceVersion(),
    }
    if (!canInstallResourceUpdate(update, current)) return false
    const path = await download(update.wgtUrl)
    await install(path)
    uni.showModal({
      title: '更新已完成',
      content: update.releaseNotes || '已下载并安装最新资源，重新打开后生效。',
      showCancel: !update.mandatory,
      cancelText: '稍后',
      confirmText: '立即重启',
      success: result => { if (result.confirm) plus.runtime.restart() },
    })
    return true
  } catch {
    return false
  }
  // #endif
  // #ifndef APP-PLUS
  return false
  // #endif
}
