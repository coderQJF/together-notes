import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from './index.mjs';

test('local search returns only the authenticated user visible notes without a model call', async () => {
  const fetchImpl = async () => assert.fail('local search must not call the model service');
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
    const aSearch = await call('/ai/search', 'POST', { query: '权限词', scope: 'notes' }, a.token);
    const bSearch = await call('/ai/search', 'POST', { query: '权限词', scope: 'notes' }, b.token);
    assert.equal(aSearch.status, 200);
    assert.equal(bSearch.status, 200);

    const aDocs = aSearch.body.citations.map(item => item.title).sort();
    const bDocs = bSearch.body.citations.map(item => item.title).sort();
    assert.deepEqual(aDocs, ['权限词 A 私人', '权限词 双方共享']);
    assert.deepEqual(bDocs, ['权限词 B 私人', '权限词 双方共享']);
    assert.equal(JSON.stringify(aSearch.body).includes('权限词 B 私人'), false);
    assert.equal(JSON.stringify(bSearch.body).includes('权限词 A 私人'), false);
    assert.equal((await call('/ai/status', 'GET', undefined, stranger.token)).body.configured, true);
  } finally {
    await new Promise(resolve => app.server.close(resolve));
    app.db.close();
  }
});
