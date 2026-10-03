<script lang="ts">
export default {
  methods: {
    receiveAppDrawing(payload: { strokes: Array<Array<{ x: number; y: number }>>; width: number; height: number } | null) {
      // #ifdef APP-PLUS
      if (!payload?.strokes?.length) {
        uni.showToast({ title: '请先写点内容', icon: 'none' })
        return
      }
      const exportWidth = 600
      const exportHeight = 900
      const sourceWidth = Math.max(1, Number(payload.width || exportWidth))
      const sourceHeight = Math.max(1, Number(payload.height || exportHeight))
      const scale = Math.min(exportWidth / sourceWidth, exportHeight / sourceHeight)
      const offsetX = (exportWidth - sourceWidth * scale) / 2
      const offsetY = (exportHeight - sourceHeight * scale) / 2
      const exportContext = uni.createCanvasContext('note-handwriting-app-export', this as any)
      exportContext.setFillStyle('#ffffff')
      exportContext.fillRect(0, 0, exportWidth, exportHeight)
      exportContext.setStrokeStyle('#28241e')
      exportContext.setLineWidth(2.4 * scale)
      exportContext.setLineCap('round')
      exportContext.setLineJoin('round')
      for (const stroke of payload.strokes) {
        if (!stroke.length) continue
        exportContext.beginPath()
        exportContext.moveTo(offsetX + stroke[0].x * scale, offsetY + stroke[0].y * scale)
        if (stroke.length === 1) exportContext.lineTo(offsetX + stroke[0].x * scale + 0.01, offsetY + stroke[0].y * scale + 0.01)
        else for (const point of stroke.slice(1)) exportContext.lineTo(offsetX + point.x * scale, offsetY + point.y * scale)
        exportContext.stroke()
      }
      exportContext.draw(false, () => uni.canvasToTempFilePath({
        canvasId: 'note-handwriting-app-export',
        fileType: 'png',
        quality: 1,
        width: exportWidth,
        height: exportHeight,
        destWidth: exportWidth,
        destHeight: exportHeight,
        success: result => this.$emit('save', result.tempFilePath),
        fail: () => uni.showToast({ title: '手写内容导出失败', icon: 'none' }),
      }, this as any))
      // #endif
    },
  },
}
</script>

<script setup lang="ts">
import { getCurrentInstance, nextTick, onMounted, ref } from 'vue'

const emit = defineEmits<{ close: []; save: [path: string] }>()
const canvasId = 'note-handwriting-pad'
const instance = getCurrentInstance()
let context: UniApp.CanvasContext | null = null
let drawing = false
let renderTimer: number | undefined
let canvasRect = { left: 0, top: 0, width: 600, height: 900 }
let strokes: Array<Array<{ x: number; y: number }>> = []
let appCommandToken = 0
const appDrawingCommand = ref({ type: 'init', token: appCommandToken })
const canvasSize = ref({ width: 600, height: 900 })

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
    renderTimer = undefined
    renderCanvas()
  }, 12)
}

function resetCanvas() {
  strokes = []
  if (renderTimer !== undefined) clearTimeout(renderTimer)
  renderTimer = undefined
  renderCanvas()
}

function point(event: any) {
  const touch = event.touches?.[0] || event.changedTouches?.[0]
  if (touch?.clientX != null && touch?.clientY != null) {
    return { x: Number(touch.clientX) - canvasRect.left, y: Number(touch.clientY) - canvasRect.top }
  }
  if (touch?.x != null && touch?.y != null) return { x: Number(touch.x), y: Number(touch.y) }
  const x = touch?.clientX ?? touch?.pageX ?? event.offsetX ?? event.clientX ?? event.pageX ?? 0
  const y = touch?.clientY ?? touch?.pageY ?? event.offsetY ?? event.clientY ?? event.pageY ?? 0
  if (event.offsetX != null && event.offsetY != null && !touch) return { x: Number(x), y: Number(y) }
  return { x: Number(x) - canvasRect.left, y: Number(y) - canvasRect.top }
}

function start(event: any) {
  drawing = true
  strokes.push([point(event)])
  queueRender()
}

function move(event: any) {
  if (!drawing) return
  strokes[strokes.length - 1]?.push(point(event))
  queueRender()
}

function end(event?: any) {
  if (drawing && event?.changedTouches?.length) strokes[strokes.length - 1]?.push(point(event))
  drawing = false
  queueRender()
}

