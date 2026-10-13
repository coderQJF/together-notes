import { access, readFile, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'

const platform = process.argv[2]
if (!['h5', 'mp-weixin', 'app'].includes(platform)) throw new Error('请指定 h5、mp-weixin 或 app')

const leakedRuntime = resolve(`dist/build/${platform}/static/games/emulatorjs`)
try {
  await access(leakedRuntime)
  throw new Error(`${platform} 构建错误地包含了已停用的 EmulatorJS GBA 运行时：${leakedRuntime}`)
} catch (reason) {
  if (reason instanceof Error && 'code' in reason && reason.code === 'ENOENT') {
    console.log(`已验证 ${platform} 构建不包含已停用的 EmulatorJS GBA 运行时`)
  } else {
    throw reason
  }
}

if (platform !== 'app') {
  const appOnlyPages = ['library', 'reader', 'games', 'game-player', 'comics']
  if (platform === 'h5') {
    const assets = await readdir(resolve('dist/build/h5/assets'))
    for (const name of appOnlyPages) {
      if (assets.some(file => file.startsWith(`${name}-`) || file.startsWith(`pages-${name}-`))) throw new Error(`H5 仍然包含 App 专属页面资源：${name}`)
    }
  }
  if (platform === 'mp-weixin') {
    const config = JSON.parse(await readFile(resolve('dist/build/mp-weixin/app.json'), 'utf8'))
    for (const name of appOnlyPages) {
      if (config.pages.some(page => page === `pages/${name}/${name}`)) throw new Error(`小程序仍然包含 App 专属页面：${name}`)
    }
    for (const name of ['editor', 'detail']) {
      if (!config.pages.includes(`pages/${name}/${name}`)) throw new Error(`小程序缺少备忘/提醒页面：${name}`)
    }
  }
  for (const name of appOnlyPages) {
    try {
      await access(resolve(`dist/build/${platform}/pages/${name}`))
      throw new Error(`${platform} 仍然包含 App 专属模块：${name}`)
    } catch (reason) {
      if (!(reason instanceof Error && 'code' in reason && reason.code === 'ENOENT')) throw reason
    }
  }
  console.log(`已验证 ${platform} 排除小说、漫画、游戏页面`)
}
