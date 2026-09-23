<script setup lang="ts">
defineEmits<{
  open: [document: 'terms' | 'privacy']
}>()
</script>

<template>
  <view class="legal-links">
    <button class="legal-link" @click="$emit('open', 'terms')">用户协议</button>
    <button class="legal-link" @click="$emit('open', 'privacy')">隐私政策</button>
  </view>
</template>

<style scoped>
.legal-links{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
.legal-link{display:flex;align-items:center;justify-content:center;width:100%;height:44px;min-height:44px;margin:0;padding:0;border:0;background:transparent;color:#806a37;font-size:12px;line-height:1}
.legal-link::after{border:0}
</style>
