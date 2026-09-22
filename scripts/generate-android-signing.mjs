import { createHash, randomBytes } from 'node:crypto'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const privateDir = resolve('.private/android')
const keystorePath = resolve(privateDir, 'together-notes-release.keystore')
const secretsPath = resolve(privateDir, 'app-release-secrets.local.json')
const certificatePath = resolve(privateDir, 'certificate.der')
const alias = 'together-notes'
const keytool = process.env.KEYTOOL_PATH || 'keytool'

await mkdir(privateDir, { recursive: true })

async function readFingerprints(storePassword) {
  const exportCertificate = spawnSync(keytool, [
    '-exportcert',
    '-alias', alias,
    '-keystore', keystorePath,
    '-storepass', storePassword,
    '-file', certificatePath,
  ], { encoding: 'utf8', windowsHide: true })
  if (exportCertificate.status !== 0) throw new Error(`读取 Android 证书失败：${exportCertificate.stderr || exportCertificate.stdout}`)
  const certificate = await readFile(certificatePath)
  await rm(certificatePath, { force: true })
  const fingerprint = algorithm => createHash(algorithm).update(certificate).digest('hex').toUpperCase().match(/.{2}/g).join(':')
  return {
    certificateMd5: fingerprint('md5'),
    certificateSha1: fingerprint('sha1'),
    certificateSha256: fingerprint('sha256'),
  }
}

let existing
try { existing = JSON.parse(await readFile(secretsPath, 'utf8')) } catch {}

if (existing) {
  const fingerprints = await readFingerprints(existing.storePassword)
  existing = { ...existing, ...fingerprints }
  await writeFile(secretsPath, `${JSON.stringify(existing, null, 2)}\n`, { mode: 0o600 })
  console.log(`签名资料已存在：${keystorePath}`)
  console.log(`证书 MD5：${fingerprints.certificateMd5}`)
  console.log(`证书 SHA-1：${fingerprints.certificateSha1}`)
  console.log(`证书 SHA-256：${fingerprints.certificateSha256}`)
  process.exit(0)
}

const storePassword = randomBytes(24).toString('base64url')
const betaRegistrationCode = `TN-${randomBytes(12).toString('base64url')}`
const generate = spawnSync(keytool, [
  '-genkeypair',
  '-alias', alias,
  '-keyalg', 'RSA',
  '-keysize', '2048',
  '-sigalg', 'SHA256withRSA',
  '-validity', '36500',
  '-dname', 'CN=Together Notes, OU=Internal Beta, O=Together Notes, L=Changzhou, ST=Jiangsu, C=CN',
  '-keystore', keystorePath,
  '-storetype', 'JKS',
  '-storepass', storePassword,
  '-keypass', storePassword,
], { encoding: 'utf8', windowsHide: true })

if (generate.status !== 0) throw new Error(`生成 Android 签名失败：${generate.stderr || generate.stdout}`)

const fingerprints = await readFingerprints(storePassword)

await writeFile(secretsPath, `${JSON.stringify({
  generatedAt: new Date().toISOString(),
  packageName: 'cn.coderf.togethernotes',
  alias,
  keystorePath,
  storePassword,
  keyPassword: storePassword,
  ...fingerprints,
  betaRegistrationCode,
}, null, 2)}\n`, { mode: 0o600 })

console.log(`已生成 Android 签名：${keystorePath}`)
console.log(`证书 MD5：${fingerprints.certificateMd5}`)
console.log(`证书 SHA-1：${fingerprints.certificateSha1}`)
console.log(`证书 SHA-256：${fingerprints.certificateSha256}`)
console.log(`敏感配置已保存：${secretsPath}`)
