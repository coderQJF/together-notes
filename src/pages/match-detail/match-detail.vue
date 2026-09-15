<script setup lang="ts">
import { computed, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import SubpageHeader from '../../components/SubpageHeader.vue'
import { competitionFor, findMatch, matchStart, standings, teamMark, type Match } from '../../data/sports'
import { formatCompactDateTime } from '../../utils/date'

const match = ref<Match | null>(null)
const competition = computed(() => match.value ? competitionFor(match.value.competitionId) : null)
const nearbyStandings = computed(() => match.value ? standings[match.value.competitionId] : [])

function remind() {
  if (!match.value || match.value.status !== 'scheduled') return
  uni.showModal({
    title: '提醒功能预览',
    content: `“${match.value.homeShort} vs ${match.value.awayShort}”目前是示例赛程，接入真实数据后即可设置开赛提醒。`,
    showCancel: false,
    confirmText: '知道了',
  })
}

onLoad(options => {
  match.value = findMatch(typeof options?.id === 'string' ? decodeURIComponent(options.id) : '') || null
})
</script>

<template>
  <view class="shell">
    <SubpageHeader :label="competition?.name || '比赛详情'" fallback="/pages/index/index" />

    <view v-if="!match" class="empty">
      <text class="empty-title">没有找到这场比赛</text>
      <text>示例赛程可能已经更新。</text>
    </view>

    <template v-else>
      <view class="match-heading">
        <text class="stage">{{ match.stage }}{{ match.format ? ` · ${match.format}` : '' }}</text>
        <text class="date">{{ formatCompactDateTime(matchStart(match)) }}</text>
      </view>

      <view class="scoreboard">
        <view class="team">
          <view class="team-emblem dark">{{ teamMark(match.home) }}</view>
          <text class="team-name">{{ match.home }}</text>
          <text class="side">主队</text>
        </view>
        <view class="middle">
          <view v-if="match.status === 'finished'" class="final-score">
            <text>{{ match.score?.[0] }}</text><text class="separator">:</text><text>{{ match.score?.[1] }}</text>
          </view>
          <template v-else>
            <text class="kickoff">{{ match.clock }}</text>
            <text class="versus">VS</text>
          </template>
          <text class="status" :class="{ finished: match.status === 'finished' }">{{ match.status === 'finished' ? '已结束' : '未开始' }}</text>
        </view>
        <view class="team">
          <view class="team-emblem light">{{ teamMark(match.away) }}</view>
          <text class="team-name">{{ match.away }}</text>
          <text class="side">客队</text>
        </view>
      </view>

      <view class="venue-row">
        <view class="location-mark"><image src="/static/nav-icons/location-active.png" mode="aspectFit" /></view>
        <view>
          <text class="venue">{{ match.venue }}</text>
          <text class="muted">{{ competition?.kind }} · {{ competition?.name }}</text>
        </view>
      </view>

      <button v-if="match.status === 'scheduled'" class="primary" @click="remind">
        <image class="bell-mark" src="/static/nav-icons/bell-inactive.png" mode="aspectFit" />
        <text>设置开赛提醒</text>
      </button>

      <view class="section">
        <text class="section-kicker">比赛前瞻</text>
        <text class="section-title">这场值得看什么</text>
        <text class="preview-copy">{{ match.preview }}</text>
        <view class="facts-card">
          <view v-for="(fact, index) in match.facts" :key="fact" class="fact-row">
            <text class="fact-index">0{{ index + 1 }}</text>
            <text>{{ fact }}</text>
          </view>
        </view>
      </view>

      <view class="section">
        <text class="section-kicker">近期状态</text>
        <text class="section-title">最近五场</text>
        <view class="form-card">
          <view class="form-row">
            <text class="form-team">{{ match.homeShort }}</text>
            <view class="form-list">
              <text v-for="(result, index) in match.homeForm" :key="index" :class="['form-dot', `result-${result}`]">{{ result }}</text>
            </view>
          </view>
          <view class="form-row">
            <text class="form-team">{{ match.awayShort }}</text>
            <view class="form-list">
              <text v-for="(result, index) in match.awayForm" :key="index" :class="['form-dot', `result-${result}`]">{{ result }}</text>
            </view>
          </view>
        </view>
      </view>

      <view class="section">
        <text class="section-kicker">排名快照</text>
        <text class="section-title">积分榜前列</text>
        <view class="standing-card">
          <view v-for="row in nearbyStandings" :key="row.team" class="standing-row" :class="{ related: row.team === match.home || row.team === match.away || row.team === match.homeShort || row.team === match.awayShort }">
            <text class="standing-rank">{{ row.rank }}</text>
            <text class="standing-team">{{ row.team }}</text>
            <text class="standing-record">{{ row.record }}</text>
            <text class="standing-points">{{ row.points }}<text> 分</text></text>
          </view>
        </view>
      </view>

      <text class="disclaimer">以上均为首版示例数据，不代表真实赛程、赛果或排名。</text>
    </template>
  </view>
</template>

<style scoped>
.shell{max-width:640px;min-height:100vh;margin:auto;padding:calc(8px + var(--status-bar-height)) 24px calc(48px + env(safe-area-inset-bottom));background:#faf8f2;color:#3e382d}.empty{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;min-height:55vh;color:#786d5b}.empty-title{font-size:20px;font-weight:600;color:#3e382d}.match-heading{text-align:center;margin:2px 0 10px}.stage{display:block;color:#786d5b;font-size:12px}.date{display:block;margin-top:8px;font-size:15px;font-weight:600;font-variant-numeric:tabular-nums;white-space:nowrap}
.scoreboard{display:grid;grid-template-columns:minmax(0,1fr) 84px minmax(0,1fr);align-items:start;gap:10px;padding:25px 12px 23px;margin-top:16px;border:1px solid #efdfaa;border-radius:24px;background:#f7e7ad}.team{display:flex;flex-direction:column;align-items:center;min-width:0}.team-emblem{display:flex;align-items:center;justify-content:center;width:58px;height:58px;border-radius:19px;font-size:12px;font-weight:700;letter-spacing:.3px}.dark{background:#494032;color:#fff9e9}.light{border:1px solid #dacb9d;background:#fff9e9;color:#494032}.team-name{display:block;width:100%;margin-top:12px;overflow:hidden;text-align:center;text-overflow:ellipsis;white-space:nowrap;font-size:14px;font-weight:600}.side{margin-top:5px;color:#8a7649;font-size:11px}.middle{display:flex;flex-direction:column;align-items:center;padding-top:8px}.kickoff{font-size:25px;font-weight:700;font-variant-numeric:tabular-nums}.versus{margin-top:2px;color:#8b774c;font-size:11px}.final-score{display:flex;align-items:center;gap:6px;font-size:31px;font-weight:700;font-variant-numeric:tabular-nums}.separator{color:#a99562;font-weight:400}.status{display:inline-flex;align-items:center;height:24px;margin-top:10px;padding:0 8px;border-radius:8px;background:#494032;color:#fff9e9;font-size:10px}.status.finished{background:#fff9e9;color:#78642e}
.venue-row{display:flex;align-items:center;gap:12px;padding:17px;margin:13px 0 0;border:1px solid #ece5d6;border-radius:18px;background:#fff}.location-mark{display:flex;align-items:center;justify-content:center;width:40px;height:40px;flex:0 0 40px;border-radius:12px;background:#f5edd3}.location-mark image{display:block;width:19px;height:19px}.venue{display:block;font-size:13px;font-weight:600}.muted{display:block;margin-top:4px;color:#786d5b;font-size:11px}.primary{display:flex;align-items:center;justify-content:center;gap:9px;width:100%;height:50px;margin:14px 0 0;border:0;border-radius:15px;background:#494032;color:#fff9e9;font-size:14px}.primary::after{border:0}.bell-mark{display:block;width:18px;height:18px}
.section{margin-top:31px}.section-kicker{display:block;margin-bottom:5px;color:#9b8758;font-size:10px;letter-spacing:1px}.section-title{display:block;font-size:20px;font-weight:600}.preview-copy{display:block;margin-top:12px;color:#62594a;font-size:14px;line-height:1.8}.facts-card,.form-card,.standing-card{margin-top:14px;border:1px solid #ece5d6;border-radius:19px;background:#fff;overflow:hidden}.fact-row{display:flex;align-items:flex-start;gap:13px;padding:15px 17px;border-bottom:1px solid #f1ecdf;font-size:13px;line-height:1.6}.fact-row:last-child{border-bottom:0}.fact-index{color:#b28b35;font-size:10px;font-weight:700;font-variant-numeric:tabular-nums}.form-row{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:62px;padding:0 17px;border-bottom:1px solid #f1ecdf}.form-row:last-child{border-bottom:0}.form-team{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px;font-weight:600}.form-list{display:flex;gap:5px}.form-dot{display:flex;align-items:center;justify-content:center;width:27px;height:27px;border-radius:9px;background:#e9e5da;color:#786d5b;font-size:10px}.result-胜{background:#e2eddc;color:#4f7045}.result-负{background:#f1dfda;color:#9a5246}.result-平{background:#eee9d8;color:#807044}
.standing-row{display:grid;grid-template-columns:28px minmax(0,1fr) 76px 52px;align-items:center;min-height:50px;padding:0 15px;border-bottom:1px solid #f1ecdf;font-size:11px}.standing-row:last-child{border-bottom:0}.standing-row.related{background:#fffae9}.standing-rank{color:#998b73}.standing-team{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px}.standing-record{color:#786d5b;text-align:right}.standing-points{text-align:right;font-size:13px;font-weight:700}.standing-points text{font-size:9px;font-weight:400}.disclaimer{display:block;margin-top:25px;color:#a09582;font-size:10px;line-height:1.6;text-align:center}
.section-kicker{color:#745b23;font-size:11px}.fact-index,.form-dot{font-size:11px}.status{font-size:11px}.standing-points text{font-size:10px}.disclaimer{color:#786d5b;font-size:11px}
/* #ifdef MP-WEIXIN */
.shell{padding-top:0}
/* #endif */
/* #ifdef H5 */
.shell{padding-top:calc(22px + env(safe-area-inset-top))}
/* #endif */
/* #ifdef APP-PLUS */
.shell{padding-top:calc(12px + var(--status-bar-height))}
/* #endif */
@media(max-width:360px){.shell{padding-left:20px;padding-right:20px}.scoreboard{grid-template-columns:minmax(0,1fr) 72px minmax(0,1fr);padding-left:7px;padding-right:7px}.team-emblem{width:52px;height:52px}.final-score{font-size:28px}.form-dot{width:24px;height:24px}}
.shell{padding-left:calc(24px + env(safe-area-inset-left));padding-right:calc(24px + env(safe-area-inset-right))}
@media(max-width:360px){.shell{padding-left:calc(20px + env(safe-area-inset-left));padding-right:calc(20px + env(safe-area-inset-right))}}
</style>
