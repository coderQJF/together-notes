import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const secretsPath = resolve('.private/android/app-release-secrets.local.json')
const secrets = JSON.parse(await readFile(secretsPath, 'utf8'))

function upsertEnvironment(source, entries) {
  const lines = String(source || '').replace(/\r\n/g, '\n').split('\n')
  const remaining = new Map(Object.entries(entries))
  const updated = lines.map(line => {
    const match = /^([A-Z][A-Z0-9_]*)=/.exec(line)
    if (!match || !remaining.has(match[1])) return line
    const value = remaining.get(match[1])
    remaining.delete(match[1])
    return `${match[1]}=${value}`
  })
  if (updated.at(-1) === '') updated.pop()
  for (const [key, value] of remaining) updated.push(`${key}=${value}`)
  return `${updated.join('\n')}\n`
}

const entries = {
  APP_REGISTRATION_CODE: secrets.betaRegistrationCode,
  APP_PUSH_WEBHOOK_TOKEN: secrets.pushWebhookToken,
}

for (const file of ['server/.env', 'deploy/.env']) {
  let current = ''
  try { current = await readFile(resolve(file), 'utf8') } catch {}
  await writeFile(resolve(file), upsertEnvironment(current, entries), { mode: 0o600 })
}

console.log('已把内测注册口令和 Push Token 写入忽略提交的本地服务端环境文件；未输出任何密钥。')
