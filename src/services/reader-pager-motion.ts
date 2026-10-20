export type ReaderSheetId = 0 | 1

export interface ReaderSheets {
  active: ReaderSheetId
  pages: [number, number]
}

/** Physical sheet identities stay fixed, including when the visible page changes. */
export function createReaderSheets(index: number, count: number): ReaderSheets {
  const current = Math.max(0, Math.min(Math.max(0, count - 1), index))
  const adjacent = current + 1 < count ? current + 1 : Math.max(0, current - 1)
  return { active: 0, pages: [current, adjacent] }
}

export function spareReaderSheet(sheets: ReaderSheets): ReaderSheetId {
  return sheets.active === 0 ? 1 : 0
}

export function prepareReaderSheet(sheets: ReaderSheets, target: number): ReaderSheets {
  const pages: [number, number] = [...sheets.pages]
  pages[spareReaderSheet(sheets)] = target
  return { active: sheets.active, pages }
}

/** Reveal the sheet already painted underneath; never replace its visible text. */
export function completeReaderSheet(sheets: ReaderSheets): ReaderSheets {
  return { active: spareReaderSheet(sheets), pages: sheets.pages }
}

export function readerTurnTarget(direction: -1 | 1, width: number) {
  return -direction * Math.max(1, width) * 1.06
}

/** A released drag finishes its remaining distance instead of starting over. */
export function readerTurnDuration(offset: number, direction: -1 | 1, width: number) {
  const target = readerTurnTarget(direction, width)
  return Math.round(Math.max(90, Math.min(240, Math.abs(target - offset) / Math.abs(target) * 240)))
}

/** App events cross the service/view bridge, so target object identity is not
 * reliable. The stable sheet marker still distinguishes a leaf from its children. */
export function isReaderSheetTransition(event: {
  target?: { id?: unknown; dataset?: { sheet?: unknown } }
  currentTarget?: { id?: unknown; dataset?: { sheet?: unknown } }
  propertyName?: string
  detail?: { propertyName?: string }
}, id: ReaderSheetId) {
  const property = event.propertyName || event.detail?.propertyName
  if (property && property !== 'transform' && property !== '-webkit-transform') return false
  if (event.target && event.target === event.currentTarget) return true
  const origin = event.target?.dataset?.sheet
  return origin !== undefined ? String(origin) === String(id) : event.target?.id === `reader-sheet-${id}`
}
