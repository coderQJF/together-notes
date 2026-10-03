<template>
  <view class="player-page">
    <WebGamePlayer v-if="launchUrl" ref="playerRef" :url="launchUrl" />
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { onLoad, onUnload } from '@dcloudio/uni-app'
import WebGamePlayer from '../../features/games/components/WebGamePlayer.vue'
import { findGame } from '../../features/games/game-catalog'

const launchUrl = ref('')
const playerRef = ref<InstanceType<typeof WebGamePlayer> | null>(null)

onLoad((options) => {
  const game = findGame(String(options?.id || ''))
  if (!game) {
    uni.showToast({ title: '游戏不存在', icon: 'none' })
    uni.navigateBack()
    return
  }

  uni.setNavigationBarTitle({ title: game.title })
  launchUrl.value = game.launchUrl
})

onUnload(() => {
  playerRef.value?.closeWebGame()
})
</script>

<style scoped>
.player-page {
  min-height: 100vh;
  background: #111;
}
</style>
