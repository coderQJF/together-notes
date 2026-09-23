export interface ReaderTextFile {
  name: string
  size: number
  text: string
}

export type ReaderImportPhase = 'choosing' | 'reading' | 'decoding'

export interface ReaderImportProgress {
  phase: ReaderImportPhase
  name?: string
  bytesRead?: number
  totalBytes?: number
}

export type ReaderImportProgressHandler = (progress: ReaderImportProgress) => void

export const MAX_READER_FILE_BYTES = 6 * 1024 * 1024
const MAX_READER_TEXT_LENGTH = 1_500_000
const ANDROID_PICK_TIMEOUT_MS = 2 * 60 * 1000
const ANDROID_READ_TIMEOUT_MS = 90 * 1000
const ANDROID_READ_BATCH_BYTES = 256 * 1024

const yieldToUi = () => new Promise<void>(resolve => setTimeout(resolve, 0))

function decodeWith(label: string, bytes: Uint8Array, fatal = false) {
  return new TextDecoder(label, { fatal }).decode(bytes)
}

export function decodeReaderText(source: ArrayBuffer): string {
  const bytes = new Uint8Array(source)
  if (!bytes.length) throw new Error('这个 TXT 文件是空的')

  let text = ''
  if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    text = decodeWith('utf-16le', bytes.subarray(2))
  } else if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    const swapped = new Uint8Array(bytes.length - 2)
    for (let index = 2; index + 1 < bytes.length; index += 2) {
      swapped[index - 2] = bytes[index + 1]
      swapped[index - 1] = bytes[index]
    }
    text = decodeWith('utf-16le', swapped)
  } else {
    const body = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? bytes.subarray(3) : bytes
    try {
      text = decodeWith('utf-8', body, true)
    } catch {
      try { text = decodeWith('gb18030', body) }
      catch { text = decodeWith('utf-8', body) }
    }
  }

  const normalized = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').trim()
  if (!normalized) throw new Error('这个 TXT 文件没有可阅读的文字')
  if (normalized.length > MAX_READER_TEXT_LENGTH) throw new Error('单本内容暂时不能超过 150 万字')
  return normalized
}

