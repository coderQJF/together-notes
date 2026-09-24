export interface ReaderTouchPoint {
  x: number
  y: number
  at: number
}

export function chapterStepFromSwipe(start: ReaderTouchPoint, end: ReaderTouchPoint) {
  const horizontal = end.x - start.x
  const vertical = end.y - start.y
  if (end.at - start.at > 900 || Math.abs(horizontal) < 58 || Math.abs(horizontal) < Math.abs(vertical) * 1.2) return 0
  return horizontal < 0 ? 1 : -1
}
