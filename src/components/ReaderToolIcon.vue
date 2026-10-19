<script setup lang="ts">
defineProps<{ kind: 'settings' | 'night' | 'day' }>()
</script>

<template>
  <view class="reader-tool-icon" :class="kind" aria-hidden="true"><view v-if="kind !== 'night'" class="center" /><view v-if="kind === 'day'" v-for="ray in 8" :key="ray" class="ray" :style="{ transform: `rotate(${ray * 45}deg)` }" /></view>
</template>

<style scoped>
.reader-tool-icon{position:relative;display:block;width:20px;height:20px;flex:0 0 20px;box-sizing:border-box}.settings{border:2px solid currentColor;border-radius:50%}.settings .center{position:absolute;inset:5px;border:1.5px solid currentColor;border-radius:50%}.night{border-radius:50%;box-shadow:inset 6px -3px 0 0 currentColor;transform:rotate(-22deg)}.day .center{position:absolute;inset:6px;border:1.5px solid currentColor;border-radius:50%}.ray{position:absolute;inset:0}.ray::before{content:'';position:absolute;top:0;left:9px;width:2px;height:3px;border-radius:2px;background:currentColor}
</style>
