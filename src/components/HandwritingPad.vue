<script lang="ts">
import { defineComponent } from 'vue'

type DrawingPoint = {
  x: number
  y: number
}

type DrawingStroke = {
  points: DrawingPoint[]
}

const CANVAS_ID = 'note-handwriting-pad'
const APP_EXPORT_CANVAS_ID = 'note-handwriting-app-export'

export default defineComponent({
  name: 'HandwritingPad',
  emits: ['close', 'save'],
  data() {
    return {
      canvasContext: null as any,
      currentStroke: [] as DrawingPoint[],
      strokes: [] as DrawingStroke[],
      hasInk: false,
      saving: false,
      appRendererReady: false,
      appFallbackReady: false,
      appInputMode: 'pending' as 'pending' | 'renderjs' | 'fallback',
      appRendererTimer: null as any,
      appFallbackTimer: null as any,
      appDrawingCommand: {
        action: 'init',
        nonce: 0,
      },
    }
  },
  mounted() {
    this.$nextTick(() => {
      // #ifdef APP-PLUS
      this.sendAppCommand('init')
      this.appRendererTimer = setTimeout(() => {
        this.appRendererTimer = null
        if (this.appInputMode === 'pending') {
          this.activateAppFallback()
          this.ensureAppFallbackContext()
        }
      }, 500)
      // #endif

      // #ifndef APP-PLUS
      this.canvasContext = uni.createCanvasContext(CANVAS_ID, this)
      this.configureContext(this.canvasContext)
      // #endif
    })
  },
  beforeUnmount() {
    if (this.appRendererTimer) {
      clearTimeout(this.appRendererTimer)
      this.appRendererTimer = null
    }
    if (this.appFallbackTimer) {
      clearTimeout(this.appFallbackTimer)
      this.appFallbackTimer = null
    }
  },
  methods: {
    configureContext(context: any) {
      if (!context) return
      context.setStrokeStyle('#29251f')
      context.setFillStyle('#29251f')
      context.setLineWidth(2.6)
      context.setLineCap('round')
      context.setLineJoin('round')
    },
    pointFromEvent(event: any): DrawingPoint | null {
      const touch = event?.touches?.[0] || event?.changedTouches?.[0]
      if (!touch) return null
      const x = Number(touch.x ?? touch.offsetX ?? touch.clientX)
      const y = Number(touch.y ?? touch.offsetY ?? touch.clientY)
      if (!Number.isFinite(x) || !Number.isFinite(y)) return null
      return { x, y }
    },
    start(event: any) {
      const point = this.pointFromEvent(event)
      if (!point || !this.canvasContext) return
      this.currentStroke = [point]
      this.canvasContext.beginPath()
      this.canvasContext.moveTo(point.x, point.y)
    },
    move(event: any) {
      const point = this.pointFromEvent(event)
      if (!point || !this.canvasContext || !this.currentStroke.length) return
      this.currentStroke.push(point)
      this.canvasContext.lineTo(point.x, point.y)
      this.canvasContext.stroke()
      this.canvasContext.draw(true)
      this.hasInk = true
    },
    end(event: any) {
      if (!this.currentStroke.length) return
      const point = this.pointFromEvent(event)
      if (point) this.currentStroke.push(point)
      if (this.currentStroke.length === 1 && this.canvasContext) {
        const onlyPoint = this.currentStroke[0]
        this.canvasContext.beginPath()
        this.canvasContext.arc(onlyPoint.x, onlyPoint.y, 1.3, 0, Math.PI * 2)
        this.canvasContext.fill()
        this.canvasContext.draw(true)
      }
      this.strokes.push({ points: [...this.currentStroke] })
      this.currentStroke = []
      this.hasInk = true
    },
    sendAppCommand(action: 'init' | 'clear' | 'save' | 'fallback') {
      this.appDrawingCommand = {
        action,
        nonce: Date.now() + Math.random(),
      }
    },
    markAppDrawingReady() {
      if (this.appInputMode !== 'pending') return
      if (this.appRendererTimer) {
        clearTimeout(this.appRendererTimer)
        this.appRendererTimer = null
      }
      this.appInputMode = 'renderjs'
      this.appRendererReady = true
    },
    markAppFallbackReady() {
      if (this.appInputMode === 'fallback') this.appFallbackReady = true
    },
    ensureAppFallbackContext() {
      if (!this.canvasContext) {
        this.canvasContext = uni.createCanvasContext('note-handwriting-app-pad', this)
        this.configureContext(this.canvasContext)
      }
    },
    activateAppFallback() {
      if (this.appInputMode === 'renderjs') return false
      if (this.appInputMode === 'pending') {
        if (this.appRendererTimer) {
          clearTimeout(this.appRendererTimer)
          this.appRendererTimer = null
        }
        this.appInputMode = 'fallback'
        this.appRendererReady = false
        this.appFallbackReady = false
        this.sendAppCommand('fallback')
        this.appFallbackTimer = setTimeout(() => {
          this.appFallbackTimer = null
          if (this.appInputMode === 'fallback') this.appFallbackReady = true
        }, 200)
      }
      return true
    },
    appFallbackStart(event: any) {
      if (!this.activateAppFallback()) return
      this.ensureAppFallbackContext()
      this.start(event)
    },
    appFallbackMove(event: any) {
      if (this.appInputMode !== 'fallback') return
      this.move(event)
    },
    appFallbackEnd(event: any) {
      if (this.appInputMode !== 'fallback') return
      this.end(event)
    },
    clear() {
      // #ifdef APP-PLUS
      if (this.appInputMode === 'renderjs') {
        this.sendAppCommand('clear')
      } else if (this.canvasContext) {
        this.canvasContext.clearRect(0, 0, 4096, 4096)
        this.canvasContext.draw()
        this.currentStroke = []
        this.strokes = []
        this.hasInk = false
      }
      // #endif

      // #ifndef APP-PLUS
      if (this.canvasContext) {
        this.canvasContext.clearRect(0, 0, 4096, 4096)
        this.canvasContext.draw()
      }
      this.currentStroke = []
      this.strokes = []
      this.hasInk = false
      // #endif
    },
    save() {
      if (this.saving) return

      // #ifdef APP-PLUS
      if (this.appInputMode === 'renderjs') {
        this.saving = true
        this.sendAppCommand('save')
      } else if (this.hasInk) {
        this.exportCanvas('note-handwriting-app-pad')
      } else {
        uni.showToast({ title: '请先写点内容', icon: 'none' })
      }
      // #endif

      // #ifndef APP-PLUS
      if (!this.hasInk) {
        uni.showToast({ title: '请先写点内容', icon: 'none' })
        return
      }
      this.exportCanvas(CANVAS_ID)
      // #endif
    },
    cancel() {
      this.$emit('close')
    },
    exportCanvas(canvasId: string) {
      this.saving = true
      uni.canvasToTempFilePath({
        canvasId,
        fileType: 'png',
        quality: 1,
        success: (result) => {
          this.saving = false
          this.$emit('save', result.tempFilePath)
          this.$emit('close')
        },
        fail: () => {
          this.saving = false
          uni.showToast({ title: '手写内容保存失败，请重试', icon: 'none' })
        },
      }, this)
    },
    receiveAppDrawing(payload: { strokes?: DrawingStroke[]; width?: number; height?: number } | null) {
      const receivedStrokes = Array.isArray(payload?.strokes)
        ? payload!.strokes!.filter((stroke) => Array.isArray(stroke?.points) && stroke.points.length)
        : []

      if (!receivedStrokes.length) {
        this.saving = false
        uni.showToast({ title: '请先写点内容', icon: 'none' })
        return
      }

      const exportWidth = 720
      const sourceWidth = Number(payload?.width) || exportWidth
      const sourceHeight = Number(payload?.height) || 560
      const exportHeight = Math.max(360, Math.min(1800, Math.round(exportWidth * sourceHeight / sourceWidth)))
      const context = uni.createCanvasContext(APP_EXPORT_CANVAS_ID, this)
      context.setFillStyle('#ffffff')
      context.fillRect(0, 0, exportWidth, exportHeight)
      context.setStrokeStyle('#29251f')
      context.setFillStyle('#29251f')
      context.setLineWidth(4)
      context.setLineCap('round')
      context.setLineJoin('round')

      receivedStrokes.forEach((stroke) => {
        const points = stroke.points
        if (points.length === 1) {
          const point = points[0]
          context.beginPath()
          context.arc(point.x * exportWidth, point.y * exportHeight, 2, 0, Math.PI * 2)
          context.fill()
          return
        }

        context.beginPath()
        context.moveTo(points[0].x * exportWidth, points[0].y * exportHeight)
        points.slice(1).forEach((point) => {
          context.lineTo(point.x * exportWidth, point.y * exportHeight)
        })
        context.stroke()
      })

      context.draw(false, () => {
        uni.canvasToTempFilePath({
          canvasId: APP_EXPORT_CANVAS_ID,
          width: exportWidth,
          height: exportHeight,
          destWidth: exportWidth,
          destHeight: exportHeight,
          fileType: 'png',
          quality: 1,
          success: (result) => {
            this.saving = false
            this.$emit('save', result.tempFilePath)
            this.$emit('close')
          },
          fail: () => {
            this.saving = false
            uni.showToast({ title: '手写内容保存失败，请重试', icon: 'none' })
          },
        }, this)
      })
    },
  },
})
</script>

