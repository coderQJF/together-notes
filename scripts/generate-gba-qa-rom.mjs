import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

// Original tiny ARM homebrew: A/B set a persistent colour, so restoring a state is visible.
// No commercial ROM data or platform logo bytes.
const words = [], labels = new Map(), fixups = []
const emit = word => words.push(word >>> 0)
const label = name => labels.set(name, words.length)
const branch = (name, condition = 0xea000000) => { fixups.push([words.length, name, 'branch', condition]); emit(0) }
const load = (reg, name) => { fixups.push([words.length, name, 'load', reg]); emit(0) }
load(0, 'io'); load(1, 'mode'); emit(0xe1c010b0)
load(6, 'keys'); emit(0xe3a0401f)
label('frame'); emit(0xe1d670b0)
emit(0xe3170001); load(8, 'green'); emit(0x01a04008) // if A is held: green
emit(0xe3170002); load(8, 'blue'); emit(0x01a04008) // if B is held: blue
load(2, 'vram'); load(5, 'count')
label('fill'); emit(0xe0c240b2); emit(0xe2555001); branch('fill', 0x1a000000)
branch('frame')
label('io'); emit(0x04000000)
label('mode'); emit(0x403)
label('keys'); emit(0x04000130)
label('vram'); emit(0x06000000)
label('count'); emit(240 * 160)
label('green'); emit(0x03e0)
label('blue'); emit(0x7c00)
for (const [index, name, kind, value] of fixups) {
  const offset = (labels.get(name) - index - 2) * 4
  words[index] = kind === 'branch' ? (value | ((offset / 4) & 0xffffff)) >>> 0 : (0xe59f0000 | (value << 12) | offset) >>> 0
}
const rom = Buffer.alloc(64 * 1024)
rom.writeUInt32LE(0xea00002e, 0)
rom.write('GBA QA', 0xa0, 'ascii'); rom[0xb2] = 0x96
let sum = 0; for (let i = 0xa0; i <= 0xbc; i++) sum += rom[i]
rom[0xbd] = (-sum - 0x19) & 255
words.forEach((word, i) => rom.writeUInt32LE(word, 0xc0 + i * 4))
const directory = resolve('artifacts/native-gba-checks/apk/assets')
await mkdir(directory, { recursive: true })
await writeFile(resolve(directory, 'qa.gba'), rom)
