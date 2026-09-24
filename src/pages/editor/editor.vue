<script setup lang="ts">
import { computed, ref } from 'vue'
import { onLoad, onUnload } from '@dcloudio/uni-app'
import SubpageHeader from '../../components/SubpageHeader.vue'
import TimePickerField from '../../components/TimePickerField.vue'
import { attachFile, request, type Item, type User } from '../../services/api'
import { syncHomeWidgetNotes } from '../../services/home-widget'
import { requestLocalReminderPermissions, scheduleLocalReminderForUser } from '../../services/local-reminders'
import { dateInputValue, timeInputValue } from '../../utils/date'

const empty = (kind: 'note' | 'reminder'): Item => ({
  kind,
  title: '',
  content: '',
  links: [],
  attachments: [],
  scope: 'mine',
  repeat: 'none',
  recipient: 'me',
  advance: 0,
  done: false,
})

const user = ref<User | null>(null)
const draft = ref<Item>(empty('note'))
const linkText = ref('')
const date = ref('')
const time = ref('19:00')
const loading = ref(true)
const pending = ref('')
const error = ref('')
const editingExisting = ref(false)
const wechatStatus = ref<{ configured: boolean; templateId: string | null }>({ configured: false, templateId: null })
const wechatAccepted = ref(false)
let active = true
let closing = false

const pageLabel = computed(() => editingExisting.value
  ? '编辑内容'
  : `添加${draft.value.kind === 'note' ? '随记' : '提醒'}`)
const headline = computed(() => draft.value.id ? '再改一改。' : draft.value.kind === 'note' ? '记一笔。' : '别忘了这场。')
const isGuestEditor = computed(() => Boolean(draft.value.owner && draft.value.owner !== user.value?.id))
const canSubscribeSelf = computed(() => {
  if (draft.value.kind !== 'reminder' || !user.value) return false
  if (draft.value.recipient === 'both') return true
  return isGuestEditor.value ? draft.value.recipient === 'partner' : draft.value.recipient === 'me'
})

function syncDateFields() {
  const source = draft.value.nextAt ? new Date(draft.value.nextAt) : new Date(Date.now() + 3600000)
  date.value = dateInputValue(source)
  time.value = timeInputValue(source)
}

async function load(options?: Record<string, string | undefined>) {
  loading.value = true
  error.value = ''
  try {
    const id = options?.id ? decodeURIComponent(options.id) : ''
    if (id) {
      const [nextUser, nextDraft] = await Promise.all([
        request<User>('/me'),
        request<Item>(`/items/${encodeURIComponent(id)}`),
      ])
      user.value = nextUser
      draft.value = nextDraft
    } else {
      user.value = await request<User>('/me')
      if (options?.title) draft.value.title = decodeURIComponent(options.title).slice(0, 100)
      if (options?.content) draft.value.content = decodeURIComponent(options.content).slice(0, 50000)
      if (options?.at && Number.isFinite(Number(options.at))) draft.value.nextAt = new Date(Number(options.at)).toISOString()
    }
    linkText.value = (draft.value.links || []).join('\n')
    syncDateFields()
    // #ifdef MP-WEIXIN
    try { wechatStatus.value = await request('/wechat/subscription/status') } catch { wechatStatus.value = { configured: false, templateId: null } }
    // #endif
  } catch (e) {
    error.value = e instanceof Error ? e.message : '内容加载失败'
  } finally {
    loading.value = false
  }
}

async function addAttachment() {
  if (pending.value) return
  if ((draft.value.attachments || []).length >= 10) {
    uni.showToast({ title: '最多 10 个附件', icon: 'none' })
    return
  }
  pending.value = 'attachment'
  try {
    const attachment = await attachFile()
    draft.value.attachments = [...(draft.value.attachments || []), attachment]
  } catch (e) {
    const message = e instanceof Error ? e.message : '添加附件失败'
    if (message !== '未选择文件' && message !== '未选择图片') uni.showToast({ title: message, icon: 'none' })
  } finally {
    pending.value = ''
  }
}

function recipientChange(event: any) {
  draft.value.recipient = ['me', 'partner', 'both'][Number(event.detail.value)]
  if (draft.value.recipient !== 'me') draft.value.scope = 'shared'
  if (!canSubscribeSelf.value) wechatAccepted.value = false
}

