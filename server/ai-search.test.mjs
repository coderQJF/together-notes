import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAiSearchService } from './ai-search.mjs';

const FIXED_NOW = Date.parse('2026-09-16T04:00:00.000Z');
const MODEL = 'search-model-test';
const BASE_URL = 'https://models.example/v1';

function responsesOutput(text, annotations = []) {
  return Response.json({
    id: 'resp_test',
    model: MODEL,
    output: [{
      type: 'message',
      role: 'assistant',
      content: [{ type: 'output_text', text, annotations }],
    }],
  });
}

function structuredOutput(answer, sourceIds) {
  return responsesOutput(JSON.stringify({ answer, source_ids: sourceIds }));
}

function service(fetchImpl, overrides = {}) {
  return createAiSearchService({
    apiKey: 'server-only-key',
    apiType: 'responses',
    fetchImpl,
    now: () => FIXED_NOW,
    model: MODEL,
    webSearchEnabled: true,
    baseUrl: BASE_URL,
    rateLimitPerMinute: 20,
    ...overrides,
  });
}

function chatOutput(content, searchResults = []) {
  return Response.json({
    id: 'chatcmpl_test',
    model: 'Deepseek-v4-flash',
    choices: [{ message: { role: 'assistant', content, ...(searchResults.length ? { search_results: searchResults } : {}) } }],
  });
}

function chatService(fetchImpl, overrides = {}) {
  return createAiSearchService({
    apiKey: 'wechat-coding-plan-token',
    apiType: 'chat_completions',
    baseUrl: 'https://chatapi.weixin.qq.com/openai/v1',
    model: 'Deepseek-v4-flash',
    fetchImpl,
    now: () => FIXED_NOW,
    webSearchEnabled: true,
    rateLimitPerMinute: 20,
    ...overrides,
  });
}

test('local matches use Responses JSON schema without enabling web search', async () => {
  let requestBody;
  const search = service(async (input, init) => {
    assert.equal(String(input), `${BASE_URL}/responses`);
    assert.equal(init.headers.Authorization, 'Bearer server-only-key');
    requestBody = JSON.parse(init.body);
    return structuredOutput('团建安排在周五晚上。', ['note-team-event']);
  });

  assert.equal(search.status().configured, true);
  const result = await search.search({
    query: '这周团建什么时候？',
    scope: 'all',
    userId: 'user-a',
    documents: [{
      id: 'note-team-event',
      type: 'note',
      title: '这周团建',
      content: '周五晚上七点在公司门口集合。',
      updatedAt: '2026-09-15T10:00:00.000Z',
      route: '/pages/detail/detail?id=note-team-event',
    }],
  });

  assert.equal(requestBody.model, MODEL);
  assert.equal(requestBody.text?.format?.type, 'json_schema');
  assert.equal(requestBody.text?.format?.strict, true);
  assert.ok(requestBody.text?.format?.schema);
  assert.equal((requestBody.tools || []).some(tool => tool.type === 'web_search'), false);
  assert.equal(result.mode, 'local');
  assert.match(result.answer, /周五晚上/);
  assert.deepEqual(result.citations.map(item => item.sourceId), ['note-team-event']);
  assert.equal(result.citations[0].route, '/pages/detail/detail?id=note-team-event');
  assert.equal(result.model, MODEL);
  assert.equal(result.generatedAt, new Date(FIXED_NOW).toISOString());
});

