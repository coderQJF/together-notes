<script setup lang="ts">
import { computed, getCurrentInstance, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { chapterStepFromSwipe, type ReaderTouchPoint } from '../services/reader-gesture'
import { paginateReaderText, readerOffsetFromLegacyScroll, readerPageAtOffset, type ReaderPageLayout } from '../services/reader-pagination'
import { completeReaderSheet, createReaderSheets, isReaderSheetTransition, prepareReaderSheet, readerTurnDuration, readerTurnTarget, spareReaderSheet, type ReaderSheetId } from '../services/reader-pager-motion'

const props = withDefaults(defineProps<{
  content: string
  chapterTitle?: string
  position: number
  fontSize: number
  lineHeight: number
  blocked?: boolean
  legacyScrollTop?: number
}>(), { chapterTitle: '', blocked: false, legacyScrollTop: 0 })
const emit = defineEmits<{
  (event: 'update:position', offset: number): void
  (event: 'page', page: { index: number; count: number; offset: number; end: number }): void
  (event: 'boundary', direction: -1 | 1): void
  (event: 'turn'): void
  (event: 'tap'): void
}>()
type TurnState = 'idle' | 'dragging' | 'settling' | 'rebounding'
const instance = getCurrentInstance()
const sheetIds: ReaderSheetId[] = [0, 1]
const sheets = ref(createReaderSheets(0, 1))
const layout = ref({ width: 0, height: 0 })
const sheetWidth = ref(0)
const titleHeight = ref(0)
const measurementVersion = ref(0)
const turnState = ref<TurnState>('idle')
const dragX = ref(0)
const transitionMs = ref(0)
const turnDirection = ref<-1 | 1>(1)
const pageIndex = computed(() => sheets.value.pages[sheets.value.active])
let measureCharacter: ReaderPageLayout['measureCharacter']
let touchStart: ReaderTouchPoint | null = null
let suppressTapUntil = 0
let turnTimer: ReturnType<typeof setTimeout> | undefined
let resizeTimer: ReturnType<typeof setTimeout> | undefined
let prepareTimer: ReturnType<typeof setTimeout> | undefined
let sequence = 0
let ready = false
const pageLayout = computed(() => {
  void measurementVersion.value
  return { ...layout.value, fontSize: props.fontSize, lineHeight: props.lineHeight, letterSpacing: .4, firstPageTopInset: props.chapterTitle ? titleHeight.value : 0, measureCharacter }
})
const pages = computed(() => paginateReaderText(props.content, pageLayout.value))
const visiblePage = computed(() => pages.value[pageIndex.value] || pages.value[0])
const copyStyle = computed(() => ({ fontSize: `${props.fontSize}px`, lineHeight: `${props.fontSize * props.lineHeight}px` }))
const titleStyle = computed(() => ({ fontSize: `${props.fontSize * 1.15}px`, lineHeight: '1.5', paddingBottom: `${props.fontSize * .9}px` }))
const readyToRead = computed(() => layout.value.width > 0 && layout.value.height > 0)
const animating = computed(() => turnState.value === 'settling' || turnState.value === 'rebounding')

function pageForSheet(id: ReaderSheetId) { return pages.value[sheets.value.pages[id]] || pages.value[0] }

function sheetStyle(id: ReaderSheetId) {
  if (id !== sheets.value.active) return { transform: 'translate3d(0,0,0)', transition: 'none' }
  return {
    transform: `translate3d(${dragX.value}px,0,0) rotateY(${dragX.value / Math.max(1, sheetWidth.value) * 8}deg)`,
    transition: animating.value ? `transform ${transitionMs.value}ms cubic-bezier(.22,.7,.2,1)` : 'none',
  }
}

function announce() {
  if (!readyToRead.value) return
  const current = visiblePage.value
  emit('page', { index: pageIndex.value, count: pages.value.length, offset: current.start, end: current.end })
}

function resetMotion() {
  sequence++
  clearTimeout(turnTimer)
  clearTimeout(prepareTimer)
  touchStart = null
  turnState.value = 'idle'
  dragX.value = 0
  transitionMs.value = 0
}

function restorePosition() {
  if (!readyToRead.value) return
  const offset = props.position || (props.legacyScrollTop ? readerOffsetFromLegacyScroll(pages.value, props.legacyScrollTop, layout.value.height) : 0)
  const index = readerPageAtOffset(pages.value, offset)
  if (index !== pageIndex.value) {
    resetMotion()
    sheets.value = createReaderSheets(index, pages.value.length)
  }
  announce()
}

function prepareMeasurement() {
  const widths = new Map<string, number>()
  let platformMeasure: ((character: string) => number) | undefined
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
  } catch { /* Conservative widths remain usable before the native canvas starts. */ }
  // #endif
  measureCharacter = platformMeasure ? character => {
    if (!widths.has(character)) widths.set(character, platformMeasure!(character))
    return widths.get(character)!
  } : undefined
  measurementVersion.value++
}

