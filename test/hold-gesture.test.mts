import test from 'node:test'
import assert from 'node:assert/strict'
import { createHoldGesture, registerPendingHold, cancelPendingHolds } from '../src/services/hold-gesture.ts'

function fixture() {
  let now = 0, nextId = 0, holds = 0, pressed = false
  const tasks = new Map<number, { at: number; callback: () => void }>()
  const gesture = createHoldGesture({
    onHold() { holds += 1 },
    onPressChange(value) { pressed = value },
    schedule(callback, delay) { const id = ++nextId; tasks.set(id, { at: now + delay, callback }); return id as unknown as ReturnType<typeof setTimeout> },
    unschedule(handle) { tasks.delete(handle as unknown as number) },
  })
  return {
    gesture,
    get holds() { return holds }, get pressed() { return pressed },
    advance(ms: number) {
      now += ms
      for (const [id, task] of tasks) if (task.at <= now) { tasks.delete(id); task.callback() }
    },
  }
}

test('400ms is a normal tap; a stationary 650ms hold springs into selection once', () => {
  const tap = fixture()
  tap.gesture.start({ x: 50, y: 200 })
  tap.advance(400)
  assert.equal(tap.holds, 0)
  assert.equal(tap.pressed, true)
  tap.gesture.end()
  tap.advance(400)
  assert.equal(tap.holds, 0)
  assert.equal(tap.gesture.consumeClick(), false)
  const hold = fixture()
  hold.gesture.start({ x: 50, y: 200 })
  hold.advance(650)
  assert.equal(hold.holds, 1)
  assert.equal(hold.pressed, false)
  hold.advance(1000)
  hold.gesture.end()
  assert.equal(hold.holds, 1)
  assert.equal(hold.gesture.consumeClick(), true)
  assert.equal(hold.gesture.consumeClick(), false)
  hold.gesture.start({ x: 50, y: 200 })
  hold.advance(700)
  hold.gesture.end()
  // Some platforms do not emit a synthetic click after a long hold. A fresh tap
  // in selection mode must work even when there was no click to consume.
  hold.gesture.prepareTap()
  assert.equal(hold.gesture.consumeClick(), false)
})

test('a slow swipe stays rejected when movement pauses or returns to the origin', () => {
  const f = fixture()
  f.gesture.start({ x: 40, y: 300 })
  f.advance(100)
  f.gesture.move({ x: 40, y: 289 })
  assert.equal(f.pressed, false)
  f.advance(900)
  f.gesture.move({ x: 40, y: 300 })
  f.advance(900)
  assert.equal(f.holds, 0)
  f.gesture.end()
  assert.equal(f.gesture.consumeClick(), true)
  f.gesture.start({ x: 40, y: 300 })
  f.advance(700)
  assert.equal(f.holds, 1)
})

test('multitouch, duplicate start, scroll and touch interruption cannot complete a pending hold', () => {
  for (const interrupt of ['multitouch', 'duplicate', 'scroll', 'cancel'] as const) {
    const f = fixture()
    f.gesture.start({ x: 40, y: 300 })
    f.advance(300)
    if (interrupt === 'multitouch') f.gesture.move({ x: 40, y: 300 }, 2)
    else if (interrupt === 'duplicate') f.gesture.start({ x: 41, y: 300 })
    else f.gesture.cancel()
    f.advance(1000)
    assert.equal(f.holds, 0, interrupt)
    assert.equal(f.pressed, false, interrupt)
    f.gesture.end()
  }
  const f = fixture()
  f.gesture.start({ x: 40, y: 300 }, 2)
  f.advance(1000)
  assert.equal(f.holds, 0)
})

test('system interruptions release transient feedback and allow the next fresh hold', () => {
  const f = fixture()
  const unregister = registerPendingHold(() => { f.gesture.cancel(); f.gesture.end() })
  f.gesture.start({ x: 40, y: 300 })
  f.advance(300)
  cancelPendingHolds()
  f.advance(1000)
  assert.equal(f.pressed, false)
  assert.equal(f.holds, 0)
  f.gesture.start({ x: 40, y: 300 })
  f.advance(700)
  assert.equal(f.holds, 1)
  unregister()
})
