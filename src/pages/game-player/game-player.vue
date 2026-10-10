<template>
  <view class="player-page">
    <!-- #ifdef APP-PLUS -->
    <view v-if="game?.runtime === 'local-gba'" class="native-launch-state">
      <view class="spinner" aria-hidden="true" />
      <text>正在启动本机模拟器</text>
    </view>
    <!-- #endif -->
    <WebGamePlayer
      v-if="game && game.runtime !== 'local-gba'"
      ref="playerRef"
      :url="game.launchUrl || ''"
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

// #ifdef APP-PLUS
import { consumeNativeGbaClosed, openNativeGba } from '@/uni_modules/together-native-gba'
// #endif

const game = ref<GameDefinition | null>(null)
const localRom = ref<StoredCloudGbaRom | null>(null)
const playerRef = ref<InstanceType<typeof WebGamePlayer> | null>(null)
let nativeSessionId = ''
let nativeClosePoll: ReturnType<typeof setInterval> | null = null

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
    setTimeout(() => launchNativePlayer(selected), 0)
  }
})

function launchNativePlayer(selected: GameDefinition) {
  // #ifdef APP-PLUS
  if (!localRom.value) return
  nativeSessionId = `gba-${Date.now()}-${Math.random().toString(36).slice(2)}`
  const opened = openNativeGba(
    localRom.value.absolutePath,
    selected.title,
    `sha256-${localRom.value.sha256}`,
    nativeSessionId,
  )
  if (!opened) {
    uni.showToast({ title: '原生模拟器启动失败', icon: 'none' })
    setTimeout(() => uni.navigateBack(), 350)
    return
  }
  nativeClosePoll = setInterval(() => {
    if (!consumeNativeGbaClosed(nativeSessionId)) return
    if (nativeClosePoll !== null) clearInterval(nativeClosePoll)
    nativeClosePoll = null
    uni.navigateBack()
  }, 300)
  // #endif
}

onUnload(() => {
  if (nativeClosePoll !== null) clearInterval(nativeClosePoll)
  nativeClosePoll = null
  playerRef.value?.closeWebGame()
  try { plus.screen.lockOrientation('portrait-primary') } catch {}
})
</script>

<style scoped>
.player-page {
  min-height: 100vh;
  background: #111;
}

.native-launch-state {
  display: flex;
  min-height: 100vh;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  color: rgba(255, 255, 255, 0.78);
  font-size: 15px;
}

.spinner {
  width: 28px;
  height: 28px;
  border: 3px solid rgba(255, 255, 255, 0.28);
  border-top-color: #f7e7ad;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
