<script setup lang="ts">
import { computed, ref } from 'vue'
import { onLoad, onShareAppMessage, onUnload } from '@dcloudio/uni-app'
import SubpageHeader from '../../components/SubpageHeader.vue'
import { login, request, type User } from '../../services/api'
import { shareText } from '../../utils/platform'

const mode = ref<'invite' | 'join'>('join')
const code = ref('')
const inviter = ref('')
const me = ref<User | null>(null)
const hasSession = ref(Boolean(uni.getStorageSync('session')))
const loading = ref(false)
const error = ref('')
let active = true

const pageLabel = computed(() => mode.value === 'invite' ? '邀请另一半' : '输入邀请码')

async function generateInvite() {
  if (loading.value) return
  loading.value = true
  error.value = ''
  try {
    const [result, user] = await Promise.all([
      request<{ code: string }>('/invite', 'POST'),
      request<User>('/me'),
    ])
    if (active) code.value = result.code
    if (active) me.value = user
    // #ifdef MP-WEIXIN
    if (active) uni.showShareMenu({ menus: ['shareAppMessage'] })
    // #endif
  } catch (e) {
    if (active) error.value = e instanceof Error ? e.message : '邀请码生成失败'
  } finally {
    if (active) loading.value = false
  }
}

async function checkInvite() {
  if (loading.value || !code.value.trim()) return
  loading.value = true
  error.value = ''
  inviter.value = ''
  try {
    const result = await request<{ nickname: string }>('/invite/preview', 'POST', { code: code.value })
    if (active) inviter.value = result.nickname
  } catch (e) {
    if (active) error.value = e instanceof Error ? e.message : '邀请码查询失败'
  } finally {
    if (active) loading.value = false
  }
}

async function previewSharedInvite() {
  if (!code.value.trim()) return
  loading.value = true
  error.value = ''
  try {
    const result = await request<{ nickname: string }>(`/invites/${encodeURIComponent(code.value.trim())}`)
    if (active) inviter.value = result.nickname
  } catch (e) {
    if (active) error.value = e instanceof Error ? e.message : '邀请加载失败'
  } finally {
    if (active) loading.value = false
  }
}

async function acceptInvite() {
  if (loading.value || !inviter.value) return
  loading.value = true
  error.value = ''
  try {
    await request('/invite/accept', 'POST', { code: code.value })
    if (!active) return
    uni.showToast({ title: '绑定成功', icon: 'success' })
    if (getCurrentPages().length > 1) uni.navigateBack()
    else uni.reLaunch({ url: '/pages/index/index' })
  } catch (e) {
    if (active) {
      hasSession.value = Boolean(uni.getStorageSync('session'))
      error.value = e instanceof Error ? e.message : '绑定失败'
    }
  } finally {
    if (active) loading.value = false
  }
}

async function loginAndAccept() {
  if (loading.value || !inviter.value) return
  loading.value = true
  error.value = ''
  try {
    await login()
    hasSession.value = true
    await request('/invite/accept', 'POST', { code: code.value })
    if (!active) return
    uni.showToast({ title: '注册并绑定成功', icon: 'success' })
    uni.reLaunch({ url: '/pages/index/index' })
  } catch (e) {
    if (active) error.value = e instanceof Error ? e.message : '登录绑定失败'
  } finally {
    if (active) loading.value = false
  }
}

function copyCode() {
  if (code.value) uni.setClipboardData({ data: code.value })
}

function shareInvite() {
  if (!code.value) return
  shareText({ title: '加入小记', content: `${me.value?.nickname || '你的好友'} 邀请你加入小记，邀请码：${code.value}` })
}

function backToLogin() {
  uni.reLaunch({ url: '/pages/index/index' })
}

onLoad(options => {
  mode.value = options?.mode === 'invite' ? 'invite' : 'join'
  // #ifdef MP-WEIXIN
  uni.hideShareMenu({ hideShareItems: ['shareAppMessage'] })
  // #endif
  if (mode.value === 'invite') generateInvite()
  else if (typeof options?.code === 'string' && options.code.trim()) {
    code.value = options.code.trim().toUpperCase()
    previewSharedInvite()
  }
})
onShareAppMessage(() => ({
  title: `${me.value?.nickname || '你的好友'} 邀请你加入小记`,
  path: code.value ? `/pages/pair/pair?mode=join&code=${encodeURIComponent(code.value)}` : '/pages/pair/pair?mode=join',
}))
onUnload(() => { active = false })
</script>

