import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from './index.mjs';

test('health reports whether WeChat reminders are configured without exposing credentials', async () => {
  const app = createApp({ dbPath: ':memory:', wxAppId: 'wx-test', wxSecret: 'secret', wxReminderTemplateId: 'template-reminder' });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  try {
    const { port } = app.server.address();
    const result = await fetch(`http://127.0.0.1:${port}/api/health`).then(response => response.json());
    assert.deepEqual(result, { ok: true, wechatRemindersConfigured: true });
  } finally {
    await new Promise(resolve => app.server.close(resolve));
    app.db.close();
  }
});

test('an accepted reminder subscription sends the configured WeChat template and keeps the in-app notification', async () => {
  const requests = [];
  const fetchImpl = async (input, init = {}) => {
    const url = String(input);
    requests.push({ url, init });
    if (url.includes('/sns/jscode2session')) return Response.json({ openid: 'openid-user-a', session_key: 'test' });
    if (url.includes('/cgi-bin/token')) return Response.json({ access_token: 'access-token', expires_in: 7200 });
    if (url.includes('/cgi-bin/message/subscribe/send')) return Response.json({ errcode: 0, errmsg: 'ok', msgid: 'message-1' });
    throw new Error(`unexpected request: ${url}`);
  };
  const app = createApp({ dbPath: ':memory:', wxAppId: 'wx-test-app', wxSecret: 'wx-test-secret', wxReminderTemplateId: 'template-reminder', fetchImpl });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${app.server.address().port}/api`;
  const call = async (path, method = 'GET', data, token = '') => {
    const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: data ? JSON.stringify(data) : undefined });
    return { status: response.status, ...await response.json() };
  };
  try {
    const auth = await call('/auth/wechat', 'POST', { code: 'login-code' });
    assert.equal((await call('/wechat/subscription/status', 'GET', undefined, auth.token)).templateId, 'template-reminder');
    const due = new Date(Date.now() + 1000).toISOString();
    const reminder = await call('/items', 'POST', {
      kind: 'reminder', title: '开市 破土 交易以及更长文字', content: '记得提前准备资料并确认安排', links: [], scope: 'mine',
      repeat: 'none', recipient: 'me', advance: 0, nextAt: due, wechatSubscribe: true,
    }, auth.token);
    assert.equal(reminder.wechatSubscribed, true);
    assert.equal(app.tick(Date.now() + 2000), 1);
    await app.flushWechat();
    const send = requests.find(request => request.url.includes('/message/subscribe/send'));
    assert.ok(send);
    const body = JSON.parse(send.init.body);
    assert.equal(body.touser, 'openid-user-a');
    assert.equal(body.template_id, 'template-reminder');
    assert.equal(body.data.thing1.value, '开市 破土 交易以及更长文字');
    assert.match(body.data.time2.value, /^\d{4}年\d{2}月\d{2}日 \d{2}:\d{2}$/);
    assert.equal(body.data.thing6.value, '记得提前准备资料并确认安排');
    assert.equal(body.page, `pages/detail/detail?id=${reminder.id}`);
    assert.equal(app.db.prepare('SELECT count(*) count FROM notifications').get().count, 1);
    assert.equal(app.db.prepare('SELECT status FROM wechat_reminder_subscriptions').get().status, 'sent');
  } finally {
    await new Promise(resolve => app.server.close(resolve));
    app.db.close();
  }
});

test('a shared reminder consumes each recipient own unused WeChat authorization regardless of who created it', async () => {
  const sends = [];
  const fetchImpl = async (input, init = {}) => {
    const url = String(input);
    if (url.includes('/sns/jscode2session')) {
      const code = new URL(url).searchParams.get('js_code');
      return Response.json({ openid: code === 'login-a' ? 'openid-user-a' : 'openid-user-b', session_key: 'test' });
    }
    if (url.includes('/cgi-bin/token')) return Response.json({ access_token: 'access-token', expires_in: 7200 });
    if (url.includes('/cgi-bin/message/subscribe/send')) {
      sends.push(JSON.parse(init.body));
      return Response.json({ errcode: 0, errmsg: 'ok', msgid: `message-${sends.length}` });
    }
    throw new Error(`unexpected request: ${url}`);
  };
  const app = createApp({ dbPath: ':memory:', wxAppId: 'wx-test-app', wxSecret: 'wx-test-secret', wxReminderTemplateId: 'template-reminder', fetchImpl });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${app.server.address().port}/api`;
  const call = async (path, method = 'GET', data, token = '') => {
    const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: data ? JSON.stringify(data) : undefined });
    return { status: response.status, ...await response.json() };
  };
  const reminder = (title, nextAt, extra = {}) => ({ kind: 'reminder', title, content: '', links: [], scope: 'mine', repeat: 'none', recipient: 'me', advance: 0, nextAt, ...extra });
  try {
    const a = await call('/auth/wechat', 'POST', { code: 'login-a' });
    const b = await call('/auth/wechat', 'POST', { code: 'login-b' });
    const invitation = await call('/invite', 'POST', {}, a.token);
    await call('/invite/accept', 'POST', { code: invitation.code }, b.token);

    const later = new Date(Date.now() + 60_000).toISOString();
    assert.equal((await call('/items', 'POST', reminder('A 的稍后提醒', later, { wechatSubscribe: true }), a.token)).wechatSubscribed, true);
    assert.equal((await call('/items', 'POST', reminder('B 的稍后提醒', later, { wechatSubscribe: true }), b.token)).wechatSubscribed, true);

    const sharedDue = new Date(Date.now() + 1000).toISOString();
    const shared = await call('/items', 'POST', reminder('共同提醒', sharedDue, { scope: 'shared', recipient: 'both' }), a.token);
    assert.equal(app.tick(Date.now() + 2000), 2);
    await app.flushWechat();
    assert.deepEqual(sends.map(send => send.touser).sort(), ['openid-user-a', 'openid-user-b']);
    assert.ok(sends.every(send => send.page === `pages/detail/detail?id=${shared.id}`));
    assert.equal(app.db.prepare('SELECT count(*) count FROM notifications WHERE item=?').get(shared.id).count, 2);
    assert.equal(app.db.prepare("SELECT count(*) count FROM wechat_reminder_subscriptions WHERE item=? AND status='sent'").get(shared.id).count, 2);

    const aOnlyAuthorization = new Date(Date.now() + 120_000).toISOString();
    await call('/items', 'POST', reminder('A 再授权一次', aOnlyAuthorization, { wechatSubscribe: true }), a.token);
    const secondSharedDue = new Date(Date.now() + 3000).toISOString();
    const secondShared = await call('/items', 'POST', reminder('只有一方有可用授权', secondSharedDue, { scope: 'shared', recipient: 'both' }), b.token);
    assert.equal(app.tick(Date.now() + 5000), 1);
    await app.flushWechat();
    assert.equal(sends.length, 3);
    assert.equal(sends[2].touser, 'openid-user-a');
    assert.equal(sends[2].page, `pages/detail/detail?id=${secondShared.id}`);
    assert.equal(app.db.prepare('SELECT count(*) count FROM notifications WHERE item=?').get(secondShared.id).count, 2);
  } finally {
    await new Promise(resolve => app.server.close(resolve));
    app.db.close();
  }
});

