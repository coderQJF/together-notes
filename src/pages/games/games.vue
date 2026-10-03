<script setup lang="ts">
import SubpageHeader from '../../components/SubpageHeader.vue'
import GameHub from '../../features/games/components/GameHub.vue'
import { GAME_CATALOG, type GameDefinition } from '../../features/games/game-catalog'

function launch(game: GameDefinition) {
  const open = () => uni.navigateTo({ url: `/pages/game-player/game-player?id=${encodeURIComponent(game.id)}` })
  if (!game.requiresOwnedRom) {
    open()
    return
  }
  uni.showModal({
    title: '请使用合法的本机 ROM',
    content: '小记不提供、下载或上传游戏 ROM。继续后请在 EmulatorJS 中选择你自行合法持有的 .gba 文件，文件只交给当前模拟器页面处理。',
    confirmText: '我已了解',
    cancelText: '暂不进入',
    confirmColor: '#494032',
    success: result => { if (result.confirm) open() },
  })
}
</script>

<template>
  <view class="shell">
    <SubpageHeader label="游戏" />
    <text class="page-title">放松一下。</text>
    <text class="page-subtitle">游戏本体直接使用 GitHub 上的开源项目，和小记业务保持隔离，后续可以独立替换或抽离。</text>
    <GameHub :games="GAME_CATALOG" @select="launch" />
    <view class="source-note">
      <text class="source-note-title">关于开源与 ROM</text>
      <text>数独加载 MIT 开源项目；GBA 使用 EmulatorJS 官方开源 Demo。小记不会随安装包分发《口袋妖怪》ROM，也不会提供第三方下载地址。</text>
    </view>
  </view>
</template>

<style scoped>
.shell{min-height:100vh;padding:0;padding-right:calc(24px + env(safe-area-inset-right));padding-bottom:calc(36px + env(safe-area-inset-bottom));padding-left:calc(24px + env(safe-area-inset-left));background:#faf8f2;color:#494032;box-sizing:border-box}.page-title{display:block;font-size:30px;font-weight:600;line-height:1.35;letter-spacing:-.5px}.page-subtitle{display:block;max-width:540px;margin-top:9px;color:#786d5b;font-size:12px;line-height:1.75}.source-note{padding:16px;margin-top:22px;border-radius:16px;background:#f4f0e7;color:#786d5b;font-size:10px;line-height:1.75}.source-note-title{display:block;margin-bottom:4px;color:#494032;font-size:11px;font-weight:600}@media(max-width:360px){.shell{padding-right:calc(20px + env(safe-area-inset-right));padding-left:calc(20px + env(safe-area-inset-left))}.page-title{font-size:27px}}
</style>
