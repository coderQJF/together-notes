<script setup lang="ts">
import { computed, ref } from 'vue'
import { onHide, onUnload } from '@dcloudio/uni-app'
import SubpageHeader from '../../components/SubpageHeader.vue'
import { newsDemoUpdatedAt, storiesFor, storyPublishedAt, type NewsChannel, type NewsStory } from '../../data/news'
import { formatClock, formatRelativeTime } from '../../utils/date'

const channel = ref<NewsChannel>('featured')
const refreshing = ref(false)
const updatedAt = ref(newsDemoUpdatedAt)
const visibleStories = computed(() => storiesFor(channel.value))
const leadStory = computed(() => visibleStories.value[0])
const remainingStories = computed(() => visibleStories.value.slice(1))
let refreshTimer: ReturnType<typeof setTimeout> | undefined

function openStory(story: NewsStory) {
  uni.navigateTo({ url: `/pages/news-detail/news-detail?id=${encodeURIComponent(story.id)}` })
}

function refresh() {
  if (refreshing.value) return
  refreshing.value = true
  refreshTimer = setTimeout(() => {
    refreshing.value = false
    uni.showToast({ title: '当前已是最新示例', icon: 'none' })
  }, 450)
}

function stopRefresh() {
  clearTimeout(refreshTimer)
  refreshTimer = undefined
  refreshing.value = false
}

onHide(stopRefresh)
onUnload(stopRefresh)
</script>

<template>
  <view class="shell">
    <SubpageHeader label="新闻" />

    <view class="update-row">
      <text class="eyebrow">{{ formatClock(updatedAt) }} 更新</text>
      <button class="refresh" :disabled="refreshing" @click="refresh">
        <image class="refresh-icon" :class="{ spinning: refreshing }" src="/static/nav-icons/refresh-active.png" mode="aspectFit" />
        <text>{{ refreshing ? '刷新中' : '刷新' }}</text>
      </button>
    </view>

    <view class="headline"><text>今天，有什么</text><text>新鲜事。</text></view>
    <text class="subtitle">先看重要的市场变化，也别错过正在发生的热点。</text>
    <view class="demo-state"><view class="preview-dot" /><text>设计预览 · 当前展示示例内容</text></view>

    <view class="channel-tabs">
      <button :class="{ active: channel === 'featured' }" @click="channel = 'featured'">精选</button>
      <button :class="{ active: channel === 'market' }" @click="channel = 'market'">股市</button>
      <button :class="{ active: channel === 'hot' }" @click="channel = 'hot'">热点</button>
    </view>

    <view v-if="leadStory" class="lead-card" @click="openStory(leadStory)">
      <view class="lead-meta">
        <view class="topic"><text class="pulse" />{{ leadStory.topic }}</view>
        <text>{{ leadStory.heat }}</text>
      </view>
      <text class="lead-title">{{ leadStory.title }}</text>
      <text class="lead-summary">{{ leadStory.summary }}</text>
      <view class="lead-footer">
        <text>{{ leadStory.source }} · {{ formatRelativeTime(storyPublishedAt(leadStory)) }}</text>
        <view class="round-arrow"><view /></view>
      </view>
    </view>

    <view class="trending">
      <text class="trending-label">正在关注</text>
      <scroll-view scroll-x :show-scrollbar="false" class="trend-scroll">
        <view class="trend-row">
          <text v-for="tag in ['AI 基建', '黄金波动', '财报季', '机器人', '新消费']" :key="tag"># {{ tag }}</text>
        </view>
      </scroll-view>
    </view>

    <view class="section-heading">
      <text class="section-title">继续读</text>
      <text class="section-count">{{ remainingStories.length }} 条</text>
    </view>

    <view v-for="story in remainingStories" :key="story.id" class="story-card" @click="openStory(story)">
      <view class="story-main">
        <view class="story-meta"><text>{{ story.topic }}</text><text>·</text><text>{{ story.heat }}</text></view>
        <text class="story-title">{{ story.title }}</text>
        <text class="story-summary">{{ story.summary }}</text>
      </view>
      <view class="story-footer">
        <text>{{ story.source }} · {{ formatRelativeTime(storyPublishedAt(story)) }}</text>
        <view class="ticker-list"><text v-for="ticker in story.tickers.slice(0, 2)" :key="ticker">{{ ticker }}</text></view>
      </view>
    </view>

    <view class="disclaimer">
      <text class="disclaimer-title">先把体验做好</text>
      <text>当前内容仅用于确认资讯流设计，并非实时新闻或投资建议。接入合规数据源后会展示真实来源与发布时间。</text>
    </view>
  </view>
</template>

