import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from './index.mjs';

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
