export interface WaterEntry { id: string; day: string; amount: number; createdAt: string }
interface Storage { read(key: string): unknown; write(key: string, value: unknown): void }

export function waterDay(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function validDay(day: string): boolean {
  const date = new Date(`${day}T12:00:00`)
  return /^\d{4}-\d{2}-\d{2}$/.test(day) && Number.isFinite(date.getTime()) && waterDay(date) === day
}

export function waterStore(owner: string, storage: Storage) {
  const key = `water-v1:${owner || 'local-guest'}`
  function entries(): WaterEntry[] {
    const value = storage.read(key)
    if (value === '' || value == null) return []
    if (!Array.isArray(value)) throw new Error('饮水记录读取失败，请勿继续写入')
    return value.filter((entry): entry is WaterEntry => Boolean(entry && typeof entry.id === 'string' && validDay(entry.day) && Number.isInteger(entry.amount) && entry.amount > 0 && entry.amount <= 5000 && Number.isFinite(Date.parse(entry.createdAt))))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }
  function add(day: string, amount: number, now = new Date()) {
    if (!Number.isInteger(amount) || amount < 1 || amount > 5000) throw new Error('请输入 1–5000 之间的整数毫升数')
    if (!validDay(day) || day > waterDay(now)) throw new Error('请选择今天或过去的日期')
    const entry: WaterEntry = { id: `${now.getTime().toString(36)}-${Math.random().toString(36).slice(2)}`, day, amount, createdAt: now.toISOString() }
    storage.write(key, [entry, ...entries()])
    return entry
  }
  function remove(id: string) { storage.write(key, entries().filter(entry => entry.id !== id)) }
  return { entries, add, remove }
}
