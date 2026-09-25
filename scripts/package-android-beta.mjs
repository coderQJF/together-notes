import { access, mkdir, mkdtemp, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { basename, parse, resolve, sep } from 'node:path'
import { spawn, spawnSync } from 'node:child_process'

const projectPath = resolve('.')
const privateDirectory = resolve('.private/android')
const secrets = JSON.parse(await readFile(resolve(privateDirectory, 'app-release-secrets.local.json'), 'utf8'))
const minimumHBuilderXVersion = [4, 81]
const appId = '__UNI__10E8CA8'

function versionParts(version) {
  return String(version || '').split('.').map(part => Number.parseInt(part, 10) || 0)
}

function compareVersions(left, right) {
  const length = Math.max(left.length, right.length)
  for (let index = 0; index < length; index += 1) {
    const difference = (left[index] || 0) - (right[index] || 0)
    if (difference) return difference
  }
  return 0
}

async function inspectHBuilderX(directory) {
  try {
    const about = JSON.parse(await readFile(resolve(directory, 'plugins/about/package.json'), 'utf8'))
    await access(resolve(directory, 'HBuilderX.exe'))
    await access(resolve(directory, 'cli.exe'))
    const packagingFiles = [
      'plugins/amazon-corretto/bin/java.exe',
      'plugins/app-safe-pack/apktool.jar',
      'plugins/app-safe-pack/apksigner.jar',
      'plugins/app-safe-pack/zipalign/zipalign.exe',
      'plugins/uniapp-cli-vite/package.json',
      'plugins/uniapp-uts-v1/package.json',
    ]
    let packagingReady = true
    try { await Promise.all(packagingFiles.map(path => access(resolve(directory, path)))) }
    catch { packagingReady = false }
    return { directory, version: String(about.version || ''), parts: versionParts(about.version), packagingReady }
  } catch {
    return null
  }
}

async function resolveHBuilderX() {
  const explicit = process.env.HBUILDERX_HOME?.trim()
  const candidates = new Set(explicit ? [resolve(explicit)] : [])
  if (!explicit) {
    const roots = new Set([parse(projectPath).root, `${process.env.SystemDrive || 'C:'}\\`])
    for (const root of roots) {
      try {
        for (const entry of await readdir(root, { withFileTypes: true })) {
          if (entry.isDirectory() && /^HBuilderX(?:\.|$)/i.test(entry.name)) candidates.add(resolve(root, entry.name, 'HBuilderX'))
        }
      } catch {}
    }
  }
  const inspected = (await Promise.all([...candidates].map(inspectHBuilderX))).filter(Boolean)
  inspected.sort((left, right) => compareVersions(right.parts, left.parts))
  const selected = explicit ? inspected[0] : inspected.find(candidate => candidate.packagingReady)
  if (!selected) throw new Error('没有找到已安装 App 开发插件的 HBuilderX。请安装新版 HBuilderX 的 App 开发插件，或通过 HBUILDERX_HOME 指定其 HBuilderX 目录')
  if (compareVersions(selected.parts, minimumHBuilderXVersion) < 0) {
    throw new Error(`HBuilderX ${selected.version} 过旧；桌面卡片和本地提醒插件要求 4.81 以上，请升级后再打包`)
  }
  if (!selected.packagingReady) throw new Error(`HBuilderX ${selected.version} 尚未安装完整的 App 开发插件，请安装后再打包`)
  console.log(`使用 HBuilderX ${selected.version}：${selected.directory}`)
  return selected.directory
}

const hbuilderxDirectory = await resolveHBuilderX()
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

async function verifyNativeCapabilities(decodedDirectory) {
  const androidManifestPath = resolve(decodedDirectory, 'AndroidManifest.xml')
  const androidManifest = await readFile(androidManifestPath, 'utf8')
  const expectedManifestEntries = [
    'uts.sdk.modules.togetherHomeWidget.TogetherNoteWidgetProvider',
    'android.appwidget.action.APPWIDGET_UPDATE',
    'uts.sdk.modules.togetherLocalReminder.ReminderAlarmReceiver',
    'uts.sdk.modules.togetherLocalReminder.ReminderBootReceiver',
  ]
  for (const entry of expectedManifestEntries) {
    if (!androidManifest.includes(entry)) throw new Error(`APK 缺少原生能力声明：${entry}`)
  }
  await access(resolve(decodedDirectory, 'res/xml/together_note_widget_info.xml'))
  await access(resolve(decodedDirectory, 'res/layout/together_note_widget.xml'))
  await access(resolve(decodedDirectory, 'res/layout/together_note_widget_text.xml'))
  const resourceRoot = resolve(decodedDirectory, 'res')
  const drawableDirectories = (await readdir(resourceRoot, { withFileTypes: true }))
    .filter(entry => entry.isDirectory() && entry.name.startsWith('drawable'))
    .map(entry => resolve(resourceRoot, entry.name))
  let settingsDrawableFound = false
  for (const directory of drawableDirectories) {
    try { await access(resolve(directory, 'together_widget_settings.xml')); settingsDrawableFound = true; break }
    catch {}
  }
  if (!settingsDrawableFound) throw new Error('APK 缺少桌面小工具设置图标')
  const xmlDirectories = (await readdir(resourceRoot, { withFileTypes: true }))
    .filter(entry => entry.isDirectory() && entry.name.startsWith('xml'))
    .map(entry => resolve(resourceRoot, entry.name))
  let reconfigurable = false
  for (const directory of xmlDirectories) {
    try {
      const widgetInfo = await readFile(resolve(directory, 'together_note_widget_info.xml'), 'utf8')
      const featureValue = widgetInfo.match(/widgetFeatures="([^"]+)"/)?.[1] || ''
      const numericValue = featureValue.match(/0x[0-9a-f]+|\d+/i)?.[0] || ''
      const numericFeatures = numericValue ? Number(numericValue) : Number.NaN
      if (/(?:^|\W)reconfigurable(?:$|\W)/.test(featureValue)
        || (Number.isFinite(numericFeatures) && (numericFeatures & 1) === 1)) {
        reconfigurable = true
        break
      }
    } catch {}
  }
  if (!reconfigurable) throw new Error('APK 缺少 Android 12+ 桌面小工具重新配置声明')
  console.log('已验证 APK 包含 Android 桌面小工具与进程退出后本地提醒能力。')
}

