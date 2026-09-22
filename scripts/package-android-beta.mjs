import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { spawn, spawnSync } from 'node:child_process'

const projectPath = resolve('.')
const privateDirectory = resolve('.private/android')
const secrets = JSON.parse(await readFile(resolve(privateDirectory, 'app-release-secrets.local.json'), 'utf8'))
const defaultHBuilderX = 'F:\\HBuilderX.3.6.4.20220922\\HBuilderX'
const hbuilderxDirectory = resolve(process.env.HBUILDERX_HOME || defaultHBuilderX)
const cliPath = resolve(hbuilderxDirectory, 'cli.exe')
const appPath = resolve(hbuilderxDirectory, 'HBuilderX.exe')
const configPath = resolve(privateDirectory, 'hbuilderx-pack.local.json')

await access(cliPath)
await access(appPath)
await access(secrets.keystorePath)
await mkdir(privateDirectory, { recursive: true })

await writeFile(configPath, `${JSON.stringify({
  project: projectPath,
  platform: 'android',
  iscustom: false,
  safemode: true,
  sourceMap: false,
  isconfusion: false,
  splashads: false,
  rpads: false,
  unimpads: false,
  android: {
    packagename: secrets.packageName,
    androidpacktype: '0',
    certalias: secrets.alias,
    certfile: secrets.keystorePath,
    certpassword: secrets.keyPassword,
    storepassword: secrets.storePassword,
    channels: '',
  },
}, null, 2)}\n`, { mode: 0o600 })

const info = spawnSync(cliPath, ['user', 'info'], { encoding: 'utf8', windowsHide: true })
if (info.status !== 0) {
  const child = spawn(appPath, [], { detached: true, stdio: 'ignore', windowsHide: true })
  child.unref()
  await new Promise(resolveWait => setTimeout(resolveWait, 5000))
}

const open = spawnSync(cliPath, ['project', 'open', '--path', projectPath], { encoding: 'utf8', windowsHide: true })
if (open.status !== 0 && !/已经存在|已导入|导入成功/.test(`${open.stdout}\n${open.stderr}`)) {
  throw new Error(`HBuilderX 导入项目失败：${open.stderr || open.stdout}`)
}

console.log('正在使用忽略提交的本地证书请求 Android 安心云打包；配置内容和密码不会输出。')
const pack = spawn(cliPath, ['pack', '--config', configPath], {
  cwd: projectPath,
  stdio: ['ignore', 'pipe', 'pipe'],
  windowsHide: true,
})
let output = ''
for (const stream of [pack.stdout, pack.stderr]) stream.on('data', chunk => {
  const text = chunk.toString()
  output += text
  process.stdout.write(text)
})
pack.on('exit', code => {
  const rejected = /\[Error\]|user not login|文件不存在|尚未开通|打包失败|packaging failed|提交失败/i.test(output)
  process.exit(code !== 0 || rejected ? 1 : 0)
})
pack.on('error', error => { throw error })
