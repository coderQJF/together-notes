<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref } from 'vue'
import { onLoad, onShow } from '@dcloudio/uni-app'
import SubpageHeader from '../../components/SubpageHeader.vue'
import { ApiError, apiAssetUrl, request, type Item } from '../../services/api'
import type { Competition, CompetitionId, ContentRefreshResult, SportsMatch, SportsMode, SportsPayload, Team } from '../../types/content'
import { formatClock, formatDayHeading, formatRelativeTime } from '../../utils/date'

const DEFAULT_COMPETITIONS: CompetitionId[] = ['epl', 'ucl', 'lol', 'laliga']
const MODE_ORDER: SportsMode[] = ['upcoming', 'results', 'standings']
const savedCompetition = uni.getStorageSync('sports-competition') as CompetitionId
const selectedId = ref<CompetitionId>(DEFAULT_COMPETITIONS.includes(savedCompetition) ? savedCompetition : 'epl')
const mode = ref<SportsMode>('upcoming')
const competitions = ref<Competition[]>([])
const payload = ref<SportsPayload | null>(null)
const loading = ref(true)
const refreshing = ref(false)
const error = ref<ApiError | null>(null)
const scrollTarget = ref('')
const brokenImages = ref<Record<string, boolean>>({})
const remindingId = ref('')
const remindersBySource = ref<Record<string, Item>>({})
const jellyDirection = ref<'left' | 'right' | ''>('')
let requestSequence = 0
let jellyTimer: ReturnType<typeof setTimeout> | undefined

const selectedCompetition = computed(() => payload.value?.competition.id === selectedId.value ? payload.value.competition : competitions.value.find(item => item.id === selectedId.value) || null)
const modeIndicatorStyle = computed(() => ({ transform: `translate3d(${MODE_ORDER.indexOf(mode.value) * 100}%, 0, 0)` }))
const visibleMatches = computed(() => {
  const matches = payload.value?.matches || []
  if (mode.value === 'results') return matches.filter(match => match.status === 'finished').sort((a, b) => Date.parse(b.startsAt) - Date.parse(a.startsAt))
  return matches.filter(match => match.status === 'scheduled' || match.status === 'live').sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))
})

const statusCopy = (match: SportsMatch) => match.status === 'live' ? '进行中' : formatClock(match.startsAt)
const matchLocation = (match: SportsMatch) => match.format || match.venue || '赛事方暂未公布场地'
const teamMark = (team: Team) => (team.shortName || team.name).replace(/\s+/g, '').slice(0, 3).toUpperCase()
const logoVisible = (team: Team) => Boolean(team.logoUrl && !brokenImages.value[team.id || team.logoUrl || team.name])
const reminderFor = (match: SportsMatch) => remindersBySource.value[`sports-match:${match.id}`]
const isReminded = (match: SportsMatch) => {
  const reminder = reminderFor(match)
  return Boolean(reminder && !reminder.done && reminder.advance === 30 && Date.parse(reminder.nextAt || '') === Date.parse(match.startsAt))
}

async function syncReminders() {
  try {
    const items = await request<Item[]>('/items')
    remindersBySource.value = Object.fromEntries(items.filter(item => item.kind === 'reminder' && item.sourceKey?.startsWith('sports-match:')).map(item => [item.sourceKey!, item]))
  } catch {}
}

function rememberReminder(item: Item) {
  if (!item.sourceKey) return
  remindersBySource.value = { ...remindersBySource.value, [item.sourceKey]: item }
}

function markLogoBroken(team: Team) {
  brokenImages.value = { ...brokenImages.value, [team.id || team.logoUrl || team.name]: true }
}

function alignSelectedChip() {
  scrollTarget.value = ''
  nextTick(() => { scrollTarget.value = `competition-${selectedId.value}` })
}

async function loadCompetitions() {
  if (competitions.value.length) return
  const response = await request<{ competitions: Competition[] }>('/content/competitions')
  competitions.value = [...response.competitions].sort((left, right) => DEFAULT_COMPETITIONS.indexOf(left.id) - DEFAULT_COMPETITIONS.indexOf(right.id))
  if (!competitions.value.some(item => item.id === selectedId.value)) selectedId.value = competitions.value[0]?.id || 'epl'
  alignSelectedChip()
}

