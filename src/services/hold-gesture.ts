export type HoldPoint = { x: number; y: number }
type Handle = ReturnType<typeof setTimeout>
type HoldOptions = {
  onHold: () => void
  onPressChange?: (pressed: boolean) => void
  holdMs?: number
  moveTolerance?: number
  schedule?: (callback: () => void, delay: number) => Handle
  unschedule?: (handle: Handle) => void
}

// A moved/cancelled touch never becomes another hold until a fresh touch starts.
// Keep this independent of platform longpress events, whose timing varies.
export function createHoldGesture(options: HoldOptions) {
  const schedule = options.schedule || setTimeout
  const unschedule = options.unschedule || clearTimeout
  let timer: Handle | undefined
  let origin: HoldPoint | undefined
  let held = false
  let rejected = false
  let suppressClick = false
  function stopTimer() { if (timer !== undefined) unschedule(timer); timer = undefined }
  function cancel() {
    if (origin) { rejected = true; suppressClick = true }
    stopTimer()
    options.onPressChange?.(false)
  }
  return {
    start(point: HoldPoint | undefined, touchCount = 1) {
      // A second finger or duplicated start is an interruption, not a new hold.
      if (origin) { cancel(); return }
      held = false; rejected = false; suppressClick = false
      if (!point || touchCount !== 1) { rejected = true; suppressClick = true; return }
      origin = point
      options.onPressChange?.(true)
      timer = schedule(() => {
        timer = undefined
        if (!origin || rejected) return
        held = true; suppressClick = true
        options.onPressChange?.(false)
        options.onHold()
      }, options.holdMs ?? 650)
    },
    move(point: HoldPoint | undefined, touchCount = 1) {
      if (!origin || rejected) return
      if (!point || touchCount !== 1 || Math.hypot(point.x - origin.x, point.y - origin.y) > (options.moveTolerance ?? 10)) cancel()
    },
    end() {
      stopTimer(); origin = undefined
      options.onPressChange?.(false)
      return held
    },
    cancel,
    prepareTap() { suppressClick = false },
    consumeClick() {
      const suppressed = suppressClick
      suppressClick = false
      return suppressed
    },
  }
}

const pendingHolds = new Set<() => void>()
export function registerPendingHold(cancel: () => void) {
  pendingHolds.add(cancel)
  return () => pendingHolds.delete(cancel)
}
export function cancelPendingHolds() { pendingHolds.forEach(cancel => cancel()) }
