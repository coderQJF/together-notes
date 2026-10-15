<script setup lang="ts">
import { APP_SHARE_IMAGE, APP_SHARE_TITLE } from '../services/app-share'
import { publicShareUrl, shareText } from '../utils/platform'
function recommend() {
  const href = publicShareUrl('/pages/index/index')
  shareText({ title: APP_SHARE_TITLE, content: `${APP_SHARE_TITLE}\n随记、待办和灵感纸，不登录也能先用。${href ? '\n'+href : '\n在微信搜索“两个人的小记记”体验。'}`, href })
}
</script>
<template>
  <view class="recommend-card">
    <view class="recommend-top"><image class="recommend-cover" :src="APP_SHARE_IMAGE" mode="aspectFit" />
    <view class="recommend-copy"><text class="recommend-title">推荐小记</text><text class="recommend-description">不登录也能先用。仅分享小程序介绍，不包含私人记录。</text></view></view>
    <!-- #ifdef MP-WEIXIN -->
    <button class="recommend-button" open-type="share">推荐给朋友</button>
    <text class="recommend-hint">分享到朋友圈：返回首页，点击右上角菜单。</text>
    <!-- #endif -->
    <!-- #ifndef MP-WEIXIN -->
    <button class="recommend-button" @click="recommend">推荐给朋友</button>
    <!-- #endif -->
  </view>
</template>
<style scoped>
.recommend-card{margin:20px 0;padding:16px;border:1px solid #ece5d6;border-radius:20px;background:#fff;color:#494032}.recommend-top{display:flex;align-items:center;gap:12px;margin-bottom:14px}.recommend-cover{display:block;width:88px;height:71px;flex:0 0 88px;border-radius:12px;background:#faf8f2}.recommend-copy{flex:1;min-width:0}.recommend-title,.recommend-description,.recommend-hint{display:block}.recommend-title{font-size:17px;font-weight:600;line-height:26px}.recommend-description{margin-top:5px;color:#867b68;font-size:12px;line-height:20px}.recommend-button{display:flex;width:100%;min-height:46px;align-items:center;justify-content:center;margin:0;padding:0 12px;border:0;border-radius:14px;background:#f7e7ad;color:#494032;font-size:14px;line-height:1.4}.recommend-hint{margin-top:10px;color:#867b68;font-size:11px;line-height:18px}
</style>
