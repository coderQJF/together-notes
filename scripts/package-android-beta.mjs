import { access, mkdir, mkdtemp, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { basename, resolve, sep } from 'node:path'
import { spawn, spawnSync } from 'node:child_process'

const projectPath = resolve('.')
const privateDirectory = resolve('.private/android')
const secrets = JSON.parse(await readFile(resolve(privateDirectory, 'app-release-secrets.local.json'), 'utf8'))
const defaultHBuilderX = 'F:\\HBuilderX.3.6.4.20220922\\HBuilderX'
const hbuilderxDirectory = resolve(process.env.HBUILDERX_HOME || defaultHBuilderX)
const cliPath = resolve(hbuilderxDirectory, 'cli.exe')
const appPath = resolve(hbuilderxDirectory, 'HBuilderX.exe')
const javaPath = resolve(process.env.JAVA_64_HOME || hbuilderxDirectory, process.env.JAVA_64_HOME ? 'bin/java.exe' : 'plugins/amazon-corretto/bin/java.exe')
const configPath = resolve(privateDirectory, 'hbuilderx-pack.local.json')
const apktoolPath = resolve(hbuilderxDirectory, 'plugins/app-safe-pack/apktool.jar')
const apksignerPath = resolve(hbuilderxDirectory, 'plugins/app-safe-pack/apksigner.jar')
const zipalignPath = resolve(hbuilderxDirectory, 'plugins/app-safe-pack/zipalign/zipalign.exe')
const apkDirectory = resolve('dist/release/apk')
const appVersion = JSON.parse(await readFile(resolve('package.json'), 'utf8')).version
const apktoolJavaHeap = process.env.APKTOOL_JAVA_HEAP || '4096m'

await access(cliPath)
await access(appPath)
await access(javaPath)
await access(secrets.keystorePath)
await access(apktoolPath)
await access(apksignerPath)
await access(zipalignPath)
await mkdir(privateDirectory, { recursive: true })

function runChecked(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', windowsHide: true, ...options })
  if (result.status !== 0) throw new Error(`${basename(command)} 执行失败：${result.stderr || result.stdout}`)
  return `${result.stdout || ''}${result.stderr || ''}`
}

async function latestRawApk() {
  const entries = await readdir(apkDirectory)
  const candidates = await Promise.all(entries.filter(name => /^__UNI__10E8CA8__\d+\.apk$/.test(name)).map(async name => {
    const path = resolve(apkDirectory, name)
    return { path, modifiedAt: (await stat(path)).mtimeMs }
  }))
  candidates.sort((left, right) => right.modifiedAt - left.modifiedAt)
  if (!candidates[0]) throw new Error('HBuilderX 显示打包成功，但没有找到新生成的 APK')
  return candidates[0].path
}

async function sanitizeAndSignApk() {
  await mkdir(apkDirectory, { recursive: true })
  const rawApk = await latestRawApk()
  const workDirectory = await mkdtemp(resolve(privateDirectory, 'apk-sanitize-'))
  if (!workDirectory.startsWith(privateDirectory + sep)) throw new Error('APK 脱敏目录不在预期的私有目录中')
  const workRawApk = resolve(workDirectory, 'raw.apk')
  const decodedDirectory = resolve(workDirectory, 'decoded')
  const rebuiltApk = resolve(workDirectory, 'rebuilt.apk')
  const alignedApk = resolve(workDirectory, 'aligned.apk')
  const safeApk = resolve(apkDirectory, `together-notes-${appVersion}-beta.apk`)
  let completed = false
  try {
    await rm(safeApk, { force: true })
    await rename(rawApk, workRawApk)
    runChecked(javaPath, ['-jar', apktoolPath, 'd', '-f', workRawApk, '-o', decodedDirectory])
    const runtimeManifestPath = resolve(decodedDirectory, 'assets/apps/__UNI__10E8CA8/www/manifest.json')
    const runtimeManifest = JSON.parse(await readFile(runtimeManifestPath, 'utf8'))
    const androidDistribution = runtimeManifest?.plus?.distribute?.google
    if (androidDistribution && typeof androidDistribution === 'object') {
      for (const key of ['aliasname', 'password', 'storepwd', 'keypwd', 'keystore']) delete androidDistribution[key]
    }
    const sanitized = JSON.stringify(runtimeManifest)
    if (/"(?:password|storepwd|keypwd|keystore)"\s*:/.test(sanitized)) throw new Error('APK 运行清单仍包含签名敏感字段')
    await writeFile(runtimeManifestPath, sanitized)
    runChecked(javaPath, [`-Xmx${apktoolJavaHeap}`, '-jar', apktoolPath, 'b', decodedDirectory, '-o', rebuiltApk])
    runChecked(zipalignPath, ['-f', '-p', '4', rebuiltApk, alignedApk])
    runChecked(javaPath, ['-jar', apksignerPath, 'sign', '--ks', secrets.keystorePath, '--ks-key-alias', secrets.alias, '--ks-pass', 'env:TOGETHER_STORE_PASS', '--key-pass', 'env:TOGETHER_KEY_PASS', '--out', safeApk, alignedApk], {
      env: { ...process.env, TOGETHER_STORE_PASS: secrets.storePassword, TOGETHER_KEY_PASS: secrets.keyPassword },
    })
    runChecked(javaPath, ['-jar', apksignerPath, 'verify', '--verbose', '--print-certs', safeApk])
    for (const name of await readdir(apkDirectory)) {
      const path = resolve(apkDirectory, name)
      if (path !== safeApk && path.startsWith(apkDirectory + sep) && name.toLowerCase().endsWith('.apk')) await rm(path, { force: true })
    }
    console.log(`已移除 APK 内的签名配置字段并重新签名：${safeApk}`)
    completed = true
    return safeApk
  } finally {
    if (!completed) await rm(safeApk, { force: true })
    await rm(workDirectory, { recursive: true, force: true })
  }
}

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
  if (code !== 0 || rejected) {
    process.exitCode = 1
    return
  }
  sanitizeAndSignApk().then(() => { process.exitCode = 0 }).catch(error => {
    console.error(`APK 脱敏或重新签名失败：${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  })
})
pack.on('error', error => { throw error })