export function readerTitleFromFileName(value: string) {
  const tail = String(value || '').split(/[\\/]/).pop() || ''
  let decoded = tail
  try { decoded = decodeURIComponent(tail) } catch {}
  return decoded.replace(/[?#].*$/, '').replace(/\.txt$/i, '').trim().slice(0, 80) || '未命名书籍'
}

function createReaderTextFile(name: string, source: ArrayBuffer, onProgress?: ReaderImportProgressHandler): ReaderTextFile {
  const normalizedName = String(name || '').trim() || '导入的书籍.txt'
  if (!/\.txt$/i.test(normalizedName)) throw new Error('目前只支持导入 TXT 文件')
  if (source.byteLength > MAX_READER_FILE_BYTES) throw new Error('TXT 文件不能超过 6 MB')
  onProgress?.({ phase: 'decoding', name: normalizedName, bytesRead: source.byteLength, totalBytes: source.byteLength })
  return { name: normalizedName, size: source.byteLength, text: decodeReaderText(source) }
}

function cancelled(message: unknown) {
  return /cancel|取消/i.test(String(message || ''))
}

function chooseH5TextFile(onProgress?: ReaderImportProgressHandler): Promise<ReaderTextFile | null> {
  return new Promise((resolve, reject) => {
    onProgress?.({ phase: 'choosing' })
    uni.chooseFile({
      count: 1,
      extension: ['.txt'],
      success: async result => {
        try {
          const file = (result.tempFiles as any[])?.[0]
          if (!file) { resolve(null); return }
          const name = file.name || file.path || result.tempFilePaths?.[0]
          onProgress?.({ phase: 'reading', name, bytesRead: 0, totalBytes: Number(file.size) || undefined })
          const source = typeof file.arrayBuffer === 'function'
            ? await file.arrayBuffer()
            : await fetch(file.path || result.tempFilePaths?.[0]).then(response => response.arrayBuffer())
          resolve(createReaderTextFile(name, source, onProgress))
        } catch (reason) { reject(reason) }
      },
      fail: result => cancelled(result.errMsg) ? resolve(null) : reject(new Error('无法读取这个 TXT 文件')),
    })
  })
}

async function readAndroidTextFile(uri: any, onProgress?: ReaderImportProgressHandler): Promise<ReaderTextFile> {
  const android = plus.android as any
  const main = android.runtimeMainActivity()
  const resolver = android.invoke(main, 'getContentResolver')
  let name = '导入的书籍.txt'
  let declaredSize = 0
  let input: any
  let output: any
  let cursor: any

  try {
    cursor = android.invoke(resolver, 'query', uri, null, null, null, null)
    if (cursor) {
      android.importClass(cursor)
      if (cursor.moveToFirst()) {
        const nameIndex = cursor.getColumnIndex('_display_name')
        if (nameIndex >= 0) name = String(cursor.getString(nameIndex) || name)
        const sizeIndex = cursor.getColumnIndex('_size')
        if (sizeIndex >= 0) declaredSize = Math.max(0, Number(cursor.getLong(sizeIndex)) || 0)
      }
    }
    if (declaredSize > MAX_READER_FILE_BYTES) throw new Error('TXT 文件不能超过 6 MB')

    input = android.invoke(resolver, 'openInputStream', uri)
    if (!input) throw new Error('系统没有返回可读取的文件')
    output = android.newObject('java.io.ByteArrayOutputStream')
    const buffer = android.newObject('byte[]', 8192)
    let total = 0
    let emptyReads = 0
    const deadline = Date.now() + ANDROID_READ_TIMEOUT_MS
    onProgress?.({ phase: 'reading', name, bytesRead: 0, totalBytes: declaredSize || undefined })
    await yieldToUi()
    while (true) {
      let batchBytes = 0
      let reachedEof = false
      while (batchBytes < ANDROID_READ_BATCH_BYTES) {
        if (Date.now() > deadline) throw new Error('读取 TXT 超时，请把文件下载到手机本地后重试')
        const length = Number(android.invoke(input, 'read', buffer))
        if (length < 0) {
          reachedEof = true
          break
        }
        if (!length) {
          emptyReads += 1
          if (emptyReads >= 8) throw new Error('文件读取停滞，请把 TXT 下载到手机本地后重试')
          break
        }
        emptyReads = 0
        total += length
        batchBytes += length
        if (total > MAX_READER_FILE_BYTES) throw new Error('TXT 文件不能超过 6 MB')
        android.invoke(output, 'write', buffer, 0, length)
      }
      onProgress?.({ phase: 'reading', name, bytesRead: total, totalBytes: declaredSize || undefined })
      if (reachedEof) break
      await yieldToUi()
    }
    const bytes = android.invoke(output, 'toByteArray')
    const Base64 = android.importClass('android.util.Base64')
    const encoded = String(android.invoke(Base64, 'encodeToString', bytes, Base64.NO_WRAP) || '')
    if (!encoded) throw new Error('没有读取到 TXT 文件内容')
    onProgress?.({ phase: 'decoding', name, bytesRead: total, totalBytes: declaredSize || total })
    await yieldToUi()
    return createReaderTextFile(name, uni.base64ToArrayBuffer(encoded), onProgress)
  } finally {
    try { if (cursor) cursor.close() } catch {}
    try { if (input) android.invoke(input, 'close') } catch {}
    try { if (output) android.invoke(output, 'close') } catch {}
  }
}

function chooseAndroidTextFile(onProgress?: ReaderImportProgressHandler): Promise<ReaderTextFile | null> {
  return new Promise((resolve, reject) => {
    let pickerTimer: ReturnType<typeof setTimeout> | undefined
    let main: any
    let previousActivityResult: any
    let settled = false
    const restore = () => {
      clearTimeout(pickerTimer)
      if (main) (main as any).onActivityResult = previousActivityResult
    }
    const finishResolve = (value: ReaderTextFile | null) => {
      if (settled) return
      settled = true
      restore()
      resolve(value)
    }
    const finishReject = (reason: unknown) => {
      if (settled) return
      settled = true
      restore()
      reject(reason instanceof Error ? reason : new Error('无法读取这个 TXT 文件'))
    }
    try {
      if (plus.os.name !== 'Android') throw new Error('当前内测版仅支持 Android 文件导入')
      const android = plus.android as any
      main = android.runtimeMainActivity()
      const Intent = android.importClass('android.content.Intent')
      const Activity = android.importClass('android.app.Activity')
      const intent = new Intent(Intent.ACTION_OPEN_DOCUMENT)
      intent.addCategory(Intent.CATEGORY_OPENABLE)
      intent.setType('text/plain')
      intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
      const requestCode = 41000 + Math.floor(Math.random() * 1000)
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
          setTimeout(() => readAndroidTextFile(uri, onProgress).then(finishResolve, finishReject), 0)
        } catch (reason) { finishReject(reason) }
      }
      pickerTimer = setTimeout(() => finishReject(new Error('等待系统文件选择结果超时，请重新选择')), ANDROID_PICK_TIMEOUT_MS)
      main.startActivityForResult(Intent.createChooser(intent, '选择 TXT 文件'), requestCode)
    } catch (reason) { finishReject(reason) }
  })
}

export function chooseReaderTextFile(onProgress?: ReaderImportProgressHandler): Promise<ReaderTextFile | null> {
  // #ifdef H5
  return chooseH5TextFile(onProgress)
  // #endif
  // #ifdef APP-PLUS
  return chooseAndroidTextFile(onProgress)
  // #endif
  // #ifndef H5
  // #ifndef APP-PLUS
  return Promise.reject(new Error('当前平台暂不支持本机文件导入'))
  // #endif
  // #endif
}
