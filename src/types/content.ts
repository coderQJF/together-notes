export type CompetitionId = 'epl' | 'laliga' | 'ucl' | 'lol'
export type SportsMode = 'upcoming' | 'results' | 'standings'
export type MatchStatus = 'scheduled' | 'live' | 'finished' | 'postponed' | 'cancelled'
export type NewsChannel = 'featured' | 'market' | 'hot'

export interface ContentWarning {
  code: string
  message: string
}

export interface ContentMeta {
  provider: string
  updatedAt: string
  stale: boolean
  warning?: ContentWarning | null
}

export interface ContentRefreshResult {
  ok: boolean
  target: 'sports' | 'news'
  refreshed: string[]
  errors: Array<{ id: string; code: string; message: string; retryable: boolean }>
  refreshedAt: string
}

export interface Competition {
  id: CompetitionId
  name: string
  mark: string
  kind: '足球' | '电竞'
  description: string
}

export interface Team {
  id: string
  name: string
  shortName: string
  logoUrl?: string | null
}

export interface MatchScore {
  home: number | null
  away: number | null
}

export interface SportsMatch {
  id: string
  competitionId: CompetitionId
  status: MatchStatus
  startsAt: string
  stage: string
  group?: string | null
  round?: string | null
  format?: string | null
  venue?: string | null
  home: Team
  away: Team
  score?: MatchScore | null
  winner?: 'home' | 'away' | 'draw' | null
  tournamentId?: string | null
  sourceUrl?: string | null
}

export interface Standing {
  rank: number
  group?: string | null
  team: Team
  played: number | null
  wins: number | null
  draws: number | null
  losses: number | null
  goalDifference?: number | null
  points: number | null
  record: string
}

export interface SportsPayload {
  competition: Competition
  matches: SportsMatch[]
  standings: Standing[]
  standingsContext?: { tournamentId: string; name: string; series: string } | null
  standingsWarning?: ContentWarning | null
  meta: ContentMeta
}

export interface NewsStory {
  id: string
  channel: NewsChannel
  topic: string
  title: string
  summary: string
  content: string
  source: string
  author?: string | null
  publishedAt: string
  originalUrl: string
  imageUrl?: string | null
  tags: string[]
}

export interface NewsPayload {
  channel: NewsChannel
  stories: NewsStory[]
  topics: string[]
  meta: ContentMeta
}