async function loadSports(showLoading = true) {
  const sequence = ++requestSequence
  if (showLoading) {
    loading.value = true
    payload.value = null
  }
  error.value = null
  try {
    await loadCompetitions()
    const competitionId = selectedId.value
    const response = await request<SportsPayload>(`/content/sports/${competitionId}`)
    if (sequence !== requestSequence || competitionId !== selectedId.value) return
    payload.value = response
    return true
  } catch (cause) {
    if (sequence !== requestSequence) return
    payload.value = null
    error.value = cause instanceof ApiError ? cause : new ApiError(cause instanceof Error ? cause.message : '获取赛事数据失败')
    return false
  } finally {
    if (sequence === requestSequence) loading.value = false
  }
}

async function selectCompetition(id: CompetitionId) {
  if (selectedId.value === id && payload.value) return
  selectMode('upcoming')
  selectedId.value = id
  uni.setStorageSync('sports-competition', id)
  alignSelectedChip()
  await loadSports()
}

function selectMode(nextMode: SportsMode) {
  if (mode.value === nextMode) return
  const direction = MODE_ORDER.indexOf(nextMode) > MODE_ORDER.indexOf(mode.value) ? 'right' : 'left'
  mode.value = nextMode
  jellyDirection.value = ''
  if (jellyTimer) clearTimeout(jellyTimer)
  nextTick(() => {
    jellyDirection.value = direction
    jellyTimer = setTimeout(() => { jellyDirection.value = '' }, 520)
  })
}

async function refresh() {
  if (refreshing.value) return
  const previousPayload = payload.value?.competition.id === selectedId.value ? payload.value : null
  const competitionId = selectedId.value
  let providerRefreshCompleted = false
  refreshing.value = true
  try {
    const result = await request<ContentRefreshResult>('/content/refresh', 'POST', { target: 'sports', competitionId }, { timeout: 120000 })
    providerRefreshCompleted = true
    if (competitionId !== selectedId.value) return
    const loaded = await loadSports(false)
    if (competitionId !== selectedId.value) return
    if (!loaded) throw error.value || new ApiError('同步成功，但读取最新赛事失败')
    uni.showToast({ title: result.ok ? '已获取最新赛事' : '赛程已更新，部分排名同步失败', icon: 'none' })
  } catch (cause) {
    const refreshError = cause instanceof ApiError ? cause : new ApiError('刷新失败')
    if (competitionId !== selectedId.value) return
    if (!providerRefreshCompleted) await loadSports(false)
    if (competitionId !== selectedId.value) return
    if (!payload.value && previousPayload) payload.value = previousPayload
    if (payload.value) {
      if (refreshError.code !== 'CONTENT_REFRESH_RATE_LIMITED' && !payload.value.meta.warning) {
        payload.value.meta = { ...payload.value.meta, stale: true, warning: { code: refreshError.code, message: refreshError.message } }
      }
      error.value = null
      uni.showToast({ title: refreshError.code === 'CONTENT_REFRESH_RATE_LIMITED' ? refreshError.message : '刷新失败，已保留上次真实数据', icon: 'none' })
    } else error.value = refreshError
  } finally {
    refreshing.value = false
  }
}

function openMatch(match: SportsMatch) {
  uni.navigateTo({ url: `/pages/match-detail/match-detail?id=${encodeURIComponent(match.id)}` })
}

