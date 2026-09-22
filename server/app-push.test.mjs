import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAppPushService } from './app-push.mjs';
import { createApp } from './index.mjs';

test('app push webhook stays disabled until both endpoint and token are configured', async () => {
  assert.equal(createAppPushService().status().configured, false);
  await assert.rejects(() => createAppPushService().send({ clientIds: ['cid'] }), /APP_PUSH_UNCONFIGURED/);
});

test('app push webhook sends a bounded authenticated payload', async () => {
  let captured;
  const service = createAppPushService({
    webhookUrl: 'https://push.example/send',
    token: 'push-secret',
    fetchImpl: async (url, options) => {
      captured = { url, options };
      return Response.json({ ok: true });
    },
  });
  await service.send({ clientIds: ['cid-a', 'cid-a', 'cid-b'], title: '提醒', content: '记得出门', payload: { route: '/pages/detail/detail?id=1' } });
  assert.equal(captured.url, 'https://push.example/send');
  assert.equal(captured.options.headers.Authorization, 'Bearer push-secret');
  assert.deepEqual(JSON.parse(captured.options.body), { clientIds: ['cid-a', 'cid-b'], title: '提醒', content: '记得出门', payload: { route: '/pages/detail/detail?id=1' }, forceNotification: true });
});

test('due reminders are delivered to registered app devices once', async () => {
  const pushes = [];
  const fetchImpl = async (url, options) => {
    if (url === 'https://push.example/send') { pushes.push(JSON.parse(options.body)); return Response.json({ ok: true }); }
    throw new Error(`unexpected URL: ${url}`);
  };
  const app = createApp({ dbPath: ':memory:', testAuth: true, fetchImpl, appPushConfig: { webhookUrl: 'https://push.example/send', token: 'push-secret' } });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${app.server.address().port}/api`;
  const call = async (path, method = 'GET', body, token) => fetch(base + path, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token || ''}` }, body: body ? JSON.stringify(body) : undefined }).then(response => response.json());
  try {
    const auth = await call('/auth/test', 'POST', { name: '我' });
    await call('/push/devices', 'POST', { clientId: 'android-client-001', platform: 'android' }, auth.token);
    const due = new Date(Date.now() + 1000).toISOString();
    const reminder = await call('/items', 'POST', { kind: 'reminder', title: '带伞', content: '下午有雨', links: [], scope: 'mine', repeat: 'none', recipient: 'me', advance: 0, nextAt: due }, auth.token);
    app.tick(Date.now() + 2000);await app.flushAppPush();app.tick(Date.now() + 2000);await app.flushAppPush();
    assert.equal(pushes.length, 1);assert.deepEqual(pushes[0].clientIds, ['android-client-001']);assert.equal(pushes[0].payload.itemId, reminder.id);
  } finally { await new Promise(resolve => app.server.close(resolve));app.db.close(); }
});
