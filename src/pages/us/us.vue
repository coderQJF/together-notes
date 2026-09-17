<script setup lang="ts">
import { ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import SubpageHeader from '../../components/SubpageHeader.vue'
import { request, type User } from '../../services/api'

const user = ref<User | null>(null)
const nickname = ref('')
const ready = ref(false)
const pending = ref(false)
const error = ref('')

async function load() {
  error.value = ''
  try {
    user.value = await request<User>('/me')
    nickname.value = user.value.nickname
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : '暂时无法打开小空间'
  } finally {
    ready.value = true
  }
}

function openPair(mode: 'invite' | 'join') {
  uni.navigateTo({ url: `/pages/pair/pair?mode=${mode}` })
}

async function saveNickname() {
  const value = nickname.value.trim()
  if (!value || pending.value) return
  pending.value = true
  error.value = ''
  try {
    user.value = await request<User>('/me', 'PUT', { nickname: value })
    nickname.value = user.value.nickname
    uni.showToast({ title: '昵称已保存', icon: 'success' })
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : '昵称保存失败'
  } finally {
    pending.value = false
  }
}

async function logout() {
  if (pending.value) return
  pending.value = true
  try {
    await request('/logout', 'POST')
  } catch {
    // 本地会话仍需清除，避免失效 token 把用户困在当前页。
  } finally {
    uni.removeStorageSync('session')
    pending.value = false
    uni.reLaunch({ url: '/pages/index/index' })
  }
}

onShow(load)
</script>

<template>
  <view class="shell">
    <SubpageHeader label="小空间" />
    <view v-if="!ready" class="state">正在打开小空间…</view>
    <view v-else-if="!user" class="state error-state">
      <text>{{ error || '登录状态已失效' }}</text>
      <button class="secondary" @click="load">重新加载</button>
    </view>
    <template v-else>
      <view class="headline"><text>我们的</text><text>小空间。</text></view>
      <text class="subtitle">有各自的小记，也有一起的日常。</text>

      <view class="couple" aria-label="我们的头像">
        <view class="avatar self">{{ user.nickname.slice(0, 1) }}</view>
        <text class="heart" aria-hidden="true">♡</text>
        <view class="avatar">{{ user.partner?.nickname?.slice(0, 1) || '？' }}</view>
      </view>
      <text class="couple-name">{{ user.nickname }}<template v-if="user.partner"> &amp; {{ user.partner.nickname }}</template></text>

      <view v-if="user.partner" class="pair-card bound">
        <view class="bound-title"><text>已经绑定</text><text class="mini-heart">♡</text></view>
        <text>私人备忘不会自动共享。</text>
      </view>
      <view v-else class="pair-card">
        <text class="pair-title">还没有绑定另一半</text>
        <text>发出邀请码，或输入对方的邀请码。</text>
        <view class="pair-actions">
          <button class="primary" @click="openPair('invite')">邀请另一半</button>
          <button class="secondary" @click="openPair('join')">输入邀请码</button>
        </view>
      </view>

      <text class="label">我的昵称</text>
      <input v-model="nickname" maxlength="20" placeholder="填写昵称" />
      <button class="save" :disabled="pending || !nickname.trim()" @click="saveNickname">{{ pending ? '保存中…' : '保存昵称' }}</button>
      <text v-if="error" class="error">{{ error }}</text>
      <button class="logout" :disabled="pending" @click="logout">退出登录</button>
    </template>
  </view>
</template>

<style scoped>
.shell{max-width:640px;min-height:100vh;margin:auto;padding:0 24px calc(42px + env(safe-area-inset-bottom));box-sizing:border-box;background:#faf8f2;color:#3e382d}.state{display:flex;min-height:60vh;flex-direction:column;align-items:center;justify-content:center;gap:15px;color:#786d5b;text-align:center}.error-state{color:#9b4b40}.headline{margin:1px 0 10px;font-size:34px;font-weight:650;line-height:1.28;letter-spacing:-1px}.headline text{display:block}.subtitle{display:block;color:#786d5b;font-size:15px;line-height:1.7}.couple{display:flex;align-items:center;gap:23px;margin:32px 0 24px}.avatar{display:flex;width:64px;height:64px;align-items:center;justify-content:center;border:1px solid #efd98d;border-radius:50%;background:#f7e7ad;font-size:25px;font-weight:600}.avatar.self{background:#494032;color:#fff9e9}.heart{width:24px;color:#494032;font-family:Arial,sans-serif;font-size:35px;font-weight:400;line-height:1;text-align:center}.mini-heart{color:#8b6720;font-family:Arial,sans-serif;font-size:21px;font-weight:400;line-height:1}.couple-name{display:block;margin-bottom:17px;font-size:20px;font-weight:600}.pair-card{padding:22px;margin-bottom:25px;border:1px solid #efd98d;border-radius:22px;background:#f7e7ad}.pair-card>text{display:block;color:#786d5b;font-size:13px;line-height:1.7}.pair-title,.bound-title{margin-bottom:8px!important;color:#3e382d!important;font-size:19px!important;font-weight:600}.bound-title{display:flex;align-items:center;gap:8px}.pair-actions{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:17px}.pair-actions button,.save,.logout,.state button{display:flex;align-items:center;justify-content:center;height:48px;min-height:48px;margin:0;border-radius:14px;font-size:14px}.primary{border:0;background:#494032;color:#fff9e9}.secondary{border:1px solid #ded5c4;background:#fff;color:#494032}.label{display:block;margin:5px 0 9px;color:#786d5b;font-size:13px}input{width:100%;height:52px;padding:0 15px;box-sizing:border-box;border:1px solid #e5dece;border-radius:15px;background:#fff;color:#3e382d;font-size:15px}.save{width:100%;margin-top:12px;border:1px solid #e5dece;background:#fff;color:#3e382d}.save[disabled],.logout[disabled]{opacity:.55}.error{display:block;margin-top:12px;color:#9b4b40;font-size:12px}.logout{width:100%;margin-top:26px;border:1px solid #e5dece;background:transparent;color:#786d5b}.shell button::after{border:0}@media(max-width:360px){.shell{padding-left:20px;padding-right:20px}.headline{font-size:31px}.pair-card{padding:19px}.pair-actions{grid-template-columns:1fr}}.shell{padding-left:calc(24px + env(safe-area-inset-left));padding-right:calc(24px + env(safe-area-inset-right))}@media(max-width:360px){.shell{padding-left:calc(20px + env(safe-area-inset-left));padding-right:calc(20px + env(safe-area-inset-right))}}
</style>
