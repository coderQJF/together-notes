import { access, cp, mkdir, readdir, rm, stat } from 'node:fs/promises'
import { extname, join, relative, resolve, sep } from 'node:path'

const sourceDirectory = resolve('vendor/emulatorjs')
const appBuildDirectory = resolve('dist/build/app')
const destinationDirectory = resolve(appBuildDirectory, 'static/games/emulatorjs')
const forbiddenGameExtensions = new Set(['.gba', '.gb', '.gbc', '.rom', '.zip', '.7z'])
const requiredFiles = [
  'index.html',
  'data/loader.js',
  'data/emulator.min.js',
  'data/cores/mgba-wasm.data',
  'data/cores/mgba-legacy-wasm.data',
]

async function inventory(directory, root = directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const nested = await Promise.all(entries.map(async entry => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return inventory(path, root)
    if (!entry.isFile()) return []
    const info = await stat(path)
    return [{ path, relativePath: relative(root, path), size: info.size }]
  }))
  return nested.flat()
}

await access(appBuildDirectory)
await Promise.all(requiredFiles.map(path => access(resolve(sourceDirectory, path))))

const sourceFiles = await inventory(sourceDirectory)
const bundledGame = sourceFiles.find(file => forbiddenGameExtensions.has(extname(file.relativePath).toLowerCase()))
if (bundledGame) throw new Error(`App 游戏运行时不得包含游戏或压缩包：${bundledGame.relativePath}`)
if (sourceFiles.length < requiredFiles.length) throw new Error('App 游戏运行时资源不完整')

const expectedRoot = resolve(appBuildDirectory, 'static/games') + sep
if (!destinationDirectory.startsWith(expectedRoot)) throw new Error('App 游戏运行时目标目录越界')
await rm(destinationDirectory, { recursive: true, force: true })
await mkdir(resolve(destinationDirectory, '..'), { recursive: true })
await cp(sourceDirectory, destinationDirectory, { recursive: true })

const copiedFiles = await inventory(destinationDirectory)
const sourceBytes = sourceFiles.reduce((sum, file) => sum + file.size, 0)
const copiedBytes = copiedFiles.reduce((sum, file) => sum + file.size, 0)
if (copiedFiles.length !== sourceFiles.length || copiedBytes !== sourceBytes) {
  throw new Error(`App 游戏运行时复制不完整：${copiedFiles.length}/${sourceFiles.length} files, ${copiedBytes}/${sourceBytes} bytes`)
}

console.log(`已注入 App 专属 GBA 运行时：${copiedFiles.length} 个文件，${copiedBytes} bytes`)
