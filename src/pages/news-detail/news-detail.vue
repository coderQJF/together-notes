<script setup lang="ts">
import { ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import SubpageHeader from '../../components/SubpageHeader.vue'
import { findStory, storyPublishedAt, type NewsStory } from '../../data/news'
import { formatCompactDateTime } from '../../utils/date'

const story = ref<NewsStory | null>(null)
const saved = ref(false)

function toggleSaved() {
  if (!story.value) return
  const stored = uni.getStorageSync('saved-demo-stories')
  const ids: string[] = Array.isArray(stored) ? stored : []
  const next = ids.includes(story.value.id) ? ids.filter(id => id !== story.value?.id) : [...ids, story.value.id]
  uni.setStorageSync('saved-demo-stories', next)
  saved.value = next.includes(story.value.id)
  uni.showToast({ title: saved.value ? '已收藏' : '已取消收藏', icon: 'none' })
}

onLoad(options => {
  story.value = findStory(typeof options?.id === 'string' ? decodeURIComponent(options.id) : '') || null
  const stored = uni.getStorageSync('saved-demo-stories')
  saved.value = Boolean(story.value && Array.isArray(stored) && stored.includes(story.value.id))
})
</script>

<template>
  <view class="shell">
    <SubpageHeader :label="story?.topic || '新闻详情'" />

    <view v-if="!story" class="empty">
      <text class="empty-title">没有找到这条内容</text>
      <text>示例资讯可能已经更新。</text>
    </view>

    <template v-else>
      <view class="article-meta">
        <text class="heat">{{ story.heat }}</text>
        <text>{{ story.source }} · {{ formatCompactDateTime(storyPublishedAt(story)) }}</text>
      </view>
      <text class="headline">{{ story.title }}</text>
      <text class="dek">{{ story.summary }}</text>

      <view class="ticker-row">
        <text v-for="ticker in story.tickers" :key="ticker">{{ ticker }}</text>
      </view>

      <view class="article-body">
        <text>{{ story.context }}</text>
      </view>

      <view class="section">
        <text class="section-kicker">三分钟读完</text>
        <text class="section-title">值得留意</text>
        <view class="takeaway-card">
          <view v-for="(takeaway, index) in story.takeaways" :key="takeaway" class="takeaway">
            <text class="number">0{{ index + 1 }}</text>
            <text>{{ takeaway }}</text>
          </view>
        </view>
      </view>

      <view class="why-card">
        <text class="why-label">为什么推给你</text>
        <text>你选择了“股市与热点”。真实数据接入后，这里会说明推荐主题，并提供关闭或减少同类内容的入口。</text>
      </view>

      <button class="save" :class="{ saved }" @click="toggleSaved">
        <image class="heart" :src="saved ? '/static/nav-icons/heart-filled.png' : '/static/nav-icons/heart-inactive.png'" mode="aspectFit" />
        <text>{{ saved ? '已收藏，留着慢慢看' : '收藏这条' }}</text>
      </button>

      <view class="risk-note">
        <text>资讯仅供参考</text>
        <text>本页是产品设计示例，不构成任何投资建议。真实版本将展示原始来源、作者和可核验链接。</text>
      </view>
    </template>
  </view>
</template>

<style scoped>
.shell{max-width:640px;min-height:100vh;margin:auto;padding:calc(8px + var(--status-bar-height)) 24px calc(48px + env(safe-area-inset-bottom));background:#faf8f2;color:#3e382d}.empty{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;min-height:55vh;color:#786d5b}.empty-title{font-size:20px;font-weight:600;color:#3e382d}.article-meta{display:flex;align-items:center;gap:9px;margin-top:2px;color:#786d5b;font-size:11px;font-variant-numeric:tabular-nums}.article-meta>text:last-child{min-width:0;line-height:1.5}.heat{display:inline-flex;align-items:center;height:24px;flex:0 0 auto;padding:0 8px;border-radius:8px;background:#f7e7ad;color:#745b23}.headline{display:block;margin:16px 0 0;font-size:31px;font-weight:600;line-height:1.4;letter-spacing:-.7px}.dek{display:block;margin-top:15px;color:#6f6555;font-size:15px;line-height:1.85}.ticker-row{display:flex;flex-wrap:wrap;gap:7px;margin-top:18px}.ticker-row text{display:inline-flex;align-items:center;height:26px;padding:0 9px;border:1px solid #ece5d6;border-radius:9px;background:#fff;color:#806b3c;font-size:11px}.article-body{padding:22px 0 5px;margin-top:23px;border-top:1px solid #e8e1d3;color:#514a3e;font-size:16px;line-height:2;white-space:pre-wrap}
.section{margin-top:31px}.section-kicker{display:block;margin-bottom:5px;color:#9b8758;font-size:11px;letter-spacing:1px}.section-title{display:block;font-size:20px;font-weight:600}.takeaway-card{margin-top:14px;border:1px solid #ece5d6;border-radius:20px;background:#fff;overflow:hidden}.takeaway{display:flex;align-items:flex-start;gap:14px;padding:17px;border-bottom:1px solid #f1ecdf;font-size:13px;line-height:1.7}.takeaway:last-child{border-bottom:0}.number{padding-top:2px;color:#b28b35;font-size:11px;font-weight:700;font-variant-numeric:tabular-nums}.why-card{padding:19px;margin-top:27px;border-radius:18px;background:#f7e7ad;color:#6d6044;font-size:12px;line-height:1.75}.why-label{display:block;margin-bottom:5px;color:#493f30;font-size:14px;font-weight:600}.save{display:flex;align-items:center;justify-content:center;gap:9px;width:100%;height:50px;margin-top:14px;border:0;border-radius:15px;background:#494032;color:#fff9e9;font-size:14px}.save::after{border:0}.save.saved{border:1px solid #e3d39e;background:#fff9e9;color:#6f5824}.heart{display:block;width:19px;height:19px}.risk-note{padding:17px;margin-top:24px;border-top:1px solid #e8e1d3;color:#958a76;font-size:11px;line-height:1.7;text-align:center}.risk-note text{display:block}.risk-note text:first-child{margin-bottom:4px;color:#786d5b;font-size:12px;font-weight:600}
.section-kicker,.risk-note{color:#786d5b}
/* #ifdef MP-WEIXIN */
.shell{padding-top:0}
/* #endif */
/* #ifdef H5 */
.shell{padding-top:calc(22px + env(safe-area-inset-top))}
/* #endif */
/* #ifdef APP-PLUS */
.shell{padding-top:calc(12px + var(--status-bar-height))}
/* #endif */
@media(max-width:360px){.shell{padding-left:20px;padding-right:20px}.headline{font-size:28px}}
.shell{padding-left:calc(24px + env(safe-area-inset-left));padding-right:calc(24px + env(safe-area-inset-right))}
@media(max-width:360px){.shell{padding-left:calc(20px + env(safe-area-inset-left));padding-right:calc(20px + env(safe-area-inset-right))}}
</style>
