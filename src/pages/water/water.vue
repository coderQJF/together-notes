<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue'
import { onHide, onShow, onShareAppMessage, onShareTimeline } from '@dcloudio/uni-app'
import SubpageHeader from '../../components/SubpageHeader.vue'
import UndoIcon from '../../components/UndoIcon.vue'
import WaterCup from '../../features/water/components/WaterCup.vue'
import { waterDay } from '../../services/water'
import { currentWaterStore, syncWater } from '../../services/water-sync'
import { WATER_CUP_ML } from '../../services/water-mood'
import { enableAppShareMenu } from '../../services/app-share'
import { waterFriendShare, waterTimelineShare } from '../../services/water-share'
import { cachedHome, request } from '../../services/api'

const day = ref(waterDay()), cups = ref(0), active = ref(false), error = ref(''), revision = ref(0), feedback = ref<'add' | 'undo' | ''>('')
const message = computed(() => cups.value >= 4 ? '已超过日常参考量，不用为了杯数继续喝。' : cups.value === 3 ? '少量多次，按自己的身体感受来。' : '喝完再点，慢慢来就好。')
let timer: ReturnType<typeof setInterval> | undefined, loadEpoch=0
function read() {
  day.value = waterDay()
  cups.value = currentWaterStore().entries().filter(entry => entry.day === day.value).length
}
function fail(e: unknown) { error.value = e instanceof Error ? e.message : '保存失败，请重试' }
async function sync() {
  const epoch=loadEpoch
  try { await syncWater(); if(active.value&&epoch===loadEpoch)read() } catch { /* Local writes are durable; retry on the next entry or page open. */ }
}
function drink() {
  try {
    read();currentWaterStore().add(day.value,WATER_CUP_ML)
    read(); error.value=''; feedback.value='add'; revision.value++
    // #ifndef H5
    uni.vibrateShort({type:'light'})
    // #endif
    void sync()
  } catch(e) { fail(e) }
}
function undo() {
  try {
    read()
    const store=currentWaterStore(),entry=store.entries().find(entry=>entry.day===day.value)
    if(!entry)return
    store.remove(entry.id);read();error.value='';feedback.value='undo';revision.value++;void sync()
  } catch(e) { fail(e) }
}
function share() { uni.navigateTo({url:'/pages/water-share/water-share'}) }
function stop() { active.value=false;loadEpoch++;clearInterval(timer) }
onShow(async()=>{active.value=true;const epoch=++loadEpoch;enableAppShareMenu(true);try{if(uni.getStorageSync('session')&&!cachedHome())await request('/me');if(!active.value||epoch!==loadEpoch)return;read();error.value=''}catch(e){fail(e)}if(!active.value||epoch!==loadEpoch)return;void sync();clearInterval(timer);timer=setInterval(()=>{try{read()}catch(e){fail(e)}},15000)})
onHide(stop);onUnmounted(stop)
// #ifdef MP-WEIXIN
onShareAppMessage(waterFriendShare);onShareTimeline(waterTimelineShare)
// #endif
</script>
<template>
  <view class="shell">
    <SubpageHeader label="喝一杯" action-label="提醒朋友" @action="share" />
    <view class="heading"><text class="eyebrow">A LITTLE SIP, A LITTLE JOY</text><text class="headline">喝一杯，冒个泡。</text><text class="subtitle">喝完一杯，碰一下你的小水杯。</text></view>
    <text v-if="error" class="error" role="alert">{{error}}</text>
    <WaterCup :cups="cups" :active="active" :revision="revision" :feedback="feedback" @drink="drink" />
    <view class="stat" aria-live="polite"><text class="stat-label">今天已经喝了</text><view class="count-line"><text class="count">{{cups}}</text><text class="unit">杯</text></view><text class="message">{{message}}</text></view>
    <button class="undo" :disabled="!cups" @click="undo"><UndoIcon />刚才点错了，撤销一杯</button>
  </view>
</template>
<style scoped>
.shell{max-width:430px;min-height:100vh;box-sizing:border-box;margin:auto;padding:0 26px calc(32px + env(safe-area-inset-bottom));background:#faf8f2;color:#494032}.heading{margin-top:25px;margin-bottom:18px}.eyebrow{display:block;color:#94856d;font-size:10px;letter-spacing:2px}.headline{display:block;margin:10px 0 9px;font-size:30px;font-weight:600;letter-spacing:-1px}.subtitle{display:block;color:#8b806e;font-size:13px;line-height:1.8}.stat{text-align:center;margin-top:10px}.stat-label{display:block;font-size:12px;color:#8b806e}.count-line{display:flex;align-items:baseline;justify-content:center;gap:9px;margin-top:6px}.count{font-size:64px;line-height:1.15;font-weight:500;letter-spacing:-3px;font-variant-numeric:tabular-nums}.unit{font-size:16px}.message{display:block;margin-top:12px;color:#897c67;font-size:12px;line-height:1.7;min-height:20px}.undo{display:flex;align-items:center;justify-content:center;gap:8px;min-height:44px;margin:16px auto 0;padding:0 12px;border:0;background:transparent;color:#897c67;font-size:12px;line-height:1.4}.undo::after{border:0}.undo[disabled]{opacity:.35;background:transparent;color:#897c67}.error{display:block;padding:10px 12px;margin-bottom:10px;border-radius:12px;background:#fff0e9;color:#ae4b3b;font-size:12px;line-height:1.6}@media(max-width:360px){.shell{padding-left:20px;padding-right:20px}.heading{margin-top:20px}.headline{font-size:28px}}
</style>
