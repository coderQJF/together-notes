import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'

async function vueFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  const nested = await Promise.all(entries.map(entry => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return vueFiles(path)
    return entry.isFile() && entry.name.endsWith('.vue') ? [path] : []
  }))
  return nested.flat()
}

test('SubpageHeader exclusively owns subpage top safe-area spacing', async () => {
  const files = await vueFiles('src/pages')
  const subpages: string[] = []

  for (const file of files) {
    const source = await readFile(file, 'utf8')
    if (!source.includes('<SubpageHeader')) continue
    subpages.push(file)
    assert.match(source, /\.shell\{[^}]*\bpadding:0(?:\s|;)/, `${file} must not add top padding above SubpageHeader`)
    assert.doesNotMatch(source, /\.shell\{padding-top:[^}]+\}/, `${file} must leave safe-area spacing to SubpageHeader`)
  }

  assert.equal(subpages.length, 12)
})