test('insufficient local context enables web search and converts url citations to numbered references', async () => {
  const citedText = '明天是国际臭氧层保护日。';
  let requestBody;
  const search = service(async (_input, init) => {
    requestBody = JSON.parse(init.body);
    return responsesOutput(citedText, [{
      type: 'url_citation',
      start_index: 0,
      end_index: citedText.length,
      title: '联合国国际日历',
      url: 'https://www.un.org/example-calendar',
    }]);
  });

  const result = await search.search({
    query: '明天是什么特别的日子？',
    scope: 'all',
    userId: 'user-a',
    documents: [{
      id: 'note-groceries',
      type: 'note',
      title: '购物清单',
      content: '牛奶和面包',
      updatedAt: '2026-09-15T10:00:00.000Z',
      route: '/pages/detail/detail?id=note-groceries',
    }],
  });

  assert.equal(requestBody.tools.some(tool => tool.type === 'web_search'), true);
  assert.equal(result.mode, 'web');
  assert.match(result.answer, /\[1\]/);
  assert.deepEqual(result.citations, [{
    index: 1,
    type: 'web',
    title: '联合国国际日历',
    url: 'https://www.un.org/example-calendar',
  }]);
});

test('a reminder scheduled tomorrow is a local match even without keyword overlap', async () => {
  let requestBody;
  const search = service(async (_input, init) => {
    requestBody = JSON.parse(init.body);
    return structuredOutput('明天下午四点有体检提醒。', ['reminder-checkup']);
  });

  const result = await search.search({
    query: '明天有什么安排？',
    scope: 'all',
    userId: 'user-a',
    documents: [{
      id: 'reminder-checkup',
      type: 'reminder',
      title: '体检',
      content: '带身份证和体检单。',
      nextAt: '2026-09-17T08:00:00.000Z',
      updatedAt: '2026-09-14T10:00:00.000Z',
      route: '/pages/detail/detail?id=reminder-checkup',
    }],
  });

  assert.equal((requestBody.tools || []).some(tool => tool.type === 'web_search'), false);
  assert.equal(result.mode, 'local');
  assert.deepEqual(result.citations.map(item => item.sourceId), ['reminder-checkup']);
});

test('an unconfigured service reports status and rejects searches explicitly', async () => {
  const search = service(async () => {
    assert.fail('an unconfigured service must not call the upstream API');
  }, { apiKey: '' });

  assert.equal(search.status().configured, false);
  await assert.rejects(
    search.search({ query: '明天有什么安排？', scope: 'all', userId: 'user-a', documents: [] }),
    error => error?.status === 503 && error?.code === 'AI_UNCONFIGURED',
  );
});

test('model supplied local source ids are restricted to the caller-provided documents', async () => {
  const search = service(async () => structuredOutput('只引用可见的小记。', ['note-visible', 'note-not-visible']));
  const result = await search.search({
    query: '纪念日晚餐订在哪里？',
    scope: 'all',
    userId: 'user-a',
    documents: [{
      id: 'note-visible',
      type: 'note',
      title: '纪念日晚餐',
      content: '订在江边餐厅。',
      updatedAt: '2026-09-15T10:00:00.000Z',
      route: '/pages/detail/detail?id=note-visible',
    }],
  });

  assert.deepEqual(result.citations.map(item => item.sourceId), ['note-visible']);
  assert.equal(JSON.stringify(result).includes('note-not-visible'), false);
});

test('web fallback never copies local note content into the web-search request', async () => {
  const bodies = [];
  const citedText = '公开资料给出的日期答案。';
  const search = service(async (_input, init) => {
    const body = JSON.parse(init.body);
    bodies.push(body);
    if (bodies.length === 1) return structuredOutput('', []);
    return responsesOutput(citedText, [{ type: 'url_citation', start_index: 0, end_index: citedText.length, title: '公开日历', url: 'https://example.com/calendar' }]);
  });
  const result = await search.search({
    query: '纪念日是哪一天？',
    scope: 'all',
    userId: 'user-a',
    documents: [{ id: 'private-note', type: 'note', title: '纪念日', content: '绝不能进入网页搜索的私人正文', updatedAt: '2026-09-15T10:00:00.000Z', route: '/pages/detail/detail?id=private-note' }],
  });
  assert.equal(bodies.length, 2);
  assert.equal((bodies[0].tools || []).length, 0);
  assert.equal(bodies[1].tools[0].type, 'web_search');
  assert.equal(JSON.stringify(bodies[1]).includes('私人正文'), false);
  assert.equal(result.mode, 'web');
});

