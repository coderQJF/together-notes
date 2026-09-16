import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from './index.mjs';

const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]);
const pngChanged = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 0, 0, 0]);
const publicLookup = async () => [{ address: '93.184.216.34', family: 4 }];

async function setup(contentConfig = {}, fetchImpl = async () => { throw new Error('unexpected network call'); }) {
  const directory = await mkdtemp(join(tmpdir(), 'together-content-'));
  const app = createApp({ dbPath: join(directory, 'app.sqlite'), testAuth: true, fetchImpl, contentConfig: { mediaDir: join(directory, 'media'), lookupHost: publicLookup, imageFetchImpl: (input, options) => fetchImpl(input, options), ...contentConfig } });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${app.server.address().port}/api`;
  const login = await fetch(base + '/auth/test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: '我' }) }).then(response => response.json());
  const call = async (path, method = 'GET', body) => {
    const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${login.token}` }, body: body ? JSON.stringify(body) : undefined });
    return { status: response.status, headers: response.headers, body: await response.json() };
  };
  const close = async () => {
    app.content.stopScheduler();
    await new Promise(resolve => app.server.close(resolve));
    app.db.close();
    await rm(directory, { recursive: true, force: true });
  };
  return { app, base, call, close };
}

test('content endpoints report unconfigured real providers without fallback data', async () => {
  const context = await setup({ newsProvider: 'newsapi' });
  try {
    const competitions = await context.call('/content/competitions');
    assert.equal(competitions.status, 200);
    assert.deepEqual(competitions.body.competitions.map(item => item.id), ['epl', 'ucl', 'lol', 'laliga']);
    assert.equal(competitions.body.meta.stale, true);

    const sports = await context.call('/content/sports/epl');
    assert.equal(sports.status, 503);
    assert.equal(sports.body.code, 'FOOTBALL_DATA_UNCONFIGURED');
    assert.equal(sports.body.error.code, 'FOOTBALL_DATA_UNCONFIGURED');
    assert.equal(sports.body.error.retryable, false);

    const news = await context.call('/content/news?channel=market');
    assert.equal(news.status, 503);
    assert.equal(news.body.error.code, 'NEWS_API_UNCONFIGURED');
  } finally { await context.close(); }
});

test('manual provider refreshes are rate limited to protect upstream quotas', async () => {
  const context = await setup();
  try {
    const first = await context.call('/content/refresh', 'POST', { target: 'sports', competitionId: 'epl' });
    assert.equal(first.status, 503);
    assert.equal(first.body.code, 'FOOTBALL_DATA_UNCONFIGURED');
    const second = await context.call('/content/refresh', 'POST', { target: 'sports', competitionId: 'epl' });
    assert.equal(second.status, 429);
    assert.equal(second.body.code, 'CONTENT_REFRESH_RATE_LIMITED');
    assert.ok(second.body.error.retryAfterSeconds >= 1);
    assert.equal(second.headers.get('retry-after'), String(second.body.error.retryAfterSeconds));
    assert.equal(second.headers.get('x-request-id'), second.body.error.requestId);
  } finally { await context.close(); }
});

