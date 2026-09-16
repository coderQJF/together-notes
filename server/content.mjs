import { createHash, randomUUID } from 'node:crypto';
import { lookup as dnsLookupCallback } from 'node:dns';
import { promisify } from 'node:util';
import { isIP } from 'node:net';
import https from 'node:https';
import { mkdirSync } from 'node:fs';
import { readFile, readdir, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, join, resolve, sep } from 'node:path';
import { footballTeamNameZh } from './team-names.zh-CN.mjs';

const dnsLookup = promisify(dnsLookupCallback);
const MB = 1024 * 1024;

export const COMPETITIONS = Object.freeze([
  { id: 'epl', name: '英超', mark: 'PL', kind: '足球', description: '英格兰顶级联赛', provider: 'football-data.org', providerId: 'PL' },
  { id: 'laliga', name: '西甲', mark: 'LL', kind: '足球', description: '西班牙顶级联赛', provider: 'football-data.org', providerId: 'PD' },
  { id: 'ucl', name: '欧冠', mark: 'CL', kind: '足球', description: '欧洲冠军联赛', provider: 'football-data.org', providerId: 'CL' },
  { id: 'lol', name: '英雄联盟', mark: 'LOL', kind: '电竞', description: '仅关注 LPL 与全球总决赛', provider: 'PandaScore', providerId: 'lol' }
]);

export class ContentError extends Error {
  constructor(status, code, message, { retryable = false, retryAfterSeconds } = {}) {
    super(message);
    this.name = 'ContentError';
    this.status = status;
    this.code = code;
    this.retryable = retryable;
    this.retryAfterSeconds = retryAfterSeconds;
    this.isContentError = true;
  }
}

export function serializeContentError(error, requestId = randomUUID()) {
  const known = error?.isContentError;
  const body = {
    code: known ? error.code : 'CONTENT_INTERNAL_ERROR',
    message: known ? error.message : '内容服务暂时不可用',
    retryable: known ? Boolean(error.retryable) : true,
    requestId
  };
  if (known && Number.isFinite(error.retryAfterSeconds)) body.retryAfterSeconds = error.retryAfterSeconds;
  return { status: known ? error.status : 500, body: { error: body } };
}

const sha = value => createHash('sha256').update(value).digest('hex');
const iso = value => new Date(value).toISOString();
const publicCompetition = competition => {
  const { provider: _provider, providerId: _providerId, ...result } = competition;
  return result;
};
const asText = value => typeof value === 'string' ? value.trim() : '';
const asNumber = value => value === null || value === undefined || value === '' || (typeof value === 'string' && !value.trim()) ? null : Number.isFinite(Number(value)) ? Number(value) : null;
const unique = values => [...new Set(values.filter(Boolean))];
const asHttpUrl = value => {
  try {
    const url = new URL(asText(value));
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : '';
  } catch { return ''; }
};

async function eachLimited(items, limit, task) {
  let index = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const current = items[index++];
      await task(current);
    }
  });
  await Promise.all(workers);
}

function providerError(provider, response, text) {
  const retryAfterHeader = response?.headers?.get?.('retry-after');
  let retryAfter;
  if (retryAfterHeader != null && retryAfterHeader !== '') {
    const seconds = Number(retryAfterHeader);
    retryAfter = Number.isFinite(seconds) ? seconds : Number.isFinite(Date.parse(retryAfterHeader)) ? Math.max(0, Math.ceil((Date.parse(retryAfterHeader) - Date.now()) / 1000)) : undefined;
  }
  const suffix = text ? `：${text.slice(0, 180)}` : '';
  const upstreamStatus = response?.status || 0;
  const rateLimited = upstreamStatus === 429;
  const authFailure = upstreamStatus === 401 || upstreamStatus === 403;
  const requestFailure = upstreamStatus >= 400 && upstreamStatus < 500 && upstreamStatus !== 429;
  const code = rateLimited ? `${provider}_RATE_LIMITED` : authFailure ? `${provider}_AUTH_FAILED` : requestFailure ? `${provider}_REQUEST_REJECTED` : `${provider}_UPSTREAM_HTTP_ERROR`;
  return new ContentError(upstreamStatus === 429 ? 429 : authFailure ? 503 : 502, code, `${provider} 返回 ${upstreamStatus || '未知状态'}${suffix}`, {
    retryable: !requestFailure,
    retryAfterSeconds: Number.isFinite(retryAfter) && retryAfter >= 0 ? retryAfter : undefined
  });
}

async function fetchJson(fetchImpl, url, options, provider) {
  let response;
  try {
    response = await fetchImpl(url, { ...options, signal: AbortSignal.timeout(12_000) });
  } catch (error) {
    throw new ContentError(504, `${provider}_UPSTREAM_UNREACHABLE`, `${provider} 连接失败：${error?.message || '请求超时'}`, { retryable: true });
  }
  if (!response.ok) {
    let text = '';
    try { text = await response.text(); } catch {}
    throw providerError(provider, response, text);
  }
  try {
    return await response.json();
  } catch {
    throw new ContentError(502, `${provider}_INVALID_RESPONSE`, `${provider} 返回了无法解析的数据`, { retryable: true });
  }
}

async function fetchText(fetchImpl, url, options, provider) {
  let response;
  try {
    response = await fetchImpl(url, { ...options, signal: AbortSignal.timeout(12_000) });
  } catch (error) {
    throw new ContentError(504, `${provider}_UPSTREAM_UNREACHABLE`, `${provider} 连接失败：${error?.message || '请求超时'}`, { retryable: true });
  }
  if (!response.ok) {
    let text = '';
    try { text = await response.text(); } catch {}
    throw providerError(provider, response, text);
  }
  try { return await response.text(); } catch {
    throw new ContentError(502, `${provider}_INVALID_RESPONSE`, `${provider} 返回了无法读取的数据`, { retryable: true });
  }
}

function ipv6Groups(address) {
  let normalized = address.toLowerCase().split('%')[0];
  const dotted = normalized.match(/(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  if (dotted) {
    const octets = dotted.split('.').map(Number);
    if (octets.some(value => !Number.isInteger(value) || value < 0 || value > 255)) return null;
    normalized = normalized.slice(0, -dotted.length) + `${((octets[0] << 8) | octets[1]).toString(16)}:${((octets[2] << 8) | octets[3]).toString(16)}`;
  }
  const halves = normalized.split('::');
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(':') : [];
  const right = halves[1] ? halves[1].split(':') : [];
  const missing = 8 - left.length - right.length;
  if ((halves.length === 1 && missing !== 0) || missing < 0) return null;
  const groups = [...left, ...Array(missing).fill('0'), ...right].map(value => /^[0-9a-f]{1,4}$/.test(value) ? Number.parseInt(value, 16) : NaN);
  return groups.length === 8 && groups.every(Number.isFinite) ? groups : null;
}

function isPrivateIp(address) {
  if (isIP(address) === 4) {
    const parts = address.split('.').map(Number);
    const [a, b] = parts;
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && ((b === 0 && (parts[2] === 0 || parts[2] === 2)) || b === 168)) ||
      (a === 198 && (b === 18 || b === 19 || (b === 51 && parts[2] === 100))) ||
      (a === 203 && b === 0 && parts[2] === 113) || a >= 224;
  }
  if (isIP(address) === 6) {
    const groups = ipv6Groups(address);
    if (!groups) return true;
    const [first, second] = groups;
    if (groups.every(value => value === 0) || groups.slice(0, 7).every(value => value === 0) && groups[7] === 1) return true;
    if ((first & 0xfe00) === 0xfc00 || (first & 0xffc0) === 0xfe80 || (first & 0xffc0) === 0xfec0 || (first & 0xff00) === 0xff00) return true;
    if (first === 0x2001 && (second === 0 || second === 0x0db8)) return true;
    const embeddedIpv4 = (high, low) => `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`;
    if (groups.slice(0, 5).every(value => value === 0) && groups[5] === 0xffff) return isPrivateIp(embeddedIpv4(groups[6], groups[7]));
    if (first === 0x0064 && second === 0xff9b && groups.slice(2, 6).every(value => value === 0)) return isPrivateIp(embeddedIpv4(groups[6], groups[7]));
    if (first === 0x2002) return isPrivateIp(embeddedIpv4(groups[1], groups[2]));
    return false;
  }
  return true;
}

async function assertPublicHttps(input, lookupHost) {
  let url;
  try { url = new URL(input); } catch { throw new Error('无效图片地址'); }
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  if (url.protocol !== 'https:' || url.username || url.password || !url.hostname || (url.port && url.port !== '443')) throw new Error('图片必须使用公网 HTTPS 443 端口');
  if (['localhost', 'localhost.localdomain'].includes(hostname.toLowerCase()) || hostname.toLowerCase().endsWith('.local')) throw new Error('禁止访问内网地址');
  if (isIP(hostname)) {
    if (isPrivateIp(hostname)) throw new Error('禁止访问内网地址');
    return { url, addresses: [{ address: hostname, family: isIP(hostname) }] };
  }
  const records = await lookupHost(hostname, { all: true, verbatim: true });
  if (!Array.isArray(records) || records.length === 0 || records.some(record => isPrivateIp(record.address))) throw new Error('图片域名解析到非公网地址');
  return { url, addresses: records };
}

function requestPinnedImage(url, address, { headers = {}, timeoutMs = 10_000 } = {}) {
  return new Promise((resolveRequest, rejectRequest) => {
    const request = https.request(url, {
      method: 'GET',
      agent: false,
      headers,
      family: address.family,
      servername: isIP(url.hostname.replace(/^\[|\]$/g, '')) ? undefined : url.hostname,
      lookup: (_hostname, _options, callback) => callback(null, address.address, address.family)
    }, response => {
      const responseHeaders = response.headers;
      resolveRequest({
        status: response.statusCode || 0,
        ok: Boolean(response.statusCode && response.statusCode >= 200 && response.statusCode < 300),
        headers: { get: name => {
          const value = responseHeaders[String(name).toLowerCase()];
          return Array.isArray(value) ? value.join(', ') : value == null ? null : String(value);
        } },
        body: response
      });
    });
    request.setTimeout(timeoutMs, () => request.destroy(new Error('图片请求超时')));
    request.once('error', rejectRequest);
    request.end();
  });
}

async function readLimitedBody(response, limit) {
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > limit) throw new Error('图片超过大小限制');
  const chunks = [];
  let size = 0;
  if (response.body?.[Symbol.asyncIterator]) {
    for await (const chunk of response.body) {
      const bytes = Buffer.from(chunk);
      size += bytes.length;
      if (size > limit) throw new Error('图片超过大小限制');
      chunks.push(bytes);
    }
    return Buffer.concat(chunks);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > limit) throw new Error('图片超过大小限制');
  return bytes;
}

