export type ReaderTheme = 'paper' | 'butter' | 'white'

export interface ReaderChapter {
  title: string
  content: string
}

export interface ReaderProgress {
  chapterIndex: number
  scrollTop: number
  updatedAt: string
}

export interface ReaderBook {
  id: string
  title: string
  author: string
  chapters: ReaderChapter[]
  createdAt: string
  updatedAt: string
  progress: ReaderProgress
}

export interface ReaderSettings {
  fontSize: number
  lineHeight: number
  theme: ReaderTheme
}

const LIBRARY_KEY = 'reader-library-v1'
const SETTINGS_KEY = 'reader-settings-v2'
const PROGRESS_KEY = 'reader-progress-v1'
export const MAX_READER_TEXT_LENGTH = 1_500_000

const DEFAULT_SETTINGS: ReaderSettings = { fontSize: 21, lineHeight: 2.15, theme: 'butter' }
const CHAPTER_HEADING = /^(?:第[0-9〇零一二三四五六七八九十百千万两]{1,12}[章节回卷篇部集](?:\s+|[：:、.-])?.{0,36}|序章|楔子|引子|前言|后记|尾声)$/

function normalizedText(value: string) {
  return String(value || '').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').replace(/[\t\u00a0]+/g, ' ').trim()
}

function fallbackChapters(text: string, targetLength = 6_000): ReaderChapter[] {
  const paragraphs = text.split(/\n{2,}/).map(item => item.trim()).filter(Boolean)
  if (!paragraphs.length) return []
  const groups: string[] = []
  let current = ''
  for (const paragraph of paragraphs) {
    if (current && current.length + paragraph.length + 2 > targetLength) {
      groups.push(current)
      current = paragraph
    } else current = current ? `${current}\n\n${paragraph}` : paragraph
  }
  if (current) groups.push(current)
  return groups.map((content, index) => ({ title: groups.length === 1 ? '正文' : `第 ${index + 1} 节`, content }))
}

export function parseReaderChapters(source: string): ReaderChapter[] {
  const text = normalizedText(source)
  if (!text) return []
  const lines = text.split('\n')
  const headings: number[] = []
  lines.forEach((line, index) => {
    const candidate = line.trim()
    if (candidate.length <= 48 && !/[。！？!?；;]$/.test(candidate) && CHAPTER_HEADING.test(candidate)) headings.push(index)
  })
  if (!headings.length) return fallbackChapters(text)

  const chapters: ReaderChapter[] = []
  const preface = lines.slice(0, headings[0]).join('\n').trim()
  if (preface) chapters.push({ title: '正文前', content: preface })
  headings.forEach((lineIndex, headingIndex) => {
    const nextLine = headings[headingIndex + 1] ?? lines.length
    const title = lines[lineIndex].trim()
    const content = lines.slice(lineIndex + 1, nextLine).join('\n').trim()
    if (content) chapters.push({ title, content })
  })
  return chapters.length ? chapters : fallbackChapters(text)
}

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
  return books.map(book => ({ ...book, progress: progress[book.id] || book.progress }))
}

function saveLibrary(books: ReaderBook[]) {
  uni.setStorageSync(LIBRARY_KEY, books.filter(book => book.id !== 'starter-window-light'))
}

export function createReaderBook(input: { title: string; author?: string; text: string }): ReaderBook {
  const title = input.title.trim().slice(0, 80)
  const author = String(input.author || '').trim().slice(0, 60)
  const text = normalizedText(input.text)
  if (!title) throw new Error('请填写书名')
  if (!text) throw new Error('请先选择 TXT 文件')
  if (text.length > MAX_READER_TEXT_LENGTH) throw new Error('单本内容暂时不能超过 150 万字')
  const chapters = parseReaderChapters(text)
  if (!chapters.length) throw new Error('没有识别到可阅读的正文')
  const now = new Date().toISOString()
  const book: ReaderBook = {
    id: `book-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`,
    title,
    author: author || '未署名',
    chapters,
    createdAt: now,
    updatedAt: now,
    progress: { chapterIndex: 0, scrollTop: 0, updatedAt: now },
  }
  saveLibrary([book, ...loadReaderLibrary()])
  return book
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

export function saveReaderProgress(id: string, chapterIndex: number, scrollTop: number) {
  const book = loadReaderLibrary().find(item => item.id === id)
  if (!book) return
  const progress = loadProgressMap()
  progress[id] = {
    chapterIndex: Math.max(0, Math.min(book.chapters.length - 1, Math.floor(chapterIndex))),
    scrollTop: Math.max(0, Math.floor(scrollTop)),
    updatedAt: new Date().toISOString(),
  }
  uni.setStorageSync(PROGRESS_KEY, progress)
}

export function loadReaderSettings(): ReaderSettings {
  const value = uni.getStorageSync(SETTINGS_KEY) as Partial<ReaderSettings> | undefined
  const fontSize = Math.max(15, Math.min(26, Number(value?.fontSize) || DEFAULT_SETTINGS.fontSize))
  const lineHeight = Math.max(1.7, Math.min(2.4, Number(value?.lineHeight) || DEFAULT_SETTINGS.lineHeight))
  const theme: ReaderTheme = ['paper', 'butter', 'white'].includes(String(value?.theme)) ? value?.theme as ReaderTheme : DEFAULT_SETTINGS.theme
  return { fontSize, lineHeight, theme }
}

export function saveReaderSettings(settings: ReaderSettings) {
  uni.setStorageSync(SETTINGS_KEY, settings)
}
