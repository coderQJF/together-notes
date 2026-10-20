export interface WaterEntry { id: string; day: string; amount: number; createdAt: string; deleted?: boolean }
export interface WaterOperation { id: string; entry: WaterEntry | null; revision: string }
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
  function read(): { events: WaterEntry[]; pending: WaterOperation[] } {
    const value = storage.read(key)
    if (value === '' || value == null) return { events: [], pending: [] }
    const valid = (entry: WaterEntry) => Boolean(entry && typeof entry.id === 'string' && (entry.deleted || validDay(entry.day) && Number.isInteger(entry.amount) && entry.amount >= 1 && entry.amount <= 5000 && Number.isFinite(Date.parse(entry.createdAt))))
    // Keep the original amounts and dates when migrating the first millilitre-based release.
    if (Array.isArray(value)) {
      if (!value.every(valid)) throw new Error('饮水记录读取失败，请勿继续写入')
      return { events: value, pending: value.map(entry => ({ id: entry.id, entry, revision: `legacy-${entry.id}` })) }
    }
    const data = value as { events?: WaterEntry[]; pending?: WaterOperation[] }
    if (!Array.isArray(data.events) || !Array.isArray(data.pending)) throw new Error('饮水记录读取失败，请勿继续写入')
    if (!data.events.every(valid) || !data.pending.every(op => op && typeof op.id === 'string' && typeof op.revision === 'string' && (op.entry === null || valid(op.entry)))) throw new Error('饮水记录读取失败，请勿继续写入')
    return { events: data.events, pending: data.pending }
  }
  function write(data: ReturnType<typeof read>) { storage.write(key, { version: 2, ...data }) }
  function entries(): WaterEntry[] { return read().events.filter(entry => !entry.deleted).sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id)) }
  function add(day: string, amount: number, now = new Date()) {
    if (!Number.isInteger(amount) || amount < 1 || amount > 5000) throw new Error('请输入 1–5000 之间的整数毫升数')
    if (!validDay(day) || day > waterDay(now)) throw new Error('请选择今天或过去的日期')
    const entry: WaterEntry = { id: `${now.getTime().toString(36)}-${Math.random().toString(36).slice(2)}`, day, amount, createdAt: now.toISOString() }
    const data = read()
    write({ events: [entry, ...data.events], pending: [...data.pending, { id: entry.id, entry, revision: entry.id }] })
    return entry
  }
  function remove(id: string) {
    const data = read(), entry = data.events.find(value => value.id === id)
    if (!entry || entry.deleted) return
    write({ events: data.events.map(value => value.id === id ? { ...value, deleted: true } : value), pending: [...data.pending.filter(value => value.id !== id), { id, entry: null, revision: `${Date.now()}-${Math.random()}` }] })
  }
  function merge(remote: WaterEntry[]) {
    const data = read(), events = new Map(remote.map(entry => [entry.id, entry]))
    for (const op of data.pending) {
      const entry = data.events.find(value => value.id === op.id)
      if (entry) events.set(op.id, entry)
    }
    write({ events: [...events.values()], pending: data.pending })
  }
  async function flush(send: (op: WaterOperation) => Promise<unknown>) {
    while (read().pending.length) {
      const op = read().pending[0]
      await send(op)
      const latest = read()
      write({ ...latest, pending: latest.pending.filter(value => value.revision !== op.revision) })
    }
  }
  function dailyTotals() {
    const totals = new Map<string, { day: string; cups: number; amount: number }>()
    for (const entry of entries()) {
      const total = totals.get(entry.day) || { day: entry.day, cups: 0, amount: 0 }
      total.cups++; total.amount += entry.amount; totals.set(entry.day, total)
    }
    return [...totals.values()].sort((a, b) => b.day.localeCompare(a.day))
  }
  return { entries, add, remove, flush, merge, dailyTotals, pending: () => read().pending }
}
