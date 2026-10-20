// Immutable drink events and deletion tombstones make offline retries idempotent.
export function createWaterLog(db) {
  db.exec('CREATE TABLE IF NOT EXISTS water_entries(owner TEXT NOT NULL,id TEXT NOT NULL,day TEXT,amount INTEGER,created_at TEXT,deleted INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(owner,id)); CREATE INDEX IF NOT EXISTS idx_water_owner_day ON water_entries(owner,day);')
  const list = owner => db.prepare('SELECT id,day,amount,created_at AS createdAt,deleted FROM water_entries WHERE owner=? ORDER BY created_at DESC,id DESC').all(owner).map(entry => ({ ...entry, deleted: Boolean(entry.deleted) }))
  function put(owner, id, entry) {
    const date = new Date(`${entry.day}T12:00:00Z`)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.day || '') || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== entry.day || entry.day > new Date(Date.now() + 864e5).toISOString().slice(0, 10)) throw new Error('饮水日期无效')
    if (!Number.isInteger(entry.amount) || entry.amount < 1 || entry.amount > 5000 || !Number.isFinite(Date.parse(entry.createdAt)) || Date.parse(entry.createdAt) > Date.now() + 600000) throw new Error('饮水记录格式无效')
    db.prepare('INSERT OR IGNORE INTO water_entries(owner,id,day,amount,created_at) VALUES(?,?,?,?,?)').run(owner, id, entry.day, entry.amount, entry.createdAt)
  }
  function remove(owner, id) { db.prepare('INSERT INTO water_entries(owner,id,deleted) VALUES(?,?,1) ON CONFLICT(owner,id) DO UPDATE SET deleted=1').run(owner, id) }
  return { list, put, remove }
}