test('football data is transformed, images are localized, and a failed refresh serves stale real cache', async () => {
  let currentTime = Date.parse('2026-09-16T02:00:00.000Z');
  let upstreamFails = false;
  const fetchImpl = async input => {
    const url = String(input);
    if (url === 'https://images.example/home.png') return new Response(png, { status: 200, headers: { 'Content-Type': 'image/png' } });
    if (upstreamFails) return new Response(JSON.stringify({ message: 'maintenance' }), { status: 503, headers: { 'Content-Type': 'application/json', 'Retry-After': '17' } });
    if (url.endsWith('/competitions/PL/matches')) return Response.json({ matches: [
      { id: 101, utcDate: '2026-09-18T18:00:00Z', status: 'TIMED', stage: 'REGULAR_SEASON', matchday: 4, homeTeam: { id: 1, name: 'Brentford FC', shortName: 'Brentford', tla: 'BRE', crest: 'https://images.example/home.png' }, awayTeam: { id: 2, name: 'Chelsea FC', shortName: 'Chelsea', tla: 'CHE', crest: null }, score: { winner: null, fullTime: { home: null, away: null } }, season: { id: 22 } },
      { id: 100, utcDate: '2026-09-12T18:00:00Z', status: 'FINISHED', stage: 'REGULAR_SEASON', matchday: 3, homeTeam: { id: 2, name: 'Chelsea FC', tla: 'CHE' }, awayTeam: { id: 1, name: 'Brentford FC', tla: 'BRE', crest: 'https://images.example/home.png' }, score: { winner: 'AWAY_TEAM', fullTime: { home: 1, away: 2 } }, season: { id: 22 } }
    ] });
    if (url.endsWith('/competitions/PL/standings')) return Response.json({ standings: [
      { type: 'TOTAL', table: [{ position: 1, team: { id: 1, name: 'Brentford FC', tla: 'BRE', crest: 'https://images.example/home.png' }, playedGames: 4, won: 3, draw: 1, lost: 0, goalDifference: 6, points: 10 }] },
      { type: 'HOME', table: [{ position: 1, team: { id: 3, name: 'Home-only table must not leak', tla: 'BAD' }, playedGames: 2, won: 2, draw: 0, lost: 0, goalDifference: 4, points: 6 }] },
      { type: 'AWAY', table: [{ position: 1, team: { id: 4, name: 'Away-only table must not leak', tla: 'BAD' }, playedGames: 2, won: 2, draw: 0, lost: 0, goalDifference: 3, points: 6 }] }
    ] });
    throw new Error(`unexpected URL ${url}`);
  };
  const context = await setup({ footballDataToken: 'football-token', now: () => currentTime, sportsTtlMs: 60_000 }, fetchImpl);
  try {
    const refresh = await context.call('/content/refresh', 'POST', { target: 'sports', competitionId: 'epl' });
    assert.equal(refresh.status, 200);
    assert.equal(refresh.body.ok, true);

    const sports = await context.call('/content/sports/epl');
    assert.equal(sports.status, 200);
    assert.equal(sports.body.matches.length, 2);
    assert.equal(sports.body.matches[0].id, 'football:101');
    assert.equal(sports.body.matches[0].home.name, '布伦特福德');
    assert.equal(sports.body.matches[0].home.shortName, '布伦特福德');
    assert.equal(sports.body.matches[0].away.name, '切尔西');
    assert.equal(sports.body.matches[0].stage, '常规赛');
    assert.equal(sports.body.matches[0].score, null);
    assert.equal(sports.body.matches[1].score.away, 2);
    assert.equal(sports.body.standings.length, 1);
    assert.equal(sports.body.standings[0].points, 10);
    assert.match(sports.body.matches[0].home.logoUrl, /^\/api\/media\/[a-f0-9]{64}\.png$/);
    assert.equal(sports.body.meta.stale, false);

    const image = await fetch(new URL(sports.body.matches[0].home.logoUrl, context.base));
    assert.equal(image.status, 200);
    assert.equal(image.headers.get('content-type'), 'image/png');
    assert.deepEqual(Buffer.from(await image.arrayBuffer()), png);

    const detail = await context.call('/content/sports/matches/' + encodeURIComponent('football:101'));
    assert.equal(detail.status, 200);
    assert.equal(detail.body.match.home.name, '布伦特福德');

    currentTime += 120_000;
    upstreamFails = true;
    const failed = await context.call('/content/refresh', 'POST', { target: 'sports', competitionId: 'epl' });
    assert.equal(failed.status, 502);
    assert.equal(failed.body.error.code, 'FOOTBALL_DATA_UPSTREAM_HTTP_ERROR');
    assert.equal(failed.body.error.retryAfterSeconds, 17);
    assert.equal(failed.headers.get('retry-after'), '17');
    const stale = await context.call('/content/sports/epl');
    assert.equal(stale.status, 200);
    assert.equal(stale.body.meta.stale, true);
    assert.equal(stale.body.meta.warning.code, 'FOOTBALL_DATA_UPSTREAM_HTTP_ERROR');
    assert.equal(stale.body.matches[0].id, 'football:101');
    const legacyMatches = structuredClone(stale.body.matches);
    legacyMatches[0].home = { ...legacyMatches[0].home, name: 'Brentford FC', shortName: 'BRE' };
    legacyMatches[0].away = { ...legacyMatches[0].away, name: 'Chelsea FC', shortName: 'CHE' };
    legacyMatches[0].stage = 'REGULAR SEASON';
    context.app.db.prepare('UPDATE content_cache SET payload=? WHERE cache_key=?').run(JSON.stringify(legacyMatches), 'sports:epl:matches');
    const legacy = await context.call('/content/sports/epl');
    assert.equal(legacy.body.matches[0].home.shortName, '布伦特福德');
    assert.equal(legacy.body.matches[0].away.shortName, '切尔西');
    assert.equal(legacy.body.matches[0].stage, '常规赛');
  } finally { await context.close(); }
});

