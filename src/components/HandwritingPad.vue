<script setup lang="ts">
import { getCurrentInstance, nextTick, onMounted } from 'vue'

const emit = defineEmits<{ close: []; save: [path: string] }>()
const canvasId = 'note-handwriting-pad'
const instance = getCurrentInstance()
let context: UniApp.CanvasContext | null = null
let drawing = false
let renderTimer: ReturnType<typeof setTimeout> | null = null
let canvasRect = { left: 0, top: 0, width: 600, height: 900 }
let strokes: Array<Array<{ x: number; y: number }>> = []

function renderCanvas(done?: () => void) {
  if (!context) return
  context.clearRect(0, 0, canvasRect.width, canvasRect.height)
  context.setFillStyle('#ffffff')
  context.fillRect(0, 0, canvasRect.width, canvasRect.height)
  context.setStrokeStyle('#28241e')
  context.setLineWidth(2.4)
  context.setLineCap('round')
  context.setLineJoin('round')
  for (const stroke of strokes) {
    if (!stroke.length) continue
    context.beginPath()
    context.moveTo(stroke[0].x, stroke[0].y)
    if (stroke.length === 1) context.lineTo(stroke[0].x + 0.01, stroke[0].y + 0.01)
    else for (const point of stroke.slice(1)) context.lineTo(point.x, point.y)
    context.stroke()
  }
  context.draw(false, done)
}

function queueRender() {
  if (renderTimer) return
  renderTimer = setTimeout(() => {
    renderTimer = null
    renderCanvas()
  }, 12)
}

function resetCanvas() {
  strokes = []
  if (renderTimer) clearTimeout(renderTimer)
  renderTimer = null
  renderCanvas()
}

function point(event: any) {
  const touch = event.touches?.[0] || event.changedTouches?.[0]
  if (touch?.x != null && touch?.y != null) return { x: Number(touch.x), y: Number(touch.y) }
  const x = touch?.clientX ?? touch?.pageX ?? event.offsetX ?? event.clientX ?? event.pageX ?? 0
  const y = touch?.clientY ?? touch?.pageY ?? event.offsetY ?? event.clientY ?? event.pageY ?? 0
  if (event.offsetX != null && event.offsetY != null && !touch) return { x: Number(x), y: Number(y) }
  return { x: Number(x) - canvasRect.left, y: Number(y) - canvasRect.top }
}

function start(event: any) {
  if (!context) return
  drawing = true
  strokes.push([point(event)])
  queueRender()
}

function move(event: any) {
  if (!drawing || !context) return
  strokes[strokes.length - 1]?.push(point(event))
  queueRender()
}

function end(event?: any) {
  if (drawing && event?.changedTouches?.length) strokes[strokes.length - 1]?.push(point(event))
  drawing = false
  queueRender()
}

function save() {
  if (!strokes.length) {
    uni.showToast({ title: '请先写点内容', icon: 'none' })
    return
  }
  if (renderTimer) clearTimeout(renderTimer)
  renderTimer = null
  renderCanvas(() => uni.canvasToTempFilePath({
      canvasId,
      fileType: 'png',
      quality: 1,
      success: result => emit('save', result.tempFilePath),
      fail: () => uni.showToast({ title: '手写内容导出失败', icon: 'none' }),
    }, instance?.proxy as any))
}

function prepareCanvas() {
  context = uni.createCanvasContext(canvasId, instance?.proxy as any)
  uni.createSelectorQuery().in(instance?.proxy as any).select('.pad-canvas').boundingClientRect(rect => {
    const measured = rect as UniApp.NodeInfo
    canvasRect = {
      left: Number(measured?.left || 0),
      top: Number(measured?.top || 0),
      width: Math.max(1, Number(measured?.width || 600)),
      height: Math.max(1, Number(measured?.height || 900)),
    }
    resetCanvas()
  }).exec()
}

onMounted(() => nextTick(() => setTimeout(prepareCanvas, 30)))
</script>

<template>
  <view class="pad-layer" @touchmove.stop>
    <view class="pad-panel" @touchmove.stop>
      <view class="pad-header"><button @click="emit('close')">取消</button><text>手写</text><button class="save" @click="save">插入</button></view>
      <canvas canvas-id="note-handwriting-pad" id="note-handwriting-pad" class="pad-canvas" disable-scroll @touchstart.stop.prevent="start" @touchmove.stop.prevent="move" @touchend.stop.prevent="end" @touchcancel.stop.prevent="end" @mousedown.stop.prevent="start" @mousemove.stop.prevent="move" @mouseup.stop.prevent="end" @mouseleave.stop="end" />
      <button class="clear" @click="resetCanvas">清空画布</button>
    </view>
  </view>
</template>

<style scoped>
.pad-layer{position:fixed;z-index:110;inset:0;display:flex;align-items:flex-end;justify-content:center;padding-top:calc(12px + env(safe-area-inset-top));background:rgba(34,30,24,.42);box-sizing:border-box}.pad-panel{display:flex;width:min(100%,640px);height:92%;flex-direction:column;padding:0 20px calc(14px + env(safe-area-inset-bottom));border-radius:24px 24px 0 0;background:#faf8f2;box-sizing:border-box}.pad-header{display:grid;grid-template-columns:70px 1fr 70px;align-items:center;height:62px}.pad-header>text{font-size:17px;font-weight:650;text-align:center}.pad-header button{display:flex;height:44px;min-height:44px;align-items:center;justify-content:center;margin:0;padding:0;border:0;background:transparent;color:#786d5b;font-size:13px}.pad-header button::after{border:0}.pad-header .save{color:#83692e;font-weight:650}.pad-canvas{width:100%;min-height:0;flex:1;border:1px solid #e5dfd3;border-radius:17px;background:#fff;touch-action:none}.clear{display:flex;height:46px;min-height:46px;align-items:center;justify-content:center;margin:12px 0 0;border:1px solid #e5dfd3;border-radius:14px;background:#fff;color:#786d5b;font-size:13px}.clear::after{border:0}
</style>
