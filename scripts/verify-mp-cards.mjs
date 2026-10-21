import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
const root='dist/build/mp-weixin/'
const [wxml,css,js,water,cover]=await Promise.all(['components/SelectableCard.wxml','components/SelectableCard.wxss','components/SelectableCard.js','services/water-share.js','static/share/water-card.png'].map(path=>readFile(root+path,path.endsWith('.png')?undefined:'utf8')))
// A web build can inherit these styles from the page; a mini-program cannot rely on that.
assert.match(String(wxml),/selectable-card/)
assert.match(String(wxml),/['"]butter['"]/)
assert.match(String(wxml),/['"]completed['"]/)
assert.match(String(css),/\.selectable-card[^}]*background:#fff[^}]*border:1px solid #ece5d6[^}]*border-radius:21px[^}]*padding:21px/)
assert.match(String(css),/\.selectable-card\.butter[^}]*background:#f7e7ad/)
assert.match(String(js),/virtualHost\s*:\s*(?:true|!0)/)
assert.match(String(water),/\/pages\/water\/water/)
assert.match(String(water),/\/static\/share\/water-card\.png/)
assert.equal(cover.readUInt32BE(16),1000);assert.equal(cover.readUInt32BE(20),800)
console.log('已验证小程序卡片自带完整样式与状态，分享封面和饮水落地路径已打包')
