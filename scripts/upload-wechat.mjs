import { createRequire } from 'node:module';
import { readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';

const require = createRequire(import.meta.url);
let ci;
try { ci = require('miniprogram-ci'); }
catch { throw new Error('缺少 miniprogram-ci；请先临时安装：npm install --no-save miniprogram-ci@2.1.31'); }

const appid = String(process.env.WECHAT_APP_ID || '').trim();
const privateKey = String(process.env.WECHAT_PRIVATE_KEY || '').trim();
const apiBase = String(process.env.VITE_API_BASE || '').trim();
if (!/^wx[0-9a-fA-F]{16}$/.test(appid)) throw new Error('缺少有效的 WECHAT_APP_ID');
if (!privateKey) throw new Error('缺少 WECHAT_PRIVATE_KEY');
if (!/^https:\/\/[^/]+(?:\/.*)?\/api\/?$/i.test(apiBase)) throw new Error('VITE_API_BASE 必须是 HTTPS 地址并以 /api 结尾');

const pkg = JSON.parse(await readFile(resolve('package.json'), 'utf8'));
const projectPath = resolve('dist/build/mp-weixin');
const privateKeyPath = join(tmpdir(), `private.${appid}.${process.pid}.key`);
const robot = Number(process.env.WECHAT_CI_ROBOT || 1);
if (!Number.isInteger(robot) || robot < 1 || robot > 30) throw new Error('WECHAT_CI_ROBOT 必须是 1—30 的整数');

await writeFile(privateKeyPath, privateKey, { mode: 0o600 });
try {
  const project = new ci.Project({ appid, type: 'miniProgram', projectPath, privateKeyPath });
  const revision = String(process.env.GITHUB_SHA || '').slice(0, 7);
  await ci.upload({
    project,
    version: String(process.env.RELEASE_VERSION || pkg.version),
    desc: revision ? `自动发布 ${revision}` : '自动发布',
    robot,
    setting: { es6: true, minify: true, minifyJS: true, minifyWXML: true, minifyWXSS: true },
    onProgressUpdate: progress => console.log('微信上传进度', progress),
  });
  console.log('微信小程序代码上传成功');
} finally {
  await rm(privateKeyPath, { force: true });
}
