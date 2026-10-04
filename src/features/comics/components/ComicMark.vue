<script setup lang="ts">
withDefaults(defineProps<{ compact?: boolean }>(), { compact: false })
</script>

<template>
  <view class="comic-mark" :class="{ compact }" aria-hidden="true">
    <view class="sheet back" />
    <view class="sheet front">
      <view class="panel large" />
      <view class="panel" />
      <view class="panel" />
    </view>
  </view>
</template>

<style scoped>
.comic-mark{position:relative;width:48px;height:48px;flex:0 0 48px;box-sizing:border-box;border:1px solid #eadfbf;border-radius:15px;background:#fff9e9;color:#494032}.sheet{position:absolute;box-sizing:border-box;border:1.5px solid currentColor;border-radius:3px;background:#fff}.sheet.back{inset:11px 9px 8px 13px;transform:rotate(7deg);opacity:.45}.sheet.front{inset:8px 12px 11px 9px;display:grid;grid-template-columns:1.25fr 1fr;grid-template-rows:1fr 1fr;gap:2px;padding:3px}.panel{border:1px solid currentColor;border-radius:1px}.panel.large{grid-row:1/3}.comic-mark.compact{width:22px;height:22px;flex-basis:22px;border:0;border-radius:0;background:transparent}.compact .sheet{border-width:1.2px;border-radius:2px}.compact .sheet.back{inset:4px 3px 2px 6px}.compact .sheet.front{inset:2px 5px 4px 3px;gap:1px;padding:2px}.compact .panel{border-width:.8px}
</style>
