import { parseNovelChapters, NOVEL_PARSER_VERSION } from '../../server/novel-chapters.mjs'

export type ReaderTheme = 'paper' | 'butter' | 'white' | 'night'

export interface ReaderChapter {
  title: string
  content: string
  remoteIndex?: number
  characterCount?: number
}

export interface ReaderProgress {
  chapterIndex: number
  scrollTop: number
  /** Original chapter character offset; independent of font and viewport size. */
  characterOffset?: number
  updatedAt: string
  readChapterIndexes?: number[]
}

export interface ReaderBook {
  id: string
  title: string
  author: string
  chapters: ReaderChapter[]
  createdAt: string
  updatedAt: string
  progress: ReaderProgress
  source?: 'local' | 'cloud'
  parserVersion?: number
  cloudId?: string
}

export interface ReaderSettings {
  fontSize: number
  lineHeight: number
  theme: ReaderTheme
  dayTheme?: Exclude<ReaderTheme, 'night'>
  pageSound: boolean
}

const LIBRARY_KEY = 'reader-library-v1'
const SETTINGS_KEY = 'reader-settings-v2'
const PROGRESS_KEY = 'reader-progress-v1'

const DEFAULT_SETTINGS: ReaderSettings = { fontSize: 21, lineHeight: 2.15, theme: 'butter', pageSound: true }
function normalizedText(value: string) {
  return String(value || '').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').replace(/[\t\u00a0]+/g, ' ').trim()
}

// Cloud and local imports must use the same heading rules and render-size limits.
export const parseReaderChapters = parseNovelChapters

function isReaderBook(value: unknown): value is ReaderBook {
  const book = value as ReaderBook
  return Boolean(book && typeof book.id === 'string' && typeof book.title === 'string' && Array.isArray(book.chapters) && book.chapters.length)
}

function loadProgressMap() {
  const value = uni.getStorageSync(PROGRESS_KEY)
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, ReaderProgress> : {}
}

function qaStarterBook(): ReaderBook {
  const now = new Date().toISOString()
  const extraChapters = Array.from({ length: 9 }, (_, index) => ({
    title: `第${index + 4}章 QA 目录样式 ${index + 4}`,
    content: `这是用于检查十章分页、长标题省略和阅读状态的第 ${index + 4} 章示例正文。`,
  }))
  return {
    id: 'starter-window-light',
    title: '窗边的小灯',
    author: '小记原创示例',
    createdAt: now,
    updatedAt: now,
    progress: { chapterIndex: 0, scrollTop: 0, updatedAt: now },
    chapters: [
      { title: '第一章 晚归的人', content: '雨停的时候，巷口只剩一盏灯还亮着。\n\n林乔把伞靠在门边，发现桌上压着一张便签：锅里有汤，记得热一热。字迹被灯光照得很柔，像有人把一句普通的话认真保存了下来。\n\n她没有立刻开灯，只站在窗边看了一会儿。楼下的积水映着云后的月亮，风经过晾衣绳，发出很轻的声响。原来有人等过，房间就不会真正变暗。' },
      { title: '第二章 留下的话', content: '第二天清晨，桌上的便签旁多了一行新字：汤很好喝，我到家了。\n\n他们开始把来不及说的小事写下来。牛奶放在第二层，窗台的花今天开了，周六想去旧书店。纸片越来越多，却没有一张显得多余。\n\n有些日子并不需要隆重纪念。只要回头时，还能找到彼此留下的那句话，就已经足够。' },
      { title: '第三章 灯亮的时候', content: '又一个雨夜，林乔在巷口抬头，看见那扇熟悉的窗亮着。\n\n她忽然明白，灯并不是为了照亮整条路。它只是告诉晚归的人：你可以慢一点，门后有人记得你。\n\n于是她加快脚步，推开门，把今天想说的第一句话写在新的便签上。' },
      ...extraChapters,
    ],
  }
}

