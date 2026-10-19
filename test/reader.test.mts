import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createReaderBook,
  getReaderBook,
  loadReaderLibrary,
  parseReaderChapters,
  prepareCloudReaderBook,
  prepareReaderBook,
  removeReaderBook,
  saveReaderBook,
  saveReaderProgress,
  loadReaderSettings,
  saveReaderSettings,
} from '../src/services/reader.ts'
import { decodeReaderText, readerTitleFromFileName } from '../src/services/reader-import.ts'
import { chapterStepFromSwipe } from '../src/services/reader-gesture.ts'
import { paginateReaderText, readerPageAtOffset, readerOffsetFromLegacyScroll } from '../src/services/reader-pagination.ts'

test('fixed reading pages preserve every source character and fit the available line area at mobile sizes', () => {
  const content = ('\t初见。When you feel most lonely and desperate, there will be a door open for you.\n\n\n\n路明非看着窗外的灯，慢慢合上书。😀\n\n' + '长'.repeat(72) + '\n').repeat(16)
  for (const width of [280, 342, 382]) {
    for (const fontSize of [15, 21, 26]) {
      for (const lineHeight of [1.8, 2.15, 2.3]) {
        const layout = { width, height: 655, fontSize, lineHeight }
        const pages = paginateReaderText(content, layout)
        assert.ok(pages.length > 1)
        assert.equal(pages.map(page => content.slice(page.start, page.end)).join(''), content)
        for (const [index, page] of pages.entries()) {
          if (index) assert.equal(page.start, pages[index - 1].end)
          assert.ok(page.lines.length > 0)
          assert.ok(page.lines.reduce((sum, line) => sum + line.height, 0) <= layout.height)
          assert.ok(page.lines.every(line => !/^[\uDC00-\uDFFF]/.test(line.text)), 'Never split a surrogate pair across pages')
        }
      }
    }
  }
})

test('TXT blank separators become paragraph gaps instead of empty pages and tabs use rendered widths', () => {
  const compact = '第一段。\n第二段。\n第三段。'
  const spaced = compact.replace(/\n/g, '\n\n\n\n\n')
  const layout = { width: 280, height: 220, fontSize: 21, lineHeight: 2 }
  const pages = paginateReaderText(spaced, layout)
  assert.deepEqual(pages.map(page => page.lines.map(line => line.text)), paginateReaderText(compact, layout).map(page => page.lines.map(line => line.text)))
  assert.equal(pages.map(page => spaced.slice(page.start, page.end)).join(''), spaced)
  const seen: string[] = []
  paginateReaderText('\t缩进内容', { ...layout, measureCharacter: character => { seen.push(character); return 10 } })
  assert.ok(seen.includes(' '))
  assert.ok(!seen.includes('\t'))
  const punctuation = paginateReaderText('甲乙丙丁戊己庚辛，壬癸（天地）黄。'.repeat(10), layout)
  assert.ok(punctuation.flatMap(page => page.lines).every(line => !/^[，。）》]/.test(line.text)))
})

test('character position restores the same passage after font/viewport changes and resolves page boundaries', () => {
  const content = '这一页的文字应在改变字号后继续读下去。'.repeat(600)
  const original = paginateReaderText(content, { width: 342, height: 660, fontSize: 21, lineHeight: 2.15 })
  const position = original[7].start
  const resized = paginateReaderText(content, { width: 280, height: 560, fontSize: 26, lineHeight: 2.3 })
  const restored = resized[readerPageAtOffset(resized, position)]
  assert.ok(restored.start <= position && restored.end > position)
  assert.equal(readerPageAtOffset(original, original[7].start), 7)
  assert.equal(readerPageAtOffset(original, content.length), original.length - 1)
  assert.equal(readerOffsetFromLegacyScroll(original, 2_000, 660), original[3].start)
})

test('reader persists a character anchor and remembers the daytime background after night mode', () => {
  const storage = new Map<string, unknown>()
  const target = globalThis as typeof globalThis & { uni?: unknown }
  const original = target.uni
  target.uni = { getStorageSync(key: string) { return storage.get(key) }, setStorageSync(key: string, value: unknown) { storage.set(key, value) } }
  try {
    const book = createReaderBook({ title: '分页位置', text: '第一章\n' + '内容'.repeat(900) })
    saveReaderProgress(book.id, 0, 0, 478)
    assert.equal(getReaderBook(book.id)?.progress.characterOffset, 478)
    saveReaderSettings({ fontSize: 26, lineHeight: 2.3, theme: 'night', dayTheme: 'paper', pageSound: false })
    assert.deepEqual(loadReaderSettings(), { fontSize: 26, lineHeight: 2.3, theme: 'night', dayTheme: 'paper', pageSound: false })
    storage.set('reader-settings-v2', { fontSize: 21, lineHeight: 2.15, theme: 'white', pageSound: false })
    assert.equal(loadReaderSettings().dayTheme, 'white', 'Older daytime settings remain the return target after night mode')
  } finally { if (original === undefined) delete target.uni; else target.uni = original }
})

