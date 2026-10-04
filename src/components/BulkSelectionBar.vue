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
  delete: []
}>()
</script>

<template>
  <view class="bulk-selection-bar" role="toolbar" aria-label="批量选择操作">
    <button class="selection-cancel" :disabled="deleting" @click="$emit('cancel')">取消</button>
    <text class="selection-count" aria-live="polite">
      {{ selectedCount ? `已选择 ${selectedCount} 项` : '选择要删除的内容' }}
    </text>
    <button
      class="selection-delete"
      :disabled="deleting || !selectedCount"
      :aria-label="deleting ? '正在删除选中内容' : `删除选中的 ${selectedCount} 项`"
      @click="$emit('delete')"
    >
      {{ deleting ? '删除中…' : '删除' }}
    </button>
  </view>
</template>

<style scoped>
.bulk-selection-bar{display:grid;grid-template-columns:minmax(56px,auto) minmax(0,1fr) minmax(56px,auto);align-items:center;gap:10px;width:100%;min-height:44px;margin:0;padding:0}
.bulk-selection-bar button{display:flex;align-items:center;justify-content:center;width:auto;min-width:56px;height:44px;min-height:44px;margin:0;padding:0 10px;border:0;border-radius:13px;background:transparent;font-size:14px;line-height:1.2}
.bulk-selection-bar button::after{border:0}
.selection-cancel{justify-self:start;color:#786d5b}
.selection-count{min-width:0;overflow:hidden;color:#494032;font-size:13px;font-weight:600;text-align:center;text-overflow:ellipsis;white-space:nowrap}
.selection-delete{justify-self:end;color:#ae4b3b!important}
.selection-delete:not([disabled]){background:#fff0e9!important}
.bulk-selection-bar button[disabled]{opacity:.42}
</style>
