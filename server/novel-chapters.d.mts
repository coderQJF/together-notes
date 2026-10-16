export const NOVEL_PARSER_VERSION: number
export const MAX_CHAPTER_LENGTH: number
export function parseNovelChapters(source: string): Array<{ title: string; content: string }>
