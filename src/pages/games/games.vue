<script setup lang="ts">
import SubpageHeader from '../../components/SubpageHeader.vue'
import GameHub from '../../features/games/components/GameHub.vue'
import { ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { GAME_CATALOG, type GameDefinition } from '../../features/games/game-catalog'
import { chooseAndStoreLocalGbaRom, getStoredLocalGbaRom } from '../../features/games/local-gba'

const localGbaReady = ref(false)

onShow(() => {
  localGbaReady.value = Boolean(getStoredLocalGbaRom())
})

function openPlayer(game: GameDefinition) {
  uni.navigateTo({ url: `/pages/game-player/game-player?id=${encodeURIComponent(game.id)}` })
}

async function importLocalGba() {
  try {
    const result = await chooseAndStoreLocalGbaRom(progress => {
      if (progress.phase === 'copying') {
        const percent = progress.totalBytes
          ? Math.min(99, Math.round((progress.bytesCopied || 0) / progress.totalBytes * 100))
          : 0
        uni.showLoading({ title: percent ? `保存中 ${percent}%` : '正在保存', mask: true })
      }
    })
    uni.hideLoading()
    localGbaReady.value = Boolean(result)
    return result
  } catch (reason) {
    uni.hideLoading()
    const message = reason instanceof Error ? reason.message : '无法导入这个 GBA 文件'
    uni.showModal({ title: '导入失败', content: message, showCancel: false, confirmColor: '#494032' })
    return null
  }
}

async function launch(game: GameDefinition) {
  if (!game.requiresOwnedRom) {
    openPlayer(game)
    return
  }
  if (getStoredLocalGbaRom()) {
    openPlayer(game)
    return
  }
  const confirmed = await new Promise<boolean>(resolve => {
    uni.showModal({
      title: '首次选择一次 GBA 文件',
      content: '模拟器与操作界面已随 App 安装，无需代理或联网。受版权限制，小记不能附带《口袋妖怪》ROM；请选择你合法持有的 .gba，保存到 App 私有目录后以后会直接打开。',
      confirmText: '选择文件',
      cancelText: '暂不进入',
      confirmColor: '#494032',
      success: result => resolve(result.confirm),
      fail: () => resolve(false),
    })
  })
  if (!confirmed) return
  const imported = await importLocalGba()
  if (imported) openPlayer(game)
}

async function replaceLocalGba() {
  const confirmed = await new Promise<boolean>(resolve => {
    uni.showModal({
      title: '更换本机 GBA 文件',
      content: '新文件会替换当前保存在 App 私有目录中的 GBA 文件，不会上传到服务器。',
      confirmText: '选择文件',
      cancelText: '取消',
      confirmColor: '#494032',
      success: result => resolve(result.confirm),
      fail: () => resolve(false),
    })
  })
  if (confirmed) await importLocalGba()
}
</script>

<template>
  <view class="shell">
    <SubpageHeader label="游戏" />
    <text class="page-title">放松一下。</text>
    <text class="page-subtitle">游戏运行能力来自 GitHub 开源项目，并与小记业务隔离；本机 ROM 不会上传。</text>
    <GameHub :games="GAME_CATALOG" @select="launch" />
    <view class="source-note">
      <text class="source-note-title">关于开源与 ROM</text>
      <text>GBA 模拟器、mGBA 核心和触控操作界面已内置，可离线启动；数独使用 MIT 开源项目。小记不会随安装包分发《口袋妖怪》ROM，也不会提供第三方下载地址。</text>
      <button v-if="localGbaReady" class="rom-action" @click="replaceLocalGba">更换本机 GBA 文件</button>
    </view>
  </view>
</template>

<style scoped>
.shell{min-height:100vh;padding:0;padding-right:calc(24px + env(safe-area-inset-right));padding-bottom:calc(36px + env(safe-area-inset-bottom));padding-left:calc(24px + env(safe-area-inset-left));background:#faf8f2;color:#494032;box-sizing:border-box}.page-title{display:block;font-size:30px;font-weight:600;line-height:1.35;letter-spacing:-.5px}.page-subtitle{display:block;max-width:540px;margin-top:9px;color:#786d5b;font-size:12px;line-height:1.75}.source-note{padding:16px;margin-top:22px;border-radius:16px;background:#f4f0e7;color:#786d5b;font-size:10px;line-height:1.75}.source-note-title{display:block;margin-bottom:4px;color:#494032;font-size:11px;font-weight:600}.rom-action{display:flex;align-items:center;justify-content:center;min-height:44px;margin:12px 0 0;padding:0 14px;border:1px solid #ded5c2;border-radius:13px;background:#fff;color:#494032;font-size:12px;line-height:44px}.rom-action::after{border:0}@media(max-width:360px){.shell{padding-right:calc(20px + env(safe-area-inset-right));padding-left:calc(20px + env(safe-area-inset-left))}.page-title{font-size:27px}}
</style>
