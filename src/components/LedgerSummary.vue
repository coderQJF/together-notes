<script setup lang="ts">
import { computed } from 'vue'
import { formatLedgerAmount, type LedgerSummary } from '../services/note-ledger'

const props = defineProps<{ summary: LedgerSummary }>()
const netTone = computed(() => props.summary.net > 0 ? 'positive' : props.summary.net < 0 ? 'negative' : 'neutral')
const netLabel = computed(() => `${props.summary.net > 0 ? '+' : props.summary.net < 0 ? '-' : ''}¥${formatLedgerAmount(props.summary.net)}`)
</script>

<template>
  <view class="ledger-summary">
    <view class="ledger-heading"><text>智能记账</text><text>已识别 {{ summary.recordCount }} 条</text></view>
    <view class="ledger-values">
      <view><text>支出</text><text class="negative">-¥{{ formatLedgerAmount(summary.expense) }}</text></view>
      <view><text>收入</text><text class="positive">+¥{{ formatLedgerAmount(summary.income) }}</text></view>
      <view class="ledger-net"><text>净额</text><text :class="netTone">{{ netLabel }}</text></view>
    </view>
  </view>
</template>

<style scoped>
.ledger-summary{padding:14px 15px;margin:12px 0;border:1px solid #eadfca;border-radius:18px;background:#fffaf0;color:#494032}.ledger-heading{display:flex;align-items:center;justify-content:space-between;gap:12px}.ledger-heading text:first-child{font-size:14px;font-weight:650}.ledger-heading text:last-child{color:#8b806e;font-size:10px}.ledger-values{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:12px}.ledger-values>view{min-width:0;padding:9px 10px;border-radius:12px;background:#fff}.ledger-values text{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.ledger-values view>text:first-child{color:#8b806e;font-size:9px}.ledger-values view>text:last-child{margin-top:4px;font-size:14px;font-weight:650;font-variant-numeric:tabular-nums}.ledger-net{background:#f7e7ad!important}.positive{color:#46704b}.negative{color:#9f4a3c}.neutral{color:#494032}@media(max-width:360px){.ledger-summary{padding:13px 12px}.ledger-values{gap:5px}.ledger-values>view{padding:8px}.ledger-values view>text:last-child{font-size:12px}}
</style>
