export const NOVEL_PARSER_VERSION = 2
export const MAX_CHAPTER_LENGTH = 6_000

const CHAPTER_HEADING = /^(?:第[0-9〇零一二三四五六七八九十百千万两]{1,12}[章节回卷篇部集幕](?:\s+|[：:、.-])?.{0,36}|序\s*章|楔子|引子|前言|后记|尾声)$/

function normalize(value) {
  return String(value || '').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').replace(/[\t\u00a0]+/g, ' ').trim()
}

function fallbackChapters(text, targetLength = MAX_CHAPTER_LENGTH) {
  const paragraphs = text.split(/\n+/).map(item => item.trim()).filter(Boolean)
  if (!paragraphs.length) return []
  const groups = []
  let current = ''
  for (const paragraph of paragraphs) {
    if (paragraph.length > targetLength) {
      if (current) { groups.push(current); current = '' }
      for (let offset = 0; offset < paragraph.length; offset += targetLength) groups.push(paragraph.slice(offset, offset + targetLength))
      continue
    }
    if (current && current.length + paragraph.length + 2 > targetLength) {
      groups.push(current)
      current = paragraph
    } else current = current ? `${current}\n\n${paragraph}` : paragraph
  }
  if (current) groups.push(current)
  return groups.map((content, index) => ({ title: groups.length === 1 ? '正文' : `第 ${index + 1} 节`, content }))
}

function boundedChapter(title, content) {
  if (content.length <= MAX_CHAPTER_LENGTH) return [{ title, content }]
  return fallbackChapters(content).map((part, index) => ({
    title: `${title}（${index + 1}）`, content: part.content,
  }))
}

export function parseNovelChapters(source) {
  const text = normalize(source)
  if (!text) return []
  const lines = text.split('\n')
  const headings = []
  lines.forEach((line, index) => {
    const candidate = line.trim()
    if (candidate.length <= 48 && !/[。！？!?；;]$/.test(candidate) && CHAPTER_HEADING.test(candidate)) headings.push(index)
  })
  if (!headings.length) return fallbackChapters(text)

  const chapters = []
  const preface = lines.slice(0, headings[0]).join('\n').trim()
  if (preface) chapters.push(...boundedChapter('正文前', preface))
  headings.forEach((lineIndex, headingIndex) => {
    const nextLine = headings[headingIndex + 1] ?? lines.length
    const title = lines[lineIndex].trim()
    const content = lines.slice(lineIndex + 1, nextLine).join('\n').trim()
    if (content) chapters.push(...boundedChapter(title, content))
  })
  return chapters.length ? chapters : fallbackChapters(text)
}