async function discardBody(response) {
  if (typeof response?.body?.cancel === 'function') {
    try { await response.body.cancel(); } catch {}
  } else response?.body?.resume?.();
}

function imageExtension(type, bytes) {
  const normalized = type.split(';')[0].trim().toLowerCase();
  if (normalized === 'image/jpeg' && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return '.jpg';
  if (normalized === 'image/png' && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return '.png';
  if (normalized === 'image/gif' && ['GIF87a', 'GIF89a'].includes(bytes.subarray(0, 6).toString('ascii'))) return '.gif';
  if (normalized === 'image/webp' && bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP') return '.webp';
  throw new Error('图片类型或文件特征无效');
}

function footballStatus(value) {
  if (['IN_PLAY', 'PAUSED', 'LIVE'].includes(value)) return 'live';
  if (value === 'FINISHED') return 'finished';
  if (['POSTPONED', 'SUSPENDED'].includes(value)) return 'postponed';
  if (value === 'CANCELLED') return 'cancelled';
  return 'scheduled';
}

function pandaStatus(value) {
  if (value === 'running') return 'live';
  if (value === 'finished') return 'finished';
  if (['canceled', 'cancelled'].includes(value)) return 'cancelled';
  if (value === 'postponed') return 'postponed';
  return 'scheduled';
}

function footballTeam(team = {}) {
  const localized = footballTeamNameZh(team);
  return {
    id: `football:${team.id ?? sha(team.name || 'unknown').slice(0, 12)}`,
    name: localized?.name || asText(team.name) || '待定',
    shortName: localized?.shortName || asText(team.shortName) || asText(team.tla) || asText(team.name).slice(0, 6) || 'TBD',
    logoUrl: asText(team.crest) || null
  };
}

function applyFootballTeamZh(team) {
  const localized = footballTeamNameZh(team);
  if (localized && team) Object.assign(team, localized);
  return team;
}

const FOOTBALL_STAGES_ZH = Object.freeze({
  REGULAR_SEASON: '常规赛', LEAGUE_STAGE: '联赛阶段', GROUP_STAGE: '小组赛',
  LAST_16: '1/8 决赛', QUARTER_FINALS: '1/4 决赛', SEMI_FINALS: '半决赛', FINAL: '决赛',
  PLAYOFFS: '附加赛', QUALIFICATION: '资格赛', THIRD_PLACE: '季军赛'
});

function footballStageZh(value) {
  const text = asText(value);
  return FOOTBALL_STAGES_ZH[text.toUpperCase().replace(/\s+/g, '_')] || text.replaceAll('_', ' ') || '联赛';
}

function transformFootballMatch(match, competitionId) {
  const home = asNumber(match?.score?.fullTime?.home);
  const away = asNumber(match?.score?.fullTime?.away);
  const winner = match?.score?.winner === 'HOME_TEAM' ? 'home' : match?.score?.winner === 'AWAY_TEAM' ? 'away' : match?.score?.winner === 'DRAW' ? 'draw' : null;
  return {
    id: `football:${match.id}`,
    competitionId,
    status: footballStatus(match.status),
    startsAt: iso(match.utcDate),
    stage: footballStageZh(match.stage),
    group: asText(match.group) || null,
    round: Number.isFinite(match.matchday) ? `第 ${match.matchday} 轮` : null,
    format: null,
    venue: asText(match.venue) || null,
    home: footballTeam(match.homeTeam),
    away: footballTeam(match.awayTeam),
    score: home === null && away === null ? null : { home, away },
    winner,
    tournamentId: asText(match.season?.id) || (match.season?.id ? String(match.season.id) : null),
    sourceUrl: null
  };
}

function transformFootballStandings(body) {
  const sections = Array.isArray(body?.standings) ? body.standings : [];
  const totals = sections.filter(section => asText(section.type).toUpperCase() === 'TOTAL');
  const selected = totals.length ? totals : sections.filter(section => !['HOME', 'AWAY'].includes(asText(section.type).toUpperCase()));
  return selected.flatMap(section => (Array.isArray(section.table) ? section.table : []).map(row => ({
    rank: asNumber(row.position) ?? 0,
    group: asText(section.group) || (sections.length > 1 ? asText(section.type) || null : null),
    team: footballTeam(row.team),
    played: asNumber(row.playedGames),
    wins: asNumber(row.won),
    draws: asNumber(row.draw),
    losses: asNumber(row.lost),
    goalDifference: asNumber(row.goalDifference),
    points: asNumber(row.points),
    record: `${asNumber(row.won) ?? '-'}胜 ${asNumber(row.draw) ?? '-'}平 ${asNumber(row.lost) ?? '-'}负`
  })));
}

function pandaTeam(opponent = {}) {
  const team = opponent?.opponent || opponent || {};
  return {
    id: `pandascore:${team.id ?? sha(team.name || 'unknown').slice(0, 12)}`,
    name: asText(team.name) || '待定',
    shortName: asText(team.acronym) || asText(team.name).slice(0, 6) || 'TBD',
    logoUrl: asText(team.image_url) || null
  };
}

function transformPandaMatch(match) {
  const opponents = Array.isArray(match.opponents) ? match.opponents : [];
  const home = pandaTeam(opponents[0]);
  const away = pandaTeam(opponents[1]);
  const resultByTeam = new Map((Array.isArray(match.results) ? match.results : []).map(item => [String(item.team_id), asNumber(item.score)]));
  const homeScore = resultByTeam.get(home.id.replace('pandascore:', '')) ?? null;
  const awayScore = resultByTeam.get(away.id.replace('pandascore:', '')) ?? null;
  const winnerId = match.winner_id == null ? '' : String(match.winner_id);
  return {
    id: `pandascore:${match.id}`,
    competitionId: 'lol',
    status: pandaStatus(match.status),
    startsAt: iso(match.begin_at || match.scheduled_at),
    stage: unique([asText(match.league?.name), asText(match.serie?.full_name) || asText(match.serie?.name)]).join(' · ') || '英雄联盟',
    group: null,
    round: asText(match.tournament?.name) || null,
    format: asNumber(match.number_of_games) ? `BO${asNumber(match.number_of_games)}` : asText(match.match_type) || null,
    venue: null,
    home,
    away,
    score: homeScore === null && awayScore === null ? null : { home: homeScore, away: awayScore },
    winner: winnerId === home.id.replace('pandascore:', '') ? 'home' : winnerId === away.id.replace('pandascore:', '') ? 'away' : null,
    tournamentId: match.tournament_id == null ? (match.tournament?.id == null ? null : String(match.tournament.id)) : String(match.tournament_id),
    sourceUrl: asHttpUrl(match.official_stream_url) || null
  };
}

function transformPandaStandings(body) {
  const rows = Array.isArray(body) ? body : Array.isArray(body?.standings) ? body.standings : [];
  return rows.map((row, index) => {
    const team = pandaTeam(row.team || row.participant || row);
    const wins = asNumber(row.wins ?? row.won);
    const losses = asNumber(row.losses ?? row.lost);
    const draws = asNumber(row.draws ?? row.ties);
    return {
      rank: asNumber(row.rank ?? row.position) ?? index + 1,
      group: asText(row.group?.name || row.group) || null,
      team,
      played: asNumber(row.played ?? row.matches_played) ?? (wins !== null && losses !== null ? wins + losses + (draws || 0) : null),
      wins,
      draws,
      losses,
      points: asNumber(row.points),
      record: asText(row.record) || `${wins ?? '-'}胜 ${losses ?? '-'}负`
    };
  }).filter(row => row.team.name !== '待定');
}

const PANDA_LPL_PATTERN = /(^|[^a-z0-9])lpl([^a-z0-9]|$)|league of legends pro league/i;
const PANDA_WORLDS_PATTERN = /(^|[^a-z0-9])worlds([^a-z0-9]|$)|world[\s-]+championship/i;

function pandaCompetitionText(value = {}) {
  return [value.name, value.slug, value.full_name].map(asText).filter(Boolean).join(' ');
}

function isWantedPandaLeague(league = {}) {
  const text = pandaCompetitionText(league);
  return PANDA_LPL_PATTERN.test(text) || PANDA_WORLDS_PATTERN.test(text);
}

function isWantedPandaMatch(match = {}, targetLeagueIds = new Set()) {
  if (match.league?.id != null && targetLeagueIds.has(String(match.league.id))) return true;
  const text = [match.league, match.serie, match.tournament].map(pandaCompetitionText).join(' ');
  return PANDA_LPL_PATTERN.test(text) || PANDA_WORLDS_PATTERN.test(text);
}

function isWantedCachedPandaMatch(match = {}) {
  const text = [match.stage, match.round, match.group].map(asText).filter(Boolean).join(' ');
  return PANDA_LPL_PATTERN.test(text) || PANDA_WORLDS_PATTERN.test(text);
}

const NEWS_CHANNELS = Object.freeze({
  featured: { newsApiQuery: '(财经 OR 科技 OR 商业 OR 全球)', topic: '精选' },
  market: { newsApiQuery: '(股票 OR 股市 OR A股 OR 港股 OR 美股 OR 财报 OR 央行)', topic: '市场' },
  hot: { newsApiQuery: '(热点 OR 突发 OR 科技 OR 商业)', topic: '热点' }
});

const GDELT_NEWS_QUERY = '("stock market" OR stocks OR equities OR economy OR finance OR business OR technology OR "artificial intelligence" OR startup OR "interest rates" OR earnings OR IPO) sourcelang:zho';
const RSS_NEWS_SOURCES = Object.freeze([
  { name: '36氪', url: 'https://www.36kr.com/feed', channel: 'hot' },
  { name: '中新网财经', url: 'https://www.chinanews.com.cn/rss/finance.xml', channel: 'market' }
]);
const MARKET_TITLE_PATTERN = /(股票|股市|A股|港股|美股|证券|指数|上证|深证|创业板|科创板|恒生|道指|纳指|标普|财报|业绩|营收|利润|央行|利率|降息|加息|通胀|经济|金融|银行|基金|债券|汇率|人民币|美元|投资|IPO|上市|市值|期货|黄金|油价|stock|market|equities|earnings|economy|finance|investment|interest rate)/i;
const HOT_TITLE_PATTERN = /(热点|突发|科技|人工智能|AI\b|芯片|机器人|互联网|软件|硬件|创业|商业|公司|能源|汽车|政策|全球|国际|科学|气候|technology|artificial intelligence|startup|business|science|climate)/i;
const PROVIDER_URLS = Object.freeze({
  'football-data.org': 'https://www.football-data.org/',
  PandaScore: 'https://www.pandascore.co/',
  NewsAPI: 'https://newsapi.org/',
  'GDELT Project': 'https://www.gdeltproject.org/'
});

function transformNewsApiArticle(article, channel) {
  const originalUrl = asHttpUrl(article.url);
  const source = asText(article.source?.name) || '未知来源';
  return {
    id: `news:${channel}:${sha(originalUrl).slice(0, 24)}`,
    channel,
    topic: NEWS_CHANNELS[channel].topic,
    title: asText(article.title),
    summary: asText(article.description) || asText(article.content).replace(/\s*\[\+\d+ chars\]\s*$/, ''),
    content: asText(article.content).replace(/\s*\[\+\d+ chars\]\s*$/, '') || asText(article.description),
    source,
    author: asText(article.author) || null,
    publishedAt: iso(article.publishedAt),
    originalUrl,
    imageUrl: asText(article.urlToImage) || null,
    tags: unique([NEWS_CHANNELS[channel].topic, source]).slice(0, 5)
  };
}

function gdeltSeenAt(value) {
  const text = asText(value);
  const compact = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(text);
  const normalized = compact ? `${compact[1]}-${compact[2]}-${compact[3]}T${compact[4]}:${compact[5]}:${compact[6]}Z` : text;
  return Number.isFinite(Date.parse(normalized)) ? iso(normalized) : '';
}

function gdeltSource(article, originalUrl) {
  const declared = asText(article.domain);
  if (declared) return declared;
  try { return new URL(originalUrl).hostname; } catch { return '未知来源'; }
}

function transformGdeltArticle(article, channel) {
  const originalUrl = asHttpUrl(article.url);
  const source = gdeltSource(article, originalUrl);
  return {
    id: `news:${channel}:${sha(originalUrl).slice(0, 24)}`,
    channel,
    topic: NEWS_CHANNELS[channel].topic,
    title: asText(article.title),
    summary: '',
    content: '',
    source,
    author: null,
    publishedAt: gdeltSeenAt(article.seendate),
    originalUrl,
    imageUrl: null,
    tags: unique([NEWS_CHANNELS[channel].topic, source, asText(article.language)]).slice(0, 5)
  };
}

function decodeXml(value) {
  return String(value || '')
    .replace(/^\s*<!\[CDATA\[|\]\]>\s*$/g, '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&#x([0-9a-f]+);/gi, (_match, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_match, decimal) => String.fromCodePoint(Number(decimal)))
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function rssElement(block, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`<${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escaped}>`, 'i').exec(block);
  return match ? decodeXml(match[1]) : '';
}

function parseRssFeed(xml, source) {
  const items = String(xml || '').match(/<item(?:\s[^>]*)?>[\s\S]*?<\/item>/gi) || [];
  return items.map(item => {
    const originalUrl = asHttpUrl(rssElement(item, 'link'));
    const published = rssElement(item, 'pubDate') || rssElement(item, 'dc:date');
    return {
      title: rssElement(item, 'title'),
      originalUrl,
      publishedAt: Number.isFinite(Date.parse(published)) ? iso(published) : '',
      source: source.name,
      sourceChannel: source.channel
    };
  }).filter(item => item.title && item.originalUrl && item.publishedAt);
}

function transformRssArticle(article, channel) {
  return {
    id: `news:${channel}:${sha(article.originalUrl).slice(0, 24)}`,
    channel,
    topic: NEWS_CHANNELS[channel].topic,
    title: article.title,
    summary: '',
    content: '',
    source: article.source,
    author: null,
    publishedAt: article.publishedAt,
    originalUrl: article.originalUrl,
    imageUrl: null,
    tags: unique([NEWS_CHANNELS[channel].topic, article.source]).slice(0, 5)
  };
}

function buildRssFeeds(articles) {
  const ordered = [...new Map(articles.sort((left, right) => Date.parse(right.publishedAt) - Date.parse(left.publishedAt)).map(article => [article.originalUrl, article])).values()];
  const market = ordered.filter(article => article.sourceChannel === 'market' || MARKET_TITLE_PATTERN.test(article.title));
  const hot = ordered.filter(article => article.sourceChannel === 'hot' || HOT_TITLE_PATTERN.test(article.title));
  return Object.fromEntries(Object.keys(NEWS_CHANNELS).map(channel => {
    const source = channel === 'market' ? market : channel === 'hot' ? hot : ordered;
    return [channel, selectDiverse(source.map(article => transformRssArticle(article, channel)))];
  }));
}

function selectDiverse(items, limit = 30) {
  const selected = [];
  const deferred = [];
  const sourceCounts = new Map();
  for (const item of items) {
    const count = sourceCounts.get(item.source) || 0;
    if (count >= 2) deferred.push(item);
    else {
      selected.push(item);
      sourceCounts.set(item.source, count + 1);
    }
    if (selected.length >= limit) return selected;
  }
  for (const item of deferred) {
    selected.push(item);
    if (selected.length >= limit) break;
  }
  return selected;
}

function buildGdeltFeeds(articles) {
  const valid = articles.filter(article => asHttpUrl(article?.url) && asText(article?.title) && gdeltSeenAt(article?.seendate));
  valid.sort((left, right) => Date.parse(gdeltSeenAt(right.seendate)) - Date.parse(gdeltSeenAt(left.seendate)));
  const uniqueByUrl = new Map();
  for (const article of valid) if (!uniqueByUrl.has(asHttpUrl(article.url))) uniqueByUrl.set(asHttpUrl(article.url), article);
  const byUrl = [...uniqueByUrl.values()];
  const market = byUrl.filter(article => MARKET_TITLE_PATTERN.test(asText(article.title)));
  const hot = byUrl.filter(article => HOT_TITLE_PATTERN.test(asText(article.title)));
  return Object.fromEntries(Object.keys(NEWS_CHANNELS).map(channel => {
    const source = channel === 'market' ? market : channel === 'hot' ? hot : byUrl;
    return [channel, selectDiverse(source.map(article => transformGdeltArticle(article, channel)))];
  }));
}

export function createContentService({
  db,
  dbPath = 'server/data/app.sqlite',
  fetchImpl = globalThis.fetch,
  imageFetchImpl,
  lookupHost = dnsLookup,
  now = () => Date.now(),
  mediaDir,
  publicBaseUrl = '',
  footballDataToken = '',
  pandaScoreToken = '',
  newsProvider = 'gdelt',
  newsApiKey = '',
  footballDataBaseUrl = 'https://api.football-data.org/v4',
  pandaScoreBaseUrl = 'https://api.pandascore.co',
  newsApiBaseUrl = 'https://newsapi.org/v2',
  gdeltBaseUrl = 'https://api.gdeltproject.org/api/v2/doc/doc',
  rssNewsSources = RSS_NEWS_SOURCES,
  gdeltRetryDelayMs = 6_000,
  sportsTtlMs = 20 * 60_000,
  newsTtlMs = 75 * 60_000,
  refreshCooldownMs = 60_000,
  imageMaxBytes = 4 * MB,
  mediaTtlMs = 7 * 24 * 60 * 60_000,
  mediaMaxTotalBytes = 512 * MB,
  mediaMaxFiles = 5_000,
  newsRetentionMs = 30 * 24 * 60 * 60_000,
  newsMaxArticles = 1_000,
  logger = console
}) {
  footballDataToken = asText(footballDataToken);
  pandaScoreToken = asText(pandaScoreToken);
  newsProvider = asText(newsProvider).toLowerCase() || 'gdelt';
  newsApiKey = asText(newsApiKey);
  if (!['gdelt', 'newsapi'].includes(newsProvider)) throw new Error('NEWS_PROVIDER 必须是 gdelt 或 newsapi');
  footballDataBaseUrl = footballDataBaseUrl.replace(/\/$/, '');
  pandaScoreBaseUrl = pandaScoreBaseUrl.replace(/\/$/, '');
  newsApiBaseUrl = newsApiBaseUrl.replace(/\/$/, '');
  gdeltBaseUrl = gdeltBaseUrl.replace(/\/$/, '');
  rssNewsSources = Array.isArray(rssNewsSources) ? rssNewsSources.filter(source => asText(source?.name) && asHttpUrl(source?.url) && ['market', 'hot'].includes(source?.channel)) : [];
  gdeltRetryDelayMs = Math.max(0, Math.floor(Number(gdeltRetryDelayMs) || 0));
  mediaMaxTotalBytes = Math.max(1, Math.floor(Number(mediaMaxTotalBytes) || 512 * MB));
  mediaMaxFiles = Math.max(1, Math.floor(Number(mediaMaxFiles) || 5_000));
  newsRetentionMs = Math.max(60_000, Math.floor(Number(newsRetentionMs) || 30 * 24 * 60 * 60_000));
  newsMaxArticles = Math.max(1, Math.floor(Number(newsMaxArticles) || 1_000));
  const resolvedMediaDir = mediaDir === '' || (mediaDir == null && dbPath === ':memory:') ? '' : resolve(mediaDir || join(dirname(resolve(dbPath)), 'media'));
  if (resolvedMediaDir) mkdirSync(resolvedMediaDir, { recursive: true });
  db.exec(`
    CREATE TABLE IF NOT EXISTS content_cache(
      cache_key TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      payload TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS content_sync(
      sync_key TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      last_attempt_at TEXT NOT NULL,
      last_success_at TEXT,
      error_code TEXT,
      error_message TEXT,
      retryable INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS content_media(
      source_hash TEXT PRIMARY KEY,
      source_url TEXT NOT NULL,
      filename TEXT NOT NULL,
      content_type TEXT NOT NULL,
      bytes INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS content_media_blobs(
      filename TEXT PRIMARY KEY,
      content_type TEXT NOT NULL,
      bytes INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS news_articles(
      id TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      payload TEXT NOT NULL,
      published_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    INSERT OR IGNORE INTO content_media_blobs(filename,content_type,bytes,created_at)
      SELECT filename,content_type,bytes,created_at FROM content_media;
  `);
  const getCache = db.prepare('SELECT * FROM content_cache WHERE cache_key=?');
  const setCache = db.prepare('INSERT INTO content_cache(cache_key,provider,payload,updated_at) VALUES(?,?,?,?) ON CONFLICT(cache_key) DO UPDATE SET provider=excluded.provider,payload=excluded.payload,updated_at=excluded.updated_at');
  const getSync = db.prepare('SELECT * FROM content_sync WHERE sync_key=?');
  const setSync = db.prepare('INSERT INTO content_sync(sync_key,provider,last_attempt_at,last_success_at,error_code,error_message,retryable) VALUES(?,?,?,?,?,?,?) ON CONFLICT(sync_key) DO UPDATE SET provider=excluded.provider,last_attempt_at=excluded.last_attempt_at,last_success_at=excluded.last_success_at,error_code=excluded.error_code,error_message=excluded.error_message,retryable=excluded.retryable');
  const getMedia = db.prepare('SELECT * FROM content_media WHERE source_hash=?');
  const setMedia = db.prepare('INSERT INTO content_media(source_hash,source_url,filename,content_type,bytes,created_at) VALUES(?,?,?,?,?,?) ON CONFLICT(source_hash) DO UPDATE SET source_url=excluded.source_url,filename=excluded.filename,content_type=excluded.content_type,bytes=excluded.bytes,created_at=excluded.created_at');
  const getMediaBlob = db.prepare('SELECT * FROM content_media_blobs WHERE filename=?');
  const setMediaBlob = db.prepare('INSERT OR IGNORE INTO content_media_blobs(filename,content_type,bytes,created_at) VALUES(?,?,?,?)');
  const getMediaTotals = db.prepare('SELECT COUNT(*) count,COALESCE(SUM(bytes),0) bytes FROM content_media_blobs');
  const deleteMediaBlob = db.prepare('DELETE FROM content_media_blobs WHERE filename=?');
  const deleteMediaSources = db.prepare('DELETE FROM content_media WHERE filename=?');
  const getNewsArticle = db.prepare('SELECT * FROM news_articles WHERE id=?');
  const setNewsArticle = db.prepare('INSERT INTO news_articles(id,provider,payload,published_at,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET provider=excluded.provider,payload=excluded.payload,published_at=excluded.published_at,updated_at=excluded.updated_at');
  const mediaInflight = new Map();
  const refreshInflight = new Map();
  const manualRefreshAt = new Map();
  const timers = [];
  let activeRefreshes = 0;
  let mediaWriteQueue = Promise.resolve();

  const mediaPublicPath = filename => `${publicBaseUrl.replace(/\/$/, '')}/api/media/${filename}` || `/api/media/${filename}`;
  const parseCache = key => {
    const row = getCache.get(key);
    if (!row) return null;
    try { return { ...row, value: JSON.parse(row.payload) }; } catch { return null; }
  };
  const warningFor = key => {
    const row = getSync.get(key);
    return row?.error_code ? { code: row.error_code, message: row.error_message } : null;
  };
  const markAttempt = (key, provider) => {
    const previous = getSync.get(key);
    setSync.run(key, provider, iso(now()), previous?.last_success_at || null, null, null, 0);
  };
  const markSuccess = (key, provider, updatedAt) => setSync.run(key, provider, updatedAt, updatedAt, null, null, 0);
  const markFailure = (key, provider, error) => {
    const previous = getSync.get(key);
    const contentError = error?.isContentError ? error : new ContentError(502, `${provider}_SYNC_FAILED`, `${provider} 同步失败：${error?.message || '未知错误'}`, { retryable: true });
    setSync.run(key, provider, iso(now()), previous?.last_success_at || null, contentError.code, contentError.message, contentError.retryable ? 1 : 0);
    return contentError;
  };

  const withMediaWriteLock = task => {
    const result = mediaWriteQueue.then(task, task);
    mediaWriteQueue = result.catch(() => {});
    return result;
  };

  function pruneNewsArticles() {
    const cutoff = iso(now() - newsRetentionMs);
    db.prepare('DELETE FROM news_articles WHERE published_at<?').run(cutoff);
    db.prepare('DELETE FROM news_articles WHERE id IN (SELECT id FROM news_articles ORDER BY published_at DESC,updated_at DESC LIMIT -1 OFFSET ?)').run(Math.max(1, newsMaxArticles));
  }

  function writeNewsArticles(stories, provider, updatedAt = iso(now())) {
    for (const story of stories) setNewsArticle.run(story.id, provider, JSON.stringify(story), story.publishedAt, updatedAt);
    pruneNewsArticles();
  }

  function archiveNewsArticles(stories, provider) {
    db.exec('BEGIN IMMEDIATE');
    try {
      writeNewsArticles(stories, provider);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }

  function referencedMediaFilenames() {
    const referenced = new Set();
    const pattern = /\/api\/media\/([a-f0-9]{64}\.(?:jpg|png|gif|webp))/g;
    const rows = [
      ...db.prepare('SELECT payload FROM content_cache').all(),
      ...db.prepare('SELECT payload FROM news_articles').all()
    ];
    for (const row of rows) {
      let match;
      while ((match = pattern.exec(row.payload))) referenced.add(match[1]);
      pattern.lastIndex = 0;
    }
    return referenced;
  }

  async function pruneMedia() {
    if (!resolvedMediaDir) return;
    await withMediaWriteLock(async () => {
      const referenced = referencedMediaFilenames();
      const blobs = db.prepare('SELECT * FROM content_media_blobs ORDER BY created_at ASC').all();
      for (const blob of blobs) {
        if (referenced.has(blob.filename)) continue;
        try { await unlink(join(resolvedMediaDir, blob.filename)); } catch (error) {
          if (error?.code !== 'ENOENT') logger.warn?.(`Media cleanup skipped ${blob.filename}: ${error.message}`);
        }
        deleteMediaSources.run(blob.filename);
        deleteMediaBlob.run(blob.filename);
      }
      const known = new Set(db.prepare('SELECT filename FROM content_media_blobs').all().map(row => row.filename));
      for (const filename of await readdir(resolvedMediaDir)) {
        const immutableBlob = /^[a-f0-9]{64}\.(?:jpg|png|gif|webp)$/.test(filename);
        const abandonedTemporary = /^\.[a-f0-9]{64}\.(?:jpg|png|gif|webp)\.[0-9a-f-]+\.tmp$/.test(filename);
        if ((immutableBlob && !known.has(filename)) || abandonedTemporary) {
          try { await unlink(join(resolvedMediaDir, filename)); } catch (error) { if (error?.code !== 'ENOENT') logger.warn?.(`Orphan media cleanup skipped ${filename}: ${error.message}`); }
        }
      }
      const totals = getMediaTotals.get();
      if (totals.count > mediaMaxFiles || totals.bytes > mediaMaxTotalBytes) logger.error?.(`Referenced media exceeds configured capacity: ${totals.count} files / ${totals.bytes} bytes`);
    });
  }

  for (const row of db.prepare("SELECT provider,payload FROM content_cache WHERE cache_key LIKE 'news:%'").all()) {
    try { archiveNewsArticles(JSON.parse(row.payload), row.provider); } catch (error) { logger.warn?.(`News cache migration skipped: ${error.message}`); }
  }

  async function cacheImage(sourceUrl) {
    if (!resolvedMediaDir || !sourceUrl) return null;
    const sourceHash = sha(sourceUrl);
    const saved = getMedia.get(sourceHash);
    if (saved && now() - Date.parse(saved.created_at) <= mediaTtlMs) {
      try { await stat(join(resolvedMediaDir, saved.filename)); return mediaPublicPath(saved.filename); } catch {}
    }
    if (mediaInflight.has(sourceHash)) return mediaInflight.get(sourceHash);
    const pending = (async () => {
      let validated = await assertPublicHttps(sourceUrl, lookupHost);
      let response;
      for (let redirects = 0; redirects < 4; redirects += 1) {
        const pinned = validated.addresses[0];
        const headers = { Accept: 'image/webp,image/png,image/jpeg,image/gif' };
        response = imageFetchImpl
          ? await imageFetchImpl(validated.url, { redirect: 'manual', headers, pinnedAddress: pinned.address, pinnedFamily: pinned.family })
          : await requestPinnedImage(validated.url, pinned, { headers });
        if ([301, 302, 303, 307, 308].includes(response.status)) {
          const location = response.headers.get('location');
          if (!location) { await discardBody(response); throw new Error('图片重定向缺少地址'); }
          await discardBody(response);
          validated = await assertPublicHttps(new URL(location, validated.url).href, lookupHost);
          continue;
        }
        break;
      }
      if (!response?.ok) { await discardBody(response); throw new Error(`图片服务返回 ${response?.status || '未知状态'}`); }
      const contentType = response.headers.get('content-type') || '';
      const bytes = await readLimitedBody(response, imageMaxBytes);
      const extension = imageExtension(contentType, bytes);
      const filename = sha(bytes) + extension;
      const normalizedType = contentType.split(';')[0].toLowerCase();
      return withMediaWriteLock(async () => {
        const destination = join(resolvedMediaDir, filename);
        const existingBlob = getMediaBlob.get(filename);
        if (!existingBlob) {
          const totals = getMediaTotals.get();
          if (totals.count + 1 > mediaMaxFiles || totals.bytes + bytes.length > mediaMaxTotalBytes) throw new Error('图片缓存已达容量上限');
        }
        try { await stat(destination); } catch {
          const temporary = join(resolvedMediaDir, `.${filename}.${randomUUID()}.tmp`);
          await writeFile(temporary, bytes, { flag: 'wx' });
          try { await rename(temporary, destination); } catch (error) {
            try { await unlink(temporary); } catch {}
            try { await stat(destination); } catch { throw error; }
          }
        }
        setMediaBlob.run(filename, normalizedType, bytes.length, iso(now()));
        setMedia.run(sourceHash, sourceUrl, filename, normalizedType, bytes.length, iso(now()));
        return mediaPublicPath(filename);
      });
    })().finally(() => mediaInflight.delete(sourceHash));
    mediaInflight.set(sourceHash, pending);
    return pending;
  }

  async function localizeTeams(items, selectors) {
    let failures = 0;
    const teams = [];
    for (const item of items) for (const selector of selectors) {
      const team = selector(item);
      if (team?.logoUrl) teams.push(team);
    }
    const byUrl = new Map();
    for (const team of teams) if (!byUrl.has(team.logoUrl)) byUrl.set(team.logoUrl, []);
    for (const team of teams) byUrl.get(team.logoUrl).push(team);
    await eachLimited([...byUrl.entries()], 4, async ([url, targets]) => {
      try {
        const local = await cacheImage(url);
        for (const team of targets) team.logoUrl = local;
      } catch (error) {
        failures += 1;
        for (const team of targets) team.logoUrl = null;
        logger.warn?.(`Content image cache skipped: ${error.message}`);
      }
    });
    return failures;
  }

  async function synchronize(key, provider, task) {
    if (refreshInflight.has(key)) return refreshInflight.get(key);
    const pending = (async () => {
      markAttempt(key, provider);
      try {
        const payload = await task();
        const updatedAt = iso(now());
        setCache.run(key, provider, JSON.stringify(payload), updatedAt);
        markSuccess(key, provider, updatedAt);
        return { key, updatedAt };
      } catch (error) {
        throw markFailure(key, provider, error);
      }
    })().finally(() => refreshInflight.delete(key));
    refreshInflight.set(key, pending);
    return pending;
  }

  const requireFootball = () => {
    if (!footballDataToken) throw new ContentError(503, 'FOOTBALL_DATA_UNCONFIGURED', '服务端未配置 FOOTBALL_DATA_API_KEY', { retryable: false });
  };
  const requirePanda = () => {
    if (!pandaScoreToken) throw new ContentError(503, 'PANDASCORE_UNCONFIGURED', '服务端未配置 PANDASCORE_API_TOKEN', { retryable: false });
  };
  const requireNews = () => {
    if (newsProvider === 'newsapi' && !newsApiKey) throw new ContentError(503, 'NEWS_API_UNCONFIGURED', 'NEWS_PROVIDER=newsapi 时必须配置 NEWS_API_KEY', { retryable: false });
  };

  let pandaLeagueCache = { ids: [], expiresAt: 0 };

  async function pandaTargetLeagueIds(headers) {
    if (pandaLeagueCache.ids.length && pandaLeagueCache.expiresAt > now()) return pandaLeagueCache.ids;
    const searches = ['LPL', 'World Championship', 'Worlds'];
    const responses = await Promise.all(searches.map(name => {
      const params = new URLSearchParams({ 'search[name]': name, per_page: '100' });
      return fetchJson(fetchImpl, `${pandaScoreBaseUrl}/lol/leagues?${params}`, { headers }, 'PANDASCORE');
    }));
    if (responses.some(body => !Array.isArray(body))) throw new ContentError(502, 'PANDASCORE_INVALID_RESPONSE', 'PandaScore 未返回可用的联赛列表', { retryable: true });
    const ids = unique(responses.flat().filter(league => league?.id != null && isWantedPandaLeague(league)).map(league => String(league.id)));
    if (!ids.length) throw new ContentError(502, 'PANDASCORE_TARGET_LEAGUES_UNAVAILABLE', 'PandaScore 未找到 LPL 或全球总决赛', { retryable: true });
    pandaLeagueCache = { ids, expiresAt: now() + 6 * 60 * 60_000 };
    return ids;
  }

  async function refreshFootball(competition) {
    requireFootball();
    const headers = { 'X-Auth-Token': footballDataToken, Accept: 'application/json' };
    const matchesKey = `sports:${competition.id}:matches`;
    const standingsKey = `sports:${competition.id}:standings`;
    const matches = synchronize(matchesKey, 'football-data.org', async () => {
      const body = await fetchJson(fetchImpl, `${footballDataBaseUrl}/competitions/${competition.providerId}/matches`, { headers }, 'FOOTBALL_DATA');
      if (!Array.isArray(body?.matches)) throw new ContentError(502, 'FOOTBALL_DATA_INVALID_RESPONSE', 'football-data.org 未返回比赛列表', { retryable: true });
      const transformed = body.matches
        .filter(match => match?.id != null && Number.isFinite(Date.parse(match?.utcDate)))
        .map(match => transformFootballMatch(match, competition.id));
      transformed.sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
      const upcoming = transformed.filter(item => !['finished', 'cancelled'].includes(item.status)).slice(0, 20);
      const history = transformed.filter(item => ['finished', 'cancelled'].includes(item.status)).sort((a, b) => Date.parse(b.startsAt) - Date.parse(a.startsAt)).slice(0, 20);
      const selected = [...upcoming, ...history];
      await localizeTeams(selected, [item => item.home, item => item.away]);
      return selected;
    });
    const standings = synchronize(standingsKey, 'football-data.org', async () => {
      const body = await fetchJson(fetchImpl, `${footballDataBaseUrl}/competitions/${competition.providerId}/standings`, { headers }, 'FOOTBALL_DATA');
      const rows = transformFootballStandings(body);
      if (!rows.length) throw new ContentError(502, 'FOOTBALL_DATA_STANDINGS_EMPTY', 'football-data.org 未返回可用积分榜', { retryable: true });
      await localizeTeams(rows, [item => item.team]);
      return rows;
    });
    const results = await Promise.allSettled([matches, standings]);
    if (results[0].status === 'rejected') throw results[0].reason;
    return results;
  }

  async function refreshPanda() {
    requirePanda();
    const headers = { Authorization: `Bearer ${pandaScoreToken}`, Accept: 'application/json' };
    const matchesKey = 'sports:lol:matches';
    const standingsKey = 'sports:lol:standings';
    const matchResult = await synchronize(matchesKey, 'PandaScore', async () => {
      const leagueIds = await pandaTargetLeagueIds(headers);
      const leagueFilter = encodeURIComponent(leagueIds.join(','));
      const endpoints = [
        `${pandaScoreBaseUrl}/lol/matches/running?filter[league_id]=${leagueFilter}&per_page=100`,
        `${pandaScoreBaseUrl}/lol/matches/upcoming?filter[league_id]=${leagueFilter}&sort=begin_at&per_page=100`,
        `${pandaScoreBaseUrl}/lol/matches/past?filter[league_id]=${leagueFilter}&sort=-begin_at&per_page=100`
      ];
      const responses = await Promise.all(endpoints.map(url => fetchJson(fetchImpl, url, { headers }, 'PANDASCORE')));
      if (responses.some(body => !Array.isArray(body))) throw new ContentError(502, 'PANDASCORE_INVALID_RESPONSE', 'PandaScore 未返回可用的比赛列表', { retryable: true });
      const byId = new Map();
      for (const match of responses.flat()) {
        if (match?.id == null || !isWantedPandaMatch(match, new Set(leagueIds))) continue;
        try { byId.set(String(match.id), transformPandaMatch(match)); } catch {}
      }
      const transformed = [...byId.values()].filter(item => Number.isFinite(Date.parse(item.startsAt)));
      const upcoming = transformed.filter(item => !['finished', 'cancelled'].includes(item.status)).sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt)).slice(0, 20);
      const history = transformed.filter(item => ['finished', 'cancelled'].includes(item.status)).sort((a, b) => Date.parse(b.startsAt) - Date.parse(a.startsAt)).slice(0, 20);
      const selected = [...upcoming, ...history];
      await localizeTeams(selected, [item => item.home, item => item.away]);
      return selected;
    });
    const matches = parseCache(matchesKey)?.value || [];
    const scopeMatch = matches.find(item => item.status === 'live' && item.tournamentId) || matches.find(item => item.status === 'scheduled' && item.tournamentId) || matches.find(item => item.tournamentId);
    const tournamentId = scopeMatch?.tournamentId;
    const standingsContext = tournamentId ? {
      tournamentId,
      name: scopeMatch?.round || `Tournament ${tournamentId}`,
      series: scopeMatch?.stage || '英雄联盟'
    } : null;
    let standingResult;
    if (!tournamentId) {
      const error = new ContentError(502, 'PANDASCORE_TOURNAMENT_UNAVAILABLE', 'PandaScore 赛程中没有可用的赛事 ID，无法同步积分榜', { retryable: true });
      markFailure(standingsKey, 'PandaScore', error);
      standingResult = { status: 'rejected', reason: error };
    } else {
      try {
        const value = await synchronize(standingsKey, 'PandaScore', async () => {
          const body = await fetchJson(fetchImpl, `${pandaScoreBaseUrl}/tournaments/${encodeURIComponent(tournamentId)}/standings`, { headers }, 'PANDASCORE');
          const rows = transformPandaStandings(body);
          if (!rows.length) throw new ContentError(502, 'PANDASCORE_STANDINGS_EMPTY', 'PandaScore 未返回可用积分榜', { retryable: true });
          for (const row of rows) if (!row.group) row.group = standingsContext.name;
          await localizeTeams(rows, [item => item.team]);
          return { rows, context: standingsContext };
        });
        standingResult = { status: 'fulfilled', value };
      } catch (reason) { standingResult = { status: 'rejected', reason }; }
    }
    return [{ status: 'fulfilled', value: matchResult }, standingResult];
  }

  async function refreshNewsApiChannel(channel) {
    requireNews();
    const config = NEWS_CHANNELS[channel];
    if (!config) throw new ContentError(400, 'NEWS_CHANNEL_INVALID', '无效的新闻频道');
    const key = `news:${channel}`;
    return synchronize(key, 'NewsAPI', async () => {
      const params = new URLSearchParams({ q: config.newsApiQuery, language: 'zh', sortBy: 'publishedAt', pageSize: '30', page: '1' });
      const body = await fetchJson(fetchImpl, `${newsApiBaseUrl}/everything?${params}`, { headers: { 'X-Api-Key': newsApiKey, Accept: 'application/json' } }, 'NEWS_API');
      if (body?.status !== 'ok' || !Array.isArray(body.articles)) throw new ContentError(502, 'NEWS_API_INVALID_RESPONSE', 'NewsAPI 未返回新闻列表', { retryable: true });
      const transformed = body.articles.filter(article => asHttpUrl(article.url) && asText(article.title) && article.publishedAt && Number.isFinite(Date.parse(article.publishedAt))).map(article => transformNewsApiArticle(article, channel));
      const stories = [...new Map(transformed.map(story => [story.id, story])).values()];
      if (!stories.length) throw new ContentError(502, 'NEWS_API_NEWS_EMPTY', 'NewsAPI 未返回可用新闻', { retryable: true });
      await eachLimited(stories, 4, async story => {
        if (!story.imageUrl) return;
        try { story.imageUrl = await cacheImage(story.imageUrl); } catch (error) {
          story.imageUrl = null;
          logger.warn?.(`News image cache skipped: ${error.message}`);
        }
      });
      archiveNewsArticles(stories, 'NewsAPI');
      return stories;
    });
  }

  async function fetchGdeltNews() {
    const params = new URLSearchParams({
      query: GDELT_NEWS_QUERY,
      mode: 'artlist',
      maxrecords: '100',
      timespan: '24h',
      sort: 'datedesc',
      format: 'json'
    });
    const request = () => fetchJson(fetchImpl, `${gdeltBaseUrl}?${params}`, { headers: { Accept: 'application/json' } }, 'GDELT');
    try {
      return await request();
    } catch (error) {
      if (error?.code !== 'GDELT_RATE_LIMITED' || gdeltRetryDelayMs <= 0) throw error;
      const retryDelay = Math.min(30_000, Math.max(gdeltRetryDelayMs, (error.retryAfterSeconds || 0) * 1_000));
      await new Promise(resolveDelay => setTimeout(resolveDelay, retryDelay));
      return request();
    }
  }

  async function fetchRssNews() {
    if (!rssNewsSources.length) throw new ContentError(503, 'RSS_NEWS_UNCONFIGURED', '未配置新闻 RSS 兜底来源', { retryable: false });
    const results = await Promise.allSettled(rssNewsSources.map(async source => {
      const xml = await fetchText(fetchImpl, source.url, { headers: { Accept: 'application/rss+xml, application/xml, text/xml;q=0.9' } }, 'RSS_NEWS');
      return parseRssFeed(xml, source);
    }));
    const articles = results.flatMap(result => result.status === 'fulfilled' ? result.value : []);
    if (!articles.length) {
      const firstError = results.find(result => result.status === 'rejected')?.reason;
      throw firstError || new ContentError(502, 'RSS_NEWS_EMPTY', '公开 RSS 未返回可用新闻', { retryable: true });
    }
    return buildRssFeeds(articles);
  }

  async function refreshGdeltNews() {
    requireNews();
    const inflightKey = 'news:gdelt:all';
    if (refreshInflight.has(inflightKey)) return refreshInflight.get(inflightKey);
    let provider = 'GDELT Project';
    const keys = Object.keys(NEWS_CHANNELS).map(channel => ({ channel, key: `news:${channel}` }));
    const pending = (async () => {
      for (const item of keys) markAttempt(item.key, provider);
      try {
        let feeds;
        let gdeltError;
        try {
          const body = await fetchGdeltNews();
          if (!Array.isArray(body?.articles)) throw new ContentError(502, 'GDELT_INVALID_RESPONSE', 'GDELT 未返回新闻列表', { retryable: true });
          feeds = buildGdeltFeeds(body.articles);
          if (!feeds.featured.length) throw new ContentError(502, 'GDELT_NEWS_EMPTY', 'GDELT 未返回可用的中文新闻', { retryable: true });
        } catch (error) {
          gdeltError = error;
          if (!['GDELT_UPSTREAM_UNREACHABLE', 'GDELT_UPSTREAM_HTTP_ERROR', 'GDELT_INVALID_RESPONSE', 'GDELT_NEWS_EMPTY'].includes(error?.code)) throw error;
          feeds = await fetchRssNews();
          provider = '36氪 / 中新网 RSS';
          logger.warn?.(`GDELT unavailable, using public RSS fallback: ${error.message}`);
        }
        if (!feeds.featured.length) throw gdeltError || new ContentError(502, 'RSS_NEWS_EMPTY', '公开 RSS 未返回可用新闻', { retryable: true });
        const updatedAt = iso(now());
        const refreshed = [];
        const errors = [];
        db.exec('BEGIN IMMEDIATE');
        try {
          writeNewsArticles(Object.values(feeds).flat(), provider, updatedAt);
          for (const item of keys) {
            if (feeds[item.channel].length) {
              setCache.run(item.key, provider, JSON.stringify(feeds[item.channel]), updatedAt);
              markSuccess(item.key, provider, updatedAt);
              refreshed.push(item.channel);
            } else {
              const code = `${provider === 'GDELT Project' ? 'GDELT' : 'RSS_NEWS'}_${item.channel.toUpperCase()}_EMPTY`;
              const error = new ContentError(502, code, `${provider} 本轮没有筛选出可用的${NEWS_CHANNELS[item.channel].topic}资讯`, { retryable: true });
              markFailure(item.key, provider, error);
              errors.push({ id: item.channel, status: error.status, code: error.code, message: error.message, retryable: error.retryable });
            }
          }
          db.exec('COMMIT');
        } catch (error) {
          db.exec('ROLLBACK');
          throw error;
        }
        return { refreshed, errors, updatedAt };
      } catch (error) {
        let contentError;
        for (const item of keys) contentError = markFailure(item.key, provider, error);
        throw contentError;
      }
    })().finally(() => refreshInflight.delete(inflightKey));
    refreshInflight.set(inflightKey, pending);
    return pending;
  }

  function competitionById(id) {
    const competition = COMPETITIONS.find(item => item.id === id);
    if (!competition) throw new ContentError(404, 'COMPETITION_NOT_FOUND', '赛事不存在');
    return competition;
  }

  function unavailableForCompetition(competition) {
    if (competition.id === 'lol') requirePanda(); else requireFootball();
    const warning = warningFor(`sports:${competition.id}:matches`);
    throw new ContentError(503, warning?.code || 'SPORTS_CACHE_EMPTY', warning?.message || '暂无真实比赛数据，请先刷新', { retryable: true });
  }

  function metaFor(row, key, ttlMs) {
    const warning = warningFor(key);
    const age = now() - Date.parse(row.updated_at);
    return {
      provider: row.provider,
      providerUrl: PROVIDER_URLS[row.provider] || null,
      updatedAt: row.updated_at,
      stale: age > ttlMs || Boolean(warning),
      warning
    };
  }

  function getCompetitions() {
    const states = COMPETITIONS.map(competition => {
      const row = parseCache(`sports:${competition.id}:matches`);
      return row ? metaFor(row, `sports:${competition.id}:matches`, sportsTtlMs) : null;
    }).filter(Boolean);
    const updatedAt = states.map(state => state.updatedAt).sort().at(-1) || iso(now());
    return {
      competitions: COMPETITIONS.map(publicCompetition),
      meta: { provider: 'configured providers', updatedAt, stale: states.length === 0, warning: states.length === 0 ? { code: 'SPORTS_CACHE_EMPTY', message: '还没有同步真实赛事数据' } : null }
    };
  }

  function getSports(competitionId) {
    const competition = competitionById(competitionId);
    const matches = parseCache(`sports:${competitionId}:matches`);
    if (!matches) unavailableForCompetition(competition);
    const standings = parseCache(`sports:${competitionId}:standings`);
    const standingsValue = standings?.value;
    const cachedStandingsRows = Array.isArray(standingsValue) ? standingsValue : Array.isArray(standingsValue?.rows) ? standingsValue.rows : [];
    const standingsContext = Array.isArray(standingsValue) ? null : standingsValue?.context || null;
    if (competitionId !== 'lol') {
      for (const match of matches.value) {
        applyFootballTeamZh(match.home);
        applyFootballTeamZh(match.away);
        match.stage = footballStageZh(match.stage);
      }
      for (const row of cachedStandingsRows) applyFootballTeamZh(row.team);
    }
    const matchesValue = competitionId === 'lol' ? matches.value.filter(isWantedCachedPandaMatch) : matches.value;
    const validLolStandings = competitionId !== 'lol' || (standingsContext && isWantedCachedPandaMatch({ stage: standingsContext.series, round: standingsContext.name }));
    const standingsRows = validLolStandings ? cachedStandingsRows : [];
    const providerStandingsWarning = standings ? warningFor(`sports:${competitionId}:standings`) : warningFor(`sports:${competitionId}:standings`) || { code: 'STANDINGS_CACHE_EMPTY', message: '暂无真实积分榜数据' };
    const scopeWarning = competitionId === 'lol' && standingsRows.length
      ? standingsContext
        ? { code: 'PANDASCORE_TOURNAMENT_SCOPE', message: `当前积分榜仅对应 ${standingsContext.series} · ${standingsContext.name}，不代表全部英雄联盟赛事。` }
        : { code: 'PANDASCORE_TOURNAMENT_CONTEXT_MISSING', message: '该积分榜来自旧缓存且缺少赛事范围，请刷新后再查看。' }
      : null;
    const filteredScopeWarning = competitionId === 'lol' && cachedStandingsRows.length && !validLolStandings
      ? { code: 'PANDASCORE_SCOPE_FILTERED', message: '旧积分榜不属于 LPL 或全球总决赛，已隐藏并等待重新同步。' }
      : null;
    const meta = metaFor(matches, `sports:${competitionId}:matches`, sportsTtlMs);
    if (competitionId === 'lol' && matches.value.length && !matchesValue.length) {
      meta.stale = true;
      meta.warning = { code: 'PANDASCORE_SCOPE_FILTERED', message: '旧赛程不属于 LPL 或全球总决赛，已隐藏并等待重新同步。' };
    }
    return {
      competition: publicCompetition(competition),
      matches: matchesValue,
      standings: standingsRows,
      standingsContext,
      standingsWarning: providerStandingsWarning || filteredScopeWarning || scopeWarning,
      meta
    };
  }

  function getMatch(id) {
    for (const competition of COMPETITIONS) {
      const row = parseCache(`sports:${competition.id}:matches`);
      const match = row?.value?.find?.(item => item.id === id);
      if (match && (competition.id !== 'lol' || isWantedCachedPandaMatch(match))) {
        if (competition.id !== 'lol') {
          applyFootballTeamZh(match.home);
          applyFootballTeamZh(match.away);
          match.stage = footballStageZh(match.stage);
        }
        return { match, meta: metaFor(row, `sports:${competition.id}:matches`, sportsTtlMs) };
      }
    }
    throw new ContentError(404, 'MATCH_NOT_FOUND', '比赛不存在或已下架');
  }

  function getNews(channel) {
    if (!NEWS_CHANNELS[channel]) throw new ContentError(400, 'NEWS_CHANNEL_INVALID', '无效的新闻频道');
    const key = `news:${channel}`;
    const row = parseCache(key);
    if (!row) {
      requireNews();
      const warning = warningFor(key);
      throw new ContentError(503, warning?.code || 'NEWS_CACHE_EMPTY', warning?.message || '暂无真实新闻数据，请先刷新', { retryable: true });
    }
    return {
      channel,
      stories: row.value,
      topics: unique(row.value.flatMap(story => [story.topic, ...(story.tags || [])])).slice(0, 8),
      meta: metaFor(row, key, newsTtlMs)
    };
  }

  function getNewsStory(id) {
    const archived = getNewsArticle.get(id);
    if (archived) {
      try {
        const story = JSON.parse(archived.payload);
        const feed = parseCache(`news:${story.channel}`);
        return {
          story,
          meta: feed && feed.value?.some?.(item => item.id === id)
            ? metaFor(feed, `news:${story.channel}`, newsTtlMs)
            : { provider: archived.provider, providerUrl: PROVIDER_URLS[archived.provider] || null, updatedAt: archived.updated_at, stale: now() - Date.parse(archived.updated_at) > newsTtlMs, warning: null }
        };
      } catch {}
    }
    for (const channel of Object.keys(NEWS_CHANNELS)) {
      const row = parseCache(`news:${channel}`);
      const story = row?.value?.find?.(item => item.id === id);
      if (story) return { story, meta: metaFor(row, `news:${channel}`, newsTtlMs) };
    }
    throw new ContentError(404, 'NEWS_NOT_FOUND', '新闻不存在或已下架');
  }

  async function refresh({ target, competitionId, channel, scheduled = false } = {}) {
    const refreshed = [];
    const errors = [];
    const tasks = [];
    if (target === 'sports') {
      const competitions = competitionId ? [competitionById(competitionId)] : COMPETITIONS;
      for (const competition of competitions) tasks.push({ id: competition.id, run: () => competition.id === 'lol' ? refreshPanda() : refreshFootball(competition) });
    } else if (target === 'news') {
      const channels = channel ? [channel] : Object.keys(NEWS_CHANNELS);
      if (channels.some(item => !NEWS_CHANNELS[item])) throw new ContentError(400, 'NEWS_CHANNEL_INVALID', '无效的新闻频道');
      if (newsProvider === 'gdelt') tasks.push({ id: channel || 'all', run: async () => {
        const result = await refreshGdeltNews();
        return channel ? {
          ...result,
          refreshed: result.refreshed.filter(id => id === channel),
          errors: result.errors.filter(error => error.id === channel)
        } : result;
      } });
      else for (const id of channels) tasks.push({ id, run: () => refreshNewsApiChannel(id) });
    } else {
      throw new ContentError(400, 'CONTENT_REFRESH_TARGET_INVALID', 'target 必须是 sports 或 news');
    }
    if (!scheduled && refreshCooldownMs > 0) {
      const refreshKey = target === 'news' && newsProvider === 'gdelt' ? 'news:*' : `${target}:${competitionId || channel || '*'}`;
      const elapsed = now() - (manualRefreshAt.get(refreshKey) || 0);
      if (elapsed < refreshCooldownMs) {
        const retryAfterSeconds = Math.max(1, Math.ceil((refreshCooldownMs - elapsed) / 1000));
        throw new ContentError(429, 'CONTENT_REFRESH_RATE_LIMITED', `刷新过于频繁，请在 ${retryAfterSeconds} 秒后重试`, { retryable: true, retryAfterSeconds });
      }
      manualRefreshAt.set(refreshKey, now());
    }
    activeRefreshes += 1;
    let results;
    try {
      results = await Promise.allSettled(tasks.map(task => task.run()));
    } finally {
      activeRefreshes -= 1;
      if (activeRefreshes === 0) try { await pruneMedia(); } catch (error) { logger.error?.(`Media cleanup failed: ${error.message}`); }
    }
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        if (Array.isArray(result.value?.refreshed) && Array.isArray(result.value?.errors)) {
          refreshed.push(...result.value.refreshed);
          errors.push(...result.value.errors);
        } else refreshed.push(tasks[index].id);
        if (Array.isArray(result.value)) for (const part of result.value) if (part.status === 'rejected') {
          const error = part.reason?.isContentError ? part.reason : new ContentError(502, 'CONTENT_SYNC_FAILED', part.reason?.message || '同步失败', { retryable: true });
          errors.push({ id: `${tasks[index].id}:standings`, status: error.status, code: error.code, message: error.message, retryable: error.retryable, retryAfterSeconds: error.retryAfterSeconds });
        }
      }
      else {
        const error = result.reason?.isContentError ? result.reason : new ContentError(502, 'CONTENT_SYNC_FAILED', result.reason?.message || '同步失败', { retryable: true });
        errors.push({ id: tasks[index].id, status: error.status, code: error.code, message: error.message, retryable: error.retryable, retryAfterSeconds: error.retryAfterSeconds });
      }
    });
    if (!refreshed.length && errors.length) {
      if (errors.length === 1) {
        const error = errors[0];
        throw new ContentError(error.status || (error.retryable ? 502 : 503), error.code, error.message, { retryable: error.retryable, retryAfterSeconds: error.retryAfterSeconds });
      }
      const retryable = errors.some(error => error.retryable);
      const retryAfterSeconds = errors.map(error => error.retryAfterSeconds).filter(Number.isFinite).sort((a, b) => a - b)[0];
      throw new ContentError(retryable ? 502 : 503, 'CONTENT_REFRESH_FAILED', `所有内容同步均失败：${errors.map(error => `${error.id}/${error.code}`).join(', ')}`, { retryable, retryAfterSeconds });
    }
    return { ok: errors.length === 0, target, refreshed, errors, refreshedAt: iso(now()) };
  }

  async function serveMedia(req, res, pathname) {
    if (!resolvedMediaDir || !['GET', 'HEAD'].includes(req.method) || !pathname.startsWith('/api/media/')) return false;
    let filename;
    try { filename = decodeURIComponent(pathname.slice('/api/media/'.length)); } catch { return false; }
    if (!/^[a-f0-9]{64}\.(jpg|png|gif|webp)$/.test(filename) || basename(filename) !== filename) return false;
    const fullPath = resolve(resolvedMediaDir, filename);
    if (!fullPath.startsWith(resolvedMediaDir + sep)) return false;
    const row = getMediaBlob.get(filename);
    if (!row) return false;
    try {
      const bytes = await readFile(fullPath);
      res.writeHead(200, { 'Content-Type': row.content_type, 'Content-Length': bytes.length, 'Cache-Control': 'public, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox" });
      if (req.method === 'HEAD') res.end(); else res.end(bytes);
      return true;
    } catch { return false; }
  }

  function startScheduler({ sportsIntervalMs = 15 * 60_000, newsIntervalMs = 60 * 60_000, initialDelayMs = 1_000 } = {}) {
    const run = target => refresh({ target, scheduled: true }).then(result => {
      if (result.errors.length) logger.warn?.(`Content ${target} sync completed with ${result.errors.length} error(s)`);
    }).catch(error => logger.error?.(`Content ${target} sync failed: ${error.message}`));
    const initial = setTimeout(() => { void run('sports'); void run('news'); }, initialDelayMs);
    initial.unref?.();
    timers.push(initial);
    for (const [target, interval] of [['sports', sportsIntervalMs], ['news', newsIntervalMs]]) {
      const timer = setInterval(() => void run(target), interval);
      timer.unref?.();
      timers.push(timer);
    }
  }

  function stopScheduler() {
    while (timers.length) clearTimeout(timers.pop());
  }

  return { getCompetitions, getSports, getMatch, getNews, getNewsStory, refresh, serveMedia, cacheImage, startScheduler, stopScheduler };
}
