export type CompetitionId = 'epl' | 'laliga' | 'ucl' | 'lol'
export type MatchStatus = 'scheduled' | 'finished'

export interface Competition {
  id: CompetitionId
  name: string
  mark: string
  kind: '足球' | '电竞'
  description: string
}

export interface Match {
  id: string
  competitionId: CompetitionId
  status: MatchStatus
  dayOffset: number
  clock: string
  stage: string
  home: string
  away: string
  homeShort: string
  awayShort: string
  score?: [number, number]
  venue: string
  format?: string
  preview: string
  facts: string[]
  homeForm: string[]
  awayForm: string[]
}

export interface Standing {
  rank: number
  team: string
  played: number
  record: string
  points: number
}

const TEAM_MARKS: Record<string, string> = {
  '阿森纳': 'ARS', '曼城': 'MCI', '切尔西': 'CHE', '纽卡斯尔联': 'NEW', '纽卡': 'NEW',
  '利物浦': 'LIV', '托特纳姆热刺': 'TOT', '热刺': 'TOT', '曼联': 'MUN', '布莱顿': 'BHA',
  '巴塞罗那': 'BAR', '巴萨': 'BAR', '马德里竞技': 'ATM', '马竞': 'ATM', '皇家马德里': 'RMA',
  '皇马': 'RMA', '塞维利亚': 'SEV', '皇家贝蒂斯': 'BET', '贝蒂斯': 'BET',
  '毕尔巴鄂竞技': 'ATH', '毕尔巴鄂': 'ATH', '比利亚雷亚尔': 'VIL', '黄潜': 'VIL',
  '瓦伦西亚': 'VAL', '巴黎圣日耳曼': 'PSG', '巴黎': 'PSG', '拜仁慕尼黑': 'FCB', '拜仁': 'FCB',
  '国际米兰': 'INT', '国米': 'INT', 'AC 米兰': 'MIL', '米兰': 'MIL', '多特蒙德': 'BVB',
  '多特': 'BVB', '本菲卡': 'BEN', 'BLG': 'BLG', 'TES': 'TES', 'JDG': 'JDG', 'WE': 'WE',
  'WBG': 'WBG', 'LNG': 'LNG', 'NIP': 'NIP', 'AL': 'AL',
}

export function teamMark(name: string) {
  return TEAM_MARKS[name] || name.replace(/\s+/g, '').slice(0, 3).toUpperCase()
}

export const competitions: Competition[] = [
  { id: 'epl', name: '英超', mark: 'PL', kind: '足球', description: '快节奏、强对抗，每轮都有看点' },
  { id: 'laliga', name: '西甲', mark: 'LL', kind: '足球', description: '技术与创造力并存的西班牙联赛' },
  { id: 'ucl', name: '欧冠', mark: 'CL', kind: '足球', description: '欧洲俱乐部的最高舞台' },
  { id: 'lol', name: '英雄联盟', mark: 'LOL', kind: '电竞', description: '关注焦点战、季后赛与国际赛事' },
]

