<script setup lang="ts">
import GameMark from './GameMark.vue'
import type { GameDefinition } from '../game-catalog'

withDefaults(defineProps<{
  games: readonly GameDefinition[]
  downloadProgress?: Readonly<Record<string, number>>
  downloadErrors?: Readonly<Record<string, string>>
}>(), {
  downloadProgress: () => ({}),
  downloadErrors: () => ({}),
})
const emit = defineEmits<{ select: [game: GameDefinition] }>()
</script>

<template>
  <view class="game-list">
    <button
      v-for="game in games"
      :key="game.id"
      class="game-card"
      :disabled="downloadProgress[game.id] !== undefined"
      hover-class="game-card-pressed"
      :aria-label="downloadProgress[game.id] !== undefined ? `${game.title}下载中${downloadProgress[game.id]}%` : `打开${game.title}`"
      @click="emit('select', game)"
    >
      <GameMark :kind="game.mark" />
      <view class="game-copy">
        <view class="game-title-row"><text class="game-title">{{ game.title }}</text><text class="game-tag">{{ game.tag }}</text></view>
        <text class="game-description">{{ game.description }}</text>
        <text class="game-source">运行来源：{{ game.sourceName }} · {{ game.license }}</text>
        <view v-if="downloadProgress[game.id] !== undefined" class="download-state" aria-live="polite">
          <view class="download-label"><text>正在下载</text><text>{{ downloadProgress[game.id] }}%</text></view>
          <view class="download-track"><view :style="{ width: `${downloadProgress[game.id]}%` }" /></view>
        </view>
        <text v-else-if="downloadErrors[game.id]" class="download-error" aria-live="assertive">{{ downloadErrors[game.id] }} · 点按重试</text>
      </view>
      <view v-if="downloadProgress[game.id] === undefined" class="game-chevron" />
    </button>
  </view>
</template>

<style scoped>
.game-list{display:flex;flex-direction:column;gap:14px;margin-top:24px}.game-card{display:flex;align-items:center;gap:14px;width:100%;min-height:118px;margin:0;padding:18px;border:1px solid #ece5d6;border-radius:21px;background:#fff;color:#494032;text-align:left;box-shadow:0 8px 22px rgba(73,64,50,.04)}.game-card::after{border:0}.game-card[disabled]{opacity:1}.game-card-pressed{transform:scale(.985);background:#fffdf6}.game-copy{min-width:0;flex:1}.game-title-row{display:flex;align-items:center;gap:8px;min-width:0}.game-title{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:16px;font-weight:600;line-height:1.4}.game-tag{display:inline-flex;align-items:center;height:23px;flex:0 0 auto;padding:0 7px;border-radius:7px;background:#f7e7ad;color:#755d24;font-size:9px;line-height:1;white-space:nowrap}.game-description{display:-webkit-box;margin-top:7px;overflow:hidden;color:#786d5b;font-size:11px;line-height:1.65;-webkit-box-orient:vertical;-webkit-line-clamp:2}.game-source{display:block;margin-top:7px;overflow:hidden;color:#a09480;font-size:9px;line-height:1.4;text-overflow:ellipsis;white-space:nowrap}.download-state{margin-top:10px}.download-label{display:flex;align-items:center;justify-content:space-between;color:#755d24;font-size:10px;line-height:1.4}.download-track{height:6px;margin-top:5px;overflow:hidden;border-radius:6px;background:#eee9dd}.download-track view{height:100%;border-radius:inherit;background:#b68c2c;transition:width .18s ease}.download-error{display:block;margin-top:8px;overflow:hidden;color:#a54b3d;font-size:10px;line-height:1.5;text-overflow:ellipsis;white-space:nowrap}.game-chevron{width:9px;height:9px;flex:0 0 9px;margin-right:3px;border-top:1.5px solid #998d79;border-right:1.5px solid #998d79;transform:rotate(45deg)}
@media(max-width:360px){.game-card{gap:11px;padding:15px}.game-title-row{align-items:flex-start;flex-direction:column;gap:4px}.game-description{-webkit-line-clamp:3}}
</style>
