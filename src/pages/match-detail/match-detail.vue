<script setup lang="ts">
import { computed, ref } from 'vue'
import { onLoad, onShow } from '@dcloudio/uni-app'
import SubpageHeader from '../../components/SubpageHeader.vue'
import { ApiError, apiAssetUrl, request, type Item, type User } from '../../services/api'
import { requestLocalReminderPermissions, scheduleLocalReminderForUser, syncLocalReminders } from '../../services/local-reminders'
import type { Competition, ContentMeta, SportsMatch, SportsPayload, Standing, Team } from '../../types/content'
import { formatCompactDateTime, formatRelativeTime } from '../../utils/date'

const match = ref<SportsMatch | null>(null)
const competition = ref<Competition | null>(null)
const sports = ref<SportsPayload | null>(null)
const meta = ref<ContentMeta | null>(null)
const loading = ref(true)
const error = ref<ApiError | null>(null)
const supportingDataError = ref('')
const reminding = ref(false)
const existingReminder = ref<Item | null>(null)
const brokenImages = ref<Record<string, boolean>>({})
let matchId = ''

const nearbyStandings = computed<Standing[]>(() => {
  const rows = sports.value?.standings || []
  if (!match.value) return rows.slice(0, 6)
  if (match.value.competitionId === 'lol') {
    const context = sports.value?.standingsContext
    if (!context || String(context.tournamentId) !== String(match.value.tournamentId || '')) return []
  }
  const related = new Set([match.value.home.id, match.value.away.id])
  const selected = rows.filter(row => related.has(row.team.id))
  return selected.length ? rows.filter(row => row.rank <= 4 || related.has(row.team.id)).slice(0, 8) : rows.slice(0, 6)
})

const standingsNote = computed(() => {
  if (!match.value) return ''
  if (!sports.value) return supportingDataError.value
  const context = sports.value.standingsContext
  if (match.value.competitionId === 'lol' && context && String(context.tournamentId) !== String(match.value.tournamentId || '')) {
    return `当前同步的积分榜属于 ${context.series} · ${context.name}，与本场赛事不一致，已隐藏避免误导。`
  }
  return sports.value.standingsWarning?.message || supportingDataError.value
})

const statusText = computed(() => {
  if (!match.value) return ''
  return ({ scheduled: '未开始', live: '进行中', finished: '已结束', postponed: '已延期', cancelled: '已取消' } as const)[match.value.status]
})

const reminderIsCurrent = computed(() => Boolean(
  match.value && existingReminder.value && !existingReminder.value.done && existingReminder.value.advance === 30 &&
  Date.parse(existingReminder.value.nextAt || '') === Date.parse(match.value.startsAt),
))

const teamMark = (team: Team) => (team.shortName || team.name).replace(/\s+/g, '').slice(0, 3).toUpperCase()
const logoVisible = (team: Team) => Boolean(team.logoUrl && !brokenImages.value[team.id || team.name])
const markLogoBroken = (team: Team) => { brokenImages.value = { ...brokenImages.value, [team.id || team.name]: true } }

async function syncReminderState(id: string) {
  try {
    const [items, user] = await Promise.all([request<Item[]>('/items'), request<User>('/me')])
    existingReminder.value = items.find(item => item.kind === 'reminder' && item.sourceKey === `sports-match:${id}`) || null
    syncLocalReminders(items, user)
  } catch {}
}

function teamForm(team: Team) {
  return (sports.value?.matches || [])
    .filter(item => item.status === 'finished' && (item.home.id === team.id || item.away.id === team.id) && item.score?.home != null && item.score?.away != null)
    .sort((a, b) => Date.parse(b.startsAt) - Date.parse(a.startsAt))
    .slice(0, 5)
    .map(item => {
      const own = item.home.id === team.id ? item.score!.home! : item.score!.away!
      const other = item.home.id === team.id ? item.score!.away! : item.score!.home!
      return own > other ? '胜' : own < other ? '负' : '平'
    })
}

const formClass = (result: string) => result === '胜' ? 'form-win' : result === '负' ? 'form-loss' : 'form-draw'

