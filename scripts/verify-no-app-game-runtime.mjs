import { access } from 'node:fs/promises'
import { resolve } from 'node:path'

const platform = process.argv[2]
if (!['h5', 'mp-weixin'].includes(platform)) throw new Error('请指定 h5 或 mp-weixin')

const leakedRuntime = resolve(`dist/build/${platform}/static/games/emulatorjs`)
try {
  await access(leakedRuntime)
  throw new Error(`${platform} 构建错误地包含了仅限 App 的 GBA 运行时：${leakedRuntime}`)
} catch (reason) {
  if (reason instanceof Error && 'code' in reason && reason.code === 'ENOENT') {
    console.log(`已验证 ${platform} 构建不包含 App GBA 运行时`)
  } else {
    throw reason
  }
}
