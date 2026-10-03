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
  chooseAndStoreLocalGbaRom,
  getStoredLocalGbaRom,
  type StoredLocalGbaRom,
} from '../../features/games/local-gba'

const game = ref<GameDefinition | null>(null)
const localRom = ref<StoredLocalGbaRom | null>(null)
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
    localRom.value = getStoredLocalGbaRom()
    if (!localRom.value) {
      uni.showToast({ title: '请先导入本机 GBA 文件', icon: 'none' })
      setTimeout(() => uni.navigateBack(), 350)
      return
    }
    try { plus.screen.lockOrientation('landscape-primary') } catch {}
  }
})

async function reimportLocalRom() {
  try {
    const result = await chooseAndStoreLocalGbaRom(progress => {
      if (progress.phase === 'copying') uni.showLoading({ title: '正在保存', mask: true })
    })
    uni.hideLoading()
    if (!result) return
    localRom.value = result
    playerKey.value += 1
  } catch (reason) {
    uni.hideLoading()
    uni.showModal({
      title: '导入失败',
      content: reason instanceof Error ? reason.message : '无法导入这个 GBA 文件',
      showCancel: false,
      confirmColor: '#494032',
    })
  }
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