<template>
  <view class="shell">
    <SubpageHeader :label="pageLabel" />

    <template v-if="mode === 'invite'">
      <view class="headline"><text>把小记，</text><text>分享给她。</text></view>
      <text class="subtitle">直接分享给另一半，对方打开后即可登录并绑定。</text>

      <view v-if="loading && !code" class="state">正在生成邀请码…</view>
      <view v-else-if="error && !code" class="state error-state">
        <text>{{ error }}</text>
        <button class="secondary" @click="generateInvite">重新生成</button>
      </view>
      <view v-else class="invite-card">
        <text class="card-label">你们的专属邀请码</text>
        <text class="invite-code">{{ code }}</text>
        <text class="card-hint">24 小时内有效 · 仅可使用一次</text>
      </view>
      <!-- #ifdef MP-WEIXIN --><button class="primary" open-type="share" :disabled="!code">分享给好友</button><!-- #endif -->
      <!-- #ifndef MP-WEIXIN --><button class="primary" :disabled="!code" @click="shareInvite">分享邀请码</button><!-- #endif -->
      <button class="secondary copy-button" :disabled="!code" @click="copyCode">复制邀请码</button>
      <text class="footnote"><!-- #ifdef MP-WEIXIN -->好友打开分享后，可直接微信注册并确认绑定。<!-- #endif --><!-- #ifndef MP-WEIXIN -->好友安装并登录小记后，输入邀请码即可绑定。<!-- #endif --></text>
    </template>

    <template v-else>
      <view class="headline"><text>加入彼此的</text><text>日常。</text></view>
      <text class="subtitle">输入她发来的邀请码，确认后就能一起记录。</text>

      <text class="label">另一半的邀请码</text>
      <input v-model="code" maxlength="12" placeholder="输入 12 位邀请码" @input="inviter = ''; error = ''" />
      <button class="primary" :disabled="loading || !code.trim()" @click="checkInvite">{{ loading && !inviter ? '查询中…' : '查看邀请' }}</button>
      <text v-if="error" class="error">{{ error }}</text>

      <view v-if="inviter" class="confirm-card">
        <view class="avatar">{{ inviter.slice(0, 1) }}</view>
        <text class="confirm-title">{{ inviter }} 邀请你绑定</text>
        <text class="card-hint">确认后可使用双人共享备忘和提醒。</text>
        <button v-if="hasSession" class="confirm" :disabled="loading" @click="acceptInvite">{{ loading ? '绑定中…' : '确认绑定' }}</button>
        <!-- #ifdef MP-WEIXIN --><button v-else class="confirm" :disabled="loading" @click="loginAndAccept">{{ loading ? '登录绑定中…' : '微信登录并绑定' }}</button><!-- #endif -->
        <!-- #ifndef MP-WEIXIN --><button v-else class="confirm" @click="backToLogin">先登录，再输入邀请码</button><!-- #endif -->
      </view>
    </template>
  </view>
</template>

<style scoped>
.shell{max-width:640px;min-height:100vh;margin:auto;padding:calc(8px + var(--status-bar-height)) 24px calc(48px + env(safe-area-inset-bottom));background:#faf8f2;color:#3e382d}.headline{display:block;margin:4px 0 8px;font-size:31px;font-weight:600;line-height:1.38;letter-spacing:-.7px}.headline text{display:block}.subtitle{display:block;margin-top:12px;color:#786d5b;font-size:14px;line-height:1.75}.state{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;min-height:250px;color:#786d5b;text-align:center}.error-state{color:#9b4b40}.invite-card{padding:27px 20px;margin-top:31px;border:1px solid #efd98d;border-radius:22px;background:#f7e7ad;text-align:center}.card-label{display:block;color:#745b23;font-size:12px}.invite-code{display:block;margin:16px 0 12px;font-size:28px;font-weight:700;letter-spacing:2px;line-height:1.35;overflow-wrap:anywhere;font-variant-numeric:tabular-nums}.card-hint{display:block;color:#786d5b;font-size:12px;line-height:1.6}.primary,.confirm,.secondary{display:flex;align-items:center;justify-content:center;width:100%;height:50px;margin-top:15px;border:0;border-radius:15px;background:#494032;color:#fff9e9;font-size:14px}.primary::after,.confirm::after,.secondary::after{border:0}.primary[disabled],.confirm[disabled]{border:1px solid #ddd3c3;background:#e8e1d3;color:#8a7e6a;opacity:1}.secondary{width:150px;background:#fff;color:#494032;border:1px solid #ece5d6}.footnote{display:block;margin-top:13px;color:#786d5b;font-size:11px;text-align:center}.label{display:block;margin:30px 0 9px;color:#786d5b;font-size:12px}input{width:100%;height:50px;padding:0 14px;border:1px solid #ece5d6;border-radius:14px;background:#fff;color:#3e382d}.error{display:block;margin-top:12px;padding:11px 13px;border-radius:11px;background:#fff0e9;color:#ae4b3b;font-size:12px}.confirm-card{display:flex;flex-direction:column;align-items:center;padding:23px;margin-top:20px;border:1px solid #efd98d;border-radius:21px;background:#f7e7ad;text-align:center}.avatar{display:flex;align-items:center;justify-content:center;width:52px;height:52px;margin-bottom:12px;border-radius:50%;background:#fff9e9;color:#494032;font-size:20px;font-weight:600}.confirm-title{font-size:17px;font-weight:600}.confirm-card .card-hint{margin-top:7px}.confirm{background:#494032}
.copy-button{width:100%;margin-top:10px}.secondary.copy-button[disabled]{border:1px solid #ddd3c3;background:#e8e1d3;color:#8a7e6a;opacity:1}
/* #ifdef MP-WEIXIN */
.shell{padding-top:0}
/* #endif */
/* #ifdef H5 */
.shell{padding-top:calc(22px + env(safe-area-inset-top))}
/* #endif */
/* #ifdef APP-PLUS */
.shell{padding-top:calc(12px + var(--status-bar-height))}
/* #endif */
@media(max-width:360px){.shell{padding-left:20px;padding-right:20px}.headline{font-size:28px}.invite-code{font-size:24px;letter-spacing:1.5px}}
.shell{padding-left:calc(24px + env(safe-area-inset-left));padding-right:calc(24px + env(safe-area-inset-right))}
@media(max-width:360px){.shell{padding-left:calc(20px + env(safe-area-inset-left));padding-right:calc(20px + env(safe-area-inset-right))}}
</style>
