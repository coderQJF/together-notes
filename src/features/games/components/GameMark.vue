<script setup lang="ts">
withDefaults(defineProps<{ kind?: 'controller' | 'grid'; compact?: boolean }>(), {
  kind: 'controller',
  compact: false,
})
</script>

<template>
  <view class="game-mark" :class="[{ compact }, kind]" aria-hidden="true">
    <template v-if="kind === 'controller'">
      <view class="controller-body">
        <view class="controller-cross horizontal" />
        <view class="controller-cross vertical" />
        <view class="controller-dot first" />
        <view class="controller-dot second" />
      </view>
    </template>
    <template v-else>
      <view v-for="index in 9" :key="index" class="grid-cell" :class="{ filled: [1, 5, 8].includes(index) }" />
    </template>
  </view>
</template>

<style scoped>
.game-mark{display:grid;width:48px;height:48px;flex:0 0 48px;box-sizing:border-box;border:1px solid #eadfbf;border-radius:15px;background:#fff9e9;color:#494032;place-items:center}.game-mark.compact{width:22px;height:22px;flex-basis:22px;border:0;border-radius:0;background:transparent}.controller-body{position:relative;width:30px;height:19px;border:1.7px solid currentColor;border-radius:9px 9px 11px 11px;box-sizing:border-box}.compact .controller-body{width:21px;height:14px;border-width:1.4px;border-radius:6px 6px 8px 8px}.controller-cross{position:absolute;left:6px;top:8px;width:8px;height:2px;border-radius:2px;background:currentColor}.controller-cross.vertical{transform:rotate(90deg)}.controller-dot{position:absolute;top:7px;width:3px;height:3px;border-radius:50%;background:currentColor}.controller-dot.first{right:8px}.controller-dot.second{right:4px;top:9px}.compact .controller-cross{left:4px;top:5px;width:6px;height:1.5px}.compact .controller-dot{top:4px;width:2.5px;height:2.5px}.compact .controller-dot.first{right:6px}.compact .controller-dot.second{right:3px;top:7px}.game-mark.grid{grid-template-columns:repeat(3,7px);grid-template-rows:repeat(3,7px);gap:2px}.grid-cell{width:7px;height:7px;box-sizing:border-box;border:1px solid #9a8b71;border-radius:1px;background:#fff}.grid-cell.filled{background:#d5b85f}.game-mark.grid.compact{grid-template-columns:repeat(3,4px);grid-template-rows:repeat(3,4px);gap:1.5px}.compact .grid-cell{width:4px;height:4px}
</style>