async function loadMatch(id: string) {
  loading.value = true
  error.value = null
  supportingDataError.value = ''
  try {
    const detail = await request<{ match: SportsMatch; meta: ContentMeta }>(`/content/sports/matches/${encodeURIComponent(id)}`)
    match.value = detail.match
    meta.value = detail.meta
    void syncReminderState(detail.match.id)
    const [competitionResult, sportsResult] = await Promise.allSettled([
      request<{ competitions: Competition[] }>('/content/competitions'),
      request<SportsPayload>(`/content/sports/${detail.match.competitionId}`),
    ])
    sports.value = sportsResult.status === 'fulfilled' ? sportsResult.value : null
    competition.value = competitionResult.status === 'fulfilled'
      ? competitionResult.value.competitions.find(item => item.id === detail.match.competitionId) || sports.value?.competition || null
      : sports.value?.competition || null
    if (sportsResult.status === 'rejected') supportingDataError.value = sportsResult.reason instanceof Error ? sportsResult.reason.message : '近期战绩与积分榜暂时不可用'
  } catch (cause) {
    error.value = cause instanceof ApiError ? cause : new ApiError(cause instanceof Error ? cause.message : '获取比赛详情失败')
  } finally {
    loading.value = false
  }
}

async function remind() {
  if (!match.value || match.value.status !== 'scheduled' || reminding.value || reminderIsCurrent.value) return
  const start = Date.parse(match.value.startsAt)
  if (!Number.isFinite(start) || start <= Date.now()) {
    uni.showToast({ title: '该场比赛已无法设置提醒', icon: 'none' })
    return
  }
  const confirmation = await new Promise<UniApp.ShowModalRes>(resolve => uni.showModal({
    title: '设置开赛提醒',
    content: `将在“${match.value!.home.shortName} vs ${match.value!.away.shortName}”开赛前 30 分钟提醒你。`,
    confirmText: '设置提醒', success: resolve, fail: () => resolve({ confirm: false, cancel: true }),
  }))
  if (!confirmation.confirm) return
  const updating = Boolean(existingReminder.value)
  reminding.value = true
  try {
    existingReminder.value = await request<Item>('/items', 'POST', {
      kind: 'reminder', title: `${match.value.home.shortName} vs ${match.value.away.shortName}`,
      content: [competition.value?.name, match.value.stage].filter(Boolean).join(' · '), scope: 'mine',
      links: match.value.sourceUrl ? [match.value.sourceUrl] : [], sourceKey: `sports-match:${match.value.id}`, nextAt: match.value.startsAt,
      repeat: 'none', recipient: 'me', advance: 30, done: false,
    })
    const user = await request<User>('/me')
    if (scheduleLocalReminderForUser(existingReminder.value, user)) requestLocalReminderPermissions()
    uni.showToast({ title: updating ? '开赛提醒已更新' : '已设置开赛前 30 分钟提醒', icon: 'none' })
  } catch (cause) {
    uni.showToast({ title: cause instanceof Error ? cause.message : '设置失败', icon: 'none' })
  } finally {
    reminding.value = false
  }
}

onLoad(options => {
  matchId = typeof options?.id === 'string' ? decodeURIComponent(options.id) : ''
  if (!matchId) { loading.value = false; error.value = new ApiError('缺少比赛编号', 400, 'MATCH_ID_MISSING'); return }
  loadMatch(matchId)
})
onShow(() => { if (match.value) void syncReminderState(match.value.id) })
</script>

