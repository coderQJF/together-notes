<template>
  <view class="water-cup-icon" aria-hidden="true">
    <view class="water-cup-frames" />
  </view>
</template>
<style scoped>
.water-cup-icon{display:block;width:56px;height:56px;flex:0 0 56px;pointer-events:none;transform-origin:50% 85%;animation:water-cup-sway 3.8s ease-in-out infinite}
/* Transparent frames preserve the clipped water wave on App and WeChat. */
.water-cup-frames{display:block;width:56px;height:56px;background-image:url('/static/nav-icons/water-cup-wave.png');background-repeat:no-repeat;background-size:1344px 56px;animation:water-cup-wave 3.8s steps(24) infinite}
@keyframes water-cup-sway{0%,100%{transform:rotate(-4deg)}50%{transform:rotate(4deg)}}
@keyframes water-cup-wave{from{background-position:0 0}to{background-position:-1344px 0}}
@media(prefers-reduced-motion:reduce){.water-cup-icon,.water-cup-frames{animation:none}}
</style>