test('reader swipe gesture maps left to next and right to previous without stealing vertical scroll', () => {
  const at = 1_000
  assert.equal(chapterStepFromSwipe({ x: 260, y: 400, at }, { x: 120, y: 410, at: at + 240 }), 1)
  assert.equal(chapterStepFromSwipe({ x: 100, y: 400, at }, { x: 240, y: 390, at: at + 240 }), -1)
  assert.equal(chapterStepFromSwipe({ x: 200, y: 300, at }, { x: 160, y: 480, at: at + 240 }), 0)
  assert.equal(chapterStepFromSwipe({ x: 260, y: 400, at }, { x: 120, y: 410, at: at + 1_200 }), 0)
})

test('reader file import decodes common Chinese TXT encodings and derives a title', () => {
  const utf8Body = new TextEncoder().encode('第一章\r\n从这里开始。')
  const utf8 = new Uint8Array(utf8Body.length + 3)
  utf8.set([0xef, 0xbb, 0xbf])
  utf8.set(utf8Body, 3)
  assert.equal(decodeReaderText(utf8.buffer), '第一章\n从这里开始。')
  assert.equal(decodeReaderText(Uint8Array.from([0xd6, 0xd0, 0xce, 0xc4]).buffer), '中文')
  assert.equal(readerTitleFromFileName('/Download/%E7%AA%97%E8%BE%B9%E7%9A%84%E5%B0%8F%E7%81%AF.txt'), '窗边的小灯')
})

test('reader parser recognizes common Chinese chapter headings and keeps a preface', () => {
  const chapters = parseReaderChapters(`写在前面\n\n第一章 相遇\n第一章正文。\n\n第二章\n第二章正文。`)
  assert.deepEqual(chapters.map(item => item.title), ['正文前', '第一章 相遇', '第二章'])
  assert.equal(chapters[1].content, '第一章正文。')
})

test('reader parser splits long heading-free text without losing paragraphs', () => {
  const first = '甲'.repeat(4_000)
  const second = '乙'.repeat(4_000)
  const chapters = parseReaderChapters(`${first}\n\n${second}`)
  assert.equal(chapters.length, 2)
  assert.equal(chapters[0].content, first)
  assert.equal(chapters[1].content, second)
})

test('reader parser normalizes newlines and rejects blank content', () => {
  assert.deepEqual(parseReaderChapters('  \r\n '), [])
  assert.equal(parseReaderChapters('\uFEFF序章\r\n从这里开始。')[0].content, '从这里开始。')
})

test('reader accepts local TXT content larger than the former 1.5 million character limit', () => {
  const text = '甲'.repeat(1_500_001)
  assert.equal(decodeReaderText(new TextEncoder().encode(text).buffer).length, text.length)
  const book = prepareReaderBook({ title: '长篇测试', text })
  assert.ok(book.chapters.length > 1)
  assert.equal(book.chapters.reduce((sum, chapter) => sum + chapter.content.length, 0), text.length)
})

test('local reader storage creates books, saves progress, and removes content', () => {
  const storage = new Map<string, unknown>()
  const target = globalThis as typeof globalThis & { uni?: unknown }
  const original = target.uni
  target.uni = {
    getStorageSync(key: string) { return storage.get(key) },
    setStorageSync(key: string, value: unknown) { storage.set(key, value) },
  }
  try {
    const now = new Date().toISOString()
    storage.set('reader-library-v1', [{ id: 'starter-window-light', title: '窗边的小灯', author: '小记原创示例', chapters: [{ title: '正文', content: '示例' }], createdAt: now, updatedAt: now, progress: { chapterIndex: 0, scrollTop: 0, updatedAt: now } }])
    assert.equal(loadReaderLibrary().length, 0)
    assert.deepEqual(storage.get('reader-library-v1'), [])
    const book = createReaderBook({ title: '测试书', text: '第一章 开始\n内容。\n第二章 继续\n更多内容。' })
    assert.equal(book.chapters.length, 2)
    assert.deepEqual(getReaderBook(book.id)?.progress.readChapterIndexes, [0])
    saveReaderProgress(book.id, 1, 360)
    assert.deepEqual(getReaderBook(book.id)?.progress.chapterIndex, 1)
    assert.deepEqual(getReaderBook(book.id)?.progress.scrollTop, 360)
    assert.deepEqual(getReaderBook(book.id)?.progress.readChapterIndexes, [0, 1])
    saveReaderProgress(book.id, 0, 0)
    assert.deepEqual(getReaderBook(book.id)?.progress.readChapterIndexes, [0, 1])
    removeReaderBook(book.id)
    assert.equal(getReaderBook(book.id), null)
  } finally {
    if (original === undefined) delete target.uni
    else target.uni = original
  }
})

