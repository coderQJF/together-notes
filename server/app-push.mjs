export function createAppPushService({ webhookUrl = '', token = '', fetchImpl = globalThis.fetch } = {}) {
  const endpoint = String(webhookUrl || '').trim();
  const secret = String(token || '').trim();
  const configured = /^https:\/\//i.test(endpoint) && Boolean(secret);

  return {
    status() {
      return { configured };
    },
    async send({ clientIds, title, content, payload }) {
      if (!configured) throw new Error('APP_PUSH_UNCONFIGURED');
      const recipients = [...new Set((clientIds || []).map(value => String(value || '').trim()).filter(Boolean))];
      if (!recipients.length) return { skipped: true };
      const response = await fetchImpl(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secret}` },
        body: JSON.stringify({
          clientIds: recipients,
          title: String(title || '').slice(0, 80),
          content: String(content || title || '').slice(0, 180),
          payload: payload && typeof payload === 'object' ? payload : {},
          forceNotification: true,
        }),
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) throw new Error(`APP_PUSH_HTTP_${response.status}`);
      const result = await response.json().catch(() => ({ ok: true }));
      if (result?.ok === false) throw new Error(String(result.code || 'APP_PUSH_REJECTED'));
      return result;
    },
  };
}