<template>
  <view class="shell">
    <SubpageHeader :label="competition?.name || '比赛详情'" fallback="/pages/index/index" />

    <view v-if="loading" class="state-card"><view class="loading-line wide" /><view class="loading-line" /><text>正在获取比赛详情…</text></view>
    <view v-else-if="error" class="state-card error-card"><text class="state-title">无法显示这场比赛</text><text class="state-message">{{ error.message }}</text><text class="error-code">错误码：{{ error.code }}</text><button v-if="matchId" class="retry-button" hover-class="none" @click="loadMatch(matchId)">重新获取</button></view>

    <template v-else-if="match">
      <view class="match-heading"><text class="stage">{{ match.stage || match.group || '赛事详情' }}{{ match.format ? ` · ${match.format}` : '' }}</text><text class="date">{{ formatCompactDateTime(match.startsAt) }}</text></view>
      <view class="scoreboard">
        <view class="team"><view class="team-emblem dark"><image v-if="logoVisible(match.home)" :src="apiAssetUrl(match.home.logoUrl)" mode="aspectFit" @error="markLogoBroken(match.home)" /><text v-else>{{ teamMark(match.home) }}</text></view><text class="team-name">{{ match.home.name }}</text><text class="side">主队</text></view>
        <view class="middle">
          <view v-if="match.status === 'finished'" class="final-score"><text>{{ match.score?.home ?? '—' }}</text><text class="separator">:</text><text>{{ match.score?.away ?? '—' }}</text></view>
          <template v-else><text class="kickoff">{{ formatCompactDateTime(match.startsAt).split(' · ').pop() }}</text><text class="versus">VS</text></template>
          <text class="status" :class="{ finished: match.status === 'finished', alert: ['live','postponed','cancelled'].includes(match.status) }">{{ statusText }}</text>
        </view>
        <view class="team"><view class="team-emblem light"><image v-if="logoVisible(match.away)" :src="apiAssetUrl(match.away.logoUrl)" mode="aspectFit" @error="markLogoBroken(match.away)" /><text v-else>{{ teamMark(match.away) }}</text></view><text class="team-name">{{ match.away.name }}</text><text class="side">客队</text></view>
      </view>

      <view class="venue-row"><view class="location-mark"><image src="/static/nav-icons/location-active.png" mode="aspectFit" /></view><view><text class="venue">{{ match.venue || '赛事方暂未公布场地' }}</text><text class="muted">{{ competition ? `${competition.kind} · ${competition.name}` : match.competitionId.toUpperCase() }}</text></view></view>
      <button v-if="match.status === 'scheduled'" class="primary" hover-class="none" :disabled="reminding || reminderIsCurrent" @click="remind"><image class="bell-mark" src="/static/nav-icons/bell-inactive.png" mode="aspectFit" /><text>{{ reminding ? '正在设置' : reminderIsCurrent ? '已设置开赛提醒' : existingReminder ? '更新开赛提醒' : '设置开赛前 30 分钟提醒' }}</text></button>

      <view class="section"><text class="section-kicker">官方数据</text><text class="section-title">赛事信息</text><view class="facts-card">
        <view class="fact-row"><text class="fact-label">状态</text><text>{{ statusText }}</text></view>
        <view class="fact-row"><text class="fact-label">阶段</text><text>{{ match.stage || '—' }}</text></view>
        <view v-if="match.group" class="fact-row"><text class="fact-label">分组</text><text>{{ match.group }}</text></view>
        <view v-if="match.round" class="fact-row"><text class="fact-label">轮次</text><text>{{ match.round }}</text></view>
        <view v-if="match.format" class="fact-row"><text class="fact-label">赛制</text><text>{{ match.format }}</text></view>
      </view></view>

      <view v-if="sports && (teamForm(match.home).length || teamForm(match.away).length)" class="section"><text class="section-kicker">真实赛果计算</text><text class="section-title">近期状态</text><view class="form-card">
        <view v-for="team in [match.home, match.away]" :key="team.id" class="form-row"><text class="form-team">{{ team.shortName }}</text><view class="form-list"><text v-for="(result, index) in teamForm(team)" :key="index" :class="['form-dot', formClass(result)]">{{ result }}</text><text v-if="!teamForm(team).length" class="form-empty">暂无</text></view></view>
      </view></view>

      <view v-if="nearbyStandings.length" class="section"><text class="section-kicker">最后成功同步</text><text class="section-title">排名快照</text><view class="standing-card">
        <view v-for="row in nearbyStandings" :key="`${row.group || ''}-${row.rank}-${row.team.id}`" class="standing-row" :class="{ related: row.team.id === match.home.id || row.team.id === match.away.id }"><text class="standing-rank">{{ row.rank }}</text><text class="standing-team">{{ row.team.name }}</text><text class="standing-record">{{ row.record }}</text><text class="standing-points">{{ row.points ?? '—' }}<text v-if="row.points != null"> 分</text></text></view>
      </view><text v-if="standingsNote" class="standings-note">{{ standingsNote }}</text></view>
      <view v-else-if="standingsNote" class="standings-note standalone">{{ standingsNote }}</view>

      <view class="data-note" :class="{ warning: meta?.stale }"><text>{{ meta?.provider }} · {{ meta ? formatRelativeTime(meta.updatedAt) : '' }}更新</text><text v-if="meta?.warning">{{ meta.warning.code }}：{{ meta.warning.message }}</text></view>
    </template>
  </view>