function measureViewport() {
  nextTick(() => {
    // The viewport always includes the opening title area. Its height never
    // changes when a later page omits that title, avoiding per-turn reflow.
    // The spare sheet stays at transform 0 even during a resize mid-turn.
    const query = uni.createSelectorQuery().in(instance?.proxy)
    query.select('.reader-leaf-preview .reader-page-viewport').boundingClientRect((rect: any) => {
      if (rect?.width > 0 && rect?.height > 0 && (layout.value.width !== rect.width || layout.value.height !== rect.height)) layout.value = { width: rect.width, height: rect.height }
    })
    query.select('.reader-pager').boundingClientRect((rect: any) => { if (rect?.width > 0) sheetWidth.value = rect.width })
    query.exec(() => {
      nextTick(() => {
        uni.createSelectorQuery().in(instance?.proxy).select('.reader-title-measure').boundingClientRect((rect: any) => {
          const height = props.chapterTitle && rect?.height > 0 ? rect.height : 0
          if (titleHeight.value !== height) titleHeight.value = height
        }).exec()
      })
    })
  })
}

function resize() {
  clearTimeout(resizeTimer)
  resizeTimer = setTimeout(measureViewport, 80)
}

function finishMotion() {
  if (!animating.value) return
  clearTimeout(turnTimer)
  if (turnState.value === 'settling') {
    // The incoming physical sheet is already visible at transform 0. Switching
    // roles leaves its DOM and text untouched and hides the outgoing sheet.
    sheets.value = completeReaderSheet(sheets.value)
    turnState.value = 'idle'
    dragX.value = 0
    transitionMs.value = 0
    emit('update:position', visiblePage.value.start)
    announce()
  } else {
    turnState.value = 'idle'
    dragX.value = 0
    transitionMs.value = 0
  }
}

function onTransitionEnd(id: ReaderSheetId, event: any) {
  if (id !== sheets.value.active || !isReaderSheetTransition(event, id)) return
  finishMotion()
}

function animateTo(offset: number, state: 'settling' | 'rebounding', duration: number) {
  transitionMs.value = duration
  turnState.value = state
  dragX.value = offset
  const token = sequence
  // A fallback is only for platforms that omit transitionend; it must never
  // replace the normal compositor-completion handoff with a shorter timer.
  turnTimer = setTimeout(() => { if (token === sequence) finishMotion() }, duration + 160)
}

function turn(direction: -1 | 1) {
  if (props.blocked || animating.value || !readyToRead.value) return
  const target = pageIndex.value + direction
  if (target < 0 || target >= pages.value.length) {
    resetMotion()
    emit('boundary', direction)
    return
  }
  const token = ++sequence
  turnDirection.value = direction
  const spare = spareReaderSheet(sheets.value)
  const targetReady = sheets.value.pages[spare] === target
  sheets.value = prepareReaderSheet(sheets.value, target)
  const finish = () => {
    if (token !== sequence || props.blocked) return
    const duration = readerTurnDuration(dragX.value, direction, sheetWidth.value)
    animateTo(readerTurnTarget(direction, sheetWidth.value), 'settling', duration)
    emit('turn')
  }
  if (turnState.value === 'dragging' || targetReady) finish()
  else {
    // Allow a newly prepared background sheet to paint before keyboard/button
    // navigation starts moving the front sheet (also works in App service JS).
    turnState.value = 'dragging'
    nextTick(() => { prepareTimer = setTimeout(finish, 32) })
  }
}