test('a reminder without explicit subscription authorization never calls the WeChat send endpoint', async () => {
  let sends = 0;
  const fetchImpl = async input => {
    const url = String(input);
    if (url.includes('/sns/jscode2session')) return Response.json({ openid: 'openid-user-b' });
    if (url.includes('/message/subscribe/send')) sends += 1;
    return Response.json({ errcode: 0 });
  };
  const app = createApp({ dbPath: ':memory:', wxAppId: 'wx-test-app', wxSecret: 'wx-test-secret', wxReminderTemplateId: 'template-reminder', fetchImpl });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${app.server.address().port}/api`;
  try {
    const auth = await fetch(base + '/auth/wechat', { method: 'POST', body: JSON.stringify({ code: 'login-code' }) }).then(response => response.json());
    const due = new Date(Date.now() + 1000).toISOString();
    await fetch(base + '/items', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.token}` }, body: JSON.stringify({ kind: 'reminder', title: '仅站内提醒', content: '', links: [], scope: 'mine', repeat: 'none', recipient: 'me', advance: 0, nextAt: due }) });
    app.tick(Date.now() + 2000);
    await app.flushWechat();
    assert.equal(sends, 0);
    assert.equal(app.db.prepare('SELECT count(*) count FROM notifications').get().count, 1);
  } finally {
    await new Promise(resolve => app.server.close(resolve));
    app.db.close();
  }
});

test('a rejected WeChat delivery records the failure without removing the in-app notification', async () => {
  const fetchImpl = async input => {
    const url = String(input);
    if (url.includes('/sns/jscode2session')) return Response.json({ openid: 'openid-user-c' });
    if (url.includes('/cgi-bin/token')) return Response.json({ access_token: 'access-token', expires_in: 7200 });
    if (url.includes('/cgi-bin/message/subscribe/send')) return Response.json({ errcode: 43101, errmsg: 'user refuse to accept the msg' });
    throw new Error(`unexpected request: ${url}`);
  };
  const app = createApp({ dbPath: ':memory:', wxAppId: 'wx-test-app', wxSecret: 'wx-test-secret', wxReminderTemplateId: 'template-reminder', fetchImpl });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${app.server.address().port}/api`;
  try {
    const auth = await fetch(base + '/auth/wechat', { method: 'POST', body: JSON.stringify({ code: 'login-code' }) }).then(response => response.json());
    const due = new Date(Date.now() + 1000).toISOString();
    await fetch(base + '/items', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.token}` }, body: JSON.stringify({ kind: 'reminder', title: '发送失败测试', content: '', links: [], scope: 'mine', repeat: 'none', recipient: 'me', advance: 0, nextAt: due, wechatSubscribe: true }) });
    app.tick(Date.now() + 2000);
    await app.flushWechat();
    assert.equal(app.db.prepare('SELECT count(*) count FROM notifications').get().count, 1);
    const subscription = app.db.prepare('SELECT status,error FROM wechat_reminder_subscriptions').get();
    assert.equal(subscription.status, 'failed');
    assert.match(subscription.error, /43101/);
  } finally {
    await new Promise(resolve => app.server.close(resolve));
    app.db.close();
  }
});