export const matches: Match[] = [
  {
    id: 'epl-ars-mci', competitionId: 'epl', status: 'scheduled', dayOffset: 1, clock: '19:30', stage: '第 6 轮',
    home: '阿森纳', away: '曼城', homeShort: '阿森纳', awayShort: '曼城', venue: '酋长球场',
    preview: '榜首竞争的直接对话，两队都会争夺中场主动权。',
    facts: ['主队近 5 场保持不败', '客队近 3 次交手占优', '开赛前 30 分钟更新首发'],
    homeForm: ['胜', '胜', '平', '胜', '胜'], awayForm: ['胜', '平', '胜', '胜', '负'],
  },
  {
    id: 'epl-che-new', competitionId: 'epl', status: 'scheduled', dayOffset: 3, clock: '23:30', stage: '第 6 轮',
    home: '切尔西', away: '纽卡斯尔联', homeShort: '切尔西', awayShort: '纽卡', venue: '斯坦福桥',
    preview: '两支强调转换速度的球队相遇，边路攻防可能决定比赛。',
    facts: ['主队连续 4 场取得进球', '客队客场防守稳定', '阵容信息将在赛前更新'],
    homeForm: ['胜', '负', '胜', '平', '胜'], awayForm: ['平', '胜', '胜', '负', '平'],
  },
  {
    id: 'epl-liv-tot', competitionId: 'epl', status: 'finished', dayOffset: -2, clock: '22:00', stage: '第 4 轮',
    home: '利物浦', away: '托特纳姆热刺', homeShort: '利物浦', awayShort: '热刺', score: [2, 1], venue: '安菲尔德',
    preview: '主队下半场完成反超，定位球成为比赛转折点。',
    facts: ['控球率 54% : 46%', '射正 6 : 4', '关键进球出现在第 78 分钟'],
    homeForm: ['胜', '胜', '胜', '平', '胜'], awayForm: ['负', '胜', '平', '胜', '负'],
  },
  {
    id: 'epl-mun-bha', competitionId: 'epl', status: 'finished', dayOffset: -5, clock: '20:30', stage: '第 4 轮',
    home: '曼联', away: '布莱顿', homeShort: '曼联', awayShort: '布莱顿', score: [1, 1], venue: '老特拉福德',
    preview: '双方各自在一次快速反击中得分，最终握手言和。',
    facts: ['控球率 49% : 51%', '射正 5 : 5', '全场共出现 4 张黄牌'],
    homeForm: ['平', '负', '胜', '平', '胜'], awayForm: ['平', '胜', '负', '胜', '平'],
  },
  {
    id: 'laliga-bar-atm', competitionId: 'laliga', status: 'scheduled', dayOffset: 2, clock: '03:00', stage: '第 7 轮',
    home: '巴塞罗那', away: '马德里竞技', homeShort: '巴萨', awayShort: '马竞', venue: '奥林匹克体育场',
    preview: '控球进攻与紧凑防守的碰撞，禁区前沿会是焦点区域。',
    facts: ['主队联赛主场连胜', '客队防守数据位居前列', '比赛时间以官方最终通知为准'],
    homeForm: ['胜', '胜', '胜', '平', '胜'], awayForm: ['胜', '平', '胜', '胜', '平'],
  },
  {
    id: 'laliga-rma-sev', competitionId: 'laliga', status: 'scheduled', dayOffset: 5, clock: '01:30', stage: '第 7 轮',
    home: '皇家马德里', away: '塞维利亚', homeShort: '皇马', awayShort: '塞维利亚', venue: '伯纳乌球场',
    preview: '主队希望保持强势开局，客队将依靠反击制造机会。',
    facts: ['主队场均进球超过 2 个', '客队近两场零封对手', '赛前名单待公布'],
    homeForm: ['胜', '胜', '平', '胜', '胜'], awayForm: ['胜', '平', '胜', '负', '胜'],
  },
  {
    id: 'laliga-bet-bil', competitionId: 'laliga', status: 'finished', dayOffset: -3, clock: '00:30', stage: '第 5 轮',
    home: '皇家贝蒂斯', away: '毕尔巴鄂竞技', homeShort: '贝蒂斯', awayShort: '毕尔巴鄂', score: [0, 2], venue: '贝尼托·比利亚马林球场',
    preview: '客队凭借高效反击带走三分。', facts: ['射正 3 : 5', '角球 7 : 4', '客队完成零封'],
    homeForm: ['负', '平', '胜', '平', '负'], awayForm: ['胜', '胜', '平', '负', '胜'],
  },
  {
    id: 'laliga-vil-val', competitionId: 'laliga', status: 'finished', dayOffset: -6, clock: '22:15', stage: '第 5 轮',
    home: '比利亚雷亚尔', away: '瓦伦西亚', homeShort: '黄潜', awayShort: '瓦伦西亚', score: [3, 2], venue: '陶瓷球场',
    preview: '五粒进球带来开放对攻，主队在终场前完成制胜。', facts: ['双方合计 14 次射正', '第 89 分钟出现制胜球', '主队替补贡献 1 球'],
    homeForm: ['胜', '胜', '负', '平', '胜'], awayForm: ['负', '平', '胜', '负', '胜'],
  },
  {
    id: 'ucl-psg-bay', competitionId: 'ucl', status: 'scheduled', dayOffset: 4, clock: '03:00', stage: '联赛阶段 · 第 3 轮',
    home: '巴黎圣日耳曼', away: '拜仁慕尼黑', homeShort: '巴黎', awayShort: '拜仁', venue: '王子公园球场',
    preview: '欧冠焦点夜，两支进攻型球队争夺关键三分。', facts: ['欧冠联赛阶段焦点对决', '双方上次交手仅差一球', '赛前首发待公布'],
    homeForm: ['胜', '胜', '平', '胜', '负'], awayForm: ['胜', '胜', '胜', '平', '胜'],
  },
  {
    id: 'ucl-int-ars', competitionId: 'ucl', status: 'scheduled', dayOffset: 5, clock: '03:00', stage: '联赛阶段 · 第 3 轮',
    home: '国际米兰', away: '阿森纳', homeShort: '国米', awayShort: '阿森纳', venue: '梅阿查球场',
    preview: '稳定防线迎战高位压迫，比赛节奏值得关注。', facts: ['双方均为上季联赛前列', '主队擅长三中卫体系', '客队定位球表现突出'],
    homeForm: ['胜', '平', '胜', '胜', '胜'], awayForm: ['胜', '胜', '平', '胜', '胜'],
  },
  {
    id: 'ucl-rma-mil', competitionId: 'ucl', status: 'finished', dayOffset: -4, clock: '03:00', stage: '联赛阶段',
    home: '皇家马德里', away: 'AC 米兰', homeShort: '皇马', awayShort: '米兰', score: [2, 2], venue: '伯纳乌球场',
    preview: '双方在高强度对攻中各取一分。', facts: ['射正 7 : 6', '双方均两度领先', '补时阶段门将完成关键扑救'],
    homeForm: ['平', '胜', '胜', '平', '胜'], awayForm: ['平', '胜', '负', '胜', '平'],
  },
  {
    id: 'ucl-bvb-ben', competitionId: 'ucl', status: 'finished', dayOffset: -7, clock: '03:00', stage: '联赛阶段',
    home: '多特蒙德', away: '本菲卡', homeShort: '多特', awayShort: '本菲卡', score: [3, 1], venue: '伊杜纳信号公园',
    preview: '主队依靠下半场的持续压迫拉开比分。', facts: ['主队射门 17 次', '客队先取得进球', '下半场主队连入 3 球'],
    homeForm: ['胜', '胜', '负', '胜', '平'], awayForm: ['负', '胜', '胜', '平', '胜'],
  },
  {
    id: 'lol-blg-tes', competitionId: 'lol', status: 'scheduled', dayOffset: 1, clock: '17:00', stage: '季后赛 · 胜者组',
    home: 'BLG', away: 'TES', homeShort: 'BLG', awayShort: 'TES', venue: '上海联盟竞技场', format: 'BO5',
    preview: '两支强队争夺决赛席位，中野联动将左右系列赛。', facts: ['系列赛采用 BO5', '预计使用当前赛事版本', '首局选边待赛前确认'],
    homeForm: ['胜', '胜', '胜', '负', '胜'], awayForm: ['胜', '胜', '负', '胜', '胜'],
  },
  {
    id: 'lol-jdg-we', competitionId: 'lol', status: 'scheduled', dayOffset: 3, clock: '18:00', stage: '季后赛 · 败者组',
    home: 'JDG', away: 'WE', homeShort: 'JDG', awayShort: 'WE', venue: '上海联盟竞技场', format: 'BO5',
    preview: '没有退路的淘汰战，阵容深度与临场调整尤其关键。', facts: ['系列赛采用 BO5', '败者将结束本阶段征程', '首发名单待官方公布'],
    homeForm: ['胜', '负', '胜', '胜', '负'], awayForm: ['胜', '胜', '负', '胜', '负'],
  },
  {
    id: 'lol-wbg-lng', competitionId: 'lol', status: 'finished', dayOffset: -2, clock: '17:00', stage: '季后赛',
    home: 'WBG', away: 'LNG', homeShort: 'WBG', awayShort: 'LNG', score: [3, 1], venue: '上海联盟竞技场', format: 'BO5',
    preview: 'WBG 在中期团战建立优势，以 3:1 拿下系列赛。', facts: ['系列赛共进行 4 局', '第三局成为比赛转折点', '胜方下路发挥稳定'],
    homeForm: ['胜', '胜', '负', '胜', '胜'], awayForm: ['负', '胜', '胜', '负', '胜'],
  },
  {
    id: 'lol-nip-al', competitionId: 'lol', status: 'finished', dayOffset: -5, clock: '18:00', stage: '季后赛',
    home: 'NIP', away: 'AL', homeShort: 'NIP', awayShort: 'AL', score: [2, 3], venue: '上海联盟竞技场', format: 'BO5',
    preview: '系列赛打满五局，AL 在决胜局抓住远古龙机会。', facts: ['系列赛打满 5 局', '决胜局持续 38 分钟', '双方共拿下 3 条大龙'],
    homeForm: ['负', '胜', '负', '胜', '负'], awayForm: ['胜', '胜', '负', '胜', '胜'],
  },
]

