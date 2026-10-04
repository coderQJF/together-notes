<script setup lang="ts">
withDefaults(defineProps<{
  modelValue: string
  label: string
  placeholder?: string
  maxlength?: number
  size?: 'content' | 'links'
}>(), {
  placeholder: '',
  maxlength: 140,
  size: 'content',
})

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

function updateValue(event: any) {
  emit('update:modelValue', String(event?.detail?.value ?? ''))
}
</script>

<template>
  <view class="textarea-field" :class="`size-${size}`">
    <text class="field-label">{{ label }}</text>
    <view class="textarea-frame">
      <textarea
        class="textarea-control"
        :value="modelValue"
        :maxlength="maxlength"
        :placeholder="placeholder"
        placeholder-style="color:#8b806e;line-height:24px"
        disable-default-padding
        @input="updateValue"
      />
    </view>
  </view>
</template>

<style scoped>
.textarea-field{width:100%;margin-top:22px}.field-label{display:block;min-height:20px;margin:0 0 9px;color:#786d5b;font-size:13px;line-height:20px}.textarea-frame{width:100%;padding:13px 14px;overflow:hidden;border:1px solid #ece5d6;border-radius:14px;background:#fff;box-sizing:border-box}.size-content .textarea-frame{height:148px}.size-links .textarea-frame{height:88px}.textarea-control{display:block;width:100%;height:100%;min-height:0;margin:0;padding:0;border:0;border-radius:0;background:transparent;color:#3e382d;font-size:16px;line-height:24px;text-align:left;overflow-y:auto;box-sizing:border-box}
</style>
