import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp, MAX_NOVEL_CONTENT_CHARACTERS } from './index.mjs';

test('novel import accepts 10M Chinese characters (> old byte and character limits) and preserves EPUB text', async () => {
  const app = createApp({ dbPath: ':memory:', testAuth: true, opsAdminToken: 'novel-test-secret' });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${app.server.address().port}/api`;
  const upload = (content, token = 'novel-test-secret', audience = 'all_vip') => fetch(`${base}/operations/novels`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'EPUB 大书边界测试', filename: 'test.epub', content, audience }),
  });
  try {
    assert.equal(MAX_NOVEL_CONTENT_CHARACTERS, 10_000_000);
    assert.equal((await upload('未授权', 'wrong')).status, 401);
    assert.equal((await upload('正文', 'novel-test-secret', 'selected')).status, 400);
    const content = '章'.repeat(MAX_NOVEL_CONTENT_CHARACTERS);
    const response = await upload(content);
    assert.equal(response.status, 201);
    const novel = await response.json();
    assert.equal(novel.character_count, MAX_NOVEL_CONTENT_CHARACTERS);
    assert.equal(novel.filename, 'test.epub');
    assert.equal(app.db.prepare('SELECT length(content) AS n FROM novels WHERE id=?').get(novel.id).n, MAX_NOVEL_CONTENT_CHARACTERS);
    const chapters = app.db.prepare('SELECT content FROM novel_chapters WHERE novel=? ORDER BY chapter_index').all(novel.id);
    assert.equal(chapters.map(chapter => chapter.content).join(''), content);
    const rejected = await upload(content + '多');
    assert.equal(rejected.status, 413);
    assert.equal((await rejected.json()).message, '单本内容不能超过 1000 万字');
    assert.equal(app.db.prepare('SELECT count(*) AS n FROM novels').get().n, 1);
  } finally {
    await new Promise(resolve => app.server.close(resolve));
    app.db.close();
  }
});