export function loadReaderLibrary(): ReaderBook[] {
  const stored = uni.getStorageSync(LIBRARY_KEY)
  let books = Array.isArray(stored) ? stored.filter(isReaderBook) : []
  const withoutLegacySample = books.filter(book => book.id !== 'starter-window-light')
  if (withoutLegacySample.length !== books.length) uni.setStorageSync(LIBRARY_KEY, withoutLegacySample)
  books = withoutLegacySample
  if (import.meta.env?.VITE_QA_READER_SAMPLE === '1') books = [qaStarterBook(), ...books]
  const progress = loadProgressMap()
  let migrated = false
  books = books.map(book => {
    if (book.source === 'cloud' || book.parserVersion === NOVEL_PARSER_VERSION) return book
    const chapters: ReaderChapter[] = []
    const offsets: number[] = []
    for (const chapter of book.chapters) {
      offsets.push(chapters.length)
      const parts = parseReaderChapters(chapter.content)
      chapters.push(...parts.map((part, index) => ({ ...part, title: part.title === '正文' || /^第 \d+ 节$/.test(part.title)
        ? (parts.length === 1 ? chapter.title : `${chapter.title}（${index + 1}）`)
        : part.title === '正文前' ? chapter.title : part.title })))
    }
    if (!chapters.length) return book
    const saved = progress[book.id] || book.progress
    const changed = chapters.length !== book.chapters.length || chapters.some((chapter, index) => chapter.title !== book.chapters[index]?.title)
    if (changed) progress[book.id] = { ...saved, chapterIndex: offsets[saved.chapterIndex] || 0, scrollTop: 0, characterOffset: 0, readChapterIndexes: [] }
    migrated = true
    return { ...book, chapters, parserVersion: NOVEL_PARSER_VERSION }
  })
  if (migrated) {
    uni.setStorageSync(LIBRARY_KEY, books.filter(book => book.id !== 'starter-window-light'))
    uni.setStorageSync(PROGRESS_KEY, progress)
  }
  return books.map(book => {
    const saved = progress[book.id] || book.progress
    const chapterIndex = Math.max(0, Math.min(book.chapters.length - 1, Math.floor(saved.chapterIndex || 0)))
    const normalizedProgress: ReaderProgress = {
      ...saved,
      chapterIndex,
      readChapterIndexes: Array.isArray(saved.readChapterIndexes)
        ? saved.readChapterIndexes
        : Array.from({ length: chapterIndex + 1 }, (_, index) => index),
    }
    return { ...book, progress: normalizedProgress }
  })
}

function saveLibrary(books: ReaderBook[]) {
  try {
    uni.setStorageSync(LIBRARY_KEY, books.filter(book => book.id !== 'starter-window-light'))
  } catch {
    throw new Error('本机存储空间不足，请先移出不需要的书籍后重试')
  }
}

export function prepareReaderBook(input: { title: string; author?: string; text: string }): ReaderBook {
  const title = input.title.trim().slice(0, 80)
  const author = String(input.author || '').trim().slice(0, 60)
  const text = normalizedText(input.text)
  if (!title) throw new Error('请填写书名')
  if (!text) throw new Error('请先选择 TXT 文件')
  const chapters = parseReaderChapters(text)
  if (!chapters.length) throw new Error('没有识别到可阅读的正文')
  const now = new Date().toISOString()
  const book: ReaderBook = {
    id: `book-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`,
    title,
    author: author || '未署名',
    chapters,
    parserVersion: NOVEL_PARSER_VERSION,
    createdAt: now,
    updatedAt: now,
    progress: { chapterIndex: 0, scrollTop: 0, updatedAt: now },
  }
  return book
}

export function prepareCloudReaderBook(input: { id: string; title: string; author: string; chapters: Array<{ chapterIndex: number; title: string; characterCount: number }>; createdAt: string; updatedAt: string }): ReaderBook {
  if (!input.id || !input.title.trim() || !input.chapters.length) throw new Error('云端小说目录不完整')
  return {
    id: `cloud-${input.id}`,
    cloudId: input.id,
    source: 'cloud',
    parserVersion: NOVEL_PARSER_VERSION,
    title: input.title.trim().slice(0, 80),
    author: input.author.trim().slice(0, 60) || '未署名',
    chapters: input.chapters.map(chapter => ({
      title: chapter.title,
      content: '',
      remoteIndex: chapter.chapterIndex,
      characterCount: chapter.characterCount,
    })),
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
    progress: { chapterIndex: 0, scrollTop: 0, updatedAt: new Date().toISOString() },
  }
}

