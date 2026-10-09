import { cloudGameDownloadUrl } from '../../services/api'

export interface StoredCloudGbaRom {
  gameId: string
  name: string
  size: number
  sha256: string
  absolutePath: string
  localUrl: string
  savedFilePath: string
  downloadedAt: string
}

type DownloadProgress = (percent: number) => void
const STORAGE_KEY = 'together-notes.cloud-gba.v1'

function records(): Record<string, StoredCloudGbaRom> {
  try {
    const value = uni.getStorageSync(STORAGE_KEY)
    return value && typeof value === 'object' ? value as Record<string, StoredCloudGbaRom> : {}
  } catch { return {} }
}

function nativeFileExists(path: string, expectedSize: number) {
  try {
    const android = plus.android as any
    const file = android.newObject('java.io.File', path)
    return Boolean(android.invoke(file, 'exists') && android.invoke(file, 'isFile') && Number(android.invoke(file, 'length')) === expectedSize)
  } catch { return false }
}

export function getStoredCloudGbaRom(gameId: string, sha256 = ''): StoredCloudGbaRom | null {
  const all = records()
  const record = all[gameId]
  if (record && (!sha256 || record.sha256 === sha256) && nativeFileExists(record.absolutePath, record.size)) return record
  if (record) { delete all[gameId]; try { uni.setStorageSync(STORAGE_KEY, all) } catch {} }
  return null
}

export function downloadAndStoreCloudGba(game: { id: string; filename?: string; romBytes?: number; romSha256?: string }, onProgress?: DownloadProgress): Promise<StoredCloudGbaRom> {
  return new Promise((resolve, reject) => {
    // #ifdef APP-PLUS
    const task = uni.downloadFile({
      url: cloudGameDownloadUrl(game.id),
      header: { Authorization: 'Bearer ' + (uni.getStorageSync('session') || '') },
      success(download) {
        if (download.statusCode !== 200) { reject(new Error(download.statusCode === 401 ? '登录已失效，请重新登录' : '游戏下载失败')); return }
        uni.saveFile({
          tempFilePath: download.tempFilePath,
          success(saved) {
            try {
              const absolutePath = plus.io.convertLocalFileSystemURL(saved.savedFilePath)
              const expectedSize = Math.max(0, Number(game.romBytes) || 0)
              if (!absolutePath || !nativeFileExists(absolutePath, expectedSize)) {
                uni.removeSavedFile({ filePath: saved.savedFilePath })
                reject(new Error('下载后的游戏文件大小不一致，请重试'))
                return
              }
              const all = records()
              const previous = all[game.id]
              const record: StoredCloudGbaRom = {
                gameId: game.id,
                name: game.filename || `${game.id}.gba`,
                size: expectedSize,
                sha256: game.romSha256 || '',
                absolutePath,
                localUrl: `file://${absolutePath}`,
                savedFilePath: saved.savedFilePath,
                downloadedAt: new Date().toISOString(),
              }
              all[game.id] = record
              uni.setStorageSync(STORAGE_KEY, all)
              if (previous?.savedFilePath && previous.savedFilePath !== saved.savedFilePath) uni.removeSavedFile({ filePath: previous.savedFilePath })
              resolve(record)
            } catch { reject(new Error('无法保存下载的游戏文件')) }
          },
          fail: () => reject(new Error('手机存储空间不足，无法保存游戏')),
        })
      },
      fail: () => reject(new Error('游戏下载失败，请检查网络后重试')),
    })
    task.onProgressUpdate(progress => onProgress?.(Math.max(0, Math.min(100, progress.progress))))
    // #endif
    // #ifndef APP-PLUS
    reject(new Error('当前平台不支持 GBA 游戏'))
    // #endif
  })
}
