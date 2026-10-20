<script setup lang="ts">
import { computed, getCurrentInstance, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { chapterStepFromSwipe, type ReaderTouchPoint } from '../services/reader-gesture'
import { paginateReaderText, readerOffsetFromLegacyScroll, readerPageAtOffset, type ReaderPageLayout } from '../services/reader-pagination'

const props = withDefaults(defineProps<{
  content: string
  position: number
  fontSize: number
  lineHeight: number
  blocked?: boolean
  legacyScrollTop?: number
}>(), { blocked: false, legacyScrollTop: 0 })
const emit = defineEmits<{
  (event: 'update:position', offset: number): void
  (event: 'page', page: { index: number; count: number; offset: number; end: number }): void
  (event: 'boundary', direction: -1 | 1): void
  (event: 'turn'): void
  (event: 'tap'): void
}>()
const instance = getCurrentInstance()
const layout = ref({ width: 0, height: 0 })
const measurementVersion = ref(0)
const turning = ref('')
const previewIndex = ref(-1)
const dragX = ref(0)
const pageIndex = ref(0)
let measureCharacter: ReaderPageLayout['measureCharacter']
let touchStart: ReaderTouchPoint | null = null
let suppressTapUntil = 0
let turnTimer: ReturnType<typeof setTimeout> | undefined
let resizeTimer: ReturnType<typeof setTimeout> | undefined
let sequence = 0
let ready = false
const pageLayout = computed(() => {
  void measurementVersion.value
  return { ...layout.value, fontSize: props.fontSize, lineHeight: props.lineHeight, letterSpacing: .4, measureCharacter }
})
const pages = computed(() => paginateReaderText(props.content, pageLayout.value))
const visiblePage = computed(() => pages.value[pageIndex.value] || pages.value[0])
const previewPage = computed(() => pages.value[previewIndex.value])
const copyStyle = computed(() => ({ fontSize: `${props.fontSize}px`, lineHeight: `${props.fontSize * props.lineHeight}px` }))
const leafStyle = computed(() => dragX.value ? { transform: `translate3d(${dragX.value}px,0,0) rotateY(${dragX.value / Math.max(1, layout.value.width) * 8}deg)` } : {})
const readyToRead = computed(() => layout.value.width > 0 && layout.value.height > 0)

function announce() {
  if (!readyToRead.value) return
  const current = visiblePage.value
  emit('page', { index: pageIndex.value, count: pages.value.length, offset: current.start, end: current.end })
}

function restorePosition() {
  if (!readyToRead.value) return
  const offset = props.position || (props.legacyScrollTop ? readerOffsetFromLegacyScroll(pages.value, props.legacyScrollTop, layout.value.height) : 0)
  pageIndex.value = readerPageAtOffset(pages.value, offset)
  announce()
}

function prepareMeasurement() {
  const widths = new Map<string, number>()
  let platformMeasure: ((character: string) => number) | undefined
  // H5 canvas uses exactly the same font family as the rendered page.
  // #ifdef H5
  const context = document.createElement('canvas').getContext('2d')
  if (context) {
    context.font = `${props.fontSize}px -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif`
    platformMeasure = character => context.measureText(character).width
  }
  // #endif
  // App's service context has no DOM; uni's canvas measures the WebView font.
  // #ifndef H5
  try {
    const context = uni.createCanvasContext('reader-measure', instance?.proxy)
    context.setFontSize(props.fontSize)
    if (context.measureText('国').width >= props.fontSize * .6) platformMeasure = character => context.measureText(character).width
  } catch { /* Conservative fallback remains usable before the native canvas starts. */ }
  // #endif
  measureCharacter = platformMeasure ? character => {
    if (!widths.has(character)) widths.set(character, platformMeasure!(character))
    return widths.get(character)!
  } : undefined
  measurementVersion.value++
}

function measureViewport() {
  nextTick(() => {
    // Measure the untransformed current body, never the preview leaf. Header,
    // footer and page margins travel with the sheet but don't hold body text.
    uni.createSelectorQuery().in(instance?.proxy).select('.reader-leaf-current .reader-page-viewport').boundingClientRect((rect: any) => {
      if (rect?.width > 0 && rect?.height > 0) layout.value = { width: rect.width, height: rect.height }
    }).exec()
  })
}

function resize() {
  clearTimeout(resizeTimer)
  resizeTimer = setTimeout(measureViewport, 80)
}

function commitPage(index: number) {
  pageIndex.value = Math.max(0, Math.min(pages.value.length - 1, index))
  emit('update:position', visiblePage.value.start)
  announce()
}

function turn(direction: -1 | 1) {
  if (props.blocked || turning.value || !readyToRead.value) return
  const target = pageIndex.value + direction
  if (target < 0 || target >= pages.value.length) {
    emit('boundary', direction)
    return
  }
  const token = ++sequence
  previewIndex.value = target
  turning.value = direction > 0 ? 'curl-next' : 'curl-previous'
  dragX.value = 0
  emit('turn')
  turnTimer = setTimeout(() => {
    if (token !== sequence) return
    commitPage(target)
    turning.value = ''
    previewIndex.value = -1
  }, 280)
}

function onTouchStart(event: any) {
  if (props.blocked || turning.value) return
  const point = event.changedTouches?.[0] || event.touches?.[0]
  touchStart = point ? { x: Number(point.clientX), y: Number(point.clientY), at: Date.now() } : null
}

function onTouchMove(event: any) {
  if (!touchStart || props.blocked || turning.value) return
  const point = event.changedTouches?.[0] || event.touches?.[0]
  if (!point) return
  const x = Number(point.clientX) - touchStart.x
  const y = Number(point.clientY) - touchStart.y
  if (Math.abs(x) < 12 || Math.abs(x) < Math.abs(y) * 1.2) return
  const target = pageIndex.value + (x < 0 ? 1 : -1)
  previewIndex.value = target >= 0 && target < pages.value.length ? target : -1
  dragX.value = Math.max(-layout.value.width * .72, Math.min(layout.value.width * .72, x * .75))
  suppressTapUntil = Date.now() + 500
}

function onTouchEnd(event: any) {
  const point = event.changedTouches?.[0]
  const start = touchStart
  touchStart = null
  if (!start || !point || props.blocked) { dragX.value = 0; return }
  const end = { x: Number(point.clientX), y: Number(point.clientY), at: Date.now() }
  const step = chapterStepFromSwipe(start, end)
  dragX.value = 0
  if (Math.abs(end.y - start.y) > 14 || Math.abs(end.x - start.x) > 14) suppressTapUntil = Date.now() + 500
  if (step) turn(step as -1 | 1)
  else previewIndex.value = -1
}

function tap() {
  if (Date.now() < suppressTapUntil || turning.value) return
  emit('tap')
}

function cancelTouch() {
  touchStart = null
  dragX.value = 0
  if (!turning.value) previewIndex.value = -1
}

function onKey(event: KeyboardEvent) {
  if (props.blocked) return
  if (event.key === 'ArrowRight' || event.key === 'PageDown') { event.preventDefault(); turn(1) }
  if (event.key === 'ArrowLeft' || event.key === 'PageUp') { event.preventDefault(); turn(-1) }
}

watch([() => props.content, pages], () => {
  sequence++
  clearTimeout(turnTimer)
  turning.value = ''
  previewIndex.value = -1
  restorePosition()
})
watch(() => props.position, restorePosition)
watch(() => props.fontSize, () => { if (ready) prepareMeasurement() })
onMounted(() => {
  ready = true
  prepareMeasurement()
  measureViewport()
  uni.onWindowResize(resize)
  // #ifdef H5
  window.addEventListener('keydown', onKey)
  // #endif
})
onBeforeUnmount(() => {
  clearTimeout(turnTimer)
  clearTimeout(resizeTimer)
  uni.offWindowResize(resize)
  // #ifdef H5
  window.removeEventListener('keydown', onKey)
  // #endif
})
defineExpose({ turn, measureViewport })
</script>

<template>
  <view class="reader-pager" @click="tap" @touchstart="onTouchStart" @touchmove.stop.prevent="onTouchMove" @touchend="onTouchEnd" @touchcancel="cancelTouch">
      <view v-if="previewPage && (turning || dragX)" class="reader-leaf reader-leaf-preview" aria-hidden="true">
        <view class="pager-header"><slot name="header" :index="previewIndex" :count="pages.length" /></view>
        <view class="reader-page-viewport reader-copy" :style="copyStyle">
          <text v-for="line in previewPage.lines" :key="line.start" class="reader-line" :class="{ indented: line.indent }" :style="{ height: `${line.height}px` }">{{ line.text.replace(/\t/g, '  ') || '\u00a0' }}</text>
        </view>
        <view class="pager-footer"><text class="tap-hint">左右滑动翻页 · 轻触显示操作</text><text class="page-counter">{{ previewIndex + 1 }} / {{ pages.length }} 页</text></view>
      </view>
      <view class="reader-leaf reader-leaf-current" :class="[turning, { dragging: dragX !== 0, 'drag-previous': dragX > 0 }]" :style="leafStyle" :data-page="pageIndex + 1" :data-pages="pages.length" :data-start="visiblePage.start" :data-end="visiblePage.end">
        <view class="pager-header"><slot name="header" :index="pageIndex" :count="pages.length" /></view>
        <view class="reader-page-viewport reader-copy" :style="copyStyle">
          <template v-if="readyToRead && content">
            <text v-for="line in visiblePage.lines" :key="line.start" class="reader-line" :class="{ indented: line.indent }" :style="{ height: `${line.height}px` }">{{ line.text.replace(/\t/g, '  ') || '\u00a0' }}</text>
          </template>
          <slot v-else />
        </view>
        <view class="pager-footer"><text class="tap-hint">左右滑动翻页 · 轻触显示操作</text><text class="page-counter">{{ pageIndex + 1 }} / {{ pages.length }} 页</text></view>
        <view v-if="turning || dragX" class="page-curl-shade" />
      </view>
    <canvas canvas-id="reader-measure" id="reader-measure" class="reader-measure" aria-hidden="true" />
  </view>
</template>

<style scoped>
.reader-pager{position:relative;width:100%;height:100%;min-height:0;overflow:hidden;perspective:1400px;touch-action:none;overscroll-behavior:none}.pager-header{flex:0 0 auto;padding-bottom:18px}.reader-page-viewport{position:relative;min-height:0;flex:1;overflow:hidden;touch-action:none;contain:layout paint}.reader-leaf{position:absolute;z-index:2;inset:0;display:flex;flex-direction:column;padding:14px calc(24px + env(safe-area-inset-right)) 12px calc(24px + env(safe-area-inset-left));box-sizing:border-box;overflow:hidden;backface-visibility:hidden;background:var(--reader-background,#faf8f2);background-image:var(--reader-texture,none);color:var(--reader-text,#3e382d);transform-origin:left center}.reader-copy{font-family:-apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif;letter-spacing:.4px}.reader-line{display:block;max-width:100%;overflow:visible;white-space:pre;word-break:normal}.reader-line.indented{text-indent:2em}.reader-leaf-preview{z-index:1}.reader-leaf.dragging{box-shadow:12px 0 22px rgba(30,24,18,.18)}.reader-leaf.drag-previous{transform-origin:right center;box-shadow:-12px 0 22px rgba(30,24,18,.18)}.page-curl-shade{position:absolute;top:0;right:0;bottom:0;width:30px;pointer-events:none;background:linear-gradient(90deg,transparent,rgba(73,64,50,.06) 40%,rgba(73,64,50,.2) 80%,rgba(255,255,255,.2));border-right:1px solid rgba(73,64,50,.12)}.curl-next{animation:curlNext 280ms cubic-bezier(.25,.7,.2,1) forwards;box-shadow:12px 0 28px rgba(30,24,18,.22)}.curl-previous{transform-origin:right center;animation:curlPrevious 280ms cubic-bezier(.25,.7,.2,1) forwards;box-shadow:-12px 0 28px rgba(30,24,18,.22)}.curl-previous .page-curl-shade,.drag-previous .page-curl-shade{right:auto;left:0;transform:scaleX(-1)}.pager-footer{display:flex;min-height:35px;flex:0 0 35px;align-items:flex-end;justify-content:space-between;gap:8px;color:var(--reader-muted,#8a7b61);font-size:10px;line-height:18px}.tap-hint{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.page-counter{flex:0 0 auto;white-space:nowrap}.reader-measure{position:fixed;left:-100px;top:-100px;width:1px;height:1px;opacity:0;pointer-events:none}@keyframes curlNext{0%{transform:translateX(0) rotateY(0)}55%{transform:translateX(-45%) rotateY(-12deg)}100%{transform:translateX(-103%) rotateY(-18deg)}}@keyframes curlPrevious{0%{transform:translateX(0) rotateY(0)}55%{transform:translateX(45%) rotateY(12deg)}100%{transform:translateX(103%) rotateY(18deg)}}@media(max-width:360px){.reader-leaf{padding-left:calc(20px + env(safe-area-inset-left));padding-right:calc(20px + env(safe-area-inset-right))}}@media(prefers-reduced-motion:reduce){.curl-next,.curl-previous{animation-duration:1ms}}
</style>
