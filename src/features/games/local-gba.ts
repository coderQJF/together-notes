export interface StoredLocalGbaRom {
  name: string
  size: number
  sha256: string
  absolutePath: string
  localUrl: string
  importedAt: string
}

export type LocalGbaImportPhase = 'choosing' | 'copying'

export interface LocalGbaImportProgress {
  phase: LocalGbaImportPhase
  name?: string
  bytesCopied?: number
  totalBytes?: number
}

export type LocalGbaImportProgressHandler = (progress: LocalGbaImportProgress) => void

const STORAGE_KEY = 'together-notes.local-gba.v1'
const PICK_TIMEOUT_MS = 2 * 60 * 1000
const COPY_TIMEOUT_MS = 2 * 60 * 1000
const COPY_BATCH_BYTES = 512 * 1024
const MIN_ROM_BYTES = 64 * 1024
const MAX_ROM_BYTES = 64 * 1024 * 1024
const DIRECTORY_NAME = 'together-games'
const ROM_FILE_NAME = 'pokemon-dark-phantom-45.gba'

const yieldToUi = () => new Promise<void>(resolve => setTimeout(resolve, 0))

function cancelled(message: unknown) {
  return /cancel|取消/i.test(String(message || ''))
}

function readStoredRecord(): StoredLocalGbaRom | null {
  try {
    const value = uni.getStorageSync(STORAGE_KEY)
    if (!value || typeof value !== 'object') return null
    const candidate = value as Partial<StoredLocalGbaRom>
    if (!candidate.absolutePath || !candidate.localUrl || !candidate.name || !candidate.sha256) return null
    return {
      name: String(candidate.name),
      size: Math.max(0, Number(candidate.size) || 0),
      sha256: String(candidate.sha256),
      absolutePath: String(candidate.absolutePath),
      localUrl: String(candidate.localUrl),
      importedAt: String(candidate.importedAt || ''),
    }
  } catch {
    return null
  }
}

function fileExists(path: string) {
  try {
    if (plus.os.name !== 'Android') return false
    const android = plus.android as any
    const file = android.newObject('java.io.File', path) as any
    return Boolean(
      android.invoke(file, 'exists')
      && android.invoke(file, 'isFile')
      && Number(android.invoke(file, 'length') || 0) >= MIN_ROM_BYTES,
    )
  } catch {
    return false
  }
}

export function getStoredLocalGbaRom(): StoredLocalGbaRom | null {
  const record = readStoredRecord()
  if (record && fileExists(record.absolutePath)) return record
  try { uni.removeStorageSync(STORAGE_KEY) } catch {}
  return null
}

function queryAndroidFileMetadata(resolver: any, uri: any) {
  const android = plus.android as any
  let cursor: any
  let name = 'game.gba'
  let size = 0
  try {
    cursor = android.invoke(resolver, 'query', uri, null, null, null, null)
    if (cursor) {
      android.importClass(cursor)
      if (cursor.moveToFirst()) {
        const nameIndex = cursor.getColumnIndex('_display_name')
        if (nameIndex >= 0) name = String(cursor.getString(nameIndex) || name)
        const sizeIndex = cursor.getColumnIndex('_size')
        if (sizeIndex >= 0) size = Math.max(0, Number(cursor.getLong(sizeIndex)) || 0)
      }
    }
  } finally {
    try { cursor?.close?.() } catch {}
  }
  return { name, size }
}

