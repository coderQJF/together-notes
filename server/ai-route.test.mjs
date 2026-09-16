import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from './index.mjs';

test('AI search only sends the authenticated user visible notes to the model', async () => {
  const upstreamBodies = [];
  const fetchImpl = async (_url, init) => {
    const body = JSON.parse(init.body);
    upstreamBodies.push(body);
    const local = JSON.parse(body.input[1].content[0].text);
    return Response.json({
      model: 'search-model-test',
      output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify({ answer: '找到一条有权限查看的小记。', source_ids: [local.documents[0].id] }), annotations: [] }] }],
    });
  };
  const app = createApp({ dbPath: ':memory:', testAuth: true, fetchImpl, aiConfig: { apiKey: 'server-only-key', apiType: 'responses', model: 'search-model-test' } });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${app.server.address().port}/api`;
  const call = async (path, method = 'GET', data, token) => {
    const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token || ''}` }, body: data ? JSON.stringify(data) : undefined });
    return { status: response.status, body: await response.json() };
  };
  try {
    const a = (await call('/auth/test', 'POST', { name: '我' })).body;
    const b = (await call('/auth/test', 'POST', { name: '小金子' })).body;
    const stranger = (await call('/auth/test', 'POST', { name: '访客' })).body;
    await call('/items', 'POST', { kind: 'note', title: '权限词 A 私人', content: '不能发给伴侣', links: [], scope: 'mine' }, a.token);
    const invite = (await call('/invite', 'POST', {}, a.token)).body;
    await call('/invite/accept', 'POST', { code: invite.code }, b.token);
    await call('/items', 'POST', { kind: 'note', title: '权限词 双方共享', content: '双方都能搜索', links: [], scope: 'shared' }, a.token);
    await call('/items', 'POST', { kind: 'note', title: '权限词 B 私人', content: '不能发给伴侣', links: [], scope: 'mine' }, b.token);

    assert.equal((await call('/ai/search', 'POST', { query: '权限词', scope: 'notes' })).status, 401);
    assert.equal((await call('/ai/search', 'POST', { query: '权限词', scope: 'notes' }, a.token)).status, 200);
    assert.equal((await call('/ai/search', 'POST', { query: '权限词', scope: 'notes' }, b.token)).status, 200);

    const aDocs = JSON.parse(upstreamBodies[0].input[1].content[0].text).documents.map(item => item.title).sort();
    const bDocs = JSON.parse(upstreamBodies[1].input[1].content[0].text).documents.map(item => item.title).sort();
    assert.deepEqual(aDocs, ['权限词 A 私人', '权限词 双方共享']);
    assert.deepEqual(bDocs, ['权限词 B 私人', '权限词 双方共享']);
    assert.equal(JSON.stringify(upstreamBodies).includes('不能发给伴侣'), true);
    assert.equal(JSON.stringify(upstreamBodies[0]).includes('权限词 B 私人'), false);
    assert.equal(JSON.stringify(upstreamBodies[1]).includes('权限词 A 私人'), false);
    assert.equal((await call('/ai/status', 'GET', undefined, stranger.token)).body.configured, true);
  } finally {
    await new Promise(resolve => app.server.close(resolve));
    app.db.close();
  }
});