test('reader preparation does not write until the explicit local save step', () => {
  const storage = new Map<string, unknown>()
  const target = globalThis as typeof globalThis & { uni?: unknown }
  const original = target.uni
  target.uni = {
    getStorageSync(key: string) { return storage.get(key) },
    setStorageSync(key: string, value: unknown) { storage.set(key, value) },
  }
  try {
    const book = prepareReaderBook({ title: '分步导入', text: '第一章 开始\n正文。' })
    assert.equal(storage.has('reader-library-v1'), false)
    saveReaderBook(book)
    assert.equal((storage.get('reader-library-v1') as unknown[]).length, 1)
  } finally {
    if (original === undefined) delete target.uni
    else target.uni = original
  }
})

test('cloud reader books store only the catalog instead of the whole novel', () => {
  const book = prepareCloudReaderBook({
    id: 'remote-1',
    title: '北派盗墓笔记',
    author: '云峰',
    createdAt: '2026-09-24T00:00:00.000Z',
    updatedAt: '2026-09-24T00:00:00.000Z',
    chapters: [
      { chapterIndex: 0, title: '第一章', characterCount: 3200 },
      { chapterIndex: 1, title: '第二章', characterCount: 2800 },
    ],
  })
  assert.equal(book.id, 'cloud-remote-1')
  assert.equal(book.source, 'cloud')
  assert.equal(book.chapters.length, 2)
  assert.equal(book.chapters[0].content, '')
  assert.equal(book.chapters[1].remoteIndex, 1)
})


test('local and cloud parsers use the same bounded act headings', async () => {
  const { parseNovelChapters } = await import('../server/novel-chapters.mjs')
  const source = '题词。\n序 章\n开始。\n第一幕\n' + '正文。'.repeat(6000) + '\n第二幕\n结束。'
  assert.deepEqual(parseReaderChapters(source), parseNovelChapters(source))
  assert.ok(parseReaderChapters(source).every(chapter => chapter.content.length <= 6000))
})

test('replacing a cloud catalog relocates progress by title and clears stale pixel offsets', () => {
  const storage = new Map<string, unknown>()
  const target = globalThis as typeof globalThis & { uni?: unknown }
  const original = target.uni
  target.uni = { getStorageSync(key: string) { return storage.get(key) }, setStorageSync(key: string, value: unknown) { storage.set(key, value) } }
  try {
    const input = { id: 'repaired', title: '测试', author: '作者', createdAt: '', updatedAt: '' }
    saveReaderBook(prepareCloudReaderBook({ ...input, chapters: [{chapterIndex: 0, title: '正文前', characterCount: 200000}, {chapterIndex: 1, title: '尾声', characterCount: 200}] }))
    saveReaderProgress('cloud-repaired', 1, 500, 350)
    saveReaderBook(prepareCloudReaderBook({ ...input, chapters: [{chapterIndex: 0, title: '序章', characterCount: 200}, {chapterIndex: 1, title: '第一幕', characterCount: 3000}, {chapterIndex: 2, title: '尾声', characterCount: 200}] }))
    assert.equal(getReaderBook('cloud-repaired')?.progress.chapterIndex, 2)
    assert.equal(getReaderBook('cloud-repaired')?.progress.scrollTop, 0)
    assert.equal(getReaderBook('cloud-repaired')?.progress.characterOffset, 0)
    assert.deepEqual(getReaderBook('cloud-repaired')?.progress.readChapterIndexes, [])
  } finally { if (original === undefined) delete target.uni; else target.uni = original }
})


test('legacy local imports repair embedded act headings once without dropping body text', () => {
  const storage = new Map<string, unknown>()
  const target = globalThis as typeof globalThis & { uni?: unknown }
  const original = target.uni
  target.uni = { getStorageSync(key: string) { return storage.get(key) }, setStorageSync(key: string, value: unknown) { storage.set(key, value) } }
  try {
    const now = new Date().toISOString()
    storage.set('reader-library-v1', [{ id: 'legacy', title: '旧书', author: '作者', createdAt: now, updatedAt: now, progress: { chapterIndex: 1, scrollTop: 900, updatedAt: now }, chapters: [{ title: '正文前', content: '题词。\n序 章\n开始。\n第一幕\n内容。' }, { title: '尾声', content: '结束。' }] }])
    const repaired = getReaderBook('legacy')!
    assert.deepEqual(repaired.chapters.map(chapter => chapter.title), ['正文前', '序 章', '第一幕', '尾声'])
    assert.equal(repaired.chapters[2].content, '内容。')
    assert.equal(repaired.progress.chapterIndex, 3)
    assert.equal(repaired.progress.scrollTop, 0)
    saveReaderProgress('legacy', 2, 450)
    assert.equal(getReaderBook('legacy')?.progress.scrollTop, 450)
    assert.equal(getReaderBook('legacy')?.chapters.length, 4)
  } finally { if (original === undefined) delete target.uni; else target.uni = original }
})
