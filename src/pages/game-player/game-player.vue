<template>
  <view class="player-page">
    <WebGamePlayer
      v-if="game"
      :key="playerKey"
      ref="playerRef"
      :url="game.launchUrl || ''"
      :local-runtime="game.runtime === 'local-gba'"
      :rom-local-url="localRom?.localUrl || ''"
      :rom-name="localRom?.name || ''"
      :rom-identity="localRom ? `sha256-${localRom.sha256}` : ''"
      @reimport="reimportLocalRom"
    />
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { onLoad, onUnload } from '@dcloudio/uni-app'
import WebGamePlayer from '../../features/games/components/WebGamePlayer.vue'
import { findGame, type GameDefinition } from '../../features/games/game-catalog'
import {
  getStoredCloudGbaRom,
  type StoredCloudGbaRom,
} from '../../features/games/cloud-gba'

const game = ref<GameDefinition | null>(null)
const localRom = ref<StoredCloudGbaRom | null>(null)
const playerKey = ref(0)
const playerRef = ref<InstanceType<typeof WebGamePlayer> | null>(null)

onLoad((options) => {
  const selected = findGame(String(options?.id || ''))
  if (!selected) {
    uni.showToast({ title: '游戏不存在', icon: 'none' })
    uni.navigateBack()
    return
  }

  uni.setNavigationBarTitle({ title: selected.title })
  game.value = selected
  if (selected.runtime === 'local-gba') {
    localRom.value = getStoredCloudGbaRom(selected.id, selected.romSha256)
    if (!localRom.value) {
      uni.showToast({ title: '请先下载这个游戏', icon: 'none' })
      setTimeout(() => uni.navigateBack(), 350)
      return
    }
    try { plus.screen.lockOrientation('landscape-primary') } catch {}
  }
})

async function reimportLocalRom() {
  uni.showToast({ title: '请返回游戏页重新下载', icon: 'none' })
  setTimeout(() => uni.navigateBack(), 350)
}

onUnload(() => {
  playerRef.value?.closeWebGame()
  try { plus.screen.lockOrientation('portrait-primary') } catch {}
})
</script>

<style scoped>
.player-page {
  min-height: 100vh;
  background: #111;
}
</style>
