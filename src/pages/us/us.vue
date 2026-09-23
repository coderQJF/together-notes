<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import SubpageHeader from '../../components/SubpageHeader.vue'
import { request, type User } from '../../services/api'
import { clearLocalReminders } from '../../services/local-reminders'

type AppCredentialStatus = { configured: boolean; username: string | null }

const user = ref<User | null>(null)
const nickname = ref('')
const ready = ref(false)
const pending = ref(false)
const error = ref('')
const editingNickname = ref(false)
const deletingAccount = ref(false)
const deletePassword = ref('')
const appCredentialStatus = ref<AppCredentialStatus>({ configured: false, username: null })
const editingAppCredential = ref(false)
const appUsername = ref('')
const appPassword = ref('')
const appPasswordConfirm = ref('')
let pageResetTimer: ReturnType<typeof setTimeout> | undefined
let showAppCredentialSetup = false
// #ifdef MP-WEIXIN
showAppCredentialSetup = true
// #endif
// #ifdef H5
showAppCredentialSetup = import.meta.env.VITE_QA_MP_CREDENTIAL === '1'
// #endif
const canSaveNickname = computed(() => Boolean(nickname.value.trim() && nickname.value.trim() !== user.value?.nickname && !pending.value))
const canSaveAppCredential = computed(() => Boolean(appUsername.value.trim() && appPassword.value.length >= 8 && appPassword.value === appPasswordConfirm.value && !pending.value))

function resetPageAfterCredentialFormCloses() {
  nextTick(() => {
    uni.pageScrollTo({ scrollTop: 0, duration: 0 })
    clearTimeout(pageResetTimer)
    pageResetTimer = setTimeout(() => uni.pageScrollTo({ scrollTop: 0, duration: 0 }), 80)
  })
}

async function load() {
  error.value = ''
  try {
    user.value = await request<User>('/me')
    nickname.value = user.value.nickname
    if (showAppCredentialSetup) appCredentialStatus.value = await request<AppCredentialStatus>('/me/app-credentials')
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
    editingNickname.value = false
    uni.showToast({ title: '昵称已保存', icon: 'success' })
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : '昵称保存失败'
  } finally {
    pending.value = false
  }
}

function beginNicknameEdit() {
  nickname.value = user.value?.nickname || ''
  error.value = ''
  editingNickname.value = true
}

function cancelNicknameEdit() {
  nickname.value = user.value?.nickname || ''
  error.value = ''
  editingNickname.value = false
}

function beginAppCredentialEdit() {
  appUsername.value = appCredentialStatus.value.username || ''
  appPassword.value = ''
  appPasswordConfirm.value = ''
  error.value = ''
  editingAppCredential.value = true
}

function cancelAppCredentialEdit() {
  appUsername.value = ''
  appPassword.value = ''
  appPasswordConfirm.value = ''
  error.value = ''
  editingAppCredential.value = false
  resetPageAfterCredentialFormCloses()
}

async function saveAppCredential() {
  if (pending.value) return
  const username = appUsername.value.trim().toLowerCase()
  if (!/^[a-z0-9][a-z0-9_.-]{3,31}$/.test(username)) {
    error.value = '账号请填写 4—32 位小写字母、数字、点、横线或下划线'
    return
  }
  if (appPassword.value.length < 8) {
    error.value = '密码至少需要 8 个字符'
    return
  }
  if (appPassword.value !== appPasswordConfirm.value) {
    error.value = '两次输入的密码不一致'
    return
  }
  pending.value = true
  error.value = ''
  try {
    appCredentialStatus.value = await request<AppCredentialStatus>('/me/app-credentials', 'PUT', { username, password: appPassword.value, acceptedTerms: true })
    appUsername.value = ''
    appPassword.value = ''
    appPasswordConfirm.value = ''
    editingAppCredential.value = false
    resetPageAfterCredentialFormCloses()
    uni.showToast({ title: 'App 登录方式已保存', icon: 'success' })
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : 'App 登录方式保存失败'
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
    clearLocalReminders()
    pending.value = false
    uni.reLaunch({ url: '/pages/index/index' })
  }
}