function issueAppCommand(type: 'clear' | 'save') {
  appDrawingCommand.value = { type, token: ++appCommandToken }
}

function clearCanvas() {
  let handledInApp = false
  // #ifdef APP-PLUS
  issueAppCommand('clear')
  handledInApp = true
  // #endif
  if (handledInApp) return
  resetCanvas()
}

function save() {
  let handledInApp = false
  // #ifdef APP-PLUS
  issueAppCommand('save')
  handledInApp = true
  // #endif
  if (handledInApp) return
  if (!strokes.length) {
    uni.showToast({ title: '请先写点内容', icon: 'none' })
    return
  }
  if (renderTimer !== undefined) clearTimeout(renderTimer)
  renderTimer = undefined
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
    canvasSize.value = { width: Math.round(canvasRect.width), height: Math.round(canvasRect.height) }
    nextTick(() => renderCanvas())
  }).exec()
}

onMounted(() => {
  // #ifndef APP-PLUS
  nextTick(() => setTimeout(prepareCanvas, 30))
  // #endif
})
</script>

<template>
  <view class="pad-layer" @touchmove.stop>
    <view class="pad-panel" @touchmove.stop>
      <view class="pad-header"><button @click="emit('close')">取消</button><text>手写</text><button class="save" @click="save">插入</button></view>
      <!-- #ifdef APP-PLUS -->
      <view
        class="pad-canvas app-pad-canvas"
        :drawing-command="appDrawingCommand"
        :change:drawing-command="handwritingRenderer.onCommandChanged"
        @touchstart="handwritingRenderer.onTouchStart"
        @touchmove="handwritingRenderer.onTouchMove"
        @touchend="handwritingRenderer.onTouchEnd"
        @touchcancel="handwritingRenderer.onTouchEnd"
      />
      <canvas canvas-id="note-handwriting-app-export" id="note-handwriting-app-export" class="app-export-canvas" width="600" height="900" />
      <!-- #endif -->
      <!-- #ifndef APP-PLUS -->
      <canvas canvas-id="note-handwriting-pad" id="note-handwriting-pad" class="pad-canvas" :width="canvasSize.width" :height="canvasSize.height" disable-scroll @touchstart.stop.prevent="start" @touchmove.stop.prevent="move" @touchend.stop.prevent="end" @touchcancel.stop.prevent="end" @mousedown.stop.prevent="start" @mousemove.stop.prevent="move" @mouseup.stop.prevent="end" @mouseleave.stop="end" />
      <!-- #endif -->
      <button class="clear" @click="clearCanvas">清空画布</button>
    </view>
  </view>
</template>

