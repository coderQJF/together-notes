export type NewsChannel = 'featured' | 'market' | 'hot'

export interface NewsStory {
  id: string
  channel: Exclude<NewsChannel, 'featured'> | 'featured'
  topic: string
  title: string
  summary: string
  source: string
  minutesAgo: number
  heat: '焦点' | '热议' | '观察'
  tickers: string[]
  takeaways: string[]
  context: string
}

/**
 * 首版仅用于确认信息层级和交互，不代表实时资讯。
 * 后续接入真实 provider 时可保持 NewsStory 结构不变。
 */
export const newsStories: NewsStory[] = [
  {
    id: 'market-opening-signals', channel: 'featured', topic: '盘前', heat: '焦点', minutesAgo: 8,
    title: '开盘前先看这三类信号',
    summary: '从成交、汇率与商品价格切入，快速整理今天值得继续跟踪的市场变量。',
    source: '小记市场观察', tickers: ['大盘', '汇率'],
    takeaways: ['观察量能是否与价格方向同步', '留意汇率变化对不同板块的影响', '把单条消息放回趋势中判断'],
    context: '市场每天都会制造大量信息。首版用简短摘要和“为什么值得看”帮助快速筛选，而不是给出买卖判断。',
  },
  {
    id: 'ai-infrastructure-chain', channel: 'market', topic: '科技', heat: '热议', minutesAgo: 24,
    title: 'AI 基建热度之外，资金还在看什么？',
    summary: '算力、网络与电力环节的关注点并不相同，行情分化时更需要回到基本面。',
    source: '小记行业笔记', tickers: ['AI', '半导体', '电力'],
    takeaways: ['区分订单预期与已确认收入', '关注资本开支持续性', '高波动阶段留意估值消化速度'],
    context: '同一主题里的公司可能处在完全不同的业务位置。详情页把新闻要点拆开，方便之后接入真实研报或公告链接。',
  },
  {
    id: 'gold-rate-expectations', channel: 'market', topic: '宏观', heat: '观察', minutesAgo: 47,
    title: '利率预期变化时，黄金为何容易放大波动',
    summary: '实际利率、美元与避险需求经常同时影响黄金，单一解释未必足够。',
    source: '小记宏观速览', tickers: ['黄金', '美元'],
    takeaways: ['同时观察实际利率与美元方向', '事件前后波动可能明显扩大', '商品价格不等于相关股票表现'],
    context: '宏观新闻常把相关性写成因果。首版详情使用多变量提示，提醒读者不要只依赖一个叙事。',
  },
  {
    id: 'earnings-reading-list', channel: 'market', topic: '财报', heat: '焦点', minutesAgo: 82,
    title: '读财报先别急着看利润：这份清单更实用',
    summary: '收入质量、现金流和管理层指引，往往比单季利润增速更能解释变化。',
    source: '小记财报课', tickers: ['财报季'],
    takeaways: ['核对经营现金流与利润差异', '区分一次性项目和主营变化', '关注下一阶段指引是否调整'],
    context: '新闻卡片只呈现结论会丢失上下文，因此详情页保留一组可复用的阅读问题。',
  },
  {
    id: 'consumer-new-trends', channel: 'hot', topic: '消费', heat: '热议', minutesAgo: 35,
    title: '年轻人的新消费，正在从“买什么”转向“怎么用”',
    summary: '体验、订阅与二手流通成为讨论焦点，也带来新的商业模式观察窗口。',
    source: '小记热点编辑部', tickers: ['消费'],
    takeaways: ['关注复购而不只看首次增长', '服务体验可能比单品爆款更持久', '不同城市与人群差异明显'],
    context: '热点页把社会话题与可能关联的行业放在一起，但会明确区分事实、观点和推测。',
  },
  {
    id: 'robotics-from-demo-to-use', channel: 'hot', topic: '机器人', heat: '焦点', minutesAgo: 66,
    title: '机器人从展示走向使用，还差哪几步？',
    summary: '稳定性、成本与真实场景数据，是从“能演示”到“可规模化”的三道门槛。',
    source: '小记科技热榜', tickers: ['机器人', '制造'],
    takeaways: ['演示能力不等同于规模交付', '成本下降曲线值得持续跟踪', '场景数据可能成为长期壁垒'],
    context: '热门技术容易被短视频片段放大。详情页聚焦产业化约束，帮助把热度和进展分开。',
  },
  {
    id: 'travel-city-weekend', channel: 'hot', topic: '城市', heat: '观察', minutesAgo: 110,
    title: '周末短途游升温，小城市为什么更容易出圈',
    summary: '交通可达性、内容传播和本地承接能力共同决定热度能否留下。',
    source: '小记生活趋势', tickers: ['文旅'],
    takeaways: ['短期客流与长期复购要分开看', '交通改善会改变目的地半径', '本地服务承接决定体验上限'],
    context: '生活热点也可能连接消费与区域经济。首版通过标签让用户自行决定是否继续阅读。',
  },
]

export function storiesFor(channel: NewsChannel) {
  if (channel === 'featured') return newsStories
  return newsStories.filter(story => story.channel === channel)
}

export function findStory(id?: string) {
  return newsStories.find(story => story.id === id)
}

export function storyPublishedAt(story: NewsStory) {
  const demoUpdatedAt = new Date(2026, 8, 15, 17, 45, 0, 0)
  return new Date(demoUpdatedAt.getTime() - story.minutesAgo * 60000)
}

export const newsDemoUpdatedAt = new Date(2026, 8, 15, 17, 45, 0, 0)