async function remind(match: SportsMatch) {
  if (remindingId.value || match.status !== 'scheduled' || isReminded(match)) return
  const start = Date.parse(match.startsAt)
  if (!Number.isFinite(start) || start <= Date.now()) {
    uni.showToast({ title: '该场比赛已无法设置开赛提醒', icon: 'none' })
    return
  }
  const confirmation = await new Promise<UniApp.ShowModalRes>(resolve => uni.showModal({
    title: '设置开赛提醒',
    content: `将在“${match.home.shortName} vs ${match.away.shortName}”开赛前 30 分钟提醒你。`,
    confirmText: '设置提醒',
    success: resolve,
    fail: () => resolve({ confirm: false, cancel: true }),
  }))
  if (!confirmation.confirm) return
  const updating = Boolean(reminderFor(match))
  remindingId.value = match.id
  try {
    const savedReminder = await request<Item>('/items', 'POST', {
      kind: 'reminder', title: `${match.home.shortName} vs ${match.away.shortName}`,
      content: [selectedCompetition.value?.name, match.stage].filter(Boolean).join(' · '),
      scope: 'mine', links: match.sourceUrl ? [match.sourceUrl] : [], sourceKey: `sports-match:${match.id}`, nextAt: match.startsAt,
      repeat: 'none', recipient: 'me', advance: 30, done: false,
    })
    rememberReminder(savedReminder)
    uni.showToast({ title: updating ? '开赛提醒已更新' : '已设置开赛前 30 分钟提醒', icon: 'none' })
  } catch (cause) {
    uni.showToast({ title: cause instanceof Error ? cause.message : '设置失败', icon: 'none' })
  } finally {
    remindingId.value = ''
  }
}

onLoad(async options => {
  const requested = options?.league as CompetitionId | undefined
  if (requested && DEFAULT_COMPETITIONS.includes(requested)) selectedId.value = requested
  alignSelectedChip()
  await loadSports()
})
onShow(() => { void syncReminders() })
onBeforeUnmount(() => { if (jellyTimer) clearTimeout(jellyTimer) })
</script>