<script module="handwritingRenderer" lang="renderjs">
export default {
  data() {
    return {
      canvas: null,
      context: null,
      host: null,
      drawing: false,
      moved: false,
      hasDrawing: false,
      strokes: [],
      currentStroke: null,
      lastPoint: null,
      cssWidth: 0,
      cssHeight: 0,
    }
  },
  methods: {
    resolveHost(candidate) {
      if (candidate && candidate.classList && candidate.classList.contains('app-pad-canvas')) return candidate
      return this.$el && this.$el.querySelector ? this.$el.querySelector('.app-pad-canvas') : null
    },
    ensureCanvas(candidate) {
      const host = this.resolveHost(candidate)
      if (!host) return false
      const rect = host.getBoundingClientRect()
      const width = Math.max(1, Math.round(rect.width))
      const height = Math.max(1, Math.round(rect.height))
      if (!this.canvas) {
        this.canvas = document.createElement('canvas')
        this.canvas.style.display = 'block'
        this.canvas.style.width = '100%'
        this.canvas.style.height = '100%'
        this.canvas.style.borderRadius = 'inherit'
        this.canvas.style.touchAction = 'none'
        host.appendChild(this.canvas)
        this.host = host
      }
      if (this.cssWidth !== width || this.cssHeight !== height || !this.context) {
        const ratio = window.devicePixelRatio || 1
        this.cssWidth = width
        this.cssHeight = height
        this.canvas.width = Math.max(1, Math.round(width * ratio))
        this.canvas.height = Math.max(1, Math.round(height * ratio))
        this.context = this.canvas.getContext('2d')
        this.context.setTransform(ratio, 0, 0, ratio, 0, 0)
        this.paintBackground()
      }
      return true
    },
    paintBackground() {
      if (!this.context) return
      this.context.fillStyle = '#ffffff'
      this.context.fillRect(0, 0, this.cssWidth, this.cssHeight)
      this.context.strokeStyle = '#28241e'
      this.context.lineWidth = 2.4
      this.context.lineCap = 'round'
      this.context.lineJoin = 'round'
    },
    eventPoint(event) {
      const touch = (event.touches && event.touches[0]) || (event.changedTouches && event.changedTouches[0])
      const rect = this.host.getBoundingClientRect()
      return {
        x: Number(touch ? touch.clientX : event.clientX) - rect.left,
        y: Number(touch ? touch.clientY : event.clientY) - rect.top,
      }
    },
    blockPageGesture(event) {
      if (event.cancelable) event.preventDefault()
      if (event.stopPropagation) event.stopPropagation()
    },
    onTouchStart(event) {
      this.blockPageGesture(event)
      if (!this.ensureCanvas(event.currentTarget)) return
      const point = this.eventPoint(event)
      this.drawing = true
      this.moved = false
      this.lastPoint = point
      this.currentStroke = [point]
      this.strokes.push(this.currentStroke)
      this.context.beginPath()
      this.context.moveTo(point.x, point.y)
    },
    onTouchMove(event) {
      this.blockPageGesture(event)
      if (!this.drawing || !this.context) return
      const point = this.eventPoint(event)
      this.context.lineTo(point.x, point.y)
      this.context.stroke()
      this.context.beginPath()
      this.context.moveTo(point.x, point.y)
      this.lastPoint = point
      this.currentStroke.push(point)
      this.moved = true
      this.hasDrawing = true
    },
    onTouchEnd(event) {
      this.blockPageGesture(event)
      if (!this.drawing || !this.context) return
      if (!this.moved && this.lastPoint) {
        this.context.lineTo(this.lastPoint.x + 0.01, this.lastPoint.y + 0.01)
        this.context.stroke()
        this.hasDrawing = true
      }
      this.context.closePath()
      this.drawing = false
      this.lastPoint = null
      this.currentStroke = null
    },
    clearCanvas() {
      if (!this.context) return
      this.context.clearRect(0, 0, this.cssWidth, this.cssHeight)
      this.paintBackground()
      this.hasDrawing = false
      this.strokes = []
      this.currentStroke = null
      this.drawing = false
      this.lastPoint = null
    },
    onCommandChanged(command) {
      if (!command || !this.ensureCanvas()) return
      if (command.type === 'clear') this.clearCanvas()
      if (command.type === 'save') {
        const payload = this.hasDrawing ? { strokes: this.strokes, width: this.cssWidth, height: this.cssHeight } : null
        this.$ownerInstance.callMethod('receiveAppDrawing', payload)
      }
    },
  },
}
</script>

<style scoped>
.pad-layer{position:fixed;z-index:110;inset:0;display:flex;align-items:flex-end;justify-content:center;padding-top:calc(12px + env(safe-area-inset-top));background:rgba(34,30,24,.42);box-sizing:border-box}.pad-panel{display:flex;width:min(100%,640px);height:92%;flex-direction:column;padding:0 20px calc(14px + env(safe-area-inset-bottom));border-radius:24px 24px 0 0;background:#faf8f2;box-sizing:border-box}.pad-header{display:grid;grid-template-columns:70px 1fr 70px;align-items:center;height:62px}.pad-header>text{font-size:17px;font-weight:650;text-align:center}.pad-header button{display:flex;height:44px;min-height:44px;align-items:center;justify-content:center;margin:0;padding:0;border:0;background:transparent;color:#786d5b;font-size:13px}.pad-header button::after{border:0}.pad-header .save{color:#83692e;font-weight:650}.pad-canvas{width:100%;min-height:0;flex:1;overflow:hidden;border:1px solid #e5dfd3;border-radius:17px;background:#fff;touch-action:none}.app-export-canvas{position:fixed;left:-10000px;top:0;width:600px;height:900px;pointer-events:none}.clear{display:flex;height:46px;min-height:46px;align-items:center;justify-content:center;margin:12px 0 0;border:1px solid #e5dfd3;border-radius:14px;background:#fff;color:#786d5b;font-size:13px}.clear::after{border:0}
</style>
