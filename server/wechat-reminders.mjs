const TOKEN_URL = 'https://api.weixin.qq.com/cgi-bin/token';
const SEND_URL = 'https://api.weixin.qq.com/cgi-bin/message/subscribe/send';

function clipped(value, length = 20) {
  return Array.from(String(value || '').replace(/[\r\n\t]+/g, ' ').trim()).slice(0, length).join('');
}

function formatReminderTime(value, timeZone) {
  const parts = new Intl.DateTimeFormat('zh-CN', {
    timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date(value)).reduce((result, part) => ({ ...result, [part.type]: part.value }), {});
  return `${parts.year}年${parts.month}月${parts.day}日 ${parts.hour}:${parts.minute}`;
}

export function createWechatReminderService({ appId = '', secret = '', templateId = '', fetchImpl = globalThis.fetch, timeZone = 'Asia/Shanghai', now = Date.now } = {}) {
  appId = String(appId).trim();
  secret = String(secret).trim();
  templateId = String(templateId).trim();
  let cachedToken = '';
  let tokenExpiresAt = 0;
  let tokenRequest;
  const configured = Boolean(appId && secret && templateId);
  const status = () => ({ configured, templateId: configured ? templateId : null });

  async function accessToken(force = false) {
    if (!force && cachedToken && tokenExpiresAt > Number(now()) + 60_000) return cachedToken;
    if (!force && tokenRequest) return tokenRequest;
    tokenRequest = (async () => {
      const query = new URLSearchParams({ grant_type: 'client_credential', appid: appId, secret });
      let response;
      try { response = await fetchImpl(`${TOKEN_URL}?${query}`, { signal: AbortSignal.timeout(10_000) }); }
      catch { throw new Error('WECHAT_TOKEN_UNREACHABLE'); }
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.access_token) throw new Error(`WECHAT_TOKEN_REJECTED:${payload?.errcode || response.status}`);
      cachedToken = String(payload.access_token);
      tokenExpiresAt = Number(now()) + Math.max(300, Number(payload.expires_in) || 7200) * 1000;
      return cachedToken;
    })();
    try { return await tokenRequest; } finally { tokenRequest = undefined; }
  }

  async function callSend(token, payload) {
    let response;
    try {
      response = await fetchImpl(`${SEND_URL}?access_token=${encodeURIComponent(token)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: AbortSignal.timeout(10_000),
      });
    } catch { throw new Error('WECHAT_SEND_UNREACHABLE'); }
    return { response, body: await response.json().catch(() => null) };
  }

  async function send({ openid, title, due, note, itemId }) {
    if (!configured) throw new Error('WECHAT_REMINDER_UNCONFIGURED');
    if (!openid) throw new Error('WECHAT_OPENID_MISSING');
    const payload = {
      touser: openid,
      template_id: templateId,
      page: `pages/detail/detail?id=${encodeURIComponent(itemId)}`,
      lang: 'zh_CN',
      data: {
        thing1: { value: clipped(title) || '小记提醒' },
        time2: { value: formatReminderTime(due, timeZone) },
        thing6: { value: clipped(note) || '请进入小记查看详情' },
      },
    };
    let token = await accessToken();
    let result = await callSend(token, payload);
    if ([40001, 40014, 42001].includes(Number(result.body?.errcode))) {
      cachedToken = '';
      token = await accessToken(true);
      result = await callSend(token, payload);
    }
    if (!result.response.ok || Number(result.body?.errcode) !== 0) throw new Error(`WECHAT_SEND_REJECTED:${result.body?.errcode || result.response.status}`);
    return { ok: true, msgid: result.body?.msgid || null };
  }

  return { status, send };
}
