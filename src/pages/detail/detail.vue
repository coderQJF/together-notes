<script setup lang="ts">
import { computed, ref } from 'vue'
import { onLoad, onShow, onUnload } from '@dcloudio/uni-app'
import SubpageHeader from '../../components/SubpageHeader.vue'
import { downloadFile, request, type Item, type User } from '../../services/api'
import { formatClock, formatCompactDateTime, formatDayHeading } from '../../utils/date'

const item = ref<Item | null>(null)
const user = ref<User | null>(null)
const loading = ref(true)
const error = ref('')
const pending = ref('')
let itemId = ''
let firstShow = true
let active = true

const scopeLabel = computed(() => item.value?.scope === 'shared' ? '我们俩' : '仅自己')
const repeatLabel = computed(() => ({ none: '单次', daily: '每天', weekly: '每周' } as Record<string, string>)[item.value?.repeat || 'none'])

async function load() {
  if (!itemId || pending.value === 'delete') return
  loading.value = !item.value
  error.value = ''
  try {
    const [itemResult, userResult] = await Promise.allSettled([
      request<Item>(`/items/${encodeURIComponent(itemId)}`),
      request<User>('/me'),
    ])
    if (itemResult.status === 'rejected') throw itemResult.reason
    item.value = itemResult.value
    user.value = userResult.status === 'fulfilled' ? userResult.value : null
  } catch (e) {
    error.value = e instanceof Error ? e.message : '内容加载失败'
  } finally {
    loading.value = false
  }
}

function edit() {
  if (!item.value?.id) return
  uni.navigateTo({ url: `/pages/editor/editor?id=${encodeURIComponent(item.value.id)}` })
}

function returnToPrevious() {
  if (!active) return
  if (getCurrentPages().length > 1) uni.navigateBack()
  else uni.reLaunch({ url: '/pages/index/index' })
}

function remove() {
  if (!item.value?.id || pending.value) return
  uni.showModal({
    title: '删除这条内容？',
    content: '删除后无法恢复。',
    success: result => {
      if (!result.confirm || !item.value?.id) return
      pending.value = 'delete'
      request(`/items/${encodeURIComponent(item.value.id)}`, 'DELETE')
        .then(() => {
          if (!active) return
          uni.showToast({ title: '已删除', icon: 'success' })
          returnToPrevious()
        })
        .catch(e => {
          if (!active) return
          pending.value = ''
          uni.showToast({ title: e instanceof Error ? e.message : '删除失败', icon: 'none' })
        })
    },
  })
}

function copy(value: string) {
  uni.setClipboardData({ data: value })
}

async function openAttachment(attachment: NonNullable<Item['attachments']>[number]) {
  if (pending.value) return
  pending.value = `file:${attachment.id}`
  try {
    await downloadFile(attachment)
  } catch (e) {
    uni.showToast({ title: e instanceof Error ? e.message : '附件打开失败', icon: 'none' })
  } finally {
    pending.value = ''
  }
}

onLoad(options => {
  itemId = typeof options?.id === 'string' ? decodeURIComponent(options.id) : ''
  if (!itemId) {
    loading.value = false
    error.value = '缺少内容编号'
    return
  }
  load()
})

onShow(() => {
  if (firstShow) {
    firstShow = false
    return
  }
  load()
})
onUnload(() => { active = false })
</script>

<template>
  <view class="shell">
    <SubpageHeader label="详情" />

    <view v-if="loading" class="state">
      <view class="loading-dot" />
      <text>正在打开…</text>
    </view>

    <view v-else-if="error || !item" class="state error-state">
      <text class="state-title">没有打开这条内容</text>
      <text class="muted">{{ error || '内容可能已被删除' }}</text>
      <button class="secondary" @click="load">重新加载</button>
    </view>

    <template v-else>
      <view class="meta-row">
        <view class="meta-tags">
          <text class="kind-tag">{{ item.kind === 'reminder' ? '提醒' : '随记' }}</text>
          <text class="scope-tag">{{ scopeLabel }}</text>
          <text v-if="item.pinned" class="pin-tag">置顶</text>
        </view>
        <text v-if="item.kind === 'note'" class="updated">{{ item.updatedAt ? formatCompactDateTime(item.updatedAt) : '随记详情' }}</text>
      </view>

      <text class="headline">{{ item.title }}</text>
      <text class="body-text">{{ item.content || '暂无正文' }}</text>

      <view v-if="item.kind === 'reminder'" class="reminder-card">
        <text class="card-kicker">提醒时间</text>
        <view v-if="item.nextAt" class="reminder-time">
          <text class="reminder-date">{{ formatDayHeading(item.nextAt) }}</text>
          <text class="reminder-clock">{{ formatClock(item.nextAt) }}</text>
        </view>
        <text v-else class="reminder-date">时间待设置</text>
        <view class="reminder-meta">
          <text>{{ item.advance ? `提前 ${item.advance} 分钟` : '准时提醒' }}</text>
          <text class="dot">·</text>
          <text>{{ repeatLabel }}</text>
          <text class="dot">·</text>
          <text>{{ item.done ? '已完成' : '待提醒' }}</text>
        </view>
      </view>

      <view v-if="item.attachments?.length" class="section">
        <text class="section-label">附件</text>
        <button v-for="attachment in item.attachments" :key="attachment.id" class="resource" @click="openAttachment(attachment)">
          <view class="resource-mark"><image class="resource-icon" src="/static/nav-icons/attachment-active.png" mode="aspectFit" /></view>
          <view class="resource-copy">
            <text class="resource-title">{{ attachment.name }}</text>
            <text class="muted small">{{ pending === `file:${attachment.id}` ? '正在打开…' : '点击下载或预览' }}</text>
          </view>
          <view class="chevron" />
        </button>
      </view>

      <view v-if="item.links.length" class="section">
        <text class="section-label">链接</text>
        <button v-for="link in item.links" :key="link" class="resource" @click="copy(link)">
          <view class="resource-mark"><image class="resource-icon" src="/static/nav-icons/link-active.png" mode="aspectFit" /></view>
          <view class="resource-copy">
            <text class="resource-title link-title">{{ link }}</text>
            <text class="muted small">点击复制链接</text>
          </view>
          <view class="chevron" />
        </button>
      </view>

      <view class="actions">
        <button class="primary" hover-class="none" @click="edit">编辑</button>
        <button v-if="item.owner === user?.id" class="danger" hover-class="none" :disabled="pending === 'delete'" @click="remove">
          {{ pending === 'delete' ? '删除中…' : '删除' }}
        </button>
      </view>
    </template>
  </view>