<style scoped>
.shell{max-width:640px;min-height:100vh;margin:auto;padding:calc(8px + var(--status-bar-height)) 24px calc(48px + env(safe-area-inset-bottom));background:#faf8f2;color:#3e382d}.update-row{display:flex;align-items:center;justify-content:space-between;gap:10px;min-height:44px}.eyebrow{display:block;color:#9a875c;font-size:12px}.refresh{display:flex;align-items:center;justify-content:center;gap:6px;width:auto;height:44px;min-height:44px;margin:0 -7px 0 0;padding:0 7px;border:0;background:transparent;color:#786d5b;font-size:12px;line-height:1}.refresh::after{border:0}.refresh-icon{display:block;width:15px;height:15px}.spinning{animation:spin .7s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}
.headline{display:block;margin:4px 0 0;font-size:32px;font-weight:600;line-height:1.3;letter-spacing:-.8px}.headline text{display:block}.subtitle{display:block;margin-top:12px;color:#786d5b;font-size:14px;line-height:1.7}.demo-state{display:flex;align-items:center;gap:7px;margin-top:13px;color:#8a7649;font-size:11px}.preview-dot{width:6px;height:6px;flex:0 0 6px;border-radius:50%;background:#b28b35}.channel-tabs{display:flex;gap:8px;margin:22px 0 16px}.channel-tabs button{display:flex;align-items:center;justify-content:center;min-width:72px;height:44px;min-height:44px;margin:0;padding:0 17px;border:1px solid #ece5d6;border-radius:22px;background:#fff;color:#786d5b;font-size:13px;line-height:1}.channel-tabs button::after{border:0}.channel-tabs button.active{border-color:#494032;background:#494032;color:#fff9e9}
.lead-card{padding:22px;margin-top:8px;border:1px solid #efd98d;border-radius:22px;background:#f7e7ad}.lead-meta{display:flex;align-items:center;justify-content:space-between;color:#806b3c;font-size:11px}.topic{display:flex;align-items:center;gap:7px}.pulse{width:7px;height:7px;border-radius:50%;background:#9d7421;box-shadow:0 0 0 4px rgba(157,116,33,.12)}.lead-title{display:block;margin-top:18px;font-size:24px;font-weight:600;line-height:1.42;letter-spacing:-.4px}.lead-summary{display:block;margin-top:11px;color:#6e6041;font-size:13px;line-height:1.75}.lead-footer{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:21px;padding-top:14px;border-top:1px solid rgba(129,103,47,.16);color:#806f49;font-size:11px}.lead-footer>text{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.round-arrow{display:flex;align-items:center;justify-content:center;width:36px;height:36px;flex:0 0 36px;border-radius:50%;background:#494032}.round-arrow view{width:8px;height:8px;margin-left:-2px;border-top:1.6px solid #fff9e9;border-right:1.6px solid #fff9e9;transform:rotate(45deg)}
.trending{display:flex;align-items:center;gap:10px;width:100%;margin:20px 0 0;overflow:hidden}.trending-label{padding-left:2px;flex:0 0 auto;color:#786d5b;font-size:11px}.trend-scroll{min-width:0;flex:1}.trend-row{display:inline-flex;gap:8px;padding-right:2px;white-space:nowrap}.trend-row text{display:inline-flex;align-items:center;height:31px;flex:0 0 auto;padding:0 10px;border:1px solid #ece5d6;border-radius:10px;background:#fff;color:#7d6b43;font-size:11px;white-space:nowrap}.section-heading{display:flex;align-items:center;justify-content:space-between;margin:27px 2px 10px}.section-title{font-size:19px;font-weight:600}.section-count{color:#867b68;font-size:12px}
.story-card{padding:18px;margin:11px 0;border:1px solid #ece5d6;border-radius:20px;background:#fff}.story-main{min-width:0}.story-meta{display:flex;align-items:center;gap:5px;color:#9a7e3f;font-size:11px}.story-title{display:block;margin-top:9px;font-size:17px;font-weight:600;line-height:1.5}.story-summary{display:-webkit-box;margin-top:7px;overflow:hidden;color:#786d5b;font-size:13px;line-height:1.7;-webkit-box-orient:vertical;-webkit-line-clamp:2}.story-footer{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:14px;padding-top:12px;border-top:1px solid #f1ecdf;color:#958a76;font-size:10px}.story-footer>text{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.ticker-list{display:flex;gap:5px;flex:0 0 auto}.ticker-list text{display:inline-flex;align-items:center;height:23px;padding:0 7px;border-radius:7px;background:#f4f0e5;color:#7f6f4c;font-size:10px}.disclaimer{padding:17px;margin-top:25px;border-radius:16px;background:#f1ede3;color:#786d5b;font-size:12px;line-height:1.7}.disclaimer-title{display:block;margin-bottom:4px;color:#494032;font-size:13px;font-weight:600}
.eyebrow,.section-count,.story-footer{color:#786d5b}.story-footer,.ticker-list text{font-size:11px}
/* #ifdef MP-WEIXIN */
.shell{padding-top:0}
/* #endif */
/* #ifdef H5 */
.shell{padding-top:calc(22px + env(safe-area-inset-top))}
/* #endif */
/* #ifdef APP-PLUS */
.shell{padding-top:calc(12px + var(--status-bar-height))}
/* #endif */
@media(max-width:360px){.shell{padding-left:20px;padding-right:20px}.headline{font-size:29px}.channel-tabs button{min-width:0;flex:1}.lead-card{padding:20px}.lead-title{font-size:22px}}
.shell{padding-left:calc(24px + env(safe-area-inset-left));padding-right:calc(24px + env(safe-area-inset-right))}
@media(max-width:360px){.shell{padding-left:calc(20px + env(safe-area-inset-left));padding-right:calc(20px + env(safe-area-inset-right))}}
</style>