<template>
  <view class="shell">
    <SubpageHeader label="比赛" />
    <view class="update-row">
      <text class="eyebrow">我们的观赛清单</text>
      <button class="refresh-button" hover-class="none" :disabled="refreshing || loading" @click="refresh">
        <image :class="{ spinning: refreshing }" src="/static/nav-icons/refresh-active.png" mode="aspectFit" />
        <text>{{ refreshing ? '刷新中' : '刷新' }}</text>
      </button>
    </view>
    <view class="headline"><text>下一场，</text><text>一起等开球。</text></view>
    <text class="subtitle">选一个喜欢的赛事，看近期安排、历史比分和排名。</text>
    <view v-if="payload" class="data-state" :class="{ warning: payload.meta.stale }">
      <view class="state-dot" />
      <text>{{ payload.meta.provider }} · {{ formatRelativeTime(payload.meta.updatedAt) }}更新{{ payload.meta.stale ? ' · 已显示最后成功数据' : '' }}</text>
    </view>

    <scroll-view class="competition-scroll" scroll-x :scroll-into-view="scrollTarget" scroll-with-animation :show-scrollbar="false">
      <view class="competition-row">
        <button v-for="competition in competitions" :id="`competition-${competition.id}`" :key="competition.id" class="competition-chip" hover-class="none" :class="{ active: selectedId === competition.id }" :aria-pressed="selectedId === competition.id" @click="selectCompetition(competition.id)">
          <text class="competition-mark">{{ competition.mark }}</text><text class="chip-label">{{ competition.name }}</text>
        </button>
      </view>
    </scroll-view>

    <view v-if="selectedCompetition" class="competition-intro">
      <view class="league-emblem">{{ selectedCompetition.mark }}</view>
      <view class="intro-copy"><text class="intro-name">{{ selectedCompetition.name }}</text><text class="intro-description">{{ selectedCompetition.description }}</text></view>
      <text class="kind-tag">{{ selectedCompetition.kind }}</text>
    </view>

    <view class="mode-tabs">
      <view class="mode-indicator-track" :style="modeIndicatorStyle"><view class="mode-indicator" :class="jellyDirection ? `jelly-${jellyDirection}` : ''" /></view>
      <button hover-class="none" :class="{ active: mode === 'upcoming' }" :aria-pressed="mode === 'upcoming'" @click="selectMode('upcoming')"><text>近期赛程</text></button>
      <button hover-class="none" :class="{ active: mode === 'results' }" :aria-pressed="mode === 'results'" @click="selectMode('results')"><text>历史赛果</text></button>
      <button hover-class="none" :class="{ active: mode === 'standings' }" :aria-pressed="mode === 'standings'" @click="selectMode('standings')"><text>积分榜</text></button>
    </view>

    <view v-if="loading" class="state-card loading-card">
      <view class="loading-line wide" /><view class="loading-line" /><view class="loading-line short" /><text>正在从赛事数据源获取…</text>
    </view>
    <view v-else-if="error" class="state-card error-card">
      <text class="state-title">赛事数据获取失败</text><text class="state-message">{{ error.message }}</text><text class="error-code">错误码：{{ error.code }}</text>
      <button class="retry-button" hover-class="none" @click="refresh"><text>重新获取</text></button>
    </view>

    <template v-else-if="payload && mode !== 'standings'">
      <view class="section-heading"><text class="section-title">{{ mode === 'upcoming' ? '接下来' : '最近结束' }}</text><text class="section-count">{{ visibleMatches.length }} 场</text></view>
      <view v-if="!visibleMatches.length" class="empty-card">数据源暂无可展示的{{ mode === 'upcoming' ? '近期赛程' : '历史赛果' }}。</view>
      <view v-for="(match, index) in visibleMatches" :key="match.id" class="match-card" hover-class="card-pressed" role="button" :aria-label="`${match.home.shortName} 对 ${match.away.shortName}，查看比赛详情`" :class="{ featured: mode === 'upcoming' && index === 0 }" @click="openMatch(match)">
        <view class="match-topline"><text>{{ formatDayHeading(match.startsAt) }} · {{ formatClock(match.startsAt) }}</text><text>{{ match.stage || match.group || '赛事' }}</text></view>
        <view class="scoreline">
          <view class="team"><view class="team-mark"><image v-if="logoVisible(match.home)" :src="apiAssetUrl(match.home.logoUrl)" mode="aspectFit" @error="markLogoBroken(match.home)" /><text v-else>{{ teamMark(match.home) }}</text></view><text class="team-name">{{ match.home.shortName }}</text></view>
          <view v-if="match.status === 'finished'" class="score"><text>{{ match.score?.home ?? '—' }}</text><text class="score-separator">:</text><text>{{ match.score?.away ?? '—' }}</text></view>
          <view v-else class="versus" :class="{ live: match.status === 'live' }"><text>{{ match.status === 'live' ? 'LIVE' : 'VS' }}</text><text class="clock">{{ statusCopy(match) }}</text></view>
          <view class="team"><view class="team-mark alt"><image v-if="logoVisible(match.away)" :src="apiAssetUrl(match.away.logoUrl)" mode="aspectFit" @error="markLogoBroken(match.away)" /><text v-else>{{ teamMark(match.away) }}</text></view><text class="team-name">{{ match.away.shortName }}</text></view>
        </view>
        <view class="match-footer">
          <view class="venue-line"><image src="/static/nav-icons/location-active.png" mode="aspectFit" /><text>{{ matchLocation(match) }}</text></view>
          <button v-if="match.status === 'scheduled'" class="remind" hover-class="none" :disabled="remindingId === match.id || isReminded(match)" @click.stop="remind(match)"><image src="/static/nav-icons/bell-inactive.png" mode="aspectFit" /><text>{{ remindingId === match.id ? '设置中' : isReminded(match) ? '已设置' : reminderFor(match) ? '更新提醒' : '设提醒' }}</text></button>
          <view v-else class="detail-link"><text>看详情</text><view class="chevron" /></view>
        </view>
      </view>
    </template>

    <view v-else-if="payload" class="standings-card">
      <view v-if="payload.standingsWarning" class="inline-warning" :class="{ neutral: payload.standingsWarning.code === 'PANDASCORE_STANDINGS_UNAVAILABLE' }"><text>{{ payload.standingsWarning.message }}</text><text v-if="payload.standingsWarning.code !== 'PANDASCORE_STANDINGS_UNAVAILABLE'">{{ payload.standingsWarning.code }}</text></view>
      <text v-if="payload.standingsContext" class="standings-context">{{ payload.standingsContext.series }} · {{ payload.standingsContext.name }}</text>
      <template v-if="payload.standings.length">
        <view class="table-head"><text class="rank">排名</text><text class="club">队伍</text><text>场次</text><text>{{ selectedId === 'lol' ? '战绩' : '净胜' }}</text><text>积分</text></view>
        <view v-for="row in payload.standings" :key="`${row.group || ''}-${row.rank}-${row.team.id}`" class="table-row"><text class="rank" :class="{ top: row.rank <= 2 }">{{ row.rank }}</text><text class="club">{{ row.team.shortName || row.team.name }}</text><text>{{ row.played ?? '—' }}</text><text>{{ selectedId === 'lol' ? row.record : (row.goalDifference ?? '—') }}</text><text class="points">{{ row.points ?? '—' }}</text></view>
      </template>
      <text v-else class="table-note">数据源暂未提供当前赛事的积分榜。</text>
    </view>

    <view v-if="payload?.meta.warning" class="source-note warning-note"><text class="source-title">数据同步告警 · {{ payload.meta.warning.code }}</text><text>{{ payload.meta.warning.message }}</text></view>
    <view v-else-if="payload" class="source-note"><text class="source-title">数据来源</text><text>赛程、赛果和排名由 {{ payload.meta.provider }} 提供，服务端统一同步并记录最后成功时间。</text></view>
  </view>