function openLegal(document: 'terms' | 'privacy') {
  uni.navigateTo({ url: `/pages/legal/legal?document=${document}` })
}

function beginDeleteAccount() {
  if (pending.value) return
  uni.showModal({
    title: '注销账号？',
    content: '注销会删除你创建的小记、提醒和附件，并解除双人绑定。此操作不可恢复。',
    confirmText: '继续注销',
    confirmColor: '#ae4b3b',
    success: result => {
      if (!result.confirm) return
      deletePassword.value = ''
      error.value = ''
      deletingAccount.value = true
    },
  })
}

function cancelDeleteAccount() {
  deletePassword.value = ''
  error.value = ''
  deletingAccount.value = false
}

async function deleteAccount() {
  if (pending.value || !deletePassword.value) return
  pending.value = true
  error.value = ''
  try {
    await request('/me', 'DELETE', { password: deletePassword.value })
    uni.removeStorageSync('session')
    clearLocalReminders()
    uni.showToast({ title: '账号已注销', icon: 'success' })
    setTimeout(() => uni.reLaunch({ url: '/pages/index/index' }), 500)
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : '账号注销失败'
  } finally {
    deletePassword.value = ''
    pending.value = false
  }
}

onShow(load)
onUnmounted(() => clearTimeout(pageResetTimer))
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
        <image class="heart" src="/static/nav-icons/heart-active.png" mode="aspectFit" aria-hidden="true" />
        <view class="avatar">{{ user.partner?.nickname?.slice(0, 1) || '？' }}</view>
      </view>
      <view class="identity-row">
        <text class="couple-name">{{ user.nickname }}<template v-if="user.partner"> &amp; {{ user.partner.nickname }}</template></text>
        <button v-if="!editingNickname" class="edit-nickname" aria-label="编辑我的昵称" @click="beginNicknameEdit"><view class="pencil-icon" /><text>编辑</text></button>
      </view>

      <view v-if="editingNickname" class="nickname-editor">
        <text class="label">我的昵称</text>
        <input v-model="nickname" maxlength="20" placeholder="填写昵称" confirm-type="done" :focus="true" @confirm="saveNickname" />
        <view class="nickname-actions">
          <button class="cancel" :disabled="pending" @click="cancelNicknameEdit">取消</button>
          <button class="save" :disabled="!canSaveNickname" @click="saveNickname">{{ pending ? '保存中…' : '保存' }}</button>
        </view>
      </view>

      <view v-if="user.partner" class="pair-card bound">
        <view class="bound-title"><text>已经绑定</text><image class="mini-heart" src="/static/nav-icons/heart-active.png" mode="aspectFit" /></view>
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

      <!-- #ifndef APP-PLUS -->
      <view v-if="showAppCredentialSetup" class="account-card app-login-card">
        <view class="account-heading">
          <view><text class="account-title">在 Android App 登录</text><text class="credential-intro">沿用当前小程序账号和全部数据，不会创建新账号。</text></view>
          <button v-if="!editingAppCredential" class="account-edit" @click="beginAppCredentialEdit">{{ appCredentialStatus.configured ? '修改' : '设置' }}</button>
        </view>
        <view v-if="!editingAppCredential" class="credential-summary">
          <text class="credential-label">App 登录账号</text>
          <text class="credential-username">{{ appCredentialStatus.username || '尚未设置' }}</text>
          <text class="credential-help">{{ appCredentialStatus.configured ? '打开 App 后选择“已有账号”，使用这里的账号和密码登录。' : '安装 App 前先在这里设置一次账号和密码。' }}</text>
        </view>
        <view v-else class="credential-form">
          <text class="label">App 登录账号</text>
          <input v-model="appUsername" maxlength="32" placeholder="4—32 位小写字母、数字或符号" confirm-type="next" />
          <text class="label">App 登录密码</text>
          <input v-model="appPassword" password maxlength="128" placeholder="至少 8 个字符" confirm-type="next" />
          <text class="label">再次输入密码</text>
          <input v-model="appPasswordConfirm" password maxlength="128" placeholder="再次输入同一密码" confirm-type="done" @confirm="saveAppCredential" />
          <text class="credential-terms">保存即表示继续同意用户协议和隐私政策。</text>
          <view class="credential-actions"><button class="cancel" :disabled="pending" @click="cancelAppCredentialEdit">取消</button><button class="credential-save" :disabled="!canSaveAppCredential" @click="saveAppCredential">{{ pending ? '保存中…' : '保存' }}</button></view>
        </view>
      </view>
      <!-- #endif -->

      <!-- #ifdef APP-PLUS -->
      <view class="account-card">
        <text class="account-title">账号与数据</text>
        <view class="legal-actions"><button @click="openLegal('terms')">用户协议</button><button @click="openLegal('privacy')">隐私政策</button></view>
        <template v-if="deletingAccount">
          <text class="delete-warning">输入当前密码确认注销。本人创建的数据和附件会永久删除，另一方保留自己创建的私人内容。</text>
          <input v-model="deletePassword" password maxlength="128" placeholder="当前密码" confirm-type="done" @confirm="deleteAccount" />
          <view class="delete-actions"><button class="cancel" :disabled="pending" @click="cancelDeleteAccount">取消</button><button class="delete-confirm" :disabled="pending || !deletePassword" @click="deleteAccount">{{ pending ? '注销中…' : '永久注销' }}</button></view>
        </template>
        <button v-else class="delete-trigger" :disabled="pending" @click="beginDeleteAccount">注销账号</button>
      </view>
      <!-- #endif -->

      <text v-if="error" class="error">{{ error }}</text>
      <button class="logout" :disabled="pending" @click="logout">退出登录</button>
    </template>
  </view>