function onTouchStart(event: any) {
  if (props.blocked || animating.value) return
  const point = event.changedTouches?.[0] || event.touches?.[0]
  touchStart = point && (event.touches?.length || 1) === 1 ? { x: Number(point.clientX), y: Number(point.clientY), at: Date.now() } : null
}

function onTouchMove(event: any) {
  if (!touchStart || props.blocked || animating.value) return
  if ((event.touches?.length || 1) > 1) { cancelTouch(); return }
  const point = event.changedTouches?.[0] || event.touches?.[0]
  if (!point) return
  const x = Number(point.clientX) - touchStart.x
  const y = Number(point.clientY) - touchStart.y
  if (Math.abs(x) < 12 || Math.abs(x) < Math.abs(y) * 1.2) return
  turnDirection.value = x < 0 ? 1 : -1
  const target = pageIndex.value + turnDirection.value
  const inside = target >= 0 && target < pages.value.length
  if (inside && sheets.value.pages[spareReaderSheet(sheets.value)] !== target) sheets.value = prepareReaderSheet(sheets.value, target)
  turnState.value = 'dragging'
  dragX.value = inside ? Math.max(-sheetWidth.value * .8, Math.min(sheetWidth.value * .8, x * .9)) : Math.max(-30, Math.min(30, x * .12))
  suppressTapUntil = Date.now() + 500
}

function rebound() {
  if (!dragX.value) { turnState.value = 'idle'; return }
  animateTo(0, 'rebounding', 150)
}

function onTouchEnd(event: any) {
  const point = event.changedTouches?.[0]
  const start = touchStart
  touchStart = null
  if (!start || !point || props.blocked) { if (!animating.value) rebound(); return }
  const end = { x: Number(point.clientX), y: Number(point.clientY), at: Date.now() }
  const step = chapterStepFromSwipe(start, end)
  if (Math.abs(end.y - start.y) > 14 || Math.abs(end.x - start.x) > 14) suppressTapUntil = Date.now() + 500
  if (step) turn(step as -1 | 1)
  else rebound()
}

function tap() {
  if (Date.now() < suppressTapUntil || turnState.value !== 'idle') return
  emit('tap')
}

function cancelTouch() {
  touchStart = null
  if (!animating.value) rebound()
}

function onKey(event: KeyboardEvent) {
  if (props.blocked) return
  if (event.key === 'ArrowRight' || event.key === 'PageDown') { event.preventDefault(); turn(1) }
  if (event.key === 'ArrowLeft' || event.key === 'PageUp') { event.preventDefault(); turn(-1) }
}

watch(pages, () => {
  resetMotion()
  const offset = props.position || (props.legacyScrollTop ? readerOffsetFromLegacyScroll(pages.value, props.legacyScrollTop, layout.value.height) : 0)
  sheets.value = createReaderSheets(readerPageAtOffset(pages.value, offset), pages.value.length)
  announce()
})
watch(() => props.position, restorePosition)
watch(() => props.fontSize, () => { if (ready) { prepareMeasurement(); measureViewport() } })
watch(() => props.chapterTitle, () => { if (ready) measureViewport() })
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
  resetMotion()
  clearTimeout(resizeTimer)
  uni.offWindowResize(resize)
  // #ifdef H5
  window.removeEventListener('keydown', onKey)
  // #endif
})
defineExpose({ turn, measureViewport })
</script>

