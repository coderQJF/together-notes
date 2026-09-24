import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const mode = process.argv[2]
if (!['native', 'hot'].includes(mode)) throw new Error('请指定 native（重新打包）或 hot（热更新）')

const packagePath = resolve('package.json')
const lockPath = resolve('package-lock.json')
const manifestPath = resolve('src/manifest.json')
const updatePath = resolve('app-update.json')
const [packageJson, lock, manifest, update] = await Promise.all(
  [packagePath, lockPath, manifestPath, updatePath].map(async path => JSON.parse(await readFile(path, 'utf8'))),
)

const parts = String(packageJson.version || '').split('.').map(Number)
if (parts.length !== 3 || parts.some(part => !Number.isInteger(part) || part < 0)) throw new Error('当前版本号不是 x.y.z 格式')
const next = mode === 'native' ? [parts[0], parts[1] + 1, 0] : [parts[0], parts[1], parts[2] + 1]
const version = next.join('.')

packageJson.version = version
lock.version = version
if (lock.packages?.['']) lock.packages[''].version = version
manifest.versionName = version
if (mode === 'native') {
  manifest.versionCode = String(Math.max(1, Number(manifest.versionCode) + 1))
  update.nativeMinVersion = version
}

const formatted = value => `${JSON.stringify(value, null, 2)}\n`
await Promise.all([
  writeFile(packagePath, formatted(packageJson)),
  writeFile(lockPath, formatted(lock)),
  writeFile(manifestPath, formatted(manifest)),
  writeFile(updatePath, formatted(update)),
])
console.log(`${mode === 'native' ? '原生大版本' : '资源小版本'}已更新为 ${version}`)
