import { access } from 'node:fs/promises'
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