test('PandaScore and NewsAPI payloads stay real while unsafe remote images are rejected', async () => {
  const requested = [];
  const fetchImpl = async input => {
    const url = String(input);
    requested.push(url);
    if (url === 'https://cdn.example/news.png' || url === 'https://cdn.example/team.png') return new Response(png, { status: 200, headers: { 'Content-Type': 'image/png' } });
    if (url.includes('/lol/leagues?')) {
      const search = new URL(url).searchParams.get('search[name]');
      if (search === 'LPL') return Response.json([{ id: 10, name: 'LPL', slug: 'lpl' }, { id: 11, name: 'LCK', slug: 'lck' }]);
      if (search === 'World Championship') return Response.json([{ id: 20, name: 'World Championship', slug: 'world-championship' }]);
      if (search === 'Worlds') return Response.json([{ id: 20, name: 'World Championship', slug: 'world-championship' }]);
    }
    if (url.includes('/lol/matches/running')) return Response.json([]);
    if (url.includes('/lol/matches/upcoming')) return Response.json([
      { id: 501, begin_at: '2026-09-18T09:00:00Z', status: 'not_started', number_of_games: 3, league: { id: 10, name: 'LPL', slug: 'lpl' }, serie: { full_name: '2026 Regional Finals' }, tournament: { id: 88, name: 'Winner Bracket' }, tournament_id: 88, opponents: [{ opponent: { id: 11, name: 'Alpha', acronym: 'ALP', image_url: 'https://cdn.example/team.png' } }, { opponent: { id: 12, name: 'Beta', acronym: 'BET' } }], results: [] },
      { id: 502, begin_at: '2026-10-08T09:00:00Z', status: 'not_started', number_of_games: 5, league: { id: 20, name: 'World Championship', slug: 'world-championship' }, serie: { full_name: '2026 Worlds' }, tournament: { id: 99, name: 'Swiss Stage' }, tournament_id: 99, opponents: [{ opponent: { id: 13, name: 'Gamma', acronym: 'GAM' } }, { opponent: { id: 14, name: 'Delta', acronym: 'DEL' } }], results: [] },
      { id: 503, begin_at: '2026-09-19T09:00:00Z', status: 'not_started', number_of_games: 3, league: { id: 11, name: 'LCK', slug: 'lck' }, serie: { full_name: '2026 LCK' }, tournament: { id: 77, name: 'Playoffs' }, tournament_id: 77, opponents: [{ opponent: { id: 15, name: 'Other One', acronym: 'ONE' } }, { opponent: { id: 16, name: 'Other Two', acronym: 'TWO' } }], results: [] }
    ]);
    if (url.includes('/lol/matches/past')) return Response.json([]);
    if (url.includes('/tournaments/88/standings')) return Response.json([{ rank: 1, team: { id: 11, name: 'Alpha', acronym: 'ALP', image_url: 'https://cdn.example/team.png' }, wins: 3, losses: 0 }]);
    if (url.includes('/everything?')) return Response.json({ status: 'ok', articles: [
      { source: { name: 'Market Wire' }, author: 'Reporter', title: 'Markets move on new data', description: 'A real provider summary.', content: 'A real provider excerpt. [+100 chars]', url: 'https://publisher.example/market-story', urlToImage: 'https://cdn.example/news.png', publishedAt: '2026-09-16T01:30:00Z' },
      { source: { name: 'Security Desk' }, title: 'Image blocked but article retained', description: 'Private address must not be fetched.', content: 'Provider text.', url: 'https://publisher.example/security-story', urlToImage: 'https://127.0.0.1/private.png', publishedAt: '2026-09-16T01:20:00Z' }
    ] });
    throw new Error(`unexpected URL ${url}`);
  };
  const context = await setup({ pandaScoreToken: 'panda-token', newsProvider: 'newsapi', newsApiKey: 'news-token' }, fetchImpl);
  try {
    const sportsRefresh = await context.call('/content/refresh', 'POST', { target: 'sports', competitionId: 'lol' });
    assert.equal(sportsRefresh.status, 200);
    const sports = await context.call('/content/sports/lol');
    assert.equal(sports.status, 200);
    assert.equal(sports.body.matches.length, 2);
    assert.deepEqual(sports.body.matches.map(match => match.id), ['pandascore:501', 'pandascore:502']);
    assert.equal(sports.body.matches[0].format, 'BO3');
    assert.equal(sports.body.matches[0].tournamentId, '88');
    assert.equal(sports.body.standings[0].record, '3胜 0负');
    assert.equal(sports.body.standingsContext.tournamentId, '88');
    assert.equal(sports.body.standingsContext.name, 'Winner Bracket');
    assert.equal(sports.body.standingsWarning.code, 'PANDASCORE_TOURNAMENT_SCOPE');
    assert.match(sports.body.matches[0].home.logoUrl, /^\/api\/media\//);
    for (const url of requested.filter(value => value.includes('/lol/matches/'))) {
      assert.equal(new URL(url).searchParams.get('filter[league_id]'), '10,20');
    }

    const newsRefresh = await context.call('/content/refresh', 'POST', { target: 'news', channel: 'market' });
    assert.equal(newsRefresh.status, 200);
    const news = await context.call('/content/news?channel=market');
    assert.equal(news.status, 200);
    assert.equal(news.body.stories.length, 2);
    assert.match(news.body.stories[0].imageUrl, /^\/api\/media\//);
    assert.equal(news.body.stories[1].imageUrl, null);
    assert.equal(requested.some(url => url.startsWith('https://127.0.0.1/')), false);

    const detail = await context.call('/content/news/' + encodeURIComponent(news.body.stories[0].id));
    assert.equal(detail.status, 200);
    assert.equal(detail.body.story.source, 'Market Wire');
    assert.equal(detail.body.story.content, 'A real provider excerpt.');
  } finally { await context.close(); }
});

test('PandaScore tournament without standings keeps matches and exposes a friendly notice', async () => {
  const fetchImpl = async input => {
    const url = String(input);
    if (url.includes('/lol/leagues?')) {
      const search = new URL(url).searchParams.get('search[name]');
      if (search === 'LPL') return Response.json([{ id: 10, name: 'LPL', slug: 'lpl' }]);
      return Response.json([{ id: 20, name: 'World Championship', slug: 'world-championship' }]);
    }
    if (url.includes('/lol/matches/running') || url.includes('/lol/matches/past')) return Response.json([]);
    if (url.includes('/lol/matches/upcoming')) return Response.json([
      { id: 601, begin_at: '2026-09-18T09:00:00Z', status: 'not_started', number_of_games: 3, league: { id: 10, name: 'LPL', slug: 'lpl' }, serie: { full_name: '2026 LPL' }, tournament: { id: 188, name: 'Playoffs' }, tournament_id: 188, opponents: [{ opponent: { id: 21, name: 'Alpha', acronym: 'ALP' } }, { opponent: { id: 22, name: 'Beta', acronym: 'BET' } }], results: [] }
    ]);
    if (url.includes('/tournaments/188/standings')) return new Response('{"error":"Record not found"}', { status: 404, headers: { 'Content-Type': 'application/json' } });
    throw new Error(`unexpected URL ${url}`);
  };
  const context = await setup({ pandaScoreToken: 'panda-token' }, fetchImpl);
  try {
    const refresh = await context.call('/content/refresh', 'POST', { target: 'sports', competitionId: 'lol' });
    assert.equal(refresh.status, 200);
    assert.equal(refresh.body.ok, false);
    assert.equal(refresh.body.errors[0].code, 'PANDASCORE_STANDINGS_UNAVAILABLE');

    const sports = await context.call('/content/sports/lol');
    assert.equal(sports.status, 200);
    assert.equal(sports.body.matches.length, 1);
    assert.deepEqual(sports.body.standings, []);
    assert.equal(sports.body.standingsContext, null);
    assert.equal(sports.body.standingsWarning.code, 'PANDASCORE_STANDINGS_UNAVAILABLE');
    assert.equal(sports.body.standingsWarning.message, 'PandaScore 暂未提供该阶段积分榜，赛程和赛果不受影响。');
    assert.doesNotMatch(sports.body.standingsWarning.message, /Record not found|404/);
  } finally { await context.close(); }
});

test('GDELT uses one real response for all news channels without inventing missing content', async () => {
  const requested = [];
  const fetchImpl = async input => {
    const url = new URL(String(input));
    requested.push(url);
    assert.equal(url.origin + url.pathname, 'https://api.gdeltproject.org/api/v2/doc/doc');
    assert.match(url.searchParams.get('query'), /sourcelang:zho/);
    assert.equal(url.searchParams.get('mode'), 'artlist');
    assert.equal(url.searchParams.get('maxrecords'), '100');
    return Response.json({ articles: [
      { url: 'https://finance.example/market-1', title: '央行利率变化推动股市走强', seendate: '20260916T021500Z', domain: 'finance.example', language: 'Chinese', socialimage: 'https://images.example/should-not-download.jpg' },
      { url: 'https://tech.example/ai-1', title: '人工智能芯片公司发布新产品', seendate: '20260916T020000Z', domain: '', language: 'Chinese' },
      { url: 'https://finance.example/market-1', title: '重复地址不得重复展示', seendate: '20260916T015900Z', domain: 'duplicate.example', language: 'Chinese' },
      { url: 'javascript:alert(1)', title: '无效地址', seendate: '20260916T015800Z', domain: 'invalid.example', language: 'Chinese' }
    ] });
  };
  const context = await setup({ newsProvider: 'gdelt' }, fetchImpl);
  try {
    const refresh = await context.call('/content/refresh', 'POST', { target: 'news', channel: 'market' });
    assert.equal(refresh.status, 200);
    assert.deepEqual(refresh.body.refreshed, ['market']);
    assert.equal(requested.length, 1);

    const featured = await context.call('/content/news?channel=featured');
    assert.equal(featured.status, 200);
    assert.equal(featured.body.stories.length, 2);
    assert.equal(featured.body.meta.provider, 'GDELT Project');
    assert.equal(featured.body.meta.providerUrl, 'https://www.gdeltproject.org/');
    assert.equal(featured.body.stories[0].publishedAt, '2026-09-16T02:15:00.000Z');
    assert.equal(featured.body.stories[0].summary, '');
    assert.equal(featured.body.stories[0].content, '');
    assert.equal(featured.body.stories[0].imageUrl, null);

    const market = await context.call('/content/news?channel=market');
    assert.equal(market.body.stories.length, 1);
    assert.equal(market.body.stories[0].source, 'finance.example');
    const hot = await context.call('/content/news?channel=hot');
    assert.equal(hot.body.stories.length, 1);
    assert.equal(hot.body.stories[0].source, 'tech.example');

    const detail = await context.call('/content/news/' + encodeURIComponent(featured.body.stories[0].id));
    assert.equal(detail.body.meta.provider, 'GDELT Project');
    const limited = await context.call('/content/refresh', 'POST', { target: 'news', channel: 'hot' });
    assert.equal(limited.status, 429);
    assert.equal(limited.body.error.code, 'CONTENT_REFRESH_RATE_LIMITED');
    assert.equal(requested.length, 1);
  } finally { await context.close(); }
});

test('unreachable GDELT falls back to fresh public Chinese RSS without mock content', async () => {
  const rss = {
    'https://www.36kr.com/feed': `<?xml version="1.0"?><rss><channel><item><title><![CDATA[AI 芯片企业完成新一轮融资]]></title><description><![CDATA[<p>企业宣布完成融资，资金将用于先进制程研发与团队扩充。</p>]]></description><link>https://www.36kr.com/p/100</link><pubDate>Wed, 16 Sep 2026 14:35:10 +0800</pubDate></item></channel></rss>`,
    'https://www.chinanews.com.cn/rss/finance.xml': `<?xml version="1.0"?><rss><channel><item><title>A股市场成交额出现新变化</title><link>https://www.chinanews.com.cn/cj/2026/09-16/100.shtml</link><pubDate>Wed, 16 Sep 2026 14:56:52 +0800</pubDate></item></channel></rss>`
  };
  const fetchImpl = async input => {
    const url = String(input);
    if (url.startsWith('https://api.gdeltproject.org/')) throw new Error('fetch failed');
    if (rss[url]) return new Response(rss[url], { status: 200, headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' } });
    throw new Error(`unexpected URL ${url}`);
  };
  const context = await setup({ newsProvider: 'gdelt', logger: { warn() {}, error() {} } }, fetchImpl);
  try {
    const refresh = await context.call('/content/refresh', 'POST', { target: 'news' });
    assert.equal(refresh.status, 200);
    assert.equal(refresh.body.ok, true);
    const featured = await context.call('/content/news?channel=featured');
    assert.equal(featured.status, 200);
    assert.equal(featured.body.meta.provider, '36氪 / 中新网 RSS');
    assert.equal(featured.body.stories.length, 2);
    assert.equal(featured.body.stories.find(story => story.source === '36氪').summary, '企业宣布完成融资，资金将用于先进制程研发与团队扩充。');
    assert.ok(featured.body.stories.every(story => story.content === ''));
    const market = await context.call('/content/news?channel=market');
    assert.equal(market.body.stories.some(story => story.source === '中新网财经'), true);
    const hot = await context.call('/content/news?channel=hot');
    assert.equal(hot.body.stories.some(story => story.source === '36氪'), true);
  } finally { await context.close(); }
});

test('GDELT rate limits preserve the last successful real cache and HTTP status', async () => {
  let currentTime = Date.parse('2026-09-16T03:00:00.000Z');
  let requests = 0;
  const fetchImpl = async () => {
    requests += 1;
    if (requests === 1) return Response.json({ articles: [
      { url: 'https://finance.example/market-2', title: '证券市场公布最新交易数据', seendate: '20260916T025500Z', domain: 'finance.example', language: 'Chinese' }
    ] });
    return new Response('slow down', { status: 429, headers: { 'Retry-After': '7' } });
  };
  const context = await setup({ newsProvider: 'gdelt', now: () => currentTime, newsTtlMs: 60_000, refreshCooldownMs: 0, gdeltRetryDelayMs: 0 }, fetchImpl);
  try {
    const first = await context.call('/content/refresh', 'POST', { target: 'news' });
    assert.equal(first.status, 200);
    currentTime += 120_000;
    const failed = await context.call('/content/refresh', 'POST', { target: 'news' });
    assert.equal(failed.status, 429);
    assert.equal(failed.body.error.code, 'GDELT_RATE_LIMITED');
    assert.equal(failed.headers.get('retry-after'), '7');
    const stale = await context.call('/content/news?channel=market');
    assert.equal(stale.status, 200);
    assert.equal(stale.body.stories[0].title, '证券市场公布最新交易数据');
    assert.equal(stale.body.meta.stale, true);
    assert.equal(stale.body.meta.warning.code, 'GDELT_RATE_LIMITED');
  } finally { await context.close(); }
});

test('GDELT keeps each last successful channel when a later classification is empty', async () => {
  let sequence = 1;
  const fetchImpl = async () => sequence === 1
    ? Response.json({ articles: [
      { url: 'https://finance.example/market-old', title: '股票市场迎来最新投资机会', seendate: '20260916T030000Z', domain: 'finance.example', language: 'Chinese' },
      { url: 'https://tech.example/hot-old', title: '人工智能公司公布芯片计划', seendate: '20260916T025500Z', domain: 'tech.example', language: 'Chinese' }
    ] })
    : Response.json({ articles: [
      { url: 'https://news.example/briefing', title: '今日财经简报', seendate: '20260916T040000Z', domain: 'news.example', language: 'Chinese' }
    ] });
  const context = await setup({ newsProvider: 'gdelt', refreshCooldownMs: 0 }, fetchImpl);
  try {
    const first = await context.call('/content/refresh', 'POST', { target: 'news' });
    assert.equal(first.status, 200);
    assert.equal(first.body.ok, true);
    sequence = 2;
    const partial = await context.call('/content/refresh', 'POST', { target: 'news' });
    assert.equal(partial.status, 200);
    assert.equal(partial.body.ok, false);
    assert.deepEqual(partial.body.refreshed, ['featured']);
    assert.deepEqual(partial.body.errors.map(item => item.code), ['GDELT_MARKET_EMPTY', 'GDELT_HOT_EMPTY']);

    const featured = await context.call('/content/news?channel=featured');
    assert.equal(featured.body.stories[0].title, '今日财经简报');
    assert.equal(featured.body.meta.stale, false);
    const market = await context.call('/content/news?channel=market');
    assert.equal(market.body.stories[0].title, '股票市场迎来最新投资机会');
    assert.equal(market.body.meta.stale, true);
    assert.equal(market.body.meta.warning.code, 'GDELT_MARKET_EMPTY');
    const hot = await context.call('/content/news?channel=hot');
    assert.equal(hot.body.stories[0].title, '人工智能公司公布芯片计划');
    assert.equal(hot.body.meta.warning.code, 'GDELT_HOT_EMPTY');
  } finally { await context.close(); }
});

test('image downloads receive the validated pinned address and enforce the blob file limit', async () => {
  const pinned = [];
  const fetchImpl = async input => {
    const url = String(input);
    if (url.includes('one.png')) return new Response(png, { status: 200, headers: { 'Content-Type': 'image/png' } });
    if (url.includes('two.png')) return new Response(pngChanged, { status: 200, headers: { 'Content-Type': 'image/png' } });
    throw new Error(`unexpected URL ${url}`);
  };
  const context = await setup({
    mediaMaxFiles: 1,
    lookupHost: async () => [{ address: '93.184.216.34', family: 4 }],
    imageFetchImpl: async (input, options) => {
      pinned.push({ address: options.pinnedAddress, family: options.pinnedFamily });
      return fetchImpl(input);
    }
  }, fetchImpl);
  try {
    const first = await context.app.content.cacheImage('https://rebind.example/one.png');
    assert.match(first, /^\/api\/media\//);
    assert.deepEqual(pinned[0], { address: '93.184.216.34', family: 4 });
    await assert.rejects(() => context.app.content.cacheImage('https://rebind.example/two.png'), /容量上限/);
    assert.equal(context.app.db.prepare('SELECT COUNT(*) count FROM content_media_blobs').get().count, 1);
  } finally { await context.close(); }
});

test('media byte capacity is enforced and executable SVG is rejected', async () => {
  const fetchImpl = async input => {
    const url = String(input);
    if (url.includes('unsafe.svg')) return new Response('<svg><script>alert(1)</script></svg>', { status: 200, headers: { 'Content-Type': 'image/svg+xml' } });
    if (url.includes('one.png')) return new Response(png, { status: 200, headers: { 'Content-Type': 'image/png' } });
    if (url.includes('two.png')) return new Response(pngChanged, { status: 200, headers: { 'Content-Type': 'image/png' } });
    throw new Error(`unexpected URL ${url}`);
  };
  const context = await setup({ mediaMaxFiles: 10, mediaMaxTotalBytes: png.length }, fetchImpl);
  try {
    await assert.rejects(() => context.app.content.cacheImage('https://[::ffff:169.254.169.254]/metadata.png'), /内网/);
    await assert.rejects(() => context.app.content.cacheImage('https://[64:ff9b::a9fe:a9fe]/metadata.png'), /内网/);
    await assert.rejects(() => context.app.content.cacheImage('https://cdn.example/unsafe.svg'), /类型或文件特征无效/);
    await context.app.content.cacheImage('https://cdn.example/one.png');
    await assert.rejects(() => context.app.content.cacheImage('https://cdn.example/two.png'), /容量上限/);
    assert.equal(context.app.db.prepare('SELECT COALESCE(SUM(bytes),0) bytes FROM content_media_blobs').get().bytes, png.length);
  } finally { await context.close(); }
});

test('news article history survives feed replacement and remains bounded', async () => {
  let sequence = 1;
  const article = value => ({ source: { name: 'Archive Wire' }, title: `Story ${value}`, description: `Summary ${value}`, content: `Excerpt ${value}`, url: `https://publisher.example/story-${value}`, urlToImage: null, publishedAt: `2026-09-${String(10 + value).padStart(2, '0')}T01:00:00Z` });
  const fetchImpl = async input => {
    if (String(input).includes('/everything?')) return Response.json({ status: 'ok', articles: [article(sequence)] });
    throw new Error(`unexpected URL ${input}`);
  };
  const context = await setup({ newsProvider: 'newsapi', newsApiKey: 'news-token', refreshCooldownMs: 0, newsMaxArticles: 2, newsRetentionMs: 60 * 24 * 60 * 60_000 }, fetchImpl);
  try {
    await context.app.content.refresh({ target: 'news', channel: 'market', scheduled: true });
    const firstFeed = await context.call('/content/news?channel=market');
    const firstId = firstFeed.body.stories[0].id;
    sequence = 2;
    await context.app.content.refresh({ target: 'news', channel: 'market', scheduled: true });
    const archived = await context.call('/content/news/' + encodeURIComponent(firstId));
    assert.equal(archived.status, 200);
    assert.equal(archived.body.story.title, 'Story 1');
    sequence = 3;
    await context.app.content.refresh({ target: 'news', channel: 'market', scheduled: true });
    assert.equal(context.app.db.prepare('SELECT COUNT(*) count FROM news_articles').get().count, 2);
    const pruned = await context.call('/content/news/' + encodeURIComponent(firstId));
    assert.equal(pruned.status, 404);
  } finally { await context.close(); }
});

test('content-addressed media keeps old referenced URLs readable and collects them after references move', async () => {
  let currentTime = Date.parse('2026-09-16T02:00:00.000Z');
  let currentImage = png;
  const fetchImpl = async input => {
    const url = String(input);
    if (url === 'https://cdn.example/shared.png') return new Response(currentImage, { status: 200, headers: { 'Content-Type': 'image/png' } });
    if (url.includes('/everything?')) return Response.json({ status: 'ok', articles: [{ source: { name: 'Shared Image Wire' }, title: 'Shared article', description: 'Summary', content: 'Excerpt', url: 'https://publisher.example/shared', urlToImage: 'https://cdn.example/shared.png', publishedAt: '2026-09-16T01:00:00Z' }] });
    throw new Error(`unexpected URL ${url}`);
  };
  const context = await setup({ newsProvider: 'newsapi', newsApiKey: 'news-token', now: () => currentTime, mediaTtlMs: 1, refreshCooldownMs: 0, mediaMaxFiles: 10 }, fetchImpl);
  try {
    await context.app.content.refresh({ target: 'news', channel: 'market', scheduled: true });
    const market = await context.call('/content/news?channel=market');
    const oldPath = market.body.stories[0].imageUrl;
    currentImage = pngChanged;
    currentTime += 2;
    await context.app.content.refresh({ target: 'news', channel: 'featured', scheduled: true });
    const featured = await context.call('/content/news?channel=featured');
    const newPath = featured.body.stories[0].imageUrl;
    assert.notEqual(newPath, oldPath);
    assert.equal((await fetch(new URL(oldPath, context.base))).status, 200);
    assert.equal(context.app.db.prepare('SELECT COUNT(*) count FROM content_media_blobs').get().count, 2);

    currentTime += 2;
    await context.app.content.refresh({ target: 'news', channel: 'market', scheduled: true });
    assert.equal((await fetch(new URL(oldPath, context.base))).status, 404);
    assert.equal(context.app.db.prepare('SELECT COUNT(*) count FROM content_media_blobs').get().count, 1);
  } finally { await context.close(); }
});
