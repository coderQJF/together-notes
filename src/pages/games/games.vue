<script setup lang="ts">
import SubpageHeader from '../../components/SubpageHeader.vue'
import GameHub from '../../features/games/components/GameHub.vue'
import { ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { GAME_CATALOG, cacheCloudGames, getCachedCloudGames, mapCloudGames, type GameDefinition } from '../../features/games/game-catalog'
import { downloadAndStoreCloudGba, getStoredCloudGbaRom } from '../../features/games/cloud-gba'
import { listCloudGames } from '../../services/api'

const games = ref<GameDefinition[]>([...GAME_CATALOG])
const loadingGames = ref(false)
const downloadProgress = ref<Record<string, number>>({})
const downloadErrors = ref<Record<string, string>>({})

onShow(async () => {
  loadingGames.value = true
  try {
    const cloudGames = mapCloudGames(await listCloudGames())
    cacheCloudGames(cloudGames)
    games.value = [...cloudGames, ...GAME_CATALOG]
  } catch {
    games.value = [...getCachedCloudGames(), ...GAME_CATALOG]
  } finally { loadingGames.value = false }
})

function openPlayer(game: GameDefinition) {
  uni.navigateTo({ url: `/pages/game-player/game-player?id=${encodeURIComponent(game.id)}` })
}

async function launch(game: GameDefinition) {
  if (game.runtime !== 'local-gba') {
    openPlayer(game)
    return
  }
  if (getStoredCloudGbaRom(game.id, game.romSha256)) {
    openPlayer(game)
    return
  }
  if (downloadProgress.value[game.id] !== undefined) return
  const { [game.id]: _previousError, ...remainingErrors } = downloadErrors.value
  downloadErrors.value = remainingErrors
  downloadProgress.value = { ...downloadProgress.value, [game.id]: 0 }
  try {
    const downloaded = await downloadAndStoreCloudGba(game, percent => {
      downloadProgress.value = { ...downloadProgress.value, [game.id]: percent }
    })
    if (downloaded) openPlayer(game)
  } catch (reason) {
    downloadErrors.value = {
      ...downloadErrors.value,
      [game.id]: reason instanceof Error ? reason.message : '游戏下载失败',
    }
  } finally {
    const { [game.id]: _completedProgress, ...remainingProgress } = downloadProgress.value
    downloadProgress.value = remainingProgress
  }
}
</script>

<template>
  <view class="shell">
    <SubpageHeader label="游戏" />
    <text class="page-title">放松一下。</text>
    <text class="page-subtitle">游戏运行能力来自 GitHub 开源项目，并与小记业务隔离；本机 ROM 不会上传。</text>
    <text v-if="loadingGames" class="catalog-status">正在同步游戏库…</text>
    <GameHub :games="games" :download-progress="downloadProgress" :download-errors="downloadErrors" @select="launch" />
    <view class="source-note">
      <text class="source-note-title">关于开源与 ROM</text>
      <text>GBA 模拟器、mGBA 核心和触控操作界面已内置。游戏从小记游戏库下载一次后保存在本机，后续启动不再消耗流量；数独使用 MIT 开源项目。</text>
    </view>
  </view>
</template>

<style scoped>
.shell{min-height:100vh;padding:0;padding-right:calc(24px + env(safe-area-inset-right));padding-bottom:calc(36px + env(safe-area-inset-bottom));padding-left:calc(24px + env(safe-area-inset-left));background:#faf8f2;color:#494032;box-sizing:border-box}.page-title{display:block;font-size:30px;font-weight:600;line-height:1.35;letter-spacing:-.5px}.page-subtitle{display:block;max-width:540px;margin-top:9px;color:#786d5b;font-size:12px;line-height:1.75}.catalog-status{display:block;margin-top:18px;color:#8c806d;font-size:12px}.source-note{padding:16px;margin-top:22px;border-radius:16px;background:#f4f0e7;color:#786d5b;font-size:10px;line-height:1.75}.source-note-title{display:block;margin-bottom:4px;color:#494032;font-size:11px;font-weight:600}@media(max-width:360px){.shell{padding-right:calc(20px + env(safe-area-inset-right));padding-left:calc(20px + env(safe-area-inset-left))}.page-title{font-size:27px}}
</style>
