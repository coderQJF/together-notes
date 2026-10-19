<script setup lang="ts">
withDefaults(defineProps<{ title: string; metadata?: string; actionLabel: string; disabled?: boolean }>(), {
  metadata: '',
  disabled: false,
})
const emit = defineEmits<{ action: [] }>()
</script>

<template>
  <view class="action-list-row">
    <view class="row-copy">
      <text class="row-title">{{ title }}</text>
      <text v-if="metadata" class="row-metadata">{{ metadata }}</text>
    </view>
    <button class="row-action" :disabled="disabled" @click="emit('action')">{{ actionLabel }}</button>
  </view>
</template>

<style scoped>
.action-list-row{display:flex;align-items:center;justify-content:space-between;gap:12px;min-width:0;padding-top:13px;margin-top:13px;border-top:1px solid var(--action-row-border,#ecdfb8)}
.row-copy{flex:1;min-width:0;overflow:hidden}.row-title,.row-metadata{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.row-title{font-size:14px;font-weight:600;line-height:1.5;color:var(--action-row-text,#494032)}.row-metadata{margin-top:4px;color:var(--action-row-muted,#85775d);font-size:11px;line-height:1.5}
.row-action{display:flex;flex:0 0 88px;align-items:center;justify-content:center;width:88px;min-width:88px;height:44px;min-height:44px;margin:0;padding:0 8px;border:1px solid var(--action-row-button-border,#dfcb88);border-radius:13px;background:var(--action-row-button-background,#fffdf6);color:var(--action-row-button-text,#6e5b2a);font-size:12px;line-height:1;white-space:nowrap;box-sizing:border-box}.row-action::after{border:0}.row-action[disabled]{opacity:.55}
</style>
