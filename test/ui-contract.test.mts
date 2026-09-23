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

test('horizontal scrollers hide their platform scrollbar', async () => {
  const files = await vueFiles('src')
  let scrollerCount = 0
  for (const file of files) {
    const source = await readFile(file, 'utf8')
    for (const tag of source.match(/<scroll-view\b[^>]*\bscroll-x\b[^>]*>/g) || []) {
      scrollerCount += 1
      assert.match(tag, /show-scrollbar="false"/, `${file} must disable the native scrollbar`)
      assert.match(tag, /class="[^"]*scrollbar-hidden/, `${file} must use the shared scrollbar-hiding class`)
    }
  }
  assert.ok(scrollerCount >= 3)
})

test('home feeds own the lower scroll region instead of scrolling the full page', async () => {
  const source = await readFile('src/pages/index/index.vue', 'utf8')
  assert.match(source, /class="feed-scroll scrollbar-hidden"\s+scroll-y/)
  assert.match(source, /\.feed-shell\{[^}]*height:100vh[^}]*overflow:hidden/)
})

test('reminder time uses the consistent two-column picker', async () => {
  const editor = await readFile('src/pages/editor/editor.vue', 'utf8')
  const picker = await readFile('src/components/TimePickerField.vue', 'utf8')
  assert.match(editor, /<TimePickerField\s+v-model="time"/)
  assert.doesNotMatch(editor, /picker\s+mode="time"/)
  assert.match(picker, /mode="multiSelector"/)
})

test('nickname editing uses the shared raster icon asset', async () => {
  const source = await readFile('src/pages/us/us.vue', 'utf8')
  assert.match(source, /nav-icons\/edit-active\.png/)
  assert.doesNotMatch(source, /class="pencil-icon"/)
})
