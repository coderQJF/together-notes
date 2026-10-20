export interface ReaderPageLine {
  text: string
  start: number
  end: number
  indent: boolean
  height: number
}

export interface ReaderTextPage {
  start: number
  end: number
  lines: ReaderPageLine[]
}

export interface ReaderPageLayout {
  width: number
  height: number
  fontSize: number
  lineHeight: number
  letterSpacing?: number
  /** Space reserved for the chapter heading on the first page only. */
  firstPageTopInset?: number
  measureCharacter?: (character: string) => number
}

// Used until a platform canvas is ready. Wide glyphs are deliberately generous;
// the same line boxes are rendered by ReaderPager on every platform.
export function readerCharacterWidth(character: string, fontSize: number) {
  if (/\p{Mark}/u.test(character)) return 0
  if (character === '\t') return fontSize * 2
  if (/^[\x20-\x7e]$/.test(character)) return fontSize * (/[MW@%]/.test(character) ? .95 : .64)
  return fontSize * 1.04
}

/** Wrap once into explicit line boxes so no platform can silently overflow a page.
 * Offsets refer to the original UTF-16 string, including whitespace/newlines. */
export function paginateReaderText(content: string, layout: ReaderPageLayout): ReaderTextPage[] {
  const fontSize = Math.max(1, layout.fontSize)
  const width = Math.max(fontSize * 3, layout.width - 3)
  const lineHeight = fontSize * Math.max(1, layout.lineHeight)
  const height = Math.max(lineHeight, layout.height - 2)
  const spacing = layout.letterSpacing ?? .4
  const measure = layout.measureCharacter || ((character: string) => readerCharacterWidth(character, fontSize))
  const lines: ReaderPageLine[] = []
  let start = 0
  let offset = 0
  let text = ''
  let indent = true
  let usedWidth = fontSize * 2
  const flush = (end: number, paragraphEnd = false) => {
    lines.push({ text, start, end, indent, height: lineHeight + (paragraphEnd ? fontSize * .45 : 0) })
    text = ''
    start = end
    indent = paragraphEnd
    usedWidth = indent ? fontSize * 2 : 0
  }
  for (const character of content) {
    if (character === '\n') {
      offset += character.length
      // TXT exports often insert several blank lines per paragraph. Consume
      // their offsets without turning those separators into empty pages.
      if (!text && indent && lines.length) {
        lines[lines.length - 1].end = offset
        start = offset
        continue
      }
      flush(offset, true)
      continue
    }
    const measured = character === '\t' ? measure(' ') * 2 : measure(character)
    const characterWidth = Math.max(0, Number.isFinite(measured) ? measured : readerCharacterWidth(character, fontSize)) + spacing
    if (text && usedWidth + characterWidth > width) {
      const previous = Array.from(text).pop()!
      // Keep Chinese closing punctuation off the next line's leading edge,
      // and opening punctuation with the following word. Carry one glyph;
      // every source offset still belongs to exactly one contiguous page.
      if (text.length > previous.length && (/[，。！？、；：）》」』】〉…,.!?;:)]/.test(character) || /[（《「『【〈(]/.test(previous))) {
        text = text.slice(0, -previous.length)
        offset -= previous.length
        flush(offset)
        text = previous
        offset += previous.length
        usedWidth += Math.max(0, measure(previous)) + spacing
      } else flush(offset)
    }
    text += character
    offset += character.length
    usedWidth += characterWidth
  }
  if (text || !lines.length) flush(offset)

  const pages: ReaderTextPage[] = []
  let page: ReaderTextPage = { start: 0, end: 0, lines: [] }
  let usedHeight = 0
  const availableHeight = () => Math.max(lineHeight, height - (pages.length ? 0 : Math.max(0, layout.firstPageTopInset || 0)))
  const finishPage = () => {
    const last = page.lines[page.lines.length - 1]
    if (last) last.height = lineHeight
    pages.push(page)
  }
  for (const line of lines) {
    // A paragraph gap belongs between lines, never by itself on another page.
    if (page.lines.length && usedHeight + lineHeight > availableHeight()) {
      finishPage()
      page = { start: line.start, end: line.end, lines: [] }
      usedHeight = 0
    }
    page.lines.push(line)
    page.end = line.end
    usedHeight += line.height
  }
  finishPage()
  return pages
}

export function readerPageAtOffset(pages: ReaderTextPage[], offset: number) {
  if (!pages.length) return 0
  const safe = Math.max(0, Number(offset) || 0)
  const index = pages.findIndex(page => safe < page.end)
  return index < 0 ? pages.length - 1 : index
}

export function readerOffsetFromLegacyScroll(pages: ReaderTextPage[], scrollTop: number, pageHeight: number) {
  return pages[Math.min(pages.length - 1, Math.max(0, Math.floor(scrollTop / Math.max(1, pageHeight))))]?.start || 0
}
