<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref } from 'vue'

const props = withDefaults(defineProps<{ label?: string; fallback?: string }>(), {
  label: '',
  fallback: '/pages/index/index',
})

const headerStyle = ref<Record<string, string>>({})
let layoutTimer: ReturnType<typeof setTimeout> | undefined

function syncHeaderLayout() {
  // #ifdef MP-WEIXIN
  try {
    const capsule = uni.getMenuButtonBoundingClientRect()
    if (!capsule || capsule.width <= 0 || capsule.height <= 0 || capsule.left <= 0 || capsule.bottom <= 0) throw new Error('胶囊尺寸尚未就绪')
    const windowInfo = typeof uni.getWindowInfo === 'function' ? uni.getWindowInfo() : uni.getSystemInfoSync()
    const statusBarHeight = windowInfo.statusBarHeight || 0
    const verticalGap = Math.max(0, capsule.top - statusBarHeight)
    const shellWidth = Math.min(windowInfo.windowWidth, 640)
    const shellLeft = (windowInfo.windowWidth - shellWidth) / 2
    const safeRight = windowInfo.safeArea ? Math.max(0, windowInfo.windowWidth - windowInfo.safeArea.right) : 0
    const horizontalPadding = windowInfo.windowWidth <= 360 ? 20 : 24
    const contentRight = shellLeft + shellWidth - horizontalPadding - safeRight
    headerStyle.value = {
      paddingTop: `${statusBarHeight}px`,
      paddingRight: `${Math.max(0, contentRight - capsule.left + 8)}px`,
      minHeight: `${Math.max(statusBarHeight + 44, capsule.bottom + verticalGap)}px`,
    }
  } catch {
    headerStyle.value = { paddingTop: 'var(--status-bar-height)', paddingRight: '88px', minHeight: 'calc(44px + var(--status-bar-height))' }
  }
  // #endif
}

syncHeaderLayout()
onMounted(() => {
  nextTick(syncHeaderLayout)
  layoutTimer = setTimeout(syncHeaderLayout, 80)
  // #ifdef MP-WEIXIN
  if (typeof uni.onWindowResize === 'function') uni.onWindowResize(syncHeaderLayout)
  // #endif
})
onUnmounted(() => {
  clearTimeout(layoutTimer)
  // #ifdef MP-WEIXIN
  if (typeof uni.offWindowResize === 'function') uni.offWindowResize(syncHeaderLayout)
  // #endif
})

function goBack() {
  const stack = getCurrentPages()
  if (stack.length > 1) {
    uni.navigateBack()
    return
  }
  uni.reLaunch({ url: props.fallback })
}
</script>

<template>
  <view class="subpage-header" :style="headerStyle">
    <button class="back" aria-label="返回上一页" @click="goBack">
      <view class="back-icon" />
      <text>返回</text>
    </button>
    <text v-if="label" class="page-mark">{{ label }}</text>
  </view>
</template>

<style scoped>
.subpage-header{position:sticky;z-index:20;top:0;display:flex;align-items:center;justify-content:space-between;min-height:44px;margin-bottom:24px;background:var(--subpage-background,#faf8f2)}
.back{display:inline-flex;align-items:center;gap:7px;width:auto;height:44px;min-height:44px;margin:0;padding:0;border:0;background:transparent;color:#786d5b;font-size:15px;line-height:1.4}
.back::after{border:0}
.back-icon{width:10px;height:10px;margin-left:3px;border-left:1.7px solid currentColor;border-bottom:1.7px solid currentColor;transform:rotate(45deg)}
.page-mark{display:inline-flex;align-items:center;min-height:28px;padding:0 11px;border-radius:9px;background:#f7e7ad;color:#494032;font-size:12px;line-height:1;white-space:nowrap}
</style>
