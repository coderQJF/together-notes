export type InkPoint = { x: number; y: number }

function inkStyle(context: any) {
  context.setStrokeStyle('#29251f')
  context.setFillStyle('#29251f')
  context.setLineWidth(2.6)
  context.setLineCap('round')
  context.setLineJoin('round')
}

// CanvasContext.draw submits and resets the command/path state. Every batch
// therefore needs its own style, beginPath and moveTo, even within one stroke.
export function drawInkSegment(context: any, from: InkPoint, to: InkPoint) {
  inkStyle(context)
  context.beginPath()
  context.moveTo(from.x, from.y)
  context.lineTo(to.x, to.y)
  context.stroke()
  context.draw(true)
}

export function drawInkDot(context: any, point: InkPoint) {
  inkStyle(context)
  context.beginPath()
  context.arc(point.x, point.y, 1.3, 0, Math.PI * 2)
  context.fill()
  context.draw(true)
}