</template>

<style scoped>
.card-pressed{opacity:.86}
.shell{max-width:640px;min-height:100vh;margin:auto;padding:calc(8px + var(--status-bar-height)) 24px calc(48px + env(safe-area-inset-bottom));background:#faf8f2;color:#3e382d}.update-row{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:44px}.eyebrow{display:block;color:#786d5b;font-size:12px}.refresh-button{display:flex;align-items:center;justify-content:center;gap:6px;width:auto;height:44px;min-height:44px;margin:0 -7px 0 0;padding:0 7px;border:0;background:transparent;color:#786d5b;font-size:12px;line-height:normal}.refresh-button::after{border:0}.refresh-button image{display:block;width:15px;height:15px}.refresh-button[disabled]{opacity:.5}.spinning{animation:spin .7s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}
.headline{display:block;margin:4px 0 0;font-size:32px;font-weight:600;line-height:1.3;letter-spacing:-.8px}.headline text{display:block}.subtitle{display:block;margin-top:12px;color:#786d5b;font-size:14px;line-height:1.7}.data-state{display:flex;align-items:flex-start;gap:7px;margin-top:13px;color:#6f7d57;font-size:11px;line-height:1.55}.data-state.warning{color:#8a6422}.state-dot{width:6px;height:6px;flex:0 0 6px;margin-top:5px;border-radius:50%;background:currentColor}
.competition-scroll{width:calc(100% + 48px);margin:22px -24px 14px;white-space:nowrap}.competition-row{display:inline-flex;gap:9px;box-sizing:border-box;min-width:100%;padding:0 34px 0 24px;white-space:nowrap}.competition-chip{display:inline-flex;align-items:center;justify-content:center;gap:7px;width:auto;height:46px;min-height:46px;flex:0 0 auto;margin:0;padding:0 15px;border:1px solid #e5dece;border-radius:23px;background:#fff;color:#6f6555;font-size:13px;line-height:normal;box-sizing:border-box;white-space:nowrap}.competition-chip::after{border:0}.competition-chip.active{border-color:#494032;background:#494032;color:#fff9e9}.competition-chip text{display:block;line-height:20px;white-space:nowrap}.competition-mark{display:flex!important;align-items:center;justify-content:center;min-width:25px;height:26px;padding:0 5px;border-radius:8px;background:#f7e7ad;color:#5d4a24;font-size:10px;font-weight:700;line-height:26px!important;letter-spacing:-.2px;box-sizing:border-box}.chip-label{padding-top:1px}
.competition-intro{display:flex;align-items:center;gap:12px;padding:14px 15px;margin:12px 0 16px;border:1px solid #efdfaa;border-radius:17px;background:#f7e7ad}.league-emblem{display:flex;align-items:center;justify-content:center;width:42px;height:42px;flex:0 0 42px;border-radius:13px;background:#fff9e9;color:#5d4a24;font-size:11px;font-weight:700;box-shadow:inset 0 0 0 1px #ead69a}.intro-copy{min-width:0;flex:1}.intro-name{display:block;font-size:17px;font-weight:600}.intro-description{display:block;margin-top:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#75643c;font-size:12px}.kind-tag{display:inline-flex;align-items:center;height:27px;padding:0 9px;border-radius:8px;background:#fff9e9;color:#78642e;font-size:11px;line-height:27px;white-space:nowrap}
.mode-tabs{position:relative;display:flex;align-items:stretch;padding:4px;border:1px solid #e5dece;border-radius:16px;background:#fff;overflow:hidden}.mode-indicator-track{position:absolute;z-index:0;top:4px;left:4px;width:calc(33.333333% - 2.6667px);height:46px;pointer-events:none;transition:transform 480ms cubic-bezier(.22,1.28,.36,1);will-change:transform}.mode-indicator{width:100%;height:100%;border-radius:12px;background:#494032;box-shadow:0 4px 12px rgba(73,64,50,.12)}.mode-indicator.jelly-right{transform-origin:left center;animation:jelly-stretch 500ms cubic-bezier(.22,1,.36,1)}.mode-indicator.jelly-left{transform-origin:right center;animation:jelly-stretch 500ms cubic-bezier(.22,1,.36,1)}@keyframes jelly-stretch{0%{transform:scaleX(1) scaleY(1)}38%{transform:scaleX(1.2) scaleY(.9)}68%{transform:scaleX(.94) scaleY(1.04)}84%{transform:scaleX(1.03) scaleY(.98)}100%{transform:scaleX(1) scaleY(1)}}.mode-tabs button{position:relative;z-index:1;display:flex;align-items:center;justify-content:center;height:46px;min-height:46px;min-width:0;flex:1;margin:0;padding:0 7px;border:0;border-radius:12px;background:transparent;color:#6f6555;font-size:13px;line-height:normal;box-sizing:border-box;transition:color 180ms ease}.mode-tabs button text{display:block;line-height:20px}.mode-tabs button::after{border:0}.mode-tabs button.active{background:transparent;color:#fff9e9}.mode-tabs button:active{opacity:.86}.section-heading{display:flex;align-items:center;justify-content:space-between;margin:24px 2px 10px}.section-title{font-size:19px;font-weight:600}.section-count{color:#786d5b;font-size:12px}
.state-card{padding:22px;margin-top:17px;border:1px solid #e7e0d2;border-radius:20px;background:#fff}.loading-card{color:#786d5b;font-size:12px}.loading-line{width:74%;height:11px;margin-bottom:10px;border-radius:7px;background:#eee9dd;animation:pulse 1.2s ease-in-out infinite}.loading-line.wide{width:100%}.loading-line.short{width:48%;margin-bottom:18px}@keyframes pulse{50%{opacity:.45}}.error-card{display:flex;flex-direction:column;align-items:flex-start}.state-title{font-size:17px;font-weight:600}.state-message{margin-top:8px;color:#786d5b;font-size:13px;line-height:1.65}.error-code{margin-top:8px;color:#a35243;font-family:monospace;font-size:11px;word-break:break-all}.retry-button{display:flex;align-items:center;justify-content:center;height:44px;min-height:44px;margin:18px 0 0;padding:0 18px;border:0;border-radius:13px;background:#494032;color:#fff9e9;font-size:13px;line-height:normal}.retry-button::after{border:0}.empty-card{padding:28px 20px;border:1px dashed #ddd4c3;border-radius:18px;color:#786d5b;font-size:13px;line-height:1.7;text-align:center}
.match-card{padding:17px 18px 16px;margin:11px 0;border:1px solid #ece5d6;border-radius:20px;background:#fff}.match-card.featured{border-color:#efd98d;background:#f9e9ae}.match-topline{display:flex;align-items:center;justify-content:space-between;gap:10px;color:#786d5b;font-size:11px;white-space:nowrap}.match-topline text{min-width:0;overflow:hidden;text-overflow:ellipsis}.scoreline{display:grid;grid-template-columns:minmax(0,1fr) 72px minmax(0,1fr);align-items:start;gap:8px;margin:18px 0}.team{display:flex;flex-direction:column;align-items:center;gap:8px;min-width:0;text-align:center}.team-mark{display:flex;align-items:center;justify-content:center;width:46px;height:46px;flex:0 0 46px;overflow:hidden;border-radius:14px;background:#494032;color:#fff9e9;font-size:10px;font-weight:700}.team-mark.alt{background:#fff;border:1px solid #dacda5;color:#494032}.team-mark image{display:block;width:34px;height:34px}.team-name{display:block;width:100%;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:14px;font-weight:600}.versus,.score{display:flex;align-items:center;justify-content:center;gap:4px;padding-top:5px;font-variant-numeric:tabular-nums}.versus{flex-direction:column;color:#998761;font-size:10px}.versus.live{color:#9a4f43}.versus .clock{color:#3e382d;font-size:18px;font-weight:700}.score{font-size:25px;font-weight:700}.score-separator{color:#b5a98f;font-weight:400}.match-footer{display:flex;align-items:center;justify-content:space-between;gap:10px;min-height:48px;padding-top:10px;border-top:1px solid rgba(141,123,81,.16);color:#786d5b;font-size:11px}.venue-line{display:flex;align-items:center;gap:7px;min-width:0}.venue-line image{display:block;width:13px;height:13px;flex:0 0 13px}.venue-line text{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.remind{display:flex;align-items:center;justify-content:center;gap:6px;width:auto;height:44px;min-height:44px;flex:0 0 auto;margin:0;padding:0 13px;border:0;border-radius:13px;background:#494032;color:#fff9e9;font-size:12px;line-height:normal}.remind image{display:block;width:15px;height:15px}.remind::after{border:0}.remind[disabled]{opacity:.55}.detail-link{display:flex;align-items:center;gap:7px;min-height:44px;color:#6f5b2a}.chevron{width:7px;height:7px;margin-right:2px;border-top:1.5px solid currentColor;border-right:1.5px solid currentColor;transform:rotate(45deg)}
.standings-card{padding:8px 17px 14px;margin-top:17px;border:1px solid #ece5d6;border-radius:20px;background:#fff}.table-head,.table-row{display:grid;grid-template-columns:42px minmax(90px,1fr) 42px 62px 38px;align-items:center;min-height:48px;column-gap:4px;font-size:12px;text-align:center}.table-head{min-height:42px;color:#786d5b;font-size:11px}.table-row{border-top:1px solid #f1ecdf;color:#61594b}.rank{text-align:left}.club{text-align:left;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px}.rank.top{color:#9a7626;font-weight:700}.points{color:#3e382d;font-size:14px;font-weight:700}.table-note{display:block;padding:22px 0 10px;color:#786d5b;font-size:12px;line-height:1.6;text-align:center}.inline-warning{display:flex;flex-direction:column;gap:4px;padding:12px 2px;color:#975a42;font-size:11px;line-height:1.5}.inline-warning.neutral{color:#786d5b}
.standings-context{display:block;padding:12px 2px 4px;color:#786d5b;font-size:11px;line-height:1.5}
.source-note{padding:17px;margin-top:25px;border-radius:16px;background:#f1ede3;color:#786d5b;font-size:12px;line-height:1.7}.source-note.warning-note{background:#f4e8df;color:#8c523f}.source-title{display:block;margin-bottom:4px;color:#494032;font-size:13px;font-weight:600}
/* #ifdef MP-WEIXIN */
.shell{padding-top:0}
/* #endif */
/* #ifdef H5 */
.shell{padding-top:calc(22px + env(safe-area-inset-top))}
/* #endif */
/* #ifdef APP-PLUS */
.shell{padding-top:calc(12px + var(--status-bar-height))}
/* #endif */
@media(max-width:360px){.shell{padding-left:20px;padding-right:20px}.competition-scroll{width:calc(100% + 40px);margin-left:-20px;margin-right:-20px}.competition-row{padding-left:20px;padding-right:30px}.headline{font-size:29px}.scoreline{grid-template-columns:minmax(0,1fr) 62px minmax(0,1fr);gap:5px}.team-mark{width:42px;height:42px;flex-basis:42px}.match-card{padding-left:16px;padding-right:16px}.table-head,.table-row{grid-template-columns:28px minmax(68px,1fr) 34px 48px 30px}}
.shell{padding-left:calc(24px + env(safe-area-inset-left));padding-right:calc(24px + env(safe-area-inset-right))}
@media(max-width:360px){.shell{padding-left:calc(20px + env(safe-area-inset-left));padding-right:calc(20px + env(safe-area-inset-right))}}
</style>
