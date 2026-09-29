<script setup lang="ts">
import { ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import SubpageHeader from '../../components/SubpageHeader.vue'
import { request, type Message } from '../../services/api'
import { formatListDateTime } from '../../utils/date'

const messages = ref<Message[]>([])
const loading = ref(true)
const error = ref('')

async function load() {
  loading.value = true
  error.value = ''
  try {
    messages.value = await request<Message[]>('/notifications')
  } catch (e) {
    error.value = e instanceof Error ? e.message : '消息加载失败'
  } finally {
    loading.value = false
  }
}

function openMessage(message: Message) {
  if (!message.itemId) {
    uni.showToast({ title: '这条提醒的详情已不可用', icon: 'none' })
    return
  }
  uni.navigateTo({ url: `/pages/detail/detail?id=${encodeURIComponent(message.itemId)}` })
}

onShow(load)
</script>

<template>
  <view class="shell">
    <SubpageHeader label="消息" />
    <text class="eyebrow">站内提醒</text>
    <text class="headline">到时间了。</text>
    <text class="subtitle">你们想记住的小事，都在这里。</text>

    <view v-if="loading" class="state">正在查看消息…</view>
    <view v-else-if="error" class="state error-state">
      <text>{{ error }}</text>
      <button @click="load">重新加载</button>
    </view>
    <view v-else-if="!messages.length" class="state">
      <view class="empty-icon"><image src="/static/nav-icons/bell-active.png" mode="aspectFit" /></view>
      <text class="state-title">暂时没有提醒消息</text>
      <text>有新消息时，会出现在这里。</text>
    </view>
    <view v-else class="message-list">
      <button v-for="message in messages" :key="message.id" class="message-card" :class="{ unread: !message.seen }" :disabled="!message.itemId" :aria-label="`查看提醒详情：${message.title}`" @click="openMessage(message)">
        <view class="message-icon"><image src="/static/nav-icons/bell-active.png" mode="aspectFit" /></view>
        <view class="message-copy">
          <text class="message-title">{{ message.title }}</text>
          <text class="message-time">{{ formatListDateTime(message.due) }}</text>
        </view>
        <view class="message-chevron" />
      </button>
    </view>
  </view>
</template>

<style scoped>
.shell{max-width:640px;min-height:100vh;margin:auto;padding:0 24px calc(48px + env(safe-area-inset-bottom));background:#faf8f2;color:#3e382d}.eyebrow{display:block;margin-top:4px;color:#786d5b;font-size:12px}.headline{display:block;margin:7px 0 0;font-size:31px;font-weight:600;line-height:1.4;letter-spacing:-.7px}.subtitle{display:block;margin-top:10px;color:#786d5b;font-size:14px;line-height:1.7}.state{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;min-height:340px;color:#786d5b;font-size:12px;text-align:center}.state-title{color:#494032;font-size:17px;font-weight:600}.state button{display:flex;align-items:center;justify-content:center;width:145px;height:44px;margin-top:5px;border:1px solid #ece5d6;border-radius:14px;background:#fff;color:#494032}.state button::after{border:0}.error-state{color:#ae4b3b}.empty-icon{display:flex;align-items:center;justify-content:center;width:56px;height:56px;margin-bottom:8px;border-radius:18px;background:#f7e7ad}.empty-icon image{display:block;width:28px;height:28px}.message-list{margin-top:27px}.message-card{display:flex;width:100%;min-height:78px;align-items:center;gap:13px;padding:16px;margin:11px 0;border:1px solid #ece5d6;border-radius:19px;background:#fff;color:#3e382d;text-align:left;line-height:1.4}.message-card::after{border:0}.message-card.unread{border-color:#efd98d;background:#fffdf6}.message-card[disabled]{opacity:.62}.message-icon{display:flex;align-items:center;justify-content:center;width:44px;height:44px;flex:0 0 44px;border-radius:14px;background:#f7e7ad}.message-icon image{display:block;width:21px;height:21px}.message-copy{min-width:0;flex:1}.message-title{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:15px;font-weight:600}.message-time{display:block;margin-top:6px;color:#786d5b;font-size:11px;font-variant-numeric:tabular-nums;white-space:nowrap}.message-chevron{width:9px;height:9px;flex:0 0 9px;margin-right:3px;border-top:1.5px solid #8a7e6a;border-right:1.5px solid #8a7e6a;transform:rotate(45deg)}
@media(max-width:360px){.shell{padding-left:20px;padding-right:20px}}
.shell{padding-left:calc(24px + env(safe-area-inset-left));padding-right:calc(24px + env(safe-area-inset-right))}
@media(max-width:360px){.shell{padding-left:calc(20px + env(safe-area-inset-left));padding-right:calc(20px + env(safe-area-inset-right))}}
</style>