</template>

<style scoped>
.shell{max-width:640px;min-height:100vh;margin:auto;padding:0 24px calc(42px + env(safe-area-inset-bottom));box-sizing:border-box;background:#faf8f2;color:#3e382d}.state{display:flex;min-height:60vh;flex-direction:column;align-items:center;justify-content:center;gap:15px;color:#786d5b;text-align:center}.error-state{color:#9b4b40}.headline{margin:1px 0 10px;font-size:34px;font-weight:650;line-height:1.28;letter-spacing:-1px}.headline text{display:block}.subtitle{display:block;color:#786d5b;font-size:15px;line-height:1.7}.couple{display:flex;align-items:center;gap:23px;margin:32px 0 20px}.avatar{display:flex;width:64px;height:64px;align-items:center;justify-content:center;border:1px solid #efd98d;border-radius:50%;background:#f7e7ad;font-size:25px;font-weight:600}.avatar.self{background:#494032;color:#fff9e9}.heart{display:block;width:31px;height:31px;flex:0 0 31px}.mini-heart{display:block;width:19px;height:19px;flex:0 0 19px}.identity-row{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:17px}.couple-name{display:block;min-width:0;font-size:20px;font-weight:600;line-height:1.5;word-break:break-word}.edit-nickname{display:flex;align-items:center;justify-content:center;gap:6px;width:auto;height:44px;min-height:44px;flex:0 0 auto;margin:-7px -8px -7px 0;padding:0 8px;border:0;background:transparent;color:#786d5b;font-size:12px}.pencil-icon{position:relative;width:13px;height:13px;transform:rotate(-45deg)}.pencil-icon::before{content:'';position:absolute;left:5px;top:0;width:4px;height:10px;border:1.5px solid currentColor;border-radius:2px}.pencil-icon::after{content:'';position:absolute;left:5px;top:11px;width:7px;border-top:1.5px solid currentColor;transform:rotate(45deg);transform-origin:left}.nickname-editor{padding:17px;margin:0 0 17px;border:1px solid #e5dece;border-radius:18px;background:#fff}.nickname-actions{display:grid;grid-template-columns:1fr 1.5fr;gap:10px;margin-top:11px}.pair-card{padding:22px;margin-bottom:25px;border:1px solid #efd98d;border-radius:22px;background:#f7e7ad}.pair-card>text{display:block;color:#786d5b;font-size:13px;line-height:1.7}.pair-title,.bound-title{margin-bottom:8px!important;color:#3e382d!important;font-size:19px!important;font-weight:600}.bound-title{display:flex;align-items:center;gap:8px}.pair-actions{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:17px}.pair-actions button,.save,.cancel,.logout,.state button{display:flex;align-items:center;justify-content:center;height:48px;min-height:48px;margin:0;border-radius:14px;font-size:14px}.primary{border:0;background:#494032;color:#fff9e9}.secondary,.cancel{border:1px solid #ded5c4;background:#fff;color:#494032}.label{display:block;margin:0 0 9px;color:#786d5b;font-size:13px}input{width:100%;height:52px;padding:0 15px;box-sizing:border-box;border:1px solid #e5dece;border-radius:15px;background:#faf8f2;color:#3e382d;font-size:15px}.save{width:100%;border:0;background:#494032;color:#fff9e9}.save[disabled],.cancel[disabled],.logout[disabled]{opacity:.55}.error{display:block;margin-top:12px;color:#9b4b40;font-size:12px}.logout{width:100%;margin-top:26px;border:1px solid #e5dece;background:transparent;color:#786d5b}.account-card{padding:20px;margin:0 0 18px;border:1px solid #ece5d6;border-radius:20px;background:#fff}.account-title{display:block;font-size:17px;font-weight:600}.account-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.account-heading>view{min-width:0}.account-edit{display:flex;align-items:center;justify-content:center;width:auto;min-width:52px;height:44px;min-height:44px;flex:0 0 auto;margin:-9px -9px 0 0;padding:0 9px;border:0;background:transparent;color:#806a37;font-size:12px}.credential-intro,.credential-help,.credential-terms{display:block;color:#786d5b;font-size:12px;line-height:1.65}.credential-intro{margin-top:6px}.credential-summary{padding:14px;margin-top:15px;border-radius:14px;background:#faf8f2}.credential-label{display:block;color:#8d816d;font-size:11px}.credential-username{display:block;margin-top:4px;color:#494032;font-size:16px;font-weight:600;word-break:break-all}.credential-help{margin-top:9px}.credential-form{margin-top:16px}.credential-form .label{margin:12px 0 7px}.credential-terms{margin-top:10px}.credential-actions{display:grid;grid-template-columns:1fr 1.5fr;gap:10px;margin-top:13px}.credential-actions button{display:flex;align-items:center;justify-content:center;height:46px;min-height:46px;margin:0;border-radius:13px}.credential-save{border:0;background:#494032;color:#fff9e9}.credential-save[disabled]{opacity:.5}.legal-actions{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px}.legal-actions button{height:44px;min-height:44px;margin:0;border:0;background:#faf8f2;color:#806a37;font-size:12px}.delete-trigger{display:flex;align-items:center;justify-content:center;width:100%;height:44px;min-height:44px;margin:14px 0 0;border:1px solid #eadfd1;border-radius:13px;background:#fff;color:#ae4b3b}.delete-warning{display:block;margin:15px 0 11px;color:#8c523f;font-size:12px;line-height:1.7}.delete-actions{display:grid;grid-template-columns:1fr 1.4fr;gap:10px;margin-top:11px}.delete-actions button{height:46px;min-height:46px;margin:0;border-radius:13px}.delete-confirm{border:0;background:#ae4b3b;color:#fff}.delete-confirm[disabled],.delete-trigger[disabled]{opacity:.55}.shell button::after{border:0}@media(max-width:360px){.shell{padding-left:20px;padding-right:20px}.headline{font-size:31px}.identity-row{align-items:flex-start}.pair-card{padding:19px}.pair-actions{grid-template-columns:1fr}}.shell{padding-left:calc(24px + env(safe-area-inset-left));padding-right:calc(24px + env(safe-area-inset-right))}@media(max-width:360px){.shell{padding-left:calc(20px + env(safe-area-inset-left));padding-right:calc(20px + env(safe-area-inset-right))}}
</style>