async function latestRawApk() {
  const entries = await readdir(apkDirectory)
  const candidates = await Promise.all(entries.filter(name => new RegExp(`^${appId}__\\d+\\.apk$`).test(name)).map(async name => {
    const path = resolve(apkDirectory, name)
    return { path, modifiedAt: (await stat(path)).mtimeMs }
  }))
  candidates.sort((left, right) => right.modifiedAt - left.modifiedAt)
  if (!candidates[0]) throw new Error('HBuilderX 显示打包成功，但没有找到新生成的 APK')
  return candidates[0].path
}

function extractCloudDownloadUrl(text) {
  const compact = text.replace(/\x1B\[[0-9;?]*[ -/]*[@-~]/g, '').replace(/\s+/g, '')
  return compact.match(/https:\/\/app\.liuyingyong\.cn\/build\/download\/[0-9a-f-]{36}/i)?.[0] || ''
}

async function downloadCloudApk(downloadUrl) {
  const url = new URL(downloadUrl)
  if (url.protocol !== 'https:' || url.hostname !== 'app.liuyingyong.cn' || !/^\/build\/download\/[0-9a-f-]{36}$/i.test(url.pathname)) {
    throw new Error('云打包下载地址不可信')
  }
  const response = await fetch(url, { redirect: 'follow' })
  if (!response.ok) throw new Error(`云打包 APK 下载失败：HTTP ${response.status}`)
  const bytes = new Uint8Array(await response.arrayBuffer())
  if (bytes.length < 1_000_000 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) throw new Error('云打包下载内容不是有效 APK')
  const rawApk = resolve(apkDirectory, `${appId}__${Date.now()}.apk`)
  await writeFile(rawApk, bytes)
  console.log(`已下载云打包 APK：${rawApk}`)
  return rawApk
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
  const signedApk = resolve(workDirectory, 'signed.apk')
  const safeApk = resolve(apkDirectory, `together-notes-${appVersion}-beta.apk`)
  try {
    await rename(rawApk, workRawApk)
    runChecked(javaPath, ['-jar', apktoolPath, 'd', '-f', workRawApk, '-o', decodedDirectory])
    const runtimeManifestPath = resolve(decodedDirectory, `assets/apps/${appId}/www/manifest.json`)
    await verifyNativeCapabilities(decodedDirectory)
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
    runChecked(javaPath, ['-jar', apksignerPath, 'sign', '--ks', secrets.keystorePath, '--ks-key-alias', secrets.alias, '--ks-pass', 'env:TOGETHER_STORE_PASS', '--key-pass', 'env:TOGETHER_KEY_PASS', '--out', signedApk, alignedApk], {
      env: { ...process.env, TOGETHER_STORE_PASS: secrets.storePassword, TOGETHER_KEY_PASS: secrets.keyPassword },
    })
    runChecked(javaPath, ['-jar', apksignerPath, 'verify', '--verbose', '--print-certs', signedApk])
    await rm(safeApk, { force: true })
    await rename(signedApk, safeApk)
    for (const name of await readdir(apkDirectory)) {
      const path = resolve(apkDirectory, name)
      if (path !== safeApk && path.startsWith(apkDirectory + sep) && name.toLowerCase().endsWith('.apk')) await rm(path, { force: true })
    }
    console.log(`已移除 APK 内的签名配置字段并重新签名：${safeApk}`)
    return safeApk
  } finally {
    await rm(workDirectory, { recursive: true, force: true })
  }
}

const suppliedCloudApkUrl = process.env.ANDROID_CLOUD_APK_URL?.trim()
if (suppliedCloudApkUrl) {
  await downloadCloudApk(suppliedCloudApkUrl)
  await sanitizeAndSignApk()
  process.exit(0)
}

await writeFile(configPath, `${JSON.stringify({
  project: projectPath,
  platform: 'android',
  iscustom: false,
  safemode: false,
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
if (info.status !== 0 || /未检测到已打开|not running/i.test(`${info.stdout}\n${info.stderr}`)) {
  const opened = spawnSync(cliPath, ['open'], { encoding: 'utf8', windowsHide: true })
  if (opened.status !== 0) {
    const child = spawn(appPath, [], { detached: true, stdio: 'ignore', windowsHide: true })
    child.unref()
  }
  let ready = false
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await new Promise(resolveWait => setTimeout(resolveWait, 1000))
    const current = spawnSync(cliPath, ['user', 'info'], { encoding: 'utf8', windowsHide: true })
    if (current.status === 0 && !/未检测到已打开|not running/i.test(`${current.stdout}\n${current.stderr}`)) { ready = true; break }
  }
  if (!ready) throw new Error('HBuilderX 启动超时，请打开并登录后重试')
}

const open = spawnSync(cliPath, ['project', 'open', '--path', projectPath], { encoding: 'utf8', windowsHide: true })
if (open.status !== 0 && !/已经存在|已导入|导入成功/.test(`${open.stdout}\n${open.stderr}`)) {
  throw new Error(`HBuilderX 导入项目失败：${open.stderr || open.stdout}`)
}

console.log('正在请求 Android 传统云打包，以确保新增 UTS 原生插件被重新编译；配置内容和密码不会输出。')
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
  const rejected = /\[Error\]|user not login|未检测到已打开|文件不存在|尚未开通|打包失败|packaging failed|提交失败/i.test(output)
  if (code !== 0 || rejected) {
    process.exitCode = 1
    return
  }
  const cloudDownloadUrl = extractCloudDownloadUrl(output)
  const prepareApk = cloudDownloadUrl ? downloadCloudApk(cloudDownloadUrl) : Promise.resolve()
  prepareApk.then(() => sanitizeAndSignApk()).then(() => { process.exitCode = 0 }).catch(error => {
    console.error(`APK 脱敏或重新签名失败：${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  })
})
pack.on('error', error => { throw error })
