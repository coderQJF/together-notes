// A resized WebView already removes part (or all) of the keyboard from its viewport.
export function keyboardDockOffset(keyboard: number, baseline: number, viewport: number) {
  return Math.max(0, keyboard - Math.max(0, baseline - viewport))
}

export function paperScrollTarget(scrollTop: number, fieldTop: number, fieldBottom: number, safeTop: number, safeBottom: number) {
  if (fieldBottom > safeBottom) return Math.max(0, scrollTop + fieldBottom - safeBottom)
  // A long paragraph cannot show both its start and its caret. Once the caret
  // is visible, never scroll back to its start on the next layout notification.
  if (fieldBottom - fieldTop > safeBottom - safeTop && fieldBottom >= safeTop) return null
  if (fieldTop < safeTop) return Math.max(0, scrollTop + fieldTop - safeTop)
  return null
}
