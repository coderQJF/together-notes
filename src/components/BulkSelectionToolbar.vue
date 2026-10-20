<script setup lang="ts">
import StatusIcon from './StatusIcon.vue'
withDefaults(defineProps<{ selectedCount?: number; allSelected?: boolean; selectableCount?: number; deleting?: boolean }>(), {
  selectedCount: 0, allSelected: false, selectableCount: 0, deleting: false,
})
defineEmits<{ delete: []; selectAll: [] }>()
</script>

<template>
  <view class="bulk-selection-toolbar" role="toolbar" aria-label="选中内容操作">
    <button class="selection-delete" :disabled="deleting || !selectedCount" :aria-label="deleting ? '正在删除选中内容' : `删除选中的 ${selectedCount} 项`" @click="$emit('delete')"><view class="delete-icon"><view /></view><text>{{deleting ? '删除中…' : '删除'}}</text></button>
    <button class="selection-all" :disabled="deleting || !selectableCount" :aria-pressed="allSelected" @click="$emit('selectAll')"><StatusIcon :checked="allSelected" :label="allSelected ? '已全选' : '全选'" /><text>{{allSelected ? '取消全选' : '全选'}}</text></button>
  </view>
</template>

<style scoped>
.bulk-selection-toolbar{position:fixed;z-index:8;left:50%;bottom:calc(16px + env(safe-area-inset-bottom));display:flex;align-items:center;gap:12px;width:calc(100% - 48px - env(safe-area-inset-left) - env(safe-area-inset-right));max-width:592px;height:58px;padding:6px 12px;transform:translateX(-50%);border:1px solid #ece5d6;border-radius:22px;background:#fff;box-shadow:0 8px 25px rgba(73,64,50,.1)}
.bulk-selection-toolbar::before{content:'';position:absolute;z-index:-1;left:-12px;right:-12px;top:-25px;bottom:-16px;background:linear-gradient(180deg,rgba(250,248,242,0),#faf8f2 42%);pointer-events:none}
.bulk-selection-toolbar button{display:flex;align-items:center;justify-content:center;gap:9px;min-width:44px;width:50%;height:44px;min-height:44px;margin:0;padding:0 8px;border:0;border-radius:13px;background:transparent;color:#494032;font-size:14px;line-height:1.2;white-space:nowrap}
.bulk-selection-toolbar button::after{border:0}.bulk-selection-toolbar button[disabled]{opacity:.42}.selection-delete{color:#ae4b3b!important}.selection-delete:not([disabled]){background:#fff0e9!important}
.delete-icon{position:relative;width:20px;height:22px;flex:0 0 20px}.delete-icon::before{content:'';position:absolute;left:3px;top:6px;width:14px;height:14px;border:1.7px solid currentColor;border-top:0;border-radius:0 0 3px 3px;box-sizing:border-box}.delete-icon::after{content:'';position:absolute;left:1px;top:4px;width:18px;border-top:1.7px solid currentColor}.delete-icon>view{position:absolute;left:7px;top:1px;width:6px;height:4px;border:1.7px solid currentColor;border-bottom:0;border-radius:2px 2px 0 0;box-sizing:border-box}
</style>