export const standings: Record<CompetitionId, Standing[]> = {
  epl: [
    { rank: 1, team: '阿森纳', played: 5, record: '+8', points: 13 },
    { rank: 2, team: '曼城', played: 5, record: '+7', points: 12 },
    { rank: 3, team: '利物浦', played: 5, record: '+5', points: 11 },
    { rank: 4, team: '切尔西', played: 5, record: '+4', points: 10 },
  ],
  laliga: [
    { rank: 1, team: '巴塞罗那', played: 6, record: '+10', points: 16 },
    { rank: 2, team: '皇家马德里', played: 6, record: '+8', points: 15 },
    { rank: 3, team: '马德里竞技', played: 6, record: '+5', points: 13 },
    { rank: 4, team: '毕尔巴鄂竞技', played: 6, record: '+3', points: 11 },
  ],
  ucl: [
    { rank: 1, team: '拜仁慕尼黑', played: 2, record: '+5', points: 6 },
    { rank: 2, team: '阿森纳', played: 2, record: '+4', points: 6 },
    { rank: 3, team: '皇家马德里', played: 2, record: '+3', points: 4 },
    { rank: 4, team: '国际米兰', played: 2, record: '+2', points: 4 },
  ],
  lol: [
    { rank: 1, team: 'BLG', played: 14, record: '12胜 2负', points: 12 },
    { rank: 2, team: 'TES', played: 14, record: '11胜 3负', points: 11 },
    { rank: 3, team: 'JDG', played: 14, record: '10胜 4负', points: 10 },
    { rank: 4, team: 'WBG', played: 14, record: '9胜 5负', points: 9 },
  ],
}

export function matchesFor(competitionId: CompetitionId, status: MatchStatus) {
  return matches
    .filter(match => match.competitionId === competitionId && match.status === status)
    .sort((a, b) => status === 'scheduled' ? a.dayOffset - b.dayOffset : b.dayOffset - a.dayOffset)
}

export function matchStart(match: Match) {
  const [hours, minutes] = match.clock.split(':').map(Number)
  const date = new Date(2026, 8, 15, hours || 0, minutes || 0, 0, 0)
  date.setDate(date.getDate() + match.dayOffset)
  return date
}

export function findMatch(id?: string) {
  return matches.find(match => match.id === id)
}

export function competitionFor(id: CompetitionId) {
  return competitions.find(competition => competition.id === id)!
}
