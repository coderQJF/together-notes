import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const manifestPath = resolve('src/manifest.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const configuredAppId = String(process.env.WECHAT_APP_ID || '').trim();
const currentAppId = String(manifest['mp-weixin']?.appid || '').trim();
const appId = configuredAppId || currentAppId;
const required = process.argv.includes('--require');

if (!appId) {
  if (required) throw new Error('缺少 WECHAT_APP_ID，无法生成可上传的小程序构建');
  console.log('WECHAT_APP_ID 未设置：保留空 AppID，仅生成本地构建产物');
  process.exit(0);
}

if (!/^wx[0-9a-fA-F]{16}$/.test(appId)) throw new Error('WECHAT_APP_ID 格式不正确');
manifest['mp-weixin'] ||= {};
manifest['mp-weixin'].appid = appId;
await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
console.log(`已为微信小程序构建配置 AppID：${appId.slice(0, 6)}…${appId.slice(-4)}`);