<template>
  <view class="handwriting-backdrop" @tap.self="cancel">
    <view class="handwriting-sheet">
      <view class="handwriting-header">
        <view class="header-copy">
          <text class="handwriting-title">手写</text>
          <text class="handwriting-hint">用手指或触控笔书写</text>
        </view>
        <button class="text-action" @tap="cancel">取消</button>
      </view>

      <view class="canvas-shell">
        <!-- #ifdef APP-PLUS -->
        <canvas
          id="note-handwriting-app-pad"
          canvas-id="note-handwriting-app-pad"
          class="pad-canvas app-pad-canvas"
          :disable-scroll="true"
          :drawing-command="appDrawingCommand"
          :change:drawing-command="handwritingRenderer.onCommandChanged"
          @touchstart.stop.prevent="appFallbackStart"
          @touchmove.stop.prevent="appFallbackMove"
          @touchend.stop.prevent="appFallbackEnd"
          @touchcancel.stop.prevent="appFallbackEnd"
        />
        <view
          v-if="appInputMode === 'pending' || (appInputMode === 'fallback' && !appFallbackReady)"
          class="canvas-preparing"
        >
          <text>正在准备手写…</text>
        </view>
        <!-- #endif -->

        <!-- #ifndef APP-PLUS -->
        <canvas
          id="note-handwriting-pad"
          canvas-id="note-handwriting-pad"
          class="pad-canvas"
          :disable-scroll="true"
          @touchstart.stop.prevent="start"
          @touchmove.stop.prevent="move"
          @touchend.stop.prevent="end"
          @touchcancel.stop.prevent="end"
        />
        <!-- #endif -->
      </view>

      <!-- #ifdef APP-PLUS -->
      <canvas
        id="note-handwriting-app-export"
        canvas-id="note-handwriting-app-export"
        class="app-export-canvas"
        :hidpi="false"
      />
      <!-- #endif -->

      <view class="handwriting-actions">
        <button class="secondary-action" @tap="clear">清空</button>
        <button class="primary-action" :loading="saving" @tap="save">完成</button>
      </view>
    </view>
  </view>
