<script setup lang="ts">
import { computed, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import SubpageHeader from '../../components/SubpageHeader.vue'
import { ApiError, apiAssetUrl, request } from '../../services/api'
import type { ContentRefreshResult, NewsChannel, NewsPayload, NewsStory } from '../../types/content'
import { formatRelativeTime } from '../../utils/date'

const channel = ref<NewsChannel>('featured')
const payload = ref<NewsPayload | null>(null)
const loading = ref(true)
const refreshing = ref(false)
const error = ref<ApiError | null>(null)
const selectedTopic = ref('')
const brokenImages = ref<Record<string, boolean>>({})
let requestSequence = 0

const visibleStories = computed(() => {
  const stories = payload.value?.stories || []
  if (!selectedTopic.value) return stories
  return stories.filter(story => story.topic === selectedTopic.value || story.tags.includes(selectedTopic.value))
})
const leadStory = computed(() => visibleStories.value[0] || null)
const remainingStories = computed(() => visibleStories.value.slice(1))

const storyImageVisible = (story: NewsStory) => Boolean(story.imageUrl && !brokenImages.value[story.id])
const markImageBroken = (story: NewsStory) => { brokenImages.value = { ...brokenImages.value, [story.id]: true } }

function openStory(story: NewsStory) {
  uni.navigateTo({ url: `/pages/news-detail/news-detail?id=${encodeURIComponent(story.id)}` })
}

async function loadNews(showLoading = true) {
  const sequence = ++requestSequence
  if (showLoading) {
    loading.value = true
    payload.value = null
  }
  error.value = null
  try {
    const response = await request<NewsPayload>(`/content/news?channel=${channel.value}`)
    if (sequence !== requestSequence) return
    payload.value = response
    if (selectedTopic.value && !response.topics.includes(selectedTopic.value)) selectedTopic.value = ''
    return true
  } catch (cause) {
    if (sequence !== requestSequence) return
    payload.value = null
    error.value = cause instanceof ApiError ? cause : new ApiError(cause instanceof Error ? cause.message : '获取新闻失败')
    return false
  } finally {
    if (sequence === requestSequence) loading.value = false
  }
}

async function selectChannel(next: NewsChannel) {
  if (next === channel.value && payload.value) return
  channel.value = next
  selectedTopic.value = ''
  await loadNews()
}

function selectTopic(topic: string) {
  selectedTopic.value = selectedTopic.value === topic ? '' : topic
}

async function refresh() {
  if (refreshing.value) return
  const previousPayload = payload.value?.channel === channel.value ? payload.value : null
  const activeChannel = channel.value
  let providerRefreshCompleted = false
  refreshing.value = true
  try {
    const result = await request<ContentRefreshResult>('/content/refresh', 'POST', { target: 'news', channel: activeChannel }, { timeout: 120000 })
    providerRefreshCompleted = true
    if (activeChannel !== channel.value) return
    const loaded = await loadNews(false)
    if (activeChannel !== channel.value) return
    if (!loaded) throw error.value || new ApiError('同步成功，但读取最新资讯失败')
    if (!result.ok) throw new ApiError(result.errors.map(item => item.message).join('；') || '新闻仅完成部分同步', 502, 'CONTENT_REFRESH_PARTIAL')
    uni.showToast({ title: '已获取最新资讯', icon: 'none' })
  } catch (cause) {
    const refreshError = cause instanceof ApiError ? cause : new ApiError('刷新失败')
    if (activeChannel !== channel.value) return
    if (!providerRefreshCompleted) await loadNews(false)
    if (activeChannel !== channel.value) return
    if (!payload.value && previousPayload) payload.value = previousPayload
    if (payload.value) {
      if (refreshError.code !== 'CONTENT_REFRESH_RATE_LIMITED' && !payload.value.meta.warning) {
        payload.value.meta = { ...payload.value.meta, stale: true, warning: { code: refreshError.code, message: refreshError.message } }
      }
      error.value = null
      uni.showToast({ title: refreshError.code === 'CONTENT_REFRESH_RATE_LIMITED' ? refreshError.message : '刷新失败，已保留上次真实资讯', icon: 'none' })
    } else error.value = refreshError
  } finally {
    refreshing.value = false
  }
}

onLoad(() => loadNews())
</script>

<template>
  <view class="shell">
    <SubpageHeader label="新闻" />

    <view class="update-row">
      <text class="eyebrow">{{ payload ? `${formatRelativeTime(payload.meta.updatedAt)}更新` : '实时资讯' }}</text>
      <button class="refresh" hover-class="none" :disabled="refreshing || loading" @click="refresh">
        <image class="refresh-icon" :class="{ spinning: refreshing }" src="/static/nav-icons/refresh-active.png" mode="aspectFit" />
        <text>{{ refreshing ? '刷新中' : '刷新' }}</text>
      </button>
    </view>

    <view class="headline"><text>今天，有什么</text><text>新鲜事。</text></view>
    <text class="subtitle">先看重要的市场变化，也别错过正在发生的热点。</text>
    <view v-if="payload" class="data-state" :class="{ warning: payload.meta.stale }">
      <view class="state-dot" />
      <text>{{ payload.meta.provider }}{{ payload.meta.stale ? ' · 已显示最后成功数据' : ' · 实时数据' }}</text>
    </view>

    <view class="channel-tabs">
      <button hover-class="none" :class="{ active: channel === 'featured' }" :aria-pressed="channel === 'featured'" @click="selectChannel('featured')"><text>精选</text></button>
      <button hover-class="none" :class="{ active: channel === 'market' }" :aria-pressed="channel === 'market'" @click="selectChannel('market')"><text>股市</text></button>
      <button hover-class="none" :class="{ active: channel === 'hot' }" :aria-pressed="channel === 'hot'" @click="selectChannel('hot')"><text>热点</text></button>
    </view>

    <view v-if="loading" class="state-card loading-card">
      <view class="loading-line wide" /><view class="loading-line" /><view class="loading-line short" /><text>正在从新闻数据源获取…</text>
    </view>
    <view v-else-if="error" class="state-card error-card">
      <text class="state-title">新闻数据获取失败</text>
      <text class="state-message">{{ error.message }}</text>
      <text class="error-code">错误码：{{ error.code }}</text>
      <button class="retry-button" hover-class="none" @click="refresh"><text>重新获取</text></button>
    </view>

    <template v-else-if="payload">
      <view v-if="leadStory" class="lead-card" hover-class="card-pressed" role="button" :aria-label="`${leadStory.title}，查看新闻详情`" @click="openStory(leadStory)">
        <image v-if="storyImageVisible(leadStory)" class="lead-image" :src="apiAssetUrl(leadStory.imageUrl)" mode="aspectFill" @error="markImageBroken(leadStory)" />
        <view class="lead-content">
          <view class="lead-meta"><view class="topic"><text class="pulse" />{{ leadStory.topic }}</view><text>最新</text></view>
          <text class="lead-title">{{ leadStory.title }}</text>
          <text class="lead-summary">{{ leadStory.summary }}</text>
          <view class="lead-footer"><text>{{ leadStory.source }} · {{ formatRelativeTime(leadStory.publishedAt) }}</text><view class="round-arrow"><view /></view></view>
        </view>
      </view>

      <view v-if="payload.topics.length" class="trending">
        <text class="trending-label">正在关注</text>
        <scroll-view scroll-x :show-scrollbar="false" class="trend-scroll">
          <view class="trend-row">
            <button v-for="topic in payload.topics" :key="topic" hover-class="none" :class="{ active: selectedTopic === topic }" :aria-pressed="selectedTopic === topic" @click="selectTopic(topic)"><text># {{ topic }}</text></button>
          </view>
        </scroll-view>
      </view>

      <view class="section-heading"><text class="section-title">{{ selectedTopic ? `# ${selectedTopic}` : '继续读' }}</text><text class="section-count">{{ remainingStories.length }} 条</text></view>
      <view v-if="!leadStory" class="empty-card">当前筛选下暂无真实资讯，可取消主题筛选或稍后刷新。</view>
      <view v-for="story in remainingStories" :key="story.id" class="story-card" hover-class="card-pressed" role="button" :aria-label="`${story.title}，查看新闻详情`" @click="openStory(story)">
        <view class="story-layout">
          <view class="story-main"><view class="story-meta"><text>{{ story.topic }}</text><text>·</text><text>{{ story.source }}</text></view><text class="story-title">{{ story.title }}</text><text class="story-summary">{{ story.summary }}</text></view>
          <image v-if="storyImageVisible(story)" class="story-image" :src="apiAssetUrl(story.imageUrl)" mode="aspectFill" @error="markImageBroken(story)" />
        </view>
        <view class="story-footer"><text>{{ formatRelativeTime(story.publishedAt) }}</text><view class="ticker-list"><text v-for="tag in story.tags.slice(0, 2)" :key="tag">{{ tag }}</text></view></view>
      </view>

      <view v-if="payload.meta.warning" class="disclaimer warning-note"><text class="disclaimer-title">数据同步告警 · {{ payload.meta.warning.code }}</text><text>{{ payload.meta.warning.message }}</text></view>
      <view class="disclaimer"><text class="disclaimer-title">资讯仅供参考</text><text>标题、摘要、发布时间与图片均来自标注的真实来源；内容不构成任何投资建议。</text></view>
    </template>
  </view>
</template>

<style scoped>
.card-pressed{opacity:.86}
.shell{max-width:640px;min-height:100vh;margin:auto;padding:calc(8px + var(--status-bar-height)) 24px calc(48px + env(safe-area-inset-bottom));background:#faf8f2;color:#3e382d}.update-row{display:flex;align-items:center;justify-content:space-between;gap:10px;min-height:44px}.eyebrow{display:block;color:#786d5b;font-size:12px}.refresh{display:flex;align-items:center;justify-content:center;gap:6px;width:auto;height:44px;min-height:44px;margin:0 -7px 0 0;padding:0 7px;border:0;background:transparent;color:#786d5b;font-size:12px;line-height:normal}.refresh::after{border:0}.refresh[disabled]{opacity:.5}.refresh-icon{display:block;width:15px;height:15px}.spinning{animation:spin .7s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}
.headline{display:block;margin:4px 0 0;font-size:32px;font-weight:600;line-height:1.3;letter-spacing:-.8px}.headline text{display:block}.subtitle{display:block;margin-top:12px;color:#786d5b;font-size:14px;line-height:1.7}.data-state{display:flex;align-items:flex-start;gap:7px;margin-top:13px;color:#6f7d57;font-size:11px;line-height:1.55}.data-state.warning{color:#8a6422}.state-dot{width:6px;height:6px;flex:0 0 6px;margin-top:5px;border-radius:50%;background:currentColor}
.channel-tabs{display:flex;gap:8px;margin:22px 0 16px}.channel-tabs button{display:flex;align-items:center;justify-content:center;min-width:76px;height:46px;min-height:46px;margin:0;padding:0 18px;border:1px solid #e5dece;border-radius:23px;background:#fff;color:#6f6555;font-size:13px;line-height:normal;box-sizing:border-box}.channel-tabs button text{display:block;line-height:20px}.channel-tabs button::after{border:0}.channel-tabs button.active{border-color:#494032;background:#494032;color:#fff9e9}.channel-tabs button:active{opacity:.86}
.state-card{padding:22px;margin-top:17px;border:1px solid #e7e0d2;border-radius:20px;background:#fff}.loading-card{color:#786d5b;font-size:12px}.loading-line{width:74%;height:11px;margin-bottom:10px;border-radius:7px;background:#eee9dd;animation:pulse 1.2s ease-in-out infinite}.loading-line.wide{width:100%}.loading-line.short{width:48%;margin-bottom:18px}@keyframes pulse{50%{opacity:.45}}.error-card{display:flex;flex-direction:column;align-items:flex-start}.state-title{font-size:17px;font-weight:600}.state-message{margin-top:8px;color:#786d5b;font-size:13px;line-height:1.65}.error-code{margin-top:8px;color:#a35243;font-family:monospace;font-size:11px;word-break:break-all}.retry-button{display:flex;align-items:center;justify-content:center;height:44px;min-height:44px;margin:18px 0 0;padding:0 18px;border:0;border-radius:13px;background:#494032;color:#fff9e9;font-size:13px;line-height:normal}.retry-button::after{border:0}.empty-card{padding:28px 20px;border:1px dashed #ddd4c3;border-radius:18px;color:#786d5b;font-size:13px;line-height:1.7;text-align:center}
.lead-card{overflow:hidden;margin-top:8px;border:1px solid #efd98d;border-radius:22px;background:#f7e7ad}.lead-image{display:block;width:100%;height:174px;background:#e9ddba}.lead-content{padding:22px}.lead-meta{display:flex;align-items:center;justify-content:space-between;color:#806b3c;font-size:11px}.topic{display:flex;align-items:center;gap:7px}.pulse{width:7px;height:7px;border-radius:50%;background:#9d7421;box-shadow:0 0 0 4px rgba(157,116,33,.12)}.lead-title{display:block;margin-top:18px;font-size:24px;font-weight:600;line-height:1.42;letter-spacing:-.4px}.lead-summary{display:-webkit-box;margin-top:11px;overflow:hidden;color:#6e6041;font-size:13px;line-height:1.75;-webkit-box-orient:vertical;-webkit-line-clamp:3}.lead-footer{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:21px;padding-top:14px;border-top:1px solid rgba(129,103,47,.16);color:#806f49;font-size:11px}.lead-footer>text{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.round-arrow{display:flex;align-items:center;justify-content:center;width:36px;height:36px;flex:0 0 36px;border-radius:50%;background:#494032}.round-arrow view{width:8px;height:8px;margin-left:-2px;border-top:1.6px solid #fff9e9;border-right:1.6px solid #fff9e9;transform:rotate(45deg)}
.trending{display:flex;align-items:center;gap:10px;width:100%;margin:20px 0 0;overflow:hidden}.trending-label{padding-left:2px;flex:0 0 auto;color:#786d5b;font-size:11px}.trend-scroll{min-width:0;flex:1}.trend-row{display:inline-flex;gap:8px;padding-right:2px;white-space:nowrap}.trend-row button{display:flex;align-items:center;justify-content:center;width:auto;height:34px;min-height:34px;flex:0 0 auto;margin:0;padding:0 11px;border:1px solid #e5dece;border-radius:11px;background:#fff;color:#7d6b43;font-size:11px;line-height:normal;white-space:nowrap}.trend-row button::after{border:0}.trend-row button.active{border-color:#ccb268;background:#f7e7ad;color:#604b1d}.section-heading{display:flex;align-items:center;justify-content:space-between;margin:27px 2px 10px}.section-title{font-size:19px;font-weight:600}.section-count{color:#786d5b;font-size:12px}
.story-card{padding:18px;margin:11px 0;border:1px solid #ece5d6;border-radius:20px;background:#fff}.story-layout{display:flex;align-items:flex-start;gap:13px}.story-main{min-width:0;flex:1}.story-image{display:block;width:90px;height:78px;flex:0 0 90px;border-radius:13px;background:#eee8d8}.story-meta{display:flex;align-items:center;gap:5px;color:#9a7e3f;font-size:11px}.story-title{display:-webkit-box;margin-top:9px;overflow:hidden;font-size:17px;font-weight:600;line-height:1.5;-webkit-box-orient:vertical;-webkit-line-clamp:2}.story-summary{display:-webkit-box;margin-top:7px;overflow:hidden;color:#786d5b;font-size:13px;line-height:1.7;-webkit-box-orient:vertical;-webkit-line-clamp:2}.story-footer{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:14px;padding-top:12px;border-top:1px solid #f1ecdf;color:#786d5b;font-size:11px}.story-footer>text{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.ticker-list{display:flex;gap:5px;flex:0 0 auto}.ticker-list text{display:inline-flex;align-items:center;height:23px;padding:0 7px;border-radius:7px;background:#f4f0e5;color:#7f6f4c;font-size:11px}.disclaimer{padding:17px;margin-top:25px;border-radius:16px;background:#f1ede3;color:#786d5b;font-size:12px;line-height:1.7}.disclaimer.warning-note{background:#f4e8df;color:#8c523f}.disclaimer-title{display:block;margin-bottom:4px;color:#494032;font-size:13px;font-weight:600}
.trend-row button{height:44px;min-height:44px;padding-left:12px;padding-right:12px;border-radius:13px}.ticker-list{max-width:58%;min-width:0;overflow:hidden}.ticker-list text{display:block;max-width:112px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;box-sizing:border-box}
/* #ifdef MP-WEIXIN */
.shell{padding-top:0}
/* #endif */
/* #ifdef H5 */
.shell{padding-top:calc(22px + env(safe-area-inset-top))}
/* #endif */
/* #ifdef APP-PLUS */
.shell{padding-top:calc(12px + var(--status-bar-height))}
/* #endif */
@media(max-width:360px){.shell{padding-left:20px;padding-right:20px}.headline{font-size:29px}.channel-tabs button{min-width:0;flex:1}.lead-content{padding:20px}.lead-title{font-size:22px}.story-image{width:76px;height:70px;flex-basis:76px}}
.shell{padding-left:calc(24px + env(safe-area-inset-left));padding-right:calc(24px + env(safe-area-inset-right))}
@media(max-width:360px){.shell{padding-left:calc(20px + env(safe-area-inset-left));padding-right:calc(20px + env(safe-area-inset-right))}}
</style>
