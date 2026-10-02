<script setup lang="ts">
import { getCurrentInstance, nextTick, onMounted } from 'vue'

const emit = defineEmits<{ close: []; save: [path: string] }>()
const canvasId = `note-handwriting-${Date.now()}`
const instance = getCurrentInstance()
let context: UniApp.CanvasContext | null = null
let drawing = false
let last = { x: 0, y: 0 }

function resetCanvas() {
  context = uni.createCanvasContext(canvasId, instance?.proxy as any)
  context.setFillStyle('#ffffff')
  context.fillRect(0, 0, 640, 900)
  context.draw()
}

function point(event: any) {
  const touch = event.touches?.[0] || event.changedTouches?.[0]
  return { x: Number(touch?.x ?? touch?.clientX ?? 0), y: Number(touch?.y ?? touch?.clientY ?? 0) }
}

function start(event: any) {
  drawing = true
  last = point(event)
}

function move(event: any) {
  if (!drawing || !context) return
  const next = point(event)
  context.beginPath()
  context.setStrokeStyle('#28241e')
  context.setLineWidth(2.4)
  context.setLineCap('round')
  context.setLineJoin('round')
  context.moveTo(last.x, last.y)
  context.lineTo(next.x, next.y)
  context.stroke()
  context.draw(true)
  last = next
}

function end() { drawing = false }

function save() {
  uni.canvasToTempFilePath({
    canvasId,
    fileType: 'png',
    quality: 1,
    success: result => emit('save', result.tempFilePath),
    fail: () => uni.showToast({ title: '手写内容导出失败', icon: 'none' }),
  }, instance?.proxy as any)
}

onMounted(() => nextTick(resetCanvas))
</script>

<template>
  <view class="pad-layer" @touchmove.stop.prevent>
    <view class="pad-panel" @touchmove.stop>
      <view class="pad-header"><button @click="emit('close')">取消</button><text>手写</text><button class="save" @click="save">插入</button></view>
      <canvas :canvas-id="canvasId" :id="canvasId" class="pad-canvas" disable-scroll @touchstart="start" @touchmove.stop.prevent="move" @touchend="end" @touchcancel="end" />
      <button class="clear" @click="resetCanvas">清空画布</button>
    </view>
  </view>
</template>

<style scoped>
.pad-layer{position:fixed;z-index:110;inset:0;display:flex;align-items:flex-end;justify-content:center;padding-top:calc(12px + env(safe-area-inset-top));background:rgba(34,30,24,.42);box-sizing:border-box}.pad-panel{display:flex;width:min(100%,640px);height:92%;flex-direction:column;padding:0 20px calc(14px + env(safe-area-inset-bottom));border-radius:24px 24px 0 0;background:#faf8f2;box-sizing:border-box}.pad-header{display:grid;grid-template-columns:70px 1fr 70px;align-items:center;height:62px}.pad-header>text{font-size:17px;font-weight:650;text-align:center}.pad-header button{display:flex;height:44px;min-height:44px;align-items:center;justify-content:center;margin:0;padding:0;border:0;background:transparent;color:#786d5b;font-size:13px}.pad-header button::after{border:0}.pad-header .save{color:#83692e;font-weight:650}.pad-canvas{width:100%;min-height:0;flex:1;border:1px solid #e5dfd3;border-radius:17px;background:#fff}.clear{display:flex;height:46px;min-height:46px;align-items:center;justify-content:center;margin:12px 0 0;border:1px solid #e5dfd3;border-radius:14px;background:#fff;color:#786d5b;font-size:13px}.clear::after{border:0}
</style>
