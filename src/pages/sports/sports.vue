<script setup lang="ts">
import { computed, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import SubpageHeader from '../../components/SubpageHeader.vue'
import { competitionFor, competitions, matchesFor, matchStart, standings, teamMark, type CompetitionId, type Match } from '../../data/sports'
import { formatClock, formatDayHeading } from '../../utils/date'

type SportsMode = 'upcoming' | 'results' | 'standings'

const savedCompetition = uni.getStorageSync('sports-competition') as CompetitionId
const selectedId = ref<CompetitionId>(competitions.some(item => item.id === savedCompetition) ? savedCompetition : 'epl')
const mode = ref<SportsMode>('upcoming')

const selectedCompetition = computed(() => competitionFor(selectedId.value))
const visibleMatches = computed(() => matchesFor(selectedId.value, mode.value === 'results' ? 'finished' : 'scheduled'))

function selectCompetition(id: CompetitionId) {
  selectedId.value = id
  uni.setStorageSync('sports-competition', id)
}

function openMatch(match: Match) {
  uni.navigateTo({ url: `/pages/match-detail/match-detail?id=${encodeURIComponent(match.id)}` })
}

function remind(match: Match) {
  uni.showModal({
    title: '提醒功能预览',
    content: `“${match.homeShort} vs ${match.awayShort}”目前是示例赛程，接入真实数据后即可设置开赛提醒。`,
    showCancel: false,
    confirmText: '知道了',
  })
}

onLoad(options => {
  const requested = options?.league as CompetitionId | undefined
  if (requested && competitions.some(item => item.id === requested)) selectCompetition(requested)
})
</script>

<template>
  <view class="shell">
    <SubpageHeader label="比赛" />

    <text class="eyebrow">我们的观赛清单</text>
    <view class="headline"><text>下一场，</text><text>一起等开球。</text></view>
    <text class="subtitle">选一个喜欢的赛事，看近期安排、历史比分和排名。</text>
    <view class="demo-state"><view class="preview-dot" /><text>设计预览 · 当前展示示例赛程</text></view>

    <scroll-view class="competition-scroll" scroll-x :show-scrollbar="false">
      <view class="competition-row">
        <button v-for="competition in competitions" :key="competition.id" class="competition-chip" :class="{ active: selectedId === competition.id }" @click="selectCompetition(competition.id)">
          <text class="competition-mark">{{ competition.mark }}</text>
          <text>{{ competition.name }}</text>
        </button>
      </view>
    </scroll-view>

    <view class="competition-intro">
      <view class="league-emblem">{{ selectedCompetition.mark }}</view>
      <view class="intro-copy">
        <text class="intro-name">{{ selectedCompetition.name }}</text>
        <text class="intro-description">{{ selectedCompetition.description }}</text>
      </view>
      <text class="kind-tag">{{ selectedCompetition.kind }}</text>
    </view>

    <view class="mode-tabs">
      <button :class="{ active: mode === 'upcoming' }" @click="mode = 'upcoming'">近期赛程</button>
      <button :class="{ active: mode === 'results' }" @click="mode = 'results'">历史赛果</button>
      <button :class="{ active: mode === 'standings' }" @click="mode = 'standings'">积分榜</button>
    </view>

    <template v-if="mode !== 'standings'">
      <view class="section-heading">
        <text class="section-title">{{ mode === 'upcoming' ? '接下来' : '最近结束' }}</text>
        <text class="section-count">{{ visibleMatches.length }} 场</text>
      </view>

      <view v-for="(match, index) in visibleMatches" :key="match.id" class="match-card" :class="{ featured: mode === 'upcoming' && index === 0 }" @click="openMatch(match)">
        <view class="match-topline">
          <text>{{ formatDayHeading(matchStart(match)) }} · {{ formatClock(matchStart(match)) }}</text>
          <text>{{ match.stage }}</text>
        </view>
        <view class="scoreline">
          <view class="team home-team">
            <view class="team-mark">{{ teamMark(match.home) }}</view>
            <text class="team-name">{{ match.homeShort }}</text>
          </view>
          <view v-if="match.status === 'finished'" class="score">
            <text>{{ match.score?.[0] }}</text><text class="score-separator">:</text><text>{{ match.score?.[1] }}</text>
          </view>
          <view v-else class="versus">
            <text>VS</text>
            <text class="clock">{{ match.clock }}</text>
          </view>
          <view class="team away-team">
            <view class="team-mark alt">{{ teamMark(match.away) }}</view>
            <text class="team-name">{{ match.awayShort }}</text>
          </view>
        </view>
        <view class="match-footer">
          <view class="venue-line"><image src="/static/nav-icons/location-active.png" mode="aspectFit" /><text>{{ match.format || match.venue }}</text></view>
          <button v-if="match.status === 'scheduled'" class="remind" @click.stop="remind(match)">
            <image src="/static/nav-icons/bell-inactive.png" mode="aspectFit" />
            <text>设提醒</text>
          </button>
          <view v-else class="detail-link"><text>看详情</text><view class="chevron" /></view>
        </view>
      </view>
    </template>

    <view v-else class="standings-card">
      <view class="table-head">
        <text class="rank">排名</text><text class="club">队伍</text><text>场次</text><text>{{ selectedId === 'lol' ? '大场' : '净胜' }}</text><text>积分</text>
      </view>
      <view v-for="row in standings[selectedId]" :key="row.team" class="table-row">
        <text class="rank" :class="{ top: row.rank <= 2 }">{{ row.rank }}</text>
        <text class="club">{{ row.team }}</text>
        <text>{{ row.played }}</text>
        <text>{{ row.record }}</text>
        <text class="points">{{ row.points }}</text>
      </view>
      <text class="table-note">示例排名用于确认页面结构，接入数据源后按官方规则展示。</text>
    </view>

    <view class="source-note">
      <text class="source-title">关于这版</text>
      <text>赛程、赛果和积分目前是交互示例；接入真实数据后可一键设置开赛提醒。</text>
    </view>
  </view>
</template>

<style scoped>
.shell{max-width:640px;min-height:100vh;margin:auto;padding:calc(8px + var(--status-bar-height)) 24px calc(48px + env(safe-area-inset-bottom));background:#faf8f2;color:#3e382d}.eyebrow{display:block;margin:2px 0 7px;color:#786d5b;font-size:12px}.headline{display:block;margin:0;font-size:32px;font-weight:600;line-height:1.3;letter-spacing:-.8px}.headline text{display:block}.subtitle{display:block;margin-top:12px;color:#786d5b;font-size:14px;line-height:1.7}.demo-state{display:flex;align-items:center;gap:7px;margin-top:13px;color:#8a7649;font-size:11px}.preview-dot{width:6px;height:6px;flex:0 0 6px;border-radius:50%;background:#b28b35}
.competition-scroll{width:calc(100% + 48px);margin:22px -24px 14px}.competition-row{display:inline-flex;gap:9px;padding:0 24px;white-space:nowrap}.competition-chip{display:inline-flex;align-items:center;gap:7px;width:auto;height:44px;min-height:44px;flex:0 0 auto;margin:0;padding:0 14px;border:1px solid #ece5d6;border-radius:22px;background:#fff;color:#786d5b;font-size:13px;line-height:1;white-space:nowrap}.competition-chip::after{border:0}.competition-chip.active{border-color:#494032;background:#494032;color:#fff9e9}.competition-chip text{white-space:nowrap}.competition-mark{display:flex;align-items:center;justify-content:center;min-width:24px;height:24px;padding:0 5px;border-radius:8px;background:#f7e7ad;color:#5d4a24;font-size:10px;font-weight:700;letter-spacing:-.2px}.competition-chip.active .competition-mark{background:#f7e7ad}
.competition-intro{display:flex;align-items:center;gap:12px;padding:14px 15px;margin:12px 0 16px;border:1px solid #efdfaa;border-radius:17px;background:#f7e7ad}.league-emblem{display:flex;align-items:center;justify-content:center;width:42px;height:42px;flex:0 0 42px;border-radius:13px;background:#fff9e9;color:#5d4a24;font-size:11px;font-weight:700;box-shadow:inset 0 0 0 1px #ead69a}.intro-copy{min-width:0;flex:1}.intro-name{display:block;font-size:17px;font-weight:600}.intro-description{display:block;margin-top:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#75643c;font-size:12px}.kind-tag{display:inline-flex;align-items:center;height:25px;padding:0 8px;border-radius:8px;background:#fff9e9;color:#78642e;font-size:11px;white-space:nowrap}
.mode-tabs{display:flex;gap:4px;padding:4px;border:1px solid #ece5d6;border-radius:16px;background:#fff}.mode-tabs button{height:44px;min-width:0;margin:0;padding:0 7px;flex:1;border:0;border-radius:12px;background:transparent;color:#786d5b;font-size:13px;line-height:1}.mode-tabs button::after{border:0}.mode-tabs button.active{background:#494032;color:#fff9e9}.section-heading{display:flex;align-items:center;justify-content:space-between;margin:24px 2px 10px}.section-title{font-size:19px;font-weight:600}.section-count{color:#867b68;font-size:12px}
.match-card{padding:17px 18px 16px;margin:11px 0;border:1px solid #ece5d6;border-radius:20px;background:#fff}.match-card.featured{border-color:#efd98d;background:#f9e9ae}.match-topline{display:flex;align-items:center;justify-content:space-between;gap:10px;color:#786d5b;font-size:11px;white-space:nowrap}.match-topline text{min-width:0;overflow:hidden;text-overflow:ellipsis}.scoreline{display:grid;grid-template-columns:minmax(0,1fr) 72px minmax(0,1fr);align-items:start;gap:8px;margin:18px 0}.team{display:flex;flex-direction:column;align-items:center;gap:8px;min-width:0;text-align:center}.home-team,.away-team{justify-content:flex-start;text-align:center}.team-mark{display:flex;align-items:center;justify-content:center;width:43px;height:43px;flex:0 0 43px;border-radius:14px;background:#494032;color:#fff9e9;font-size:10px;font-weight:700;letter-spacing:.2px}.team-mark.alt{background:#fff;border:1px solid #dacda5;color:#494032}.team-name{display:block;width:100%;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:14px;font-weight:600}.versus,.score{display:flex;align-items:center;justify-content:center;gap:4px;padding-top:5px;font-variant-numeric:tabular-nums}.versus{flex-direction:column;color:#998761;font-size:10px}.versus .clock{color:#3e382d;font-size:18px;font-weight:700}.score{font-size:25px;font-weight:700}.score-separator{color:#b5a98f;font-weight:400}.match-footer{display:flex;align-items:center;justify-content:space-between;gap:10px;min-height:44px;padding-top:10px;border-top:1px solid rgba(141,123,81,.16);color:#786d5b;font-size:11px}.venue-line{display:flex;align-items:center;gap:7px;min-width:0}.venue-line image{display:block;width:13px;height:13px;flex:0 0 13px}.venue-line text{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.remind{display:flex;align-items:center;justify-content:center;gap:6px;width:auto;height:40px;min-height:40px;flex:0 0 auto;margin:0;padding:0 12px;border:0;border-radius:12px;background:#494032;color:#fff9e9;font-size:12px;line-height:1}.remind image{display:block;width:15px;height:15px}.remind::after{border:0}.detail-link{display:flex;align-items:center;gap:7px;min-height:40px;color:#6f5b2a}.chevron{width:7px;height:7px;margin-right:2px;border-top:1.5px solid currentColor;border-right:1.5px solid currentColor;transform:rotate(45deg)}
.standings-card{padding:8px 17px 14px;margin-top:17px;border:1px solid #ece5d6;border-radius:20px;background:#fff}.table-head,.table-row{display:grid;grid-template-columns:42px minmax(90px,1fr) 42px 62px 38px;align-items:center;min-height:48px;column-gap:4px;font-size:12px;text-align:center}.table-head{min-height:42px;color:#958a76;font-size:11px}.table-row{border-top:1px solid #f1ecdf;color:#61594b}.rank{text-align:left}.club{text-align:left;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px}.rank.top{color:#9a7626;font-weight:700}.points{font-size:14px;font-weight:700;color:#3e382d}.table-note{display:block;padding:13px 0 2px;border-top:1px solid #f1ecdf;color:#958a76;font-size:11px;line-height:1.6}
.source-note{padding:17px;margin-top:25px;border-radius:16px;background:#f1ede3;color:#786d5b;font-size:12px;line-height:1.7}.source-title{display:block;margin-bottom:4px;color:#494032;font-size:13px;font-weight:600}
.section-count,.table-head,.table-note{color:#786d5b}.versus{font-size:11px}.match-footer{min-height:48px}.remind{height:44px;min-height:44px}.detail-link{min-height:44px}
/* #ifdef MP-WEIXIN */
.shell{padding-top:0}
/* #endif */
/* #ifdef H5 */
.shell{padding-top:calc(22px + env(safe-area-inset-top))}
/* #endif */
/* #ifdef APP-PLUS */
.shell{padding-top:calc(12px + var(--status-bar-height))}
/* #endif */
@media(max-width:360px){.shell{padding-left:20px;padding-right:20px}.competition-scroll{width:calc(100% + 40px);margin-left:-20px;margin-right:-20px}.competition-row{padding:0 20px}.headline{font-size:29px}.scoreline{grid-template-columns:minmax(0,1fr) 62px minmax(0,1fr);gap:5px}.team-mark{width:40px;height:40px;flex-basis:40px}.match-card{padding-left:16px;padding-right:16px}.table-head,.table-row{grid-template-columns:28px minmax(68px,1fr) 34px 48px 30px}}
.shell{padding-left:calc(24px + env(safe-area-inset-left));padding-right:calc(24px + env(safe-area-inset-right))}
@media(max-width:360px){.shell{padding-left:calc(20px + env(safe-area-inset-left));padding-right:calc(20px + env(safe-area-inset-right))}}
</style>