</template>

<style scoped>
.shell{max-width:640px;min-height:100vh;margin:auto;padding:calc(8px + var(--status-bar-height)) 24px calc(42px + env(safe-area-inset-bottom));background:#faf8f2;color:#3e382d}
.state{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;min-height:55vh;color:#786d5b;text-align:center}
.error-state{padding:30px}.state-title{font-size:20px;font-weight:600;color:#3e382d}.loading-dot{width:24px;height:24px;border:2px solid #e7d7a4;border-right-color:#494032;border-radius:50%;animation:spin .8s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}
.meta-row{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-top:4px}.meta-tags{display:flex;align-items:center;gap:6px;flex-shrink:0}.kind-tag,.scope-tag,.pin-tag{display:inline-flex;align-items:center;height:25px;padding:0 8px;border-radius:8px;background:#fff;border:1px solid #ece5d6;color:#786d5b;font-size:11px;white-space:nowrap}.pin-tag{background:#f7e7ad;border-color:#efd98d;color:#6c5624}.updated{min-width:0;color:#786d5b;font-size:11px;line-height:1.5;text-align:right;font-variant-numeric:tabular-nums}
.headline{display:block;margin:24px 0 14px;font-size:32px;font-weight:600;line-height:1.35;letter-spacing:-.6px;word-break:break-word}.body-text{display:block;min-height:48px;margin:0 0 28px;color:#4b4438;font-size:16px;line-height:1.9;white-space:pre-wrap;word-break:break-word}
.reminder-card{padding:21px;margin:8px 0 28px;border:1px solid #ece5d6;border-radius:21px;background:#fff}.card-kicker,.section-label{display:block;margin-bottom:12px;color:#786d5b;font-size:12px}.reminder-time{display:flex;align-items:flex-end;justify-content:space-between;gap:12px}.reminder-date{color:#62594a;font-size:14px;line-height:1.5}.reminder-clock{font-size:26px;font-weight:700;line-height:1.15;font-variant-numeric:tabular-nums;white-space:nowrap}.reminder-meta{display:flex;align-items:center;flex-wrap:wrap;gap:7px;margin-top:14px;color:#786d5b;font-size:13px}.dot{color:#a99b82}
.section{margin:26px 0}.resource{display:flex;align-items:center;gap:12px;width:100%;min-height:68px;margin:10px 0;padding:12px 14px;border:1px solid #ece5d6;border-radius:16px;background:#fff;color:#3e382d;text-align:left;line-height:1.4}.resource::after{border:0}.resource-mark{display:flex;align-items:center;justify-content:center;width:38px;height:38px;flex:0 0 38px;border-radius:12px;background:#f7e7ad}.resource-icon{display:block;width:20px;height:20px}.resource-copy{min-width:0;flex:1}.resource-title{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:14px}.link-title{color:#83692e}.small{display:block;margin-top:4px;font-size:11px}.muted{color:#786d5b}.chevron{width:8px;height:8px;flex:0 0 8px;margin-right:3px;border-top:1.5px solid #a79b87;border-right:1.5px solid #a79b87;transform:rotate(45deg)}
.actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-top:34px}.actions button{display:flex;align-items:center;justify-content:center;width:100%;height:50px;min-height:50px;margin:0;padding:0 16px;border-radius:15px;font-size:15px;line-height:normal}.actions button:only-child{grid-column:1/-1}.actions button::after{border:0}.primary{background:#494032;color:#fff9e9}.danger{border:1px solid #eadfd1;background:#fff;color:#ae4b3b}.secondary{min-width:140px;height:46px;margin-top:8px;border:1px solid #ece5d6;border-radius:14px;background:#fff;color:#494032}.secondary::after{border:0}
/* #ifdef MP-WEIXIN */
.shell{padding-top:0}
/* #endif */
/* #ifdef H5 */
.shell{padding-top:calc(22px + env(safe-area-inset-top))}
/* #endif */
/* #ifdef APP-PLUS */
.shell{padding-top:calc(12px + var(--status-bar-height))}
/* #endif */
@media(max-width:360px){.shell{padding-left:20px;padding-right:20px}.updated{max-width:122px}.headline{font-size:29px}.meta-tags{gap:4px}.kind-tag,.scope-tag,.pin-tag{padding-left:7px;padding-right:7px}.reminder-time{align-items:flex-start;flex-direction:column;gap:5px}.reminder-clock{font-size:27px}}
.shell{padding-left:calc(24px + env(safe-area-inset-left));padding-right:calc(24px + env(safe-area-inset-right))}
@media(max-width:360px){.shell{padding-left:calc(20px + env(safe-area-inset-left));padding-right:calc(20px + env(safe-area-inset-right))}}
</style>
