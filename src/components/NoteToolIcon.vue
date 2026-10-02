<script setup lang="ts">
defineProps<{ kind: 'handwriting' | 'todo' | 'paragraph' | 'image' | 'link' }>()
</script>

<template>
  <view class="tool-icon" :class="`tool-${kind}`">
    <image v-if="kind === 'link'" src="/static/nav-icons/link-active.png" mode="aspectFit" />
    <template v-else-if="kind === 'handwriting'"><view class="pen-body" /><view class="pen-stroke" /></template>
    <template v-else-if="kind === 'todo'"><view class="todo-ring" /><view class="todo-line" /></template>
    <template v-else-if="kind === 'paragraph'"><text>A</text><view class="paragraph-lines"><view /><view /><view /></view></template>
    <template v-else><view class="image-frame"><view class="image-sun" /><view class="image-mountain" /></view></template>
  </view>
</template>

<style scoped>
.tool-icon{position:relative;display:flex;width:25px;height:25px;align-items:center;justify-content:center;color:#494032;box-sizing:border-box}.tool-icon image{width:22px;height:22px}.pen-body{position:absolute;width:5px;height:20px;border:1.8px solid currentColor;border-radius:3px 3px 1px 1px;transform:rotate(42deg)}.pen-stroke{position:absolute;right:0;bottom:2px;width:15px;height:7px;border-bottom:1.7px solid currentColor;border-radius:50%;transform:rotate(-8deg)}.todo-ring{position:absolute;left:1px;width:14px;height:14px;border:1.8px solid currentColor;border-radius:50%;box-sizing:border-box}.todo-line{position:absolute;right:0;width:8px;border-top:1.8px solid currentColor;box-shadow:0 5px 0 currentColor}.tool-paragraph{justify-content:space-between}.tool-paragraph>text{font-size:17px;font-weight:600}.paragraph-lines{display:flex;width:11px;flex-direction:column;gap:3px}.paragraph-lines view{width:100%;border-top:1.5px solid currentColor}.paragraph-lines view:last-child{width:7px}.image-frame{position:relative;width:22px;height:20px;border:1.7px solid currentColor;border-radius:4px;box-sizing:border-box}.image-sun{position:absolute;right:3px;top:3px;width:4px;height:4px;border:1.2px solid currentColor;border-radius:50%;box-sizing:border-box}.image-mountain{position:absolute;left:3px;right:3px;bottom:3px;height:8px;border-left:1.5px solid currentColor;border-bottom:1.5px solid currentColor;transform:skewX(-34deg) rotate(-2deg)}
</style>
