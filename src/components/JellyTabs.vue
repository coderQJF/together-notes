<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'

export interface JellyTabOption {
  key: string
  label: string
}

const props = withDefaults(defineProps<{
  modelValue: string
  options: JellyTabOption[]
  ariaLabel?: string
  disabled?: boolean
  compact?: boolean
}>(), {
  ariaLabel: '切换内容',
  disabled: false,
  compact: false,
})

const emit = defineEmits<{
  (event: 'update:modelValue', value: string): void
  (event: 'change', value: string): void
}>()

const jellyDirection = ref<'left' | 'right' | ''>('')
let jellyTimer: ReturnType<typeof setTimeout> | undefined

const activeIndex = computed(() => Math.max(0, props.options.findIndex(option => option.key === props.modelValue)))
const indicatorStyle = computed(() => ({
  width: `calc((100% - 8px) / ${Math.max(1, props.options.length)})`,
  transform: `translate3d(${activeIndex.value * 100}%, 0, 0)`,
}))

watch(() => props.modelValue, (next, previous) => {
  const nextIndex = props.options.findIndex(option => option.key === next)
  const previousIndex = props.options.findIndex(option => option.key === previous)
  if (nextIndex < 0 || previousIndex < 0 || nextIndex === previousIndex) return
  jellyDirection.value = ''
  if (jellyTimer) clearTimeout(jellyTimer)
  nextTick(() => {
    jellyDirection.value = nextIndex > previousIndex ? 'right' : 'left'
    jellyTimer = setTimeout(() => { jellyDirection.value = '' }, 520)
  })
})

function select(value: string) {
  if (props.disabled || value === props.modelValue) return
  emit('update:modelValue', value)
  emit('change', value)
}

onBeforeUnmount(() => { if (jellyTimer) clearTimeout(jellyTimer) })
</script>

<template>
  <view class="jelly-tabs" :class="{ compact }" role="tablist" :aria-label="ariaLabel">
    <view class="indicator-track" :style="indicatorStyle">
      <view class="indicator" :class="jellyDirection ? `jelly-${jellyDirection}` : ''" />
    </view>
    <button
      v-for="option in options"
      :key="option.key"
      hover-class="none"
      role="tab"
      :disabled="disabled"
      :aria-selected="modelValue === option.key"
      :class="{ active: modelValue === option.key }"
      @click="select(option.key)"
    >
      <text>{{ option.label }}</text>
    </button>
  </view>
</template>

<style scoped>
.jelly-tabs{position:relative;display:flex;align-items:stretch;width:100%;padding:4px;overflow:hidden;border:1px solid #e5dece;border-radius:16px;background:#fff;box-sizing:border-box}
.indicator-track{position:absolute;z-index:0;top:4px;bottom:4px;left:4px;box-sizing:border-box;pointer-events:none;transition:transform 480ms cubic-bezier(.22,1.28,.36,1);will-change:transform}
.indicator{width:100%;height:100%;border-radius:12px;background:#494032;box-shadow:0 4px 12px rgba(73,64,50,.12)}
.indicator.jelly-right{transform-origin:left center;animation:jelly-stretch 500ms cubic-bezier(.22,1,.36,1)}
.indicator.jelly-left{transform-origin:right center;animation:jelly-stretch 500ms cubic-bezier(.22,1,.36,1)}
.jelly-tabs button{position:relative;z-index:1;display:flex;align-items:center;justify-content:center;min-width:0;height:46px;min-height:46px;flex:1;margin:0;padding:0 7px;border:0;border-radius:12px;background:transparent;color:#6f6555;font-size:13px;line-height:normal;box-sizing:border-box;transition:color 180ms ease}
.jelly-tabs button::after{border:0}
.jelly-tabs button text{display:block;overflow:hidden;line-height:20px;text-overflow:ellipsis;white-space:nowrap}
.jelly-tabs button.active{background:transparent;color:#fff9e9}
.jelly-tabs button:active{opacity:.86}
.jelly-tabs button[disabled]{opacity:.48}
.jelly-tabs.compact button{height:40px;min-height:40px;font-size:12px}
.jelly-tabs.compact .indicator-track{height:40px;bottom:auto}
@keyframes jelly-stretch{0%{transform:scaleX(1) scaleY(1)}38%{transform:scaleX(1.2) scaleY(.9)}68%{transform:scaleX(.94) scaleY(1.04)}84%{transform:scaleX(1.03) scaleY(.98)}100%{transform:scaleX(1) scaleY(1)}}
</style>
