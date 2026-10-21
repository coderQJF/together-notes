<script lang="ts">
export default { options: { virtualHost: true } }
</script>
<script setup lang="ts">
import { onUnmounted, ref } from 'vue'
import StatusIcon from './StatusIcon.vue'
import { createHoldGesture, registerPendingHold, type HoldPoint } from '../services/hold-gesture'

const props = withDefaults(defineProps<{
  selecting?: boolean
  selected?: boolean
  locked?: boolean
  disabled?: boolean
  selectionLabel?: string
  butter?: boolean
  completed?: boolean
}>(), { selecting: false, selected: false, locked: false, disabled: false, selectionLabel: '', butter: false, completed: false })
const emit = defineEmits<{ hold: []; activate: []; toggle: [] }>()
const pressed = ref(false), rebounding = ref(false)
let reboundTimer: ReturnType<typeof setTimeout> | undefined
type TouchInput = { touches?: ArrayLike<{ clientX?: number; clientY?: number; pageX?: number; pageY?: number }>; target?: unknown }
function point(event: TouchInput): HoldPoint | undefined {
  const touch = event.touches?.[0]
  if (!touch) return
  const x = Number(touch.clientX ?? touch.pageX), y = Number(touch.clientY ?? touch.pageY)
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : undefined
}
const gesture = createHoldGesture({
  onPressChange(value) { pressed.value = value },
  onHold() {
    if (props.disabled || props.selecting) return
    rebounding.value = true
    clearTimeout(reboundTimer)
    reboundTimer = setTimeout(() => { rebounding.value = false }, 320)
    emit('hold')
  },
})
const unregister = registerPendingHold(cancel)
function start(event: TouchInput) {
  const target = event.target as { closest?: (selector: string) => unknown } | null | undefined
  if (props.disabled || target?.closest?.('button, uni-button, input, textarea')) return
  if (props.selecting) { gesture.prepareTap(); return }
  gesture.start(point(event), event.touches?.length || 0)
}
function move(event: TouchInput) { gesture.move(point(event), event.touches?.length || 0) }
function cancel() { gesture.cancel(); gesture.end() }
function activate() { if (!props.disabled && !gesture.consumeClick()) emit('activate') }
onUnmounted(() => { cancel(); unregister(); clearTimeout(reboundTimer) })
</script>

<template>
  <view
    class="selectable-card card"
    :class="{ butter, completed, 'hold-pressed': pressed, 'hold-rebound': rebounding, 'selection-active': selecting, 'selected-card': selected, 'selection-locked': selecting && locked }"
    role="button"
    tabindex="0"
    :aria-pressed="selecting ? selected : undefined"
    @touchstart="start"
    @touchmove="move"
    @touchend="gesture.end()"
    @touchcancel="cancel"
    @contextmenu.stop.prevent
    @click="activate"
    @keydown.enter.prevent="activate"
    @keydown.space.prevent="activate"
  >
    <slot name="meta" />
    <view class="selectable-card-row">
     <view class="selectable-card-content"><slot /></view>
     <view class="selectable-card-action">
      <button
        v-if="selecting"
        class="selection-toggle"
        :class="{ locked }"
        :aria-pressed="selected"
        :aria-disabled="locked || disabled"
        :aria-label="selectionLabel || (selected ? '取消选择' : '选择这条内容')"
        @touchstart.stop
        @click.stop="!disabled && $emit('toggle')"
      ><StatusIcon :checked="selected" :label="selected ? '已选择' : '未选择'" /></button>
      <slot v-else name="action" />
     </view>
    </view>
  </view>
</template>

<style scoped>
.selectable-card{display:block;width:100%;min-width:0;box-sizing:border-box;background:#fff;border:1px solid #ece5d6;border-radius:21px;padding:21px;margin:14px 0}.selectable-card:first-child{margin-top:4px}.selectable-card.butter{background:#f7e7ad;border-color:#f0dc99}.selectable-card.completed{opacity:.6}
.selectable-card{position:relative;touch-action:pan-y;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;transform:scale(1);transform-origin:center;transition:transform .28s cubic-bezier(.2,.9,.28,1.28),border-color .16s ease,box-shadow .16s ease}
.selectable-card-row{display:flex;align-items:center;gap:8px}
.selectable-card-content{min-width:0;flex:1}
.selectable-card-action{display:flex;align-items:center;justify-content:center;width:44px;min-width:44px;flex:0 0 44px;align-self:center;margin-right:-8px}
.hold-pressed{transform:scale(.975);transition:transform .16s ease-out}
.hold-rebound{animation:hold-rebound .32s cubic-bezier(.2,.9,.28,1.28)}
.selection-active.completed{opacity:.82}
.selectable-card.selected-card{border-color:#b8953d;box-shadow:0 0 0 1px rgba(184,149,61,.34)}
.selection-locked{background:#f7f4ed}.selection-locked.butter{background:#f3e5ba}
.selection-toggle{display:flex;align-items:center;justify-content:center;width:44px;min-width:44px;height:44px;min-height:44px;margin:0;padding:0;border:0;background:transparent}
.selection-toggle::after{border:0}.selection-toggle.locked{opacity:.36}
@keyframes hold-rebound{0%{transform:scale(.975)}60%{transform:scale(1.012)}100%{transform:scale(1)}}
@media(prefers-reduced-motion:reduce){.selectable-card{transition:none}.hold-rebound{animation:none}}
@media(min-width:900px){.selectable-card{padding:25px}}
</style>
