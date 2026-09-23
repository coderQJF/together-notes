<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { request } from '../services/api'

type PhoneStatus = { configured: boolean; masked: string | null }

const status = ref<PhoneStatus>({ configured: false, masked: null })
const editing = ref(false)
const phone = ref('')
const pending = ref(false)
const error = ref('')
const canSave = computed(() => /^1[3-9]\d{9}$/.test(phone.value.trim()) && !pending.value)

async function load() {
  try {
    status.value = await request<PhoneStatus>('/me/phone')
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : '手机号状态加载失败'
  }
}

function beginEdit() {
  phone.value = ''
  error.value = ''
  editing.value = true
}

function cancelEdit() {
  phone.value = ''
  error.value = ''
  editing.value = false
}

async function save() {
  if (!canSave.value) return
  pending.value = true
  error.value = ''
  try {
    status.value = await request<PhoneStatus>('/me/phone', 'PUT', { phone: phone.value.trim() })
    phone.value = ''
    editing.value = false
    uni.showToast({ title: '联动手机号已保存', icon: 'success' })
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : '手机号保存失败'
  } finally {
    pending.value = false
  }
}

onMounted(load)
</script>

<template>
  <view class="phone-card">
    <view class="heading">
      <view>
        <text class="title">Stock Platform 联动</text>
        <text class="intro">两边绑定相同手机号后，可接收每日策略观察清单。</text>
      </view>
      <button v-if="!editing" class="edit" @click="beginEdit">{{ status.configured ? '修改' : '绑定' }}</button>
    </view>
    <view v-if="!editing" class="summary">
      <text class="label">联动手机号</text>
      <text class="value">{{ status.masked || '尚未绑定' }}</text>
    </view>
    <view v-else class="form">
      <text class="field-label">中国大陆手机号</text>
      <input v-model="phone" type="number" maxlength="11" placeholder="请输入 11 位手机号" confirm-type="done" @confirm="save" />
      <view class="actions">
        <button class="cancel" :disabled="pending" @click="cancelEdit">取消</button>
        <button class="save" :disabled="!canSave" @click="save">{{ pending ? '保存中…' : '保存' }}</button>
      </view>
    </view>
    <text v-if="error" class="error">{{ error }}</text>
  </view>
</template>

<style scoped>
.phone-card{padding:20px;margin:0 0 18px;border:1px solid #ece5d6;border-radius:20px;background:#fff}.heading{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.heading>view{min-width:0}.title,.intro,.label,.value,.field-label,.error{display:block}.title{color:#494032;font-size:17px;font-weight:600}.intro{margin-top:6px;color:#786d5b;font-size:12px;line-height:1.65}.edit{display:flex;align-items:center;justify-content:center;width:auto;min-width:52px;height:44px;min-height:44px;flex:0 0 auto;margin:-9px -9px 0 0;padding:0 9px;border:0;background:transparent;color:#806a37;font-size:12px}.summary{padding:14px;margin-top:15px;border-radius:14px;background:#faf8f2}.label{color:#8d816d;font-size:11px}.value{margin-top:4px;color:#494032;font-size:16px;font-weight:600}.form{margin-top:16px}.field-label{margin-bottom:7px;color:#786d5b;font-size:13px}.form input{width:100%;height:52px;padding:0 15px;box-sizing:border-box;border:1px solid #e5dece;border-radius:15px;background:#faf8f2;color:#3e382d;font-size:15px}.actions{display:grid;grid-template-columns:1fr 1.5fr;gap:10px;margin-top:13px}.actions button{display:flex;align-items:center;justify-content:center;height:46px;min-height:46px;margin:0;border-radius:13px}.cancel{border:1px solid #ded5c4;background:#fff;color:#494032}.save{border:0;background:#494032;color:#fff9e9}.save[disabled],.cancel[disabled]{opacity:.55}.error{margin-top:12px;color:#9b4b40;font-size:12px}.phone-card button::after{border:0}
</style>