</template>

<script module="handwritingRenderer" lang="renderjs">
export default {
  mounted() {
    this.$nextTick(() => this.scheduleMount(0))
  },
  methods: {
    resolveCanvas() {
      const root = this.$el
      const rootIsPad = root && root.matches && root.matches('.app-pad-canvas')
      const host = rootIsPad
        ? root
        : root && root.querySelector
          ? root.querySelector('.app-pad-canvas')
          : document.getElementById('note-handwriting-app-pad')

      if (!host) return null
      if (String(host.tagName || '').toLowerCase() === 'canvas') {
        return { host, canvas: host }
      }

      const canvas = host.querySelector && host.querySelector('canvas')
      return canvas ? { host, canvas } : null
    },
    scheduleMount(attempt) {
      if (this.disabled) return
      const resolved = this.resolveCanvas()
      if (!resolved) {
        if (attempt < 40) {
          setTimeout(() => this.scheduleMount(attempt + 1), 50)
        }
        return
      }
      this.mountCanvas(resolved.host, resolved.canvas)
    },
    mountCanvas(host, canvas) {
      if (this.canvas === canvas && this.touchTarget) {
        this.retryResize(0)
        return
      }

      this.unbindCanvas()
      this.host = host
      this.canvas = canvas
      this.context = this.canvas.getContext('2d')
      this.strokes = this.strokes || []
      this.activeStroke = null
      this.retryResize(0)

      host.style.touchAction = 'none'
      canvas.style.touchAction = 'none'
      canvas.style.width = '100%'
      canvas.style.height = '100%'

      this.touchTarget = host
      this.boundTouchStart = (event) => this.onTouchStart(event)
      this.boundTouchMove = (event) => this.onTouchMove(event)
      this.boundTouchEnd = (event) => this.onTouchEnd(event)
      host.addEventListener('touchstart', this.boundTouchStart, { passive: false, capture: true })
      host.addEventListener('touchmove', this.boundTouchMove, { passive: false, capture: true })
      host.addEventListener('touchend', this.boundTouchEnd, { passive: false, capture: true })
      host.addEventListener('touchcancel', this.boundTouchEnd, { passive: false, capture: true })

      if (typeof ResizeObserver !== 'undefined') {
        this.resizeObserver = new ResizeObserver(() => this.resizeCanvas())
        this.resizeObserver.observe(host)
      } else {
        this.boundResize = () => this.resizeCanvas()
        window.addEventListener('resize', this.boundResize)
      }

    },
    unbindCanvas() {
      if (this.touchTarget) {
        this.touchTarget.removeEventListener('touchstart', this.boundTouchStart, true)
        this.touchTarget.removeEventListener('touchmove', this.boundTouchMove, true)
        this.touchTarget.removeEventListener('touchend', this.boundTouchEnd, true)
        this.touchTarget.removeEventListener('touchcancel', this.boundTouchEnd, true)
      }
      if (this.resizeObserver) this.resizeObserver.disconnect()
      if (this.boundResize) window.removeEventListener('resize', this.boundResize)
      this.touchTarget = null
      this.resizeObserver = null
      this.boundResize = null
    },
    retryResize(attempt) {
      if (this.disabled) return
      this.resizeCanvas()
      if ((!this.cssWidth || !this.cssHeight) && attempt < 40) {
        setTimeout(() => this.retryResize(attempt + 1), 50)
      }
    },
    resizeCanvas() {
      if (this.disabled) return
      if (!this.host || !this.canvas || !this.context) return
      const rect = this.host.getBoundingClientRect()
      if (!rect.width || !rect.height) return
      const ratio = Math.max(1, window.devicePixelRatio || 1)
      const nextWidth = Math.round(rect.width * ratio)
      const nextHeight = Math.round(rect.height * ratio)
      if (this.canvas.width !== nextWidth || this.canvas.height !== nextHeight) {
        this.canvas.width = nextWidth
        this.canvas.height = nextHeight
      }
      this.cssWidth = rect.width
      this.cssHeight = rect.height
      this.context.setTransform(ratio, 0, 0, ratio, 0, 0)
      this.context.strokeStyle = '#29251f'
      this.context.fillStyle = '#29251f'
      this.context.lineWidth = 2.6
      this.context.lineCap = 'round'
      this.context.lineJoin = 'round'
      this.redraw()
      if (!this.rendererReadySent && this.$ownerInstance && this.$ownerInstance.callMethod) {
        this.rendererReadySent = true
        this.$ownerInstance.callMethod('markAppDrawingReady')
      }
    },
    normalizedPoint(event) {
      if (!this.host || !this.cssWidth || !this.cssHeight) return null
      const touch = event.touches && event.touches[0]
        ? event.touches[0]
        : event.changedTouches && event.changedTouches[0]
      if (!touch) return null
      const rect = this.host.getBoundingClientRect()
      const x = Math.max(0, Math.min(this.cssWidth, touch.clientX - rect.left))
      const y = Math.max(0, Math.min(this.cssHeight, touch.clientY - rect.top))
      return { x: x / this.cssWidth, y: y / this.cssHeight }
    },
    drawSegment(from, to) {
      if (!this.context) return
      this.context.beginPath()
      this.context.moveTo(from.x * this.cssWidth, from.y * this.cssHeight)
      this.context.lineTo(to.x * this.cssWidth, to.y * this.cssHeight)
      this.context.stroke()
    },
    drawDot(point) {
      if (!this.context) return
      this.context.beginPath()
      this.context.arc(point.x * this.cssWidth, point.y * this.cssHeight, 1.3, 0, Math.PI * 2)
      this.context.fill()
    },
    onTouchStart(event) {
      if (this.disabled) return
      event.preventDefault()
      event.stopPropagation()
      const point = this.normalizedPoint(event)
      if (!point) return
      this.activeStroke = { points: [point] }
    },
    onTouchMove(event) {
      if (this.disabled) return
      event.preventDefault()
      event.stopPropagation()
      if (!this.activeStroke) return
      const point = this.normalizedPoint(event)
      if (!point) return
      const points = this.activeStroke.points
      const previous = points[points.length - 1]
      points.push(point)
      this.drawSegment(previous, point)
    },
    onTouchEnd(event) {
      if (this.disabled) return
      event.preventDefault()
      event.stopPropagation()
      if (!this.activeStroke) return
      if (this.activeStroke.points.length === 1) {
        this.drawDot(this.activeStroke.points[0])
      }
      this.strokes.push(this.activeStroke)
      this.activeStroke = null
    },
    redraw() {
      if (!this.context || !this.canvas) return
      this.context.clearRect(0, 0, this.cssWidth || 0, this.cssHeight || 0)
      ;(this.strokes || []).forEach((stroke) => {
        const points = stroke.points || []
        if (points.length === 1) {
          this.drawDot(points[0])
          return
        }
        for (let index = 1; index < points.length; index += 1) {
          this.drawSegment(points[index - 1], points[index])
        }
      })
    },
    clearCanvas() {
      this.strokes = []
      this.activeStroke = null
      if (this.context) {
        this.context.clearRect(0, 0, this.cssWidth || 0, this.cssHeight || 0)
      }
    },
    sendDrawing(ownerInstance) {
      const owner = ownerInstance || this.$ownerInstance
      if (!owner || !owner.callMethod) return
      const payload = {
        width: this.cssWidth || 0,
        height: this.cssHeight || 0,
        strokes: (this.strokes || []).map((stroke) => ({
          points: (stroke.points || []).map((point) => ({ x: point.x, y: point.y })),
        })),
      }
      if (ownerInstance) {
        owner.callMethod('receiveAppDrawing', payload)
      } else {
        this.$ownerInstance.callMethod('receiveAppDrawing', payload)
      }
    },
    onCommandChanged(command, _oldCommand, ownerInstance) {
      this.scheduleMount(0)
      if (!command || !command.action) return
      if (command.action === 'init') {
        this.disabled = false
      } else if (command.action === 'fallback') {
        this.disabled = true
        this.activeStroke = null
        this.strokes = []
        if (this.resizeObserver) {
          this.resizeObserver.disconnect()
          this.resizeObserver = null
        }
        if (this.boundResize) {
          window.removeEventListener('resize', this.boundResize)
          this.boundResize = null
        }
        if (this.$ownerInstance && this.$ownerInstance.callMethod) {
          this.$ownerInstance.callMethod('markAppFallbackReady')
        }
      } else if (command.action === 'clear') {
        this.clearCanvas()
      } else if (command.action === 'save') {
        this.sendDrawing(ownerInstance)
      }
    },
  },
}
</script>

