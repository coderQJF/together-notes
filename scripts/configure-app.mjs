import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const manifestPath = resolve('src/manifest.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const required = process.argv.includes('--require');
const appId = String(process.env.DCLOUD_APP_ID || manifest.appid || '').trim();
const packageName = String(process.env.ANDROID_PACKAGE_NAME || manifest['app-plus']?.distribute?.android?.packagename || 'cn.coderf.togethernotes').trim();

if (!appId && required) throw new Error('缺少 DCLOUD_APP_ID，无法生成可发行的 Android App');
if (appId && !/^__UNI__[A-Z0-9]{6,32}$/i.test(appId)) throw new Error('DCLOUD_APP_ID 格式不正确，应为 __UNI__ 开头的应用标识');
if (!/^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*){2,}$/i.test(packageName)) throw new Error('ANDROID_PACKAGE_NAME 格式不正确');

manifest['app-plus'] ||= {};
manifest['app-plus'].distribute ||= {};
manifest['app-plus'].distribute.android ||= {};
manifest['app-plus'].distribute.android.packagename = packageName;
if (appId) manifest.appid = appId;

await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
console.log(appId
  ? `已配置 Android App：${appId.slice(0, 9)}… / ${packageName}`
  : `DCLOUD_APP_ID 未设置：保留空 AppID，仅生成 App 资源（包名 ${packageName}）`);
