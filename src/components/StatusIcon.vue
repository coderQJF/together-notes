<script setup lang="ts">
withDefaults(defineProps<{ checked?: boolean; label?: string; size?: 'default' | 'large' }>(), {
  checked: false,
  label: '',
  size: 'default',
})
</script>

<template>
  <view class="status-icon" :class="{ checked, large:size === 'large' }" role="img" :aria-label="label || (checked ? '已完成' : '待完成')">
    <view v-if="checked" class="check-mark" />
  </view>
</template>

<style scoped>
.status-icon{position:relative;width:20px;height:20px;flex:0 0 20px;border:1.8px solid #a4873e;border-radius:50%;box-sizing:border-box}
.status-icon.checked{background:#f7e7ad}
.check-mark{position:absolute;left:50%;top:48%;width:5px;height:9px;border-right:1.8px solid #494032;border-bottom:1.8px solid #494032;transform:translate(-50%,-50%) rotate(45deg);transform-origin:center}
.status-icon.large{width:26px;height:26px;flex-basis:26px;border-width:2px;border-color:#9c9487}
.status-icon.large.checked{border-color:#b8953d;background:#f7e7ad}
.status-icon.large .check-mark{width:6px;height:10px;border-right-width:2px;border-bottom-width:2px}
</style>