<style scoped>
.handwriting-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1600;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding: 18px;
  padding-bottom: calc(18px + env(safe-area-inset-bottom));
  background: rgba(25, 22, 17, 0.42);
  box-sizing: border-box;
}

.handwriting-sheet {
  width: 100%;
  max-width: 680px;
  padding: 20px;
  border-radius: 24px;
  background: #faf8f2;
  box-sizing: border-box;
  box-shadow: 0 18px 54px rgba(41, 36, 28, 0.2);
}

.handwriting-header,
.handwriting-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.header-copy {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.handwriting-title {
  color: #29251f;
  font-size: 21px;
  font-weight: 700;
}

.handwriting-hint {
  color: #857d70;
  font-size: 13px;
}

.text-action,
.secondary-action,
.primary-action {
  min-width: 72px;
  min-height: 44px;
  margin: 0;
  padding: 0 18px;
  border: 0;
  border-radius: 14px;
  font-size: 15px;
  line-height: 44px;
}

.text-action::after,
.secondary-action::after,
.primary-action::after {
  border: 0;
}

.text-action {
  color: #6d6558;
  background: transparent;
}

.canvas-shell {
  position: relative;
  width: 100%;
  height: min(54vh, 520px);
  min-height: 340px;
  margin: 18px 0;
  overflow: hidden;
  border: 1px solid rgba(73, 64, 50, 0.16);
  border-radius: 18px;
  background: #ffffff;
  touch-action: none;
}

.pad-canvas {
  display: block;
  width: 100%;
  height: 100%;
  background: #ffffff;
  touch-action: none;
}

.canvas-preparing {
  position: absolute;
  inset: 0;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #857d70;
  font-size: 14px;
  background: rgba(255, 255, 255, 0.88);
}

.app-export-canvas {
  position: fixed;
  left: -10000px;
  top: -10000px;
  width: 720px;
  height: 1800px;
  pointer-events: none;
}

.handwriting-actions {
  justify-content: flex-end;
}

.secondary-action {
  color: #494032;
  background: #f1ede4;
}

.primary-action {
  min-width: 112px;
  color: #494032;
  background: #f7e7ad;
  font-weight: 650;
}

@media (max-width: 430px) {
  .handwriting-backdrop {
    padding: 0;
    align-items: stretch;
  }

  .handwriting-sheet {
    display: flex;
    flex-direction: column;
    min-height: 100vh;
    padding: calc(16px + env(safe-area-inset-top)) 16px calc(16px + env(safe-area-inset-bottom));
    border-radius: 0;
  }

  .canvas-shell {
    flex: 1;
    height: auto;
    min-height: 360px;
  }
}
</style>