</template>

<style scoped>
.retry-button{display:flex;align-items:center;justify-content:center;height:44px;min-height:44px;margin:18px 0 0;padding:0 18px;border:0;border-radius:13px;background:#494032;color:#fff9e9;font-size:13px;line-height:normal}.retry-button::after{border:0}
.shell{max-width:640px;min-height:100vh;margin:auto;padding:calc(8px + var(--status-bar-height)) 24px calc(48px + env(safe-area-inset-bottom));background:#faf8f2;color:#3e382d}.state-card{padding:22px;margin-top:18px;border:1px solid #e7e0d2;border-radius:20px;background:#fff;color:#786d5b;font-size:12px}.loading-line{width:74%;height:11px;margin-bottom:10px;border-radius:7px;background:#eee9dd;animation:pulse 1.2s ease-in-out infinite}.loading-line.wide{width:100%}@keyframes pulse{50%{opacity:.45}}.error-card{display:flex;flex-direction:column}.state-title{color:#3e382d;font-size:18px;font-weight:600}.state-message{margin-top:8px;line-height:1.7}.error-code{margin-top:8px;color:#a35243;font-family:monospace;font-size:11px}.match-heading{text-align:center;margin:2px 0 10px}.stage{display:block;color:#786d5b;font-size:12px}.date{display:block;margin-top:8px;font-size:15px;font-weight:600;font-variant-numeric:tabular-nums;white-space:nowrap}
.scoreboard{display:grid;grid-template-columns:minmax(0,1fr) 84px minmax(0,1fr);align-items:start;gap:10px;padding:25px 12px 23px;margin-top:16px;border:1px solid #efdfaa;border-radius:24px;background:#f7e7ad}.team{display:flex;flex-direction:column;align-items:center;min-width:0}.team-emblem{display:flex;align-items:center;justify-content:center;width:60px;height:60px;overflow:hidden;border-radius:19px;font-size:11px;font-weight:700}.team-emblem image{display:block;width:46px;height:46px}.dark{background:#494032;color:#fff9e9}.light{border:1px solid #dacb9d;background:#fff9e9;color:#494032}.team-name{display:-webkit-box;width:100%;margin-top:12px;overflow:hidden;text-align:center;font-size:13px;font-weight:600;line-height:1.4;-webkit-box-orient:vertical;-webkit-line-clamp:2}.side{margin-top:5px;color:#8a7649;font-size:11px}.middle{display:flex;flex-direction:column;align-items:center;padding-top:8px}.kickoff{font-size:25px;font-weight:700;font-variant-numeric:tabular-nums}.versus{margin-top:2px;color:#8b774c;font-size:11px}.final-score{display:flex;align-items:center;gap:6px;font-size:31px;font-weight:700}.separator{color:#a99562;font-weight:400}.status{display:inline-flex;align-items:center;height:25px;margin-top:10px;padding:0 9px;border-radius:8px;background:#494032;color:#fff9e9;font-size:11px;line-height:25px}.status.finished{background:#fff9e9;color:#78642e}.status.alert{background:#9a5144;color:#fff}
.venue-row{display:flex;align-items:center;gap:12px;padding:17px;margin:13px 0 0;border:1px solid #ece5d6;border-radius:18px;background:#fff}.location-mark{display:flex;align-items:center;justify-content:center;width:40px;height:40px;flex:0 0 40px;border-radius:12px;background:#f5edd3}.location-mark image{display:block;width:19px;height:19px}.venue{display:block;font-size:13px;font-weight:600}.muted{display:block;margin-top:4px;color:#786d5b;font-size:11px}.primary{display:flex;align-items:center;justify-content:center;gap:9px;width:100%;height:50px;min-height:50px;margin:14px 0 0;border:0;border-radius:15px;background:#494032;color:#fff9e9;font-size:14px;line-height:normal}.primary::after{border:0}.primary[disabled]{opacity:.55}.bell-mark{display:block;width:18px;height:18px}
.section{margin-top:31px}.section-kicker{display:block;margin-bottom:5px;color:#745b23;font-size:11px;letter-spacing:1px}.section-title{display:block;font-size:20px;font-weight:600}.facts-card,.form-card,.standing-card{margin-top:14px;border:1px solid #ece5d6;border-radius:19px;background:#fff;overflow:hidden}.fact-row{display:flex;align-items:flex-start;justify-content:space-between;gap:18px;padding:15px 17px;border-bottom:1px solid #f1ecdf;font-size:13px;line-height:1.6}.fact-row:last-child{border-bottom:0}.fact-label{flex:0 0 54px;color:#8d806b}.fact-row>text:last-child{text-align:right}.form-row{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:62px;padding:0 17px;border-bottom:1px solid #f1ecdf}.form-row:last-child{border-bottom:0}.form-team{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px;font-weight:600}.form-list{display:flex;gap:5px}.form-dot{display:flex;align-items:center;justify-content:center;width:27px;height:27px;border-radius:9px;background:#e9e5da;color:#786d5b;font-size:11px}.form-win{background:#e2eddc;color:#4f7045}.form-loss{background:#f1dfda;color:#9a5246}.form-draw{background:#eee9d8;color:#807044}.form-empty{color:#958a76;font-size:11px}
.standing-row{display:grid;grid-template-columns:28px minmax(0,1fr) 76px 52px;align-items:center;min-height:50px;padding:0 15px;border-bottom:1px solid #f1ecdf;font-size:11px}.standing-row:last-child{border-bottom:0}.standing-row.related{background:#fffae9}.standing-rank{color:#998b73}.standing-team{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px}.standing-record{color:#786d5b;text-align:right}.standing-points{text-align:right;font-size:13px;font-weight:700}.standing-points text{font-size:10px;font-weight:400}.data-note{display:flex;flex-direction:column;gap:4px;margin-top:25px;color:#786d5b;font-size:11px;line-height:1.6;text-align:center}.data-note.warning{color:#95583e}
.standings-note{display:block;margin-top:10px;color:#8c623d;font-size:11px;line-height:1.65}.standings-note.standalone{padding:15px 17px;margin-top:28px;border-radius:15px;background:#f4e8df}
/* #ifdef MP-WEIXIN */
.shell{padding-top:0}
/* #endif */
/* #ifdef H5 */
.shell{padding-top:calc(22px + env(safe-area-inset-top))}
/* #endif */
/* #ifdef APP-PLUS */
.shell{padding-top:calc(12px + var(--status-bar-height))}
/* #endif */
@media(max-width:360px){.shell{padding-left:20px;padding-right:20px}.scoreboard{grid-template-columns:minmax(0,1fr) 72px minmax(0,1fr);padding-left:7px;padding-right:7px}.team-emblem{width:52px;height:52px}.team-emblem image{width:40px;height:40px}.final-score{font-size:28px}.form-dot{width:24px;height:24px}.standing-row{grid-template-columns:25px minmax(0,1fr) 62px 45px}}
.shell{padding-left:calc(24px + env(safe-area-inset-left));padding-right:calc(24px + env(safe-area-inset-right))}
@media(max-width:360px){.shell{padding-left:calc(20px + env(safe-area-inset-left));padding-right:calc(20px + env(safe-area-inset-right))}}
</style>
