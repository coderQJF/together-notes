import test from 'node:test'
import assert from 'node:assert/strict'
import { drawInkDot, drawInkSegment } from '../src/services/handwriting.ts'
import { keyboardDockOffset, paperScrollTarget } from '../src/services/paper-layout.ts'

test('keyboard docking accounts for overlay, resize and partially resized viewports', () => {
  assert.equal(keyboardDockOffset(300, 844, 844), 300)
  assert.equal(keyboardDockOffset(300, 844, 544), 0)
  assert.equal(keyboardDockOffset(300, 844, 644), 100)
  assert.equal(keyboardDockOffset(0, 844, 844), 0)
  assert.equal(keyboardDockOffset(300, 844, 500), 0)
  assert.equal(paperScrollTarget(100, 500, 548, 80, 450), 198)
  assert.equal(paperScrollTarget(100, 40, 88, 80, 450), 60)
  assert.equal(paperScrollTarget(100, 200, 248, 80, 450), null)
})

test('each handwriting batch resets its path to the previous touch, never the canvas origin', () => {
  let path: number[][] = []
  let width = 0
  const segments: number[][][] = []
  const context = {
    setStrokeStyle() {}, setFillStyle() {}, setLineCap() {}, setLineJoin() {},
    setLineWidth(value: number) { width = value },
    beginPath() { path = [] },
    moveTo(x: number, y: number) { path.push([x, y]) },
    lineTo(x: number, y: number) { if (!path.length) path.push([0, 0]); path.push([x, y]) },
    stroke() { assert.equal(width, 2.6); segments.push([...path]) },
    draw(reserve: boolean) { assert.equal(reserve, true); path = []; width = 1 },
    arc(x: number, y: number) { path.push([x, y]) },
    fill() { segments.push([...path]) },
  }
  drawInkSegment(context, { x: 40, y: 60 }, { x: 70, y: 80 })
  drawInkSegment(context, { x: 70, y: 80 }, { x: 90, y: 100 })
  drawInkSegment(context, { x: 160, y: 180 }, { x: 170, y: 190 })
  drawInkDot(context, { x: 210, y: 220 })
  assert.deepEqual(segments, [[[40, 60], [70, 80]], [[70, 80], [90, 100]], [[160, 180], [170, 190]], [[210, 220]]])
})
