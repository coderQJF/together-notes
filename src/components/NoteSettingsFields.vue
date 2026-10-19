<script setup lang="ts">
withDefaults(defineProps<{
  scope: 'mine' | 'shared'
  pinned?: boolean
  scopeReadonly?: boolean
  showPin?: boolean
  compact?: boolean
  scopeHint?: string
}>(), {
  pinned: false,
  scopeReadonly: false,
  showPin: true,
  compact: false,
  scopeHint: '',
})

const emit = defineEmits<{
  'scope-change': [value: 'mine' | 'shared']
  'update:pinned': [value: boolean]
}>()

function changeScope(event: any) {
  emit('scope-change', Number(event.detail.value) ? 'shared' : 'mine')
}

function changePinned(event: any) {
  emit('update:pinned', Boolean(event.detail.value))
}
</script>

<template>
  <view class="note-settings" :class="{ compact }">
    <view class="scope-setting">
      <text v-if="!compact" class="field-label">可见范围</text>
      <view v-if="scopeReadonly" class="scope-field readonly">
        <text>{{ compact ? '我们俩' : '我们俩 · 共同编辑' }}</text>
        <text v-if="!compact" class="scope-owner">创建者管理范围</text>
      </view>
      <picker v-else :range="['仅自己', '我们俩']" :value="scope === 'shared' ? 1 : 0" @change="changeScope">
        <view class="scope-field" aria-label="可见范围">
          <text>{{ scope === 'shared' ? (compact ? '我们俩' : '我们俩 · 共同编辑') : (compact ? '仅自己' : '仅自己可见') }}</text>
          <view class="chevron-down" />
        </view>
      </picker>
      <text v-if="scopeHint && !scopeReadonly && !compact" class="scope-hint">{{ scopeHint }}</text>
    </view>
    <label v-if="showPin" class="pin-setting">
      <view class="pin-copy">
        <text>{{ compact ? '置顶' : '置顶这条备忘' }}</text>
        <text v-if="!compact" class="pin-hint">在列表最前面显示</text>
      </view>
      <switch color="#b28b35" :checked="pinned" aria-label="置顶这条备忘" @change="changePinned" />
    </label>
  </view>
</template>

<style scoped>
.note-settings{width:100%;min-width:0;color:#494032}
.field-label{display:block;margin:22px 0 9px;color:#786d5b;font-size:13px;line-height:20px}
.scope-setting{min-width:0}
.scope-field{display:flex;align-items:center;justify-content:space-between;gap:8px;width:100%;min-height:50px;padding:0 14px;border:1px solid #ece5d6;border-radius:14px;background:#fff;color:#3e382d;font-size:14px;box-sizing:border-box}
.scope-field>text:first-child{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.readonly{background:#f4f0e7}.scope-owner{flex:none;color:#786d5b;font-size:11px}
.chevron-down{width:8px;height:8px;flex:0 0 8px;margin:-4px 3px 0 4px;border-right:1.5px solid #786d5b;border-bottom:1.5px solid #786d5b;transform:rotate(45deg)}
.scope-hint{display:block;margin-top:9px;color:#786d5b;font-size:11px;line-height:1.6}
.pin-setting{display:flex;align-items:center;justify-content:space-between;gap:10px;min-height:62px;margin-top:20px;padding:12px 0;border-bottom:1px solid #ece5d6;box-sizing:border-box}
.pin-copy{min-width:0}.pin-copy>text{display:block}.pin-hint{margin-top:5px;color:#786d5b;font-size:11px}
.pin-setting switch{display:flex;align-items:center;min-width:52px;min-height:44px;flex:none}
.compact{display:flex;align-items:center;justify-content:space-between;gap:8px;width:auto;flex:1;font-size:12px}
.compact .scope-setting{max-width:calc(100% - 96px)}
.compact .scope-field{width:auto;min-width:94px;min-height:44px;padding:0 10px;border:0;border-radius:12px;background:#f4efe2;color:#786d5b;font-size:12px}
.compact .pin-setting{flex:none;gap:6px;min-height:44px;margin:0;padding:0;border:0}
.compact .pin-copy>text{white-space:nowrap}
</style>