async function wechatChange(event: any) {
  if (!event.detail.value) { wechatAccepted.value = false; return }
  const templateId = wechatStatus.value.templateId
  if (!templateId || !canSubscribeSelf.value) return
  // #ifdef MP-WEIXIN
  try {
    const result = await new Promise<Record<string, string>>((resolve, reject) => (uni as any).requestSubscribeMessage({ tmplIds: [templateId], success: resolve, fail: reject }))
    wechatAccepted.value = result[templateId] === 'accept'
    if (!wechatAccepted.value) uni.showToast({ title: '未授权，将保留站内提醒', icon: 'none' })
  } catch {
    wechatAccepted.value = false
    uni.showToast({ title: '微信提醒授权未完成', icon: 'none' })
  }
  // #endif
}

function setPinned(event: any) {
  draft.value.pinned = Boolean(event.detail.value)
}

function returnToPrevious() {
  if (!active) return
  if (getCurrentPages().length > 1) uni.navigateBack()
  else uni.reLaunch({ url: '/pages/index/index' })
}

async function save() {
  if (pending.value) return
  if (!draft.value.title.trim()) {
    uni.showToast({ title: '请填写标题', icon: 'none' })
    return
  }
  const links = linkText.value.split('\n').map(value => value.trim()).filter(Boolean)
  if (links.some(value => !/^https?:\/\//i.test(value))) {
    uni.showToast({ title: '链接需以 http:// 或 https:// 开头', icon: 'none' })
    return
  }
  draft.value.links = links
  if (draft.value.kind === 'reminder') {
    const nextAt = new Date(`${date.value}T${time.value}:00`)
    if (Number.isNaN(nextAt.getTime())) {
      uni.showToast({ title: '请选择提醒时间', icon: 'none' })
      return
    }
    draft.value.nextAt = nextAt.toISOString()
  }
  pending.value = 'save'
  try {
    const saved = await request<Item & { wechatSubscribed?: boolean }>(draft.value.id ? `/items/${encodeURIComponent(draft.value.id)}` : '/items', draft.value.id ? 'PUT' : 'POST', { ...draft.value, wechatSubscribe: wechatAccepted.value && canSubscribeSelf.value })
    if (!active) return
    // #ifdef APP-PLUS
    request<Item[]>('/items').then(syncHomeWidgetNotes).catch(() => {})
    // #endif
    const localReminderScheduled = saved.kind === 'reminder' && user.value ? scheduleLocalReminderForUser(saved, user.value) : false
    if (localReminderScheduled) requestLocalReminderPermissions()
    closing = true
    uni.showToast({ title: saved.wechatSubscribed ? '已保存并开启微信提醒' : localReminderScheduled ? '已保存并设置本机提醒' : '已保存', icon: 'success' })
    returnToPrevious()
  } catch (e) {
    if (active) uni.showToast({ title: e instanceof Error ? e.message : '保存失败', icon: 'none' })
  } finally {
    if (active && !closing) pending.value = ''
  }
}

onLoad(options => {
  const routeOptions = options as Record<string, string | undefined>
  editingExisting.value = Boolean(routeOptions?.id)
  draft.value = empty(routeOptions?.kind === 'reminder' ? 'reminder' : 'note')
  load(routeOptions)
})
onUnload(() => { active = false })
</script>

<template>
  <view class="shell">
    <SubpageHeader :label="pageLabel" />

    <view v-if="loading" class="state">正在准备…</view>
    <view v-else-if="error" class="state">
      <text class="state-title">暂时无法编辑</text>
      <text class="muted">{{ error }}</text>
    </view>

    <view v-else class="form">
      <text class="headline">{{ headline }}</text>

      <text class="label">标题</text>
      <input v-model="draft.title" maxlength="100" placeholder="想记下什么？" />

      <text class="label">内容</text>
      <textarea class="content-input" v-model="draft.content" maxlength="50000" placeholder="文字、清单，或者想对她说的话…" disable-default-padding />

      <text class="label">链接（每行一个）</text>
      <textarea class="links-input" v-model="linkText" placeholder="https://…" disable-default-padding />

      <text class="label">附件</text>
      <view v-for="(attachment, index) in draft.attachments" :key="attachment.id" class="setting">
        <view class="setting-copy">
          <text class="setting-title">{{ attachment.name }}</text>
          <text class="muted small">{{ Math.max(1, Math.round(attachment.size / 1024)) }} KB</text>
        </view>
        <button class="remove-file" @click="draft.attachments?.splice(index, 1)">移除</button>
      </view>
      <button class="attachment-button" :disabled="Boolean(pending)" @click="addAttachment">
        <view v-if="pending === 'attachment'" class="spinner" />
        <view v-else class="mini-plus" />
        <text>{{ pending === 'attachment' ? '选择中…' : '添加附件' }}<!-- #ifdef APP-PLUS -->（图片）<!-- #endif --></text>
      </button>
      <text class="muted small hint">单个最大 12MB，最多 10 个。<!-- #ifdef APP-PLUS -->内测版 App 暂支持图片附件。<!-- #endif --></text>

      <text class="label">可见范围</text>
      <view v-if="isGuestEditor" class="picker readonly">
        <text>我们俩 · 共同编辑</text>
        <text class="muted small">创建者管理范围</text>
      </view>
      <picker v-else :range="['仅自己', '我们俩']" :value="draft.scope === 'shared' ? 1 : 0" @change="draft.scope = Number($event.detail.value) ? 'shared' : 'mine'">
        <view class="picker">
          <text>{{ draft.scope === 'shared' ? '我们俩 · 共同编辑' : '仅自己可见' }}</text>
          <view class="chevron-down" />
        </view>
      </picker>
      <text v-if="!isGuestEditor && !user?.partner" class="muted small hint">绑定另一半后可以共享。</text>

      <template v-if="draft.kind === 'reminder'">
        <text class="label">提醒时间</text>
        <view class="date-row">
          <picker mode="date" :value="date" @change="date = $event.detail.value">
            <view class="picker"><text>{{ date }}</text><view class="chevron-down" /></view>
          </picker>
          <TimePickerField v-model="time" class="time-picker" />
        </view>

        <text class="label">重复</text>
        <picker :range="['不重复', '每天', '每周']" :value="['none', 'daily', 'weekly'].indexOf(draft.repeat || 'none')" @change="draft.repeat = ['none', 'daily', 'weekly'][Number($event.detail.value)]">
          <view class="picker">
            <text>{{ ({ none: '不重复', daily: '每天', weekly: '每周' } as Record<string, string>)[draft.repeat || 'none'] }}</text>
            <view class="chevron-down" />
          </view>
        </picker>

        <text class="label">提前多久</text>
        <picker :range="['准时', '15 分钟', '30 分钟', '1 小时']" :value="[0, 15, 30, 60].indexOf(draft.advance || 0)" @change="draft.advance = [0, 15, 30, 60][Number($event.detail.value)]">
          <view class="picker">
            <text>{{ draft.advance ? `提前 ${draft.advance} 分钟` : '准时' }}</text>
            <view class="chevron-down" />
          </view>
        </picker>

        <text class="label">提醒谁</text>
        <picker :range="isGuestEditor ? ['创建者', '创建者的另一半', '我们俩'] : ['我', '另一半', '我们俩']" :value="['me', 'partner', 'both'].indexOf(draft.recipient || 'me')" @change="recipientChange">
          <view class="picker">
            <text>{{ isGuestEditor ? ({ me: '创建者', partner: '创建者的另一半', both: '我们俩' } as Record<string, string>)[draft.recipient || 'me'] : ({ me: '我', partner: '另一半', both: '我们俩' } as Record<string, string>)[draft.recipient || 'me'] }}</text>
            <view class="chevron-down" />
          </view>
        </picker>
        <!-- #ifdef MP-WEIXIN -->
        <text class="muted small hint">站内提醒始终保留；微信服务通知需要你单次授权。</text>
        <!-- #endif -->
        <!-- #ifdef H5 --><text class="muted small hint">当前提供站内消息，关闭页面后不会弹出系统通知。</text><!-- #endif -->
        <!-- #ifdef APP-PLUS --><text class="muted small hint">提醒会同步到本机系统；允许通知权限后，划掉 App 仍会按时弹出。对方在你离线期间新建的提醒，会在下次打开 App 后同步。</text><!-- #endif -->
        <!-- #ifdef MP-WEIXIN -->
        <view v-if="wechatStatus.configured" class="setting wechat-setting">
          <view class="setting-copy">
            <text class="setting-title">微信服务通知</text>
            <text class="muted small">{{ canSubscribeSelf ? (wechatAccepted ? '已授权，本次提醒将发送一次微信通知' : '打开后由微信申请本次通知授权') : '提醒对象不包含你，需由对方自行授权' }}</text>
          </view>
          <switch color="#b28b35" :checked="wechatAccepted" :disabled="!canSubscribeSelf" @change="wechatChange" />
        </view>
        <text v-if="wechatStatus.configured && draft.repeat !== 'none'" class="muted small hint">一次授权只用于下一次提醒；重复提醒的后续周期需要再次授权。</text>
        <!-- #endif -->
      </template>

      <view v-else class="setting pin-setting">
        <view>
          <text class="setting-title">置顶这条备忘</text>
          <text class="muted small">在列表最前面显示</text>
        </view>
        <switch color="#b28b35" :checked="draft.pinned" @change="setPinned" />
      </view>

      <button class="primary" :disabled="Boolean(pending)" @click="save">
        <view v-if="pending === 'save'" class="spinner" />
        <text>{{ pending === 'save' ? '保存中…' : '保存' }}</text>
      </button>
    </view>
  </view>
</template>

<style scoped>
.shell{max-width:640px;min-height:100vh;margin:auto;padding:0 24px calc(42px + env(safe-area-inset-bottom));background:#faf8f2;color:#3e382d}.state{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;min-height:50vh;text-align:center;color:#786d5b}.state-title{font-size:20px;font-weight:600;color:#3e382d}.muted{color:#786d5b}.small{font-size:11px}.headline{display:block;margin:2px 0 8px;font-size:31px;font-weight:600;line-height:1.35;letter-spacing:-.6px}.label{display:block;margin:22px 0 9px;color:#786d5b;font-size:13px}.form input,.form textarea,.picker{width:100%;border:1px solid #ece5d6;border-radius:14px;background:#fff;color:#3e382d}.form input{height:50px;padding:0 14px}.form textarea{display:block;padding:14px;line-height:1.65;overflow-y:auto}.form .content-input{height:148px;min-height:148px;max-height:148px}.form .links-input{height:82px;min-height:82px;max-height:82px}.picker{display:flex;align-items:center;justify-content:space-between;min-height:50px;padding:0 14px;overflow-wrap:anywhere}.readonly{background:#f4f0e7}.chevron-down{width:8px;height:8px;flex:0 0 8px;margin:-4px 3px 0 12px;border-right:1.5px solid #786d5b;border-bottom:1.5px solid #786d5b;transform:rotate(45deg)}
.date-row{display:flex;gap:12px}.date-row>picker,.date-row>.time-picker{min-width:0;flex:1}.setting{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:62px;padding:12px 0;border-bottom:1px solid #ece5d6}.setting-copy{min-width:0;flex:1}.setting-title{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.hint{display:block;margin-top:9px;line-height:1.6}.remove-file{width:auto;min-width:56px;height:44px;min-height:44px;margin:0;padding:0 10px;border:0;background:transparent;color:#ae4b3b;font-size:12px}.remove-file::after{border:0}.attachment-button{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;height:48px;margin-top:12px;border:1px solid #ece5d6;border-radius:14px;background:#fff;color:#494032}.attachment-button::after{border:0}.mini-plus{position:relative;width:14px;height:14px}.mini-plus::before,.mini-plus::after{content:'';position:absolute;left:1px;top:6px;width:12px;height:1.5px;border-radius:2px;background:#494032}.mini-plus::after{transform:rotate(90deg)}.pin-setting{margin-top:20px}.pin-setting .small{display:block;margin-top:5px}
.wechat-setting{margin-top:13px;padding:14px;border:1px solid #e9dfc9;border-radius:16px;background:#fff}.wechat-setting .small{display:block;margin-top:5px;line-height:1.55;white-space:normal}.wechat-setting switch{flex:0 0 auto}
.primary{display:flex;align-items:center;justify-content:center;width:100%;height:50px;margin:28px 0 10px;border:0;border-radius:15px;background:#494032;color:#fff9e9;font-size:15px}.primary::after{border:0}.spinner{width:16px;height:16px;margin-right:8px;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;animation:spin .7s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}
@media(max-width:360px){.shell{padding-left:20px;padding-right:20px}.headline{font-size:29px}.date-row{gap:8px}}
.shell{padding-left:calc(24px + env(safe-area-inset-left));padding-right:calc(24px + env(safe-area-inset-right))}
@media(max-width:360px){.shell{padding-left:calc(20px + env(safe-area-inset-left));padding-right:calc(20px + env(safe-area-inset-right))}}
</style>