export function saveReaderBook(book: ReaderBook) {
  const existing = loadReaderLibrary().find(item => item.id === book.id)
  const changed = existing && (existing.chapters.length !== book.chapters.length || existing.chapters.some((chapter, index) => chapter.title !== book.chapters[index]?.title || chapter.characterCount !== book.chapters[index]?.characterCount))
  const saved = existing ? { ...book, progress: existing.progress } : book
  if (existing && changed) {
    const oldTitle = existing.chapters[existing.progress.chapterIndex]?.title
    const matchingIndex = book.chapters.findIndex(chapter => chapter.title === oldTitle || chapter.title === `${oldTitle}（1）`)
    saved.progress = { ...existing.progress, chapterIndex: Math.max(0, matchingIndex), scrollTop: 0, characterOffset: 0, readChapterIndexes: [] }
    const progress = loadProgressMap()
    progress[book.id] = saved.progress
    uni.setStorageSync(PROGRESS_KEY, progress)
  }
  saveLibrary([saved, ...loadReaderLibrary().filter(item => item.id !== book.id)])
  return saved
}

export function createReaderBook(input: { title: string; author?: string; text: string }): ReaderBook {
  return saveReaderBook(prepareReaderBook(input))
}

export function getReaderBook(id: string) {
  return loadReaderLibrary().find(book => book.id === id) || null
}

export function removeReaderBook(id: string) {
  saveLibrary(loadReaderLibrary().filter(book => book.id !== id))
  const progress = loadProgressMap()
  if (progress[id]) {
    delete progress[id]
    uni.setStorageSync(PROGRESS_KEY, progress)
  }
}

export function saveReaderProgress(id: string, chapterIndex: number, scrollTop: number, characterOffset?: number) {
  const book = loadReaderLibrary().find(item => item.id === id)
  if (!book) return null
  const progress = loadProgressMap()
  const normalizedChapter = Math.max(0, Math.min(book.chapters.length - 1, Math.floor(chapterIndex)))
  const readChapterIndexes = [...new Set([...(progress[id]?.readChapterIndexes || book.progress.readChapterIndexes || []), normalizedChapter])]
    .filter(index => Number.isInteger(index) && index >= 0 && index < book.chapters.length)
    .sort((left, right) => left - right)
  const next: ReaderProgress = {
    chapterIndex: normalizedChapter,
    scrollTop: Math.max(0, Math.floor(scrollTop)),
    updatedAt: new Date().toISOString(),
    readChapterIndexes,
  }
  if (characterOffset !== undefined) next.characterOffset = Math.max(0, Math.floor(Number(characterOffset) || 0))
  progress[id] = next
  uni.setStorageSync(PROGRESS_KEY, progress)
  return next
}

export function loadReaderSettings(): ReaderSettings {
  const value = uni.getStorageSync(SETTINGS_KEY) as Partial<ReaderSettings> | undefined
  const fontSize = Math.max(15, Math.min(26, Number(value?.fontSize) || DEFAULT_SETTINGS.fontSize))
  const lineHeight = Math.max(1.7, Math.min(2.4, Number(value?.lineHeight) || DEFAULT_SETTINGS.lineHeight))
  const theme: ReaderTheme = ['paper', 'butter', 'white', 'night'].includes(String(value?.theme)) ? value?.theme as ReaderTheme : DEFAULT_SETTINGS.theme
  const dayTheme = ['paper', 'butter', 'white'].includes(String(value?.dayTheme)) ? value!.dayTheme! : theme === 'night' ? 'butter' : theme
  const pageSound = value?.pageSound !== false
  return { fontSize, lineHeight, theme, dayTheme, pageSound }
}

export function saveReaderSettings(settings: ReaderSettings) {
  uni.setStorageSync(SETTINGS_KEY, settings)
}
