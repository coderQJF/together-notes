<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{ modelValue?: string }>(), { modelValue: '19:00' })
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const hours = Array.from({ length: 24 }, (_, index) => String(index).padStart(2, '0'))
const minutes = Array.from({ length: 60 }, (_, index) => String(index).padStart(2, '0'))
const columns = [hours, minutes]
const selected = computed(() => {
  const [hour = '19', minute = '00'] = /^\d{2}:\d{2}$/.test(props.modelValue) ? props.modelValue.split(':') : []
  return [Math.max(0, hours.indexOf(hour)), Math.max(0, minutes.indexOf(minute))]
})

function change(event: any) {
  const value = Array.isArray(event.detail?.value) ? event.detail.value : []
  const hour = hours[Math.max(0, Math.min(23, Number(value[0]) || 0))]
  const minute = minutes[Math.max(0, Math.min(59, Number(value[1]) || 0))]
  emit('update:modelValue', `${hour}:${minute}`)
}
</script>

<template>
  <picker mode="multiSelector" :range="columns" :value="selected" @change="change">
    <view class="time-field" aria-label="选择提醒时间">
      <text>{{ modelValue }}</text>
      <view class="chevron-down" />
    </view>
  </picker>
</template>

<style scoped>
.time-field{display:flex;width:100%;min-height:50px;align-items:center;justify-content:space-between;padding:0 14px;border:1px solid #ece5d6;border-radius:14px;background:#fff;color:#3e382d;font-variant-numeric:tabular-nums}.chevron-down{width:8px;height:8px;flex:0 0 8px;margin:-4px 3px 0 12px;border-right:1.5px solid #786d5b;border-bottom:1.5px solid #786d5b;transform:rotate(45deg)}
</style>
