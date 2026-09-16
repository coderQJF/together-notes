<script setup lang="ts">
import { ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import SubpageHeader from '../../components/SubpageHeader.vue'
import { ApiError, apiAssetUrl, request } from '../../services/api'
import type { ContentMeta, NewsStory } from '../../types/content'
import { formatCompactDateTime, formatRelativeTime } from '../../utils/date'

const story = ref<NewsStory | null>(null)
const meta = ref<ContentMeta | null>(null)
const loading = ref(true)
const error = ref<ApiError | null>(null)
const saved = ref(false)
const imageBroken = ref(false)
let storyId = ''

async function loadStory(id: string) {
  loading.value = true
  error.value = null
  imageBroken.value = false
  try {
    const response = await request<{ story: NewsStory; meta: ContentMeta }>(`/content/news/${encodeURIComponent(id)}`)
    story.value = response.story
    meta.value = response.meta
    const stored = uni.getStorageSync('saved-news-stories')
    saved.value = Array.isArray(stored) && stored.includes(response.story.id)
  } catch (cause) {
    error.value = cause instanceof ApiError ? cause : new ApiError(cause instanceof Error ? cause.message : '获取新闻详情失败')
  } finally {
    loading.value = false
  }
}

function toggleSaved() {
  if (!story.value) return
  const stored = uni.getStorageSync('saved-news-stories')
  const ids: string[] = Array.isArray(stored) ? stored : []
  const next = ids.includes(story.value.id) ? ids.filter(id => id !== story.value?.id) : [...ids, story.value.id]
  uni.setStorageSync('saved-news-stories', next)
  saved.value = next.includes(story.value.id)
  uni.showToast({ title: saved.value ? '已收藏' : '已取消收藏', icon: 'none' })
}

function openOriginal() {
  if (!story.value?.originalUrl || !/^https?:\/\//i.test(story.value.originalUrl)) return
  // #ifdef H5
  window.open(story.value.originalUrl, '_blank', 'noopener,noreferrer')
  // #endif
  // #ifndef H5
  uni.setClipboardData({ data: story.value.originalUrl, success: () => uni.showToast({ title: '原文链接已复制', icon: 'none' }) })
  // #endif
}

onLoad(options => {
  storyId = typeof options?.id === 'string' ? decodeURIComponent(options.id) : ''
  if (!storyId) { loading.value = false; error.value = new ApiError('缺少文章编号', 400, 'NEWS_ID_MISSING'); return }
  loadStory(storyId)
})
</script>

<template>
  <view class="shell">
    <SubpageHeader :label="story?.topic || '新闻详情'" />

    <view v-if="loading" class="state-card"><view class="loading-line wide" /><view class="loading-line" /><text>正在获取文章…</text></view>
    <view v-else-if="error" class="state-card error-card"><text class="state-title">无法显示这条新闻</text><text class="state-message">{{ error.message }}</text><text class="error-code">错误码：{{ error.code }}</text><button v-if="storyId" class="retry-button" hover-class="none" @click="loadStory(storyId)">重新获取</button></view>

    <template v-else-if="story">
      <view class="article-meta"><text class="topic">{{ story.topic }}</text><text>{{ story.source }} · {{ formatCompactDateTime(story.publishedAt) }}</text></view>
      <text class="headline">{{ story.title }}</text>
      <text class="dek">{{ story.summary }}</text>
      <view v-if="story.tags.length" class="ticker-row"><text v-for="tag in story.tags" :key="tag">{{ tag }}</text></view>

      <image v-if="story.imageUrl && !imageBroken" class="hero-image" :src="apiAssetUrl(story.imageUrl)" mode="aspectFill" @error="imageBroken = true" />

      <view class="source-card"><view><text class="source-label">来源可核验</text><text class="source-name">{{ story.source }}{{ story.author ? ` · ${story.author}` : '' }}</text></view><button hover-class="none" :disabled="!story.originalUrl" @click="openOriginal"><text v-if="!story.originalUrl">暂无原文</text><text v-else>
        <!-- #ifdef H5 -->阅读原文<!-- #endif -->
        <!-- #ifndef H5 -->复制原文链接<!-- #endif -->
      </text></button></view>

      <view class="article-body"><text>{{ story.content || story.summary }}</text></view>

      <view v-if="meta" class="sync-card" :class="{ warning: meta.stale }"><text class="sync-title">{{ meta.provider }} · {{ formatRelativeTime(meta.updatedAt) }}同步</text><text v-if="meta.warning">{{ meta.warning.code }}：{{ meta.warning.message }}</text><text v-else>文章信息来自服务端保存的最后成功同步结果。</text></view>

      <button class="save" hover-class="none" :class="{ saved }" @click="toggleSaved"><image class="heart" :src="saved ? '/static/nav-icons/heart-filled.png' : '/static/nav-icons/heart-inactive.png'" mode="aspectFit" /><text>{{ saved ? '已收藏，留着慢慢看' : '收藏这条' }}</text></button>

      <view class="risk-note"><text>资讯仅供参考</text><text>页面展示的标题、摘要与原文链接来自标注的真实数据源，不构成任何投资建议。</text></view>
    </template>
  </view>
</template>

<style scoped>
.retry-button{display:flex;align-items:center;justify-content:center;height:44px;min-height:44px;margin:18px 0 0;padding:0 18px;border:0;border-radius:13px;background:#494032;color:#fff9e9;font-size:13px;line-height:normal}.retry-button::after{border:0}
.shell{max-width:640px;min-height:100vh;margin:auto;padding:calc(8px + var(--status-bar-height)) 24px calc(48px + env(safe-area-inset-bottom));background:#faf8f2;color:#3e382d}.state-card{padding:22px;margin-top:18px;border:1px solid #e7e0d2;border-radius:20px;background:#fff;color:#786d5b;font-size:12px}.loading-line{width:74%;height:11px;margin-bottom:10px;border-radius:7px;background:#eee9dd;animation:pulse 1.2s ease-in-out infinite}.loading-line.wide{width:100%}@keyframes pulse{50%{opacity:.45}}.error-card{display:flex;flex-direction:column}.state-title{color:#3e382d;font-size:18px;font-weight:600}.state-message{margin-top:8px;line-height:1.7}.error-code{margin-top:8px;color:#a35243;font-family:monospace;font-size:11px}.article-meta{display:flex;align-items:flex-start;gap:9px;margin-top:2px;color:#786d5b;font-size:11px;line-height:1.5;font-variant-numeric:tabular-nums}.article-meta>text:last-child{min-width:0}.topic{display:inline-flex;align-items:center;height:25px;flex:0 0 auto;padding:0 9px;border-radius:8px;background:#f7e7ad;color:#745b23;line-height:25px}.headline{display:block;margin:16px 0 0;font-size:31px;font-weight:600;line-height:1.4;letter-spacing:-.7px}.dek{display:block;margin-top:15px;color:#6f6555;font-size:15px;line-height:1.85}.ticker-row{display:flex;flex-wrap:wrap;gap:7px;margin-top:18px}.ticker-row text{display:inline-flex;align-items:center;height:27px;padding:0 9px;border:1px solid #ece5d6;border-radius:9px;background:#fff;color:#806b3c;font-size:11px;line-height:27px}.hero-image{display:block;width:100%;height:210px;margin-top:22px;border-radius:20px;background:#eee8d8}
.source-card{display:flex;align-items:center;justify-content:space-between;gap:15px;padding:16px 17px;margin-top:18px;border:1px solid #ece5d6;border-radius:17px;background:#fff}.source-card>view{min-width:0}.source-label{display:block;color:#958a76;font-size:10px}.source-name{display:block;margin-top:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;font-weight:600}.source-card button{display:flex;align-items:center;justify-content:center;width:auto;height:40px;min-height:40px;flex:0 0 auto;margin:0;padding:0 13px;border:1px solid #decf9f;border-radius:12px;background:#fff9e9;color:#6f5824;font-size:12px;line-height:normal}.source-card button::after{border:0}.article-body{padding:22px 0 5px;margin-top:23px;border-top:1px solid #e8e1d3;color:#514a3e;font-size:16px;line-height:2;white-space:pre-wrap;word-break:break-word}.sync-card{padding:18px;margin-top:27px;border-radius:18px;background:#f1ede3;color:#786d5b;font-size:12px;line-height:1.75}.sync-card.warning{background:#f4e8df;color:#8c523f}.sync-title{display:block;margin-bottom:5px;color:#493f30;font-size:13px;font-weight:600}.save{display:flex;align-items:center;justify-content:center;gap:9px;width:100%;height:50px;min-height:50px;margin-top:14px;border:0;border-radius:15px;background:#494032;color:#fff9e9;font-size:14px;line-height:normal}.save::after{border:0}.save.saved{border:1px solid #e3d39e;background:#fff9e9;color:#6f5824}.heart{display:block;width:19px;height:19px}.risk-note{padding:17px;margin-top:24px;border-top:1px solid #e8e1d3;color:#786d5b;font-size:11px;line-height:1.7;text-align:center}.risk-note text{display:block}.risk-note text:first-child{margin-bottom:4px;font-size:12px;font-weight:600}
.source-card button{height:44px;min-height:44px}
/* #ifdef MP-WEIXIN */
.shell{padding-top:0}
/* #endif */
/* #ifdef H5 */
.shell{padding-top:calc(22px + env(safe-area-inset-top))}
/* #endif */
/* #ifdef APP-PLUS */
.shell{padding-top:calc(12px + var(--status-bar-height))}
/* #endif */
@media(max-width:360px){.shell{padding-left:20px;padding-right:20px}.headline{font-size:28px}.hero-image{height:184px}}
.shell{padding-left:calc(24px + env(safe-area-inset-left));padding-right:calc(24px + env(safe-area-inset-right))}
@media(max-width:360px){.shell{padding-left:calc(20px + env(safe-area-inset-left));padding-right:calc(20px + env(safe-area-inset-right))}}
</style>
