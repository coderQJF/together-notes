<script setup lang="ts">
import { ref } from 'vue'
import { onShow, onHide, onShareAppMessage, onShareTimeline } from '@dcloudio/uni-app'
import SubpageHeader from '../../components/SubpageHeader.vue'
import WaterCup from '../../features/water/components/WaterCup.vue'
import { enableAppShareMenu } from '../../services/app-share'
import { shareWaterReminder, waterFriendShare, waterTimelineShare } from '../../services/water-share'
const active=ref(false)
onShow(()=>{active.value=true;enableAppShareMenu(true)});onHide(()=>{active.value=false})
function start() { uni.navigateTo({url:'/pages/water/water'}) }
// #ifdef MP-WEIXIN
onShareAppMessage(waterFriendShare);onShareTimeline(waterTimelineShare)
// #endif
</script>
<template>
  <view class="shell">
    <SubpageHeader label="一杯水的问候" />
    <view class="heading"><text class="eyebrow">A LITTLE CARE FOR YOU</text><text class="headline">忙归忙，<text class="block">别忘了喝口水。</text></text><text class="subtitle">有人把一杯小小的关心，递到了你面前。</text></view>
    <WaterCup :cups="2" :active="active" :interactive="false" greeting="歇一下，喝口水，再继续发光。" />
    <text class="invitation">给自己一点休息，慢慢喝就好。</text>
    <button class="primary" @click="start">我也来记一杯</button>
    <!-- #ifdef MP-WEIXIN -->
    <button class="share" open-type="share">提醒朋友喝水</button>
    <!-- #endif -->
    <!-- #ifndef MP-WEIXIN -->
    <button class="share" @click="shareWaterReminder">提醒朋友喝水</button>
    <!-- #endif -->
  </view>
</template>
<style scoped>
.shell{max-width:430px;min-height:100vh;box-sizing:border-box;margin:auto;padding:0 26px calc(32px + env(safe-area-inset-bottom));background:#faf8f2;color:#494032}.heading{margin-top:26px;margin-bottom:18px}.eyebrow{display:block;font-size:10px;letter-spacing:2px;color:#94856d}.headline{display:block;margin:14px 0;font-size:32px;line-height:1.45;font-weight:600;letter-spacing:-1px}.block{display:block}.subtitle{display:block;color:#8b806e;font-size:13px;line-height:1.8}.invitation{display:block;text-align:center;font-size:13px;color:#897c67;margin:0 0 24px}.primary,.share{display:flex;align-items:center;justify-content:center;width:100%;min-height:48px;box-sizing:border-box;margin:0;padding:0 14px;border:0;border-radius:16px;font-size:14px;line-height:1.4}.primary{background:#f7e7ad;color:#494032}.share{background:transparent;color:#897c67;margin-top:10px}.primary::after,.share::after{border:0}@media(max-width:360px){.shell{padding-left:20px;padding-right:20px}.headline{font-size:30px}}
</style>
