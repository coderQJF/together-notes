import type { Attachment } from './api'

// Android photo pickers may return a content URI whose temporary permission
// expires. Copy it while permission is available, using the same Native.js
// stream/byte-array technique as the existing TXT and GBA importers.
export async function copyAndroidImage(path: string, name: string): Promise<Attachment> {
  const android = plus.android as any
  const activity = android.runtimeMainActivity()
  const resolver = android.invoke(activity, 'getContentResolver')
  const Uri = android.importClass('android.net.Uri')
  const directory = android.newObject('java.io.File', android.invoke(activity, 'getFilesDir'), 'note-images')
  if (!android.invoke(directory, 'exists') && !android.invoke(directory, 'mkdirs')) throw new Error('无法创建本机图片目录')
  const id = `local-file-${Date.now()}-${Math.random().toString(16).slice(2)}`
  const extension = name.match(/\.([a-z0-9]{2,5})$/i)?.[1] || 'jpg'
  const file = android.newObject('java.io.File', directory, `${id}.${extension}`)
  const JavaArray = android.importClass('java.lang.reflect.Array')
  const Byte = android.importClass('java.lang.Byte')
  const buffer = JavaArray.newInstance(Byte.TYPE, 8192)
  let input: any, output: any, size = 0, succeeded = false, emptyReads = 0
  const deadline = Date.now() + 30000
  try {
    input = android.invoke(resolver, 'openInputStream', Uri.parse(path))
    if (!input) throw new Error('读取图片失败')
    output = android.newObject('java.io.FileOutputStream', file, false)
    let batch = 0
    while (true) {
      if (Date.now() > deadline) throw new Error('读取图片超时，请重新选择')
      const length = Number(android.invoke(input, 'read', buffer, 0, 8192))
      if (length < 0) break
      if (!length) { if (++emptyReads > 8) throw new Error('读取图片失败'); continue }
      emptyReads = 0
      size += length
      if (size > 12 * 1024 * 1024) throw new Error('单张图片不能超过 12MB')
      android.invoke(output, 'write', buffer, 0, length)
      batch += length
      if (batch >= 256 * 1024) { batch = 0; await new Promise(resolve => setTimeout(resolve, 0)) }
    }
    if (!size) throw new Error('图片内容为空')
    android.invoke(output, 'flush')
    succeeded = true
    return { id, name, size, localPath: `file://${android.invoke(file, 'getAbsolutePath')}` }
  } finally {
    try { if (input) android.invoke(input, 'close') } catch {}
    try { if (output) android.invoke(output, 'close') } catch {}
    if (!succeeded) { try { android.invoke(file, 'delete') } catch {} }
  }
}
