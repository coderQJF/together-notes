// A resized WebView already removes part (or all) of the keyboard from its viewport.
export function keyboardDockOffset(keyboard: number, baseline: number, viewport: number) {
  return Math.max(0, keyboard - Math.max(0, baseline - viewport))
}

export function paperScrollTarget(scrollTop: number, fieldTop: number, fieldBottom: number, safeTop: number, safeBottom: number) {
  if (fieldBottom > safeBottom) return Math.max(0, scrollTop + fieldBottom - safeBottom)
  if (fieldTop < safeTop) return Math.max(0, scrollTop + fieldTop - safeTop)
  return null
}
