<script setup lang="ts">
withDefaults(defineProps<{
  selectedCount?: number
  deleting?: boolean
}>(), {
  selectedCount: 0,
  deleting: false,
})

defineEmits<{
  cancel: []
}>()
</script>

<template>
  <view class="bulk-selection-bar" role="toolbar" aria-label="批量选择操作">
    <button class="selection-cancel" :disabled="deleting" aria-label="取消选择" @click="$emit('cancel')"><view class="cancel-icon" /><text>取消</text></button>
    <text class="selection-count" aria-live="polite">
      {{ selectedCount ? `已选择 ${selectedCount} 项` : '选择要删除的内容' }}
    </text>
  </view>
</template>

<style scoped>
.bulk-selection-bar{display:flex;align-items:center;gap:14px;width:100%;height:44px;min-height:44px;margin:0;padding:0}
.bulk-selection-bar button{display:flex;align-items:center;justify-content:center;gap:7px;width:auto;min-width:56px;height:44px;min-height:44px;margin:0;padding:0 4px;border:0;border-radius:13px;background:transparent;font-size:14px;line-height:1.2}
.bulk-selection-bar button::after{border:0}
.selection-cancel{justify-self:start;color:#786d5b}
.selection-count{min-width:0;overflow:hidden;color:#494032;font-size:19px;font-weight:600;text-overflow:ellipsis;white-space:nowrap}
.cancel-icon{position:relative;width:16px;height:16px}.cancel-icon::before,.cancel-icon::after{content:'';position:absolute;left:0;top:7px;width:16px;height:1.5px;border-radius:2px;background:currentColor;transform:rotate(45deg)}.cancel-icon::after{transform:rotate(-45deg)}
.bulk-selection-bar button[disabled]{opacity:.42}
</style>
