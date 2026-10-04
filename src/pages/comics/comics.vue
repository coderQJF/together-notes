<script setup lang="ts">
import SubpageHeader from '../../components/SubpageHeader.vue'
import ComicMark from '../../features/comics/components/ComicMark.vue'
</script>

<template>
  <view class="shell">
    <SubpageHeader label="漫画" />
    <view class="hero">
      <ComicMark />
      <view class="hero-copy">
        <view class="title-row"><text class="page-title">漫画阅读</text><text class="status">调研中</text></view>
        <text class="page-subtitle">正在评估适合 App 的本机漫画阅读方案，优先保证打开快、长图顺滑和内容来源清楚。</text>
      </view>
    </view>

    <view class="research-card">
      <text class="card-title">这一版先把入口留好</text>
      <text class="card-copy">后续会围绕本机导入、目录管理、阅读进度和长图浏览继续验证；方案确定前不会接入来源不明的漫画站点。</text>
      <view class="research-list">
        <view><view class="dot" /><text>本机内容优先</text></view>
        <view><view class="dot" /><text>竖向长图阅读</text></view>
        <view><view class="dot" /><text>进度留在设备</text></view>
      </view>
    </view>
  </view>
</template>

<style scoped>
.shell{--subpage-background:#faf8f2;max-width:640px;min-height:100vh;margin:auto;padding:0;padding-right:calc(24px + env(safe-area-inset-right));padding-bottom:calc(42px + env(safe-area-inset-bottom));padding-left:calc(24px + env(safe-area-inset-left));box-sizing:border-box;background:#faf8f2;color:#494032}.hero{display:flex;align-items:flex-start;gap:15px}.hero-copy{min-width:0;flex:1}.title-row{display:flex;align-items:center;gap:9px;min-width:0}.page-title{font-size:30px;font-weight:650;line-height:1.3;letter-spacing:-.5px}.status{display:inline-flex;align-items:center;min-height:26px;padding:0 9px;border-radius:8px;background:#f7e7ad;color:#705a25;font-size:11px;line-height:1;white-space:nowrap}.page-subtitle{display:block;max-width:500px;margin-top:8px;color:#786d5b;font-size:13px;line-height:1.75}.research-card{padding:21px;margin-top:26px;border:1px solid #ece5d6;border-radius:21px;background:#fff}.card-title{display:block;font-size:18px;font-weight:600;line-height:1.45}.card-copy{display:block;margin-top:8px;color:#786d5b;font-size:13px;line-height:1.75}.research-list{display:flex;flex-direction:column;gap:11px;margin-top:18px;padding-top:17px;border-top:1px solid #f0eadf}.research-list>view{display:flex;align-items:center;gap:9px;color:#625744;font-size:13px}.dot{width:8px;height:8px;flex:0 0 8px;border:2px solid #d2b45d;border-radius:50%;box-sizing:border-box;background:#fff9e9}@media(max-width:360px){.shell{padding-right:calc(20px + env(safe-area-inset-right));padding-left:calc(20px + env(safe-area-inset-left))}.page-title{font-size:27px}.hero{gap:12px}.research-card{padding:18px}}
</style>
