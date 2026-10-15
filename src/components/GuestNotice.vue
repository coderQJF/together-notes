<script setup lang="ts">
defineProps<{ login?: boolean }>()
defineEmits<{ (e: 'login'): void }>()
</script>
<template>
  <view class="guest-notice">
    <view><text class="guest-title">本地游客模式</text><text class="guest-copy">仅保存在当前设备，尚未同步。清除小程序数据可能丢失记录。</text></view>
    <button v-if="login" @click="$emit('login')">登录同步</button>
  </view>
</template>
<style scoped>
.guest-notice{display:flex;flex:0 0 auto;align-items:center;gap:12px;margin:12px 0 18px;padding:12px 14px;border:1px solid #ece5d6;border-radius:16px;background:#fff;color:#494032}.guest-notice>view{flex:1;min-width:0}.guest-title,.guest-copy{display:block}.guest-title{font-size:13px;font-weight:600;line-height:22px}.guest-copy{font-size:11px;line-height:18px;color:#867b68}.guest-notice button{flex:0 0 auto;min-width:44px;min-height:44px;margin:0;padding:0 8px;background:transparent;color:#494032;font-size:12px;display:flex;align-items:center;justify-content:center}
</style>