async function copyAndroidRom(
  uri: any,
  onProgress?: LocalGbaImportProgressHandler,
): Promise<StoredLocalGbaRom> {
  const android = plus.android as any
  const main = android.runtimeMainActivity()
  const resolver = android.invoke(main, 'getContentResolver')
  const metadata = queryAndroidFileMetadata(resolver, uri)
  if (!/\.gba$/i.test(metadata.name)) throw new Error('请选择扩展名为 .gba 的游戏文件')
  if (metadata.size > MAX_ROM_BYTES) throw new Error('这个 GBA 文件超过 64MB，无法导入')

  const filesDir = android.invoke(main, 'getFilesDir')
  const gameDir = android.newObject('java.io.File', filesDir, DIRECTORY_NAME) as any
  if (!android.invoke(gameDir, 'exists') && !android.invoke(gameDir, 'mkdirs')) {
    throw new Error('无法创建本机游戏目录')
  }
  const destination = android.newObject('java.io.File', gameDir, ROM_FILE_NAME) as any
  const temporary = android.newObject('java.io.File', gameDir, `${ROM_FILE_NAME}.tmp`) as any
  const backup = android.newObject('java.io.File', gameDir, `${ROM_FILE_NAME}.bak`) as any
  try { if (android.invoke(temporary, 'exists')) android.invoke(temporary, 'delete') } catch {}
  try {
    if (android.invoke(backup, 'exists') && !android.invoke(destination, 'exists')) {
      android.invoke(backup, 'renameTo', destination)
    } else if (android.invoke(backup, 'exists')) {
      android.invoke(backup, 'delete')
    }
  } catch {}

  let input: any
  let output: any
  let total = 0
  const MessageDigest = android.importClass('java.security.MessageDigest')
  const digest = MessageDigest.getInstance('SHA-256')
  const deadline = Date.now() + COPY_TIMEOUT_MS
  try {
    input = android.invoke(resolver, 'openInputStream', uri)
    if (!input) throw new Error('系统没有返回可读取的 GBA 文件')
    output = android.newObject('java.io.FileOutputStream', temporary, false)
    const buffer = android.newObject('byte[]', 8192)
    let emptyReads = 0
    onProgress?.({ phase: 'copying', name: metadata.name, bytesCopied: 0, totalBytes: metadata.size || undefined })

    while (true) {
      let batchBytes = 0
      let reachedEof = false
      while (batchBytes < COPY_BATCH_BYTES) {
        if (Date.now() > deadline) throw new Error('复制 GBA 文件超时，请把文件保存到手机本地后重试')
        const length = Number(android.invoke(input, 'read', buffer))
        if (length < 0) {
          reachedEof = true
          break
        }
        if (!length) {
          emptyReads += 1
          if (emptyReads >= 8) throw new Error('读取 GBA 文件停滞，请重新选择')
          break
        }
        emptyReads = 0
        total += length
        if (total > MAX_ROM_BYTES) throw new Error('这个 GBA 文件超过 64MB，无法导入')
        batchBytes += length
        digest.update(buffer, 0, length)
        android.invoke(output, 'write', buffer, 0, length)
      }
      onProgress?.({ phase: 'copying', name: metadata.name, bytesCopied: total, totalBytes: metadata.size || undefined })
      if (reachedEof) break
      await yieldToUi()
    }
    android.invoke(output, 'flush')
  } finally {
    try { if (input) android.invoke(input, 'close') } catch {}
    try { if (output) android.invoke(output, 'close') } catch {}
  }

  if (total < MIN_ROM_BYTES) {
    try { android.invoke(temporary, 'delete') } catch {}
    throw new Error('这个文件太小，不像有效的 GBA 游戏文件')
  }
  const digestBytes = digest.digest()
  let sha256 = ''
  for (let index = 0; index < digestBytes.length; index += 1) {
    sha256 += (Number(digestBytes[index]) & 0xff).toString(16).padStart(2, '0')
  }

  let movedExistingToBackup = false
  let promotedTemporary = false
  try {
    if (android.invoke(destination, 'exists')) {
      if (android.invoke(backup, 'exists') && !android.invoke(backup, 'delete')) {
        throw new Error('无法清理旧的 GBA 备份')
      }
      if (!android.invoke(destination, 'renameTo', backup)) throw new Error('无法备份旧的 GBA 文件')
      movedExistingToBackup = true
    }
    if (!android.invoke(temporary, 'renameTo', destination)) throw new Error('无法保存 GBA 文件到应用私有目录')
    promotedTemporary = true
    if (Number(android.invoke(destination, 'length')) !== total) throw new Error('保存后的 GBA 文件大小不一致')
    if (movedExistingToBackup) {
      try { android.invoke(backup, 'delete') } catch {}
    }
  } catch (reason) {
    try { android.invoke(temporary, 'delete') } catch {}
    try {
      if (promotedTemporary && android.invoke(destination, 'exists')) android.invoke(destination, 'delete')
      if (movedExistingToBackup) {
        android.invoke(backup, 'renameTo', destination)
      }
    } catch {}
    throw reason
  }

  const absolutePath = String(android.invoke(destination, 'getAbsolutePath'))
  const record: StoredLocalGbaRom = {
    name: metadata.name,
    size: total,
    sha256,
    absolutePath,
    localUrl: `file://${absolutePath}`,
    importedAt: new Date().toISOString(),
  }
  uni.setStorageSync(STORAGE_KEY, record)
  return record
}

