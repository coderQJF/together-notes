import { createRequire } from 'node:module';
import { access, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { mkdir } from 'node:fs/promises';

const require = createRequire(import.meta.url);
let ci;
try { ci = require('miniprogram-ci'); }
catch { throw new Error('缺少 miniprogram-ci；请先临时安装：npm install --no-save miniprogram-ci@2.1.31'); }

const appid = String(process.env.WECHAT_APP_ID || '').trim();
const inlinePrivateKey = String(process.env.WECHAT_PRIVATE_KEY || '').trim();
const projectPath = resolve(process.env.WECHAT_PROJECT_PATH || 'dist/build/mp-weixin');
const outputPath = resolve(process.env.WECHAT_PREVIEW_OUTPUT || 'dist/wechat-preview.png');
const localPrivateKeyPath = resolve(`private.${appid}.key`);
const robot = Number(process.env.WECHAT_CI_ROBOT || 1);

if (!/^wx[0-9a-fA-F]{16}$/.test(appid)) throw new Error('缺少有效的 WECHAT_APP_ID');
if (!Number.isInteger(robot) || robot < 1 || robot > 30) throw new Error('WECHAT_CI_ROBOT 必须是 1—30 的整数');
await access(join(projectPath, 'project.config.json'));

let privateKeyPath = localPrivateKeyPath;
let temporaryPrivateKeyPath = '';
if (inlinePrivateKey) {
  temporaryPrivateKeyPath = join(tmpdir(), `private.${appid}.${process.pid}.key`);
  await writeFile(temporaryPrivateKeyPath, inlinePrivateKey, { mode: 0o600 });
  privateKeyPath = temporaryPrivateKeyPath;
} else {
  const localPrivateKey = await readFile(localPrivateKeyPath, 'utf8').catch(() => '');
  if (!/^-----BEGIN (?:RSA )?PRIVATE KEY-----[\s\S]+-----END (?:RSA )?PRIVATE KEY-----\s*$/.test(localPrivateKey)) {
    throw new Error(`缺少有效的微信代码上传密钥：${localPrivateKeyPath}`);
  }
}

await mkdir(dirname(outputPath), { recursive: true });
try {
  const project = new ci.Project({ appid, type: 'miniProgram', projectPath, privateKeyPath });
  await ci.preview({
    project,
    desc: `本地完整流程验证 ${new Date().toISOString()}`,
    robot,
    setting: { es6: true, minify: true, minifyJS: true, minifyWXML: true, minifyWXSS: true },
    qrcodeFormat: 'image',
    qrcodeOutputDest: outputPath,
    onProgressUpdate: progress => console.log('微信预览进度', progress),
  });
  console.log(`微信小程序预览码已生成：${outputPath}`);
} finally {
  if (temporaryPrivateKeyPath) await rm(temporaryPrivateKeyPath, { force: true });
}
