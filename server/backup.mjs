import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { readdir, unlink } from 'node:fs/promises';
import { resolve, dirname, basename } from 'node:path';

const dbPath = resolve(process.env.DB_PATH || 'server/data/app.sqlite');
const backupDir = resolve(process.env.BACKUP_DIR || resolve(dirname(dbPath), 'backups'));
const keep = Math.max(1, Number(process.env.KEEP_BACKUPS || 14));
mkdirSync(backupDir, { recursive: true });

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const target = resolve(backupDir, `backup-${stamp}.sqlite`);
if (dirname(target) !== backupDir) throw new Error('备份路径无效');

const db = new DatabaseSync(dbPath);
try { db.exec(`VACUUM INTO '${target.replaceAll("'", "''")}'`); }
finally { db.close(); }

const files = (await readdir(backupDir)).filter(name => /^backup-.*\.sqlite$/.test(name)).sort().reverse();
for (const name of files.slice(keep)) await unlink(resolve(backupDir, name));
console.log(`数据库已备份：${basename(target)}；保留最近 ${keep} 份`);