function chooseAndroidGbaRom(onProgress?: LocalGbaImportProgressHandler): Promise<StoredLocalGbaRom | null> {
  return new Promise((resolve, reject) => {
    let pickerTimer: ReturnType<typeof setTimeout> | undefined
    let main: any
    let previousActivityResult: any
    let settled = false
    const restore = () => {
      clearTimeout(pickerTimer)
      if (main) (main as any).onActivityResult = previousActivityResult
    }
    const finishResolve = (value: StoredLocalGbaRom | null) => {
      if (settled) return
      settled = true
      restore()
      resolve(value)
    }
    const finishReject = (reason: unknown) => {
      if (settled) return
      settled = true
      restore()
      reject(reason instanceof Error ? reason : new Error('无法导入这个 GBA 文件'))
    }

    try {
      if (plus.os.name !== 'Android') throw new Error('当前版本仅支持 Android 本机 GBA 导入')
      const android = plus.android as any
      main = android.runtimeMainActivity()
      const Intent = android.importClass('android.content.Intent')
      const Activity = android.importClass('android.app.Activity')
      const intent = new Intent(Intent.ACTION_OPEN_DOCUMENT)
      intent.addCategory(Intent.CATEGORY_OPENABLE)
      // ROM MIME types vary by Android file provider, so filter by the
      // displayed `.gba` extension after selection instead of hiding files.
      intent.setType('*/*')
      intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
      const requestCode = 43000 + Math.floor(Math.random() * 1000)
      previousActivityResult = (main as any).onActivityResult
      onProgress?.({ phase: 'choosing' })
      ;(main as any).onActivityResult = (currentRequestCode: number, resultCode: number, data: any) => {
        if (currentRequestCode !== requestCode) {
          if (typeof previousActivityResult === 'function') previousActivityResult(currentRequestCode, resultCode, data)
          return
        }
        restore()
        if (resultCode !== Activity.RESULT_OK || !data) { finishResolve(null); return }
        try {
          android.importClass(data)
          const uri = data.getData()
          if (!uri) { finishReject(new Error('系统没有返回所选文件')); return }
          setTimeout(() => copyAndroidRom(uri, onProgress).then(finishResolve, finishReject), 0)
        } catch (reason) { finishReject(reason) }
      }
      pickerTimer = setTimeout(() => finishReject(new Error('等待系统文件选择结果超时，请重新选择')), PICK_TIMEOUT_MS)
      main.startActivityForResult(Intent.createChooser(intent, '选择你合法持有的 GBA 文件'), requestCode)
    } catch (reason) {
      if (cancelled(reason)) finishResolve(null)
      else finishReject(reason)
    }
  })
}

export function chooseAndStoreLocalGbaRom(onProgress?: LocalGbaImportProgressHandler) {
  // This module is imported only by APP-PLUS pages, but keep a guarded fallback
  // so type-checks and accidental cross-platform imports fail safely.
  // #ifdef APP-PLUS
  return chooseAndroidGbaRom(onProgress)
  // #endif
  // #ifndef APP-PLUS
  return Promise.reject(new Error('当前平台不支持本机 GBA 游戏')) as Promise<StoredLocalGbaRom | null>
  // #endif
}