test('a web answer without clickable citation annotations is rejected', async () => {
  const search = service(async () => responsesOutput('没有引用的答案'));
  await assert.rejects(
    search.search({ query: '今天有什么公开新闻？', scope: 'all', userId: 'user-a', documents: [] }),
    error => error?.status === 502 && error?.code === 'AI_CITATIONS_MISSING',
  );
});

test('every numbered web reference keeps a matching clickable citation', async () => {
  const parts = Array.from({ length: 10 }, (_, index) => `来源${index + 1}`);
  const text = parts.join('；');
  let cursor = 0;
  const annotations = parts.map((part, index) => {
    const start = cursor;
    cursor += part.length + (index < parts.length - 1 ? 1 : 0);
    return { type: 'url_citation', start_index: start, end_index: start + part.length, title: part, url: `https://example.com/source-${index + 1}` };
  });
  const search = service(async () => responsesOutput(text, annotations));
  const result = await search.search({ query: '列出十个公开来源', scope: 'all', userId: 'user-a', documents: [] });
  assert.equal(result.citations.length, 10);
  assert.match(result.answer, /\[10\]/);
  assert.equal(result.citations[9].index, 10);
});

test('compatible Chat Completions uses the configured endpoint for local answers', async () => {
  let requestBody;
  const search = chatService(async (input, init) => {
    assert.equal(String(input), 'https://chatapi.weixin.qq.com/openai/v1/chat/completions');
    assert.equal(init.headers.Authorization, 'Bearer wechat-coding-plan-token');
    requestBody = JSON.parse(init.body);
    return chatOutput('</think>\n{"answer":"周五晚上七点集合。","source_ids":["note-team-event"]}');
  });
  const result = await search.search({
    query: '这周团建什么时候？', scope: 'all', userId: 'user-a',
    documents: [{ id: 'note-team-event', type: 'note', title: '这周团建', content: '周五晚上七点集合。', updatedAt: '2026-09-15T10:00:00.000Z' }],
  });
  assert.equal(search.status().apiType, 'chat_completions');
  assert.equal(search.status().provider, 'OpenAI-compatible Chat Completions');
  assert.equal(requestBody.model, 'Deepseek-v4-flash');
  assert.equal(requestBody.messages[0].role, 'system');
  assert.equal(requestBody.web_search_options, undefined);
  assert.equal(result.mode, 'local');
  assert.match(result.answer, /周五晚上七点/);
});

test('compatible Chat Completions web fallback requests search and returns clickable sources', async () => {
  let requestBody;
  const search = chatService(async (_input, init) => {
    requestBody = JSON.parse(init.body);
    return chatOutput('明天是国际臭氧层保护日。[1]', [{ index: 1, name: '联合国国际日历', url: 'https://www.un.org/example-calendar' }]);
  });
  const result = await search.search({ query: '明天是什么特别的日子？', scope: 'all', userId: 'user-a', documents: [] });
  assert.equal(requestBody.web_search_options.enable, true);
  assert.equal(requestBody.web_search_options.user_location.timezone, 'Asia/Shanghai');
  assert.equal(JSON.stringify(requestBody).includes('私人笔记'), false);
  assert.equal(result.mode, 'web');
  assert.deepEqual(result.citations, [{ index: 1, type: 'web', title: '联合国国际日历', url: 'https://www.un.org/example-calendar' }]);
});

test('compatible Chat Completions rejects web text without provider search_results', async () => {
  const search = chatService(async () => chatOutput('这是模型已有知识，不是联网结果。'));
  await assert.rejects(
    search.search({ query: '明天是什么日子？', scope: 'all', userId: 'user-a', documents: [] }),
    error => error?.status === 502 && error?.code === 'AI_CITATIONS_MISSING',
  );
});
