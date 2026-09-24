import { createHash } from 'node:crypto'
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const appDirectory = resolve('dist/build/app')
const outputDirectory = resolve('dist/build/h5/app-updates')
const packageJson = JSON.parse(await readFile(resolve('package.json'), 'utf8'))
const manifest = JSON.parse(await readFile(resolve('src/manifest.json'), 'utf8'))
const updateConfig = JSON.parse(await readFile(resolve('app-update.json'), 'utf8'))
const appId = String(manifest.appid || '')
const version = String(packageJson.version || '')

if (!/^__UNI__[A-Z0-9]{6,32}$/i.test(appId)) throw new Error('无效的 DCloud AppID')
if (version !== String(manifest.versionName || '')) throw new Error('package.json 与 manifest.json 版本不一致')
await stat(resolve(appDirectory, 'manifest.json'))
await mkdir(outputDirectory, { recursive: true })

const finalName = `${appId}-${version}.wgt`
const finalPath = resolve(outputDirectory, finalName)
const temporaryPath = resolve(outputDirectory, `${finalName}.zip`)
await rm(temporaryPath, { force: true })
await rm(finalPath, { force: true })

let packed
if (process.platform === 'win32') {
  const quote = value => `'${value.replaceAll("'", "''")}'`
  packed = spawnSync('powershell.exe', ['-NoProfile', '-Command', `Compress-Archive -Path ${quote(resolve(appDirectory, '*'))} -DestinationPath ${quote(temporaryPath)} -CompressionLevel Optimal`], { encoding: 'utf8', windowsHide: true })
} else {
  packed = spawnSync('zip', ['-q', '-r', temporaryPath, '.'], { cwd: appDirectory, encoding: 'utf8' })
}
if (packed.status !== 0) throw new Error(`WGT 打包失败：${packed.stderr || packed.stdout}`)
await rename(temporaryPath, finalPath)
const bytes = await readFile(finalPath)
const latest = {
  appId,
  resourceVersion: version,
  nativeMinVersion: String(updateConfig.nativeMinVersion || version),
  wgtUrl: `/app-updates/${finalName}`,
  sha256: createHash('sha256').update(bytes).digest('hex'),
  size: bytes.length,
  releaseNotes: String(updateConfig.releaseNotes || ''),
  mandatory: updateConfig.mandatory === true,
}
await writeFile(resolve(outputDirectory, 'latest.json'), `${JSON.stringify(latest, null, 2)}\n`)
console.log(`已生成 App 资源更新包：${finalPath} (${bytes.length} bytes)`)