<template>
  <view class="reader-pager" :data-turn-state="turnState" :data-active-sheet="sheets.active" @click="tap" @touchstart="onTouchStart" @touchmove.stop.prevent="onTouchMove" @touchend="onTouchEnd" @touchcancel="cancelTouch">
    <view v-for="id in sheetIds" :key="id" :id="`reader-sheet-${id}`" class="reader-leaf" :class="{ 'reader-leaf-current': id === sheets.active, 'reader-leaf-preview': id !== sheets.active, 'leaf-moving': id === sheets.active && turnState !== 'idle', 'leaf-previous': id === sheets.active && turnDirection < 0, 'leaf-ready': id === sheets.active || turnState !== 'idle' }" :style="sheetStyle(id)" :data-sheet="id" :data-sheet-page="sheets.pages[id] + 1" :data-page="sheets.pages[id] + 1" :data-pages="pages.length" :data-start="pageForSheet(id).start" :data-end="pageForSheet(id).end" :aria-hidden="id !== sheets.active" @transitionend="onTransitionEnd(id, $event)">
      <view class="pager-header"><slot name="header" :index="sheets.pages[id]" :count="pages.length" /></view>
      <view class="reader-page-viewport reader-copy" :style="copyStyle">
        <template v-if="readyToRead && content">
          <text v-if="sheets.pages[id] === 0 && chapterTitle" class="reader-chapter-title" :style="titleStyle">{{ chapterTitle }}</text>
          <text v-for="line in pageForSheet(id).lines" :key="line.start" class="reader-line" :class="{ indented: line.indent }" :style="{ height: `${line.height}px` }">{{ line.text.replace(/\t/g, '  ') || '\u00a0' }}</text>
        </template>
        <slot v-else />
      </view>
      <view class="pager-footer"><text class="page-counter">{{ sheets.pages[id] + 1 }} / {{ pages.length }} 页</text></view>
      <view class="page-curl-shade" />
    </view>
    <text class="reader-title-measure reader-copy" :style="{ ...titleStyle, width: `${layout.width}px` }" aria-hidden="true">{{ chapterTitle }}</text>
    <canvas canvas-id="reader-measure" id="reader-measure" class="reader-measure" aria-hidden="true" />
  </view>
</template>

<style scoped>
.reader-pager{position:relative;width:100%;height:100%;min-height:0;overflow:hidden;perspective:1400px;touch-action:none;overscroll-behavior:none;background:var(--reader-background,#faf8f2);background-image:var(--reader-texture,none)}.pager-header{flex:0 0 auto;padding-bottom:18px}.reader-page-viewport{position:relative;min-height:0;flex:1;overflow:hidden;touch-action:none;contain:layout paint}.reader-leaf{position:absolute;z-index:2;inset:0;display:flex;flex-direction:column;padding:14px calc(24px + env(safe-area-inset-right)) 12px calc(24px + env(safe-area-inset-left));box-sizing:border-box;overflow:hidden;backface-visibility:hidden;background:var(--reader-background,#faf8f2);background-image:var(--reader-texture,none);color:var(--reader-text,#3e382d);transform-origin:left center;will-change:transform}.reader-copy{font-family:-apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif;letter-spacing:.4px}.reader-line{display:block;max-width:100%;overflow:visible;white-space:pre;word-break:normal}.reader-line.indented{text-indent:2em}.reader-chapter-title,.reader-title-measure{display:block;box-sizing:border-box;white-space:normal;overflow-wrap:anywhere;font-weight:700}.reader-title-measure{position:fixed;top:-10000px;left:0;pointer-events:none;visibility:hidden}.reader-leaf-preview{z-index:1}.reader-leaf.leaf-moving{box-shadow:12px 0 22px rgba(30,24,18,.18)}.reader-leaf.leaf-previous{transform-origin:right center}.reader-leaf.leaf-moving.leaf-previous{box-shadow:-12px 0 22px rgba(30,24,18,.18)}.page-curl-shade{position:absolute;top:0;right:0;bottom:0;width:26px;pointer-events:none;opacity:0;background:linear-gradient(90deg,transparent,rgba(73,64,50,.06) 40%,rgba(73,64,50,.16) 80%,rgba(255,255,255,.15));border-right:1px solid rgba(73,64,50,.12)}.leaf-moving .page-curl-shade{opacity:1}.leaf-previous .page-curl-shade{right:auto;left:0;transform:scaleX(-1)}.pager-footer{display:flex;min-height:22px;flex:0 0 22px;align-items:flex-end;justify-content:flex-end;color:var(--reader-muted,#8a7b61);font-size:10px;line-height:18px}.page-counter{flex:0 0 auto;white-space:nowrap}.reader-measure{position:fixed;left:-100px;top:-100px;width:1px;height:1px;opacity:0;pointer-events:none}@media(max-width:360px){.reader-leaf{padding-left:calc(20px + env(safe-area-inset-left));padding-right:calc(20px + env(safe-area-inset-right))}}@media(prefers-reduced-motion:reduce){.reader-leaf.leaf-moving{transition-duration:1ms!important}}
</style>
