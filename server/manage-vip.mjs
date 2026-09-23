import { DatabaseSync } from 'node:sqlite'
import { resolve } from 'node:path'

const usage = `用法：
  npm run vip -- list
  npm run vip -- enable <用户 ID 或 App 登录账号>
  npm run vip -- disable <用户 ID 或 App 登录账号>`

const [command, rawSelector] = process.argv.slice(2)
if (!['list', 'enable', 'disable'].includes(command || '') || (command !== 'list' && !rawSelector)) {
  console.error(usage)
  process.exitCode = 1
} else {
  const db = new DatabaseSync(resolve(process.env.DB_PATH || 'server/data/app.sqlite'))
  try {
    const columns = db.prepare('PRAGMA table_info(users)').all()
    if (!columns.length) throw new Error('数据库中还没有 users 表，请先启动一次服务')
    if (!columns.some(column => column.name === 'vip')) db.exec('ALTER TABLE users ADD COLUMN vip INTEGER NOT NULL DEFAULT 0')

    const selectUsers = () => db.prepare(`
      SELECT users.id, users.nickname, users.identity, users.vip, app_credentials.username
      FROM users
      LEFT JOIN app_credentials ON app_credentials.user = users.id
      ORDER BY users.nickname, users.id
    `).all()
    const printable = row => ({
      id: row.id,
      nickname: row.nickname,
      login: row.username || (String(row.identity).startsWith('wx:') ? '微信小程序账号' : '未设置 App 登录账号'),
      vip: Boolean(row.vip),
    })

    if (command === 'list') {
      console.table(selectUsers().map(printable))
    } else {
      const selector = String(rawSelector).trim()
      const matches = selectUsers().filter(row => row.id === selector || String(row.username || '').toLowerCase() === selector.toLowerCase())
      if (matches.length !== 1) throw new Error(matches.length ? '匹配到多个账号，请改用用户 ID' : '没有找到该用户；微信账号请先执行 list 查看用户 ID')
      const vip = command === 'enable' ? 1 : 0
      db.prepare('UPDATE users SET vip=? WHERE id=?').run(vip, matches[0].id)
      console.log(JSON.stringify({ ...printable(matches[0]), vip: Boolean(vip) }, null, 2))
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  } finally {
    db.close()
  }
}
