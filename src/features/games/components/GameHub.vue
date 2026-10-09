<script setup lang="ts">
import GameMark from './GameMark.vue'
import type { GameDefinition } from '../game-catalog'

defineProps<{ games: readonly GameDefinition[] }>()
const emit = defineEmits<{ select: [game: GameDefinition] }>()
</script>

<template>
  <view class="game-list">
    <button
      v-for="game in games"
      :key="game.id"
      class="game-card"
      hover-class="game-card-pressed"
      :aria-label="`打开${game.title}`"
      @click="emit('select', game)"
    >
      <GameMark :kind="game.mark" />
      <view class="game-copy">
        <view class="game-title-row"><text class="game-title">{{ game.title }}</text><text class="game-tag">{{ game.tag }}</text></view>
        <text class="game-description">{{ game.description }}</text>
        <text class="game-source">运行来源：{{ game.sourceName }} · {{ game.license }}</text>
      </view>
      <view class="game-chevron" />
    </button>
  </view>
</template>

<style scoped>
.game-list{display:flex;flex-direction:column;gap:14px;margin-top:24px}.game-card{display:flex;align-items:center;gap:14px;width:100%;min-height:118px;margin:0;padding:18px;border:1px solid #ece5d6;border-radius:21px;background:#fff;color:#494032;text-align:left;box-shadow:0 8px 22px rgba(73,64,50,.04)}.game-card::after{border:0}.game-card-pressed{transform:scale(.985);background:#fffdf6}.game-copy{min-width:0;flex:1}.game-title-row{display:flex;align-items:center;gap:8px;min-width:0}.game-title{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:16px;font-weight:600;line-height:1.4}.game-tag{display:inline-flex;align-items:center;height:23px;flex:0 0 auto;padding:0 7px;border-radius:7px;background:#f7e7ad;color:#755d24;font-size:9px;line-height:1;white-space:nowrap}.game-description{display:-webkit-box;margin-top:7px;overflow:hidden;color:#786d5b;font-size:11px;line-height:1.65;-webkit-box-orient:vertical;-webkit-line-clamp:2}.game-source{display:block;margin-top:7px;overflow:hidden;color:#a09480;font-size:9px;line-height:1.4;text-overflow:ellipsis;white-space:nowrap}.game-chevron{width:9px;height:9px;flex:0 0 9px;margin-right:3px;border-top:1.5px solid #998d79;border-right:1.5px solid #998d79;transform:rotate(45deg)}
@media(max-width:360px){.game-card{gap:11px;padding:15px}.game-title-row{align-items:flex-start;flex-direction:column;gap:4px}.game-description{-webkit-line-clamp:3}}
</style>
