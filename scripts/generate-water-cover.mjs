import {spawn} from 'node:child_process'
import {mkdtemp,writeFile,mkdir,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join,resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
import WebSocket from 'ws'
const port=9258,profile=await mkdtemp(join(tmpdir(),'water-cover-'))
const browser=spawn(process.env.EDGE_PATH||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',['--headless=new','--disable-gpu','--no-first-run','--hide-scrollbars',`--remote-debugging-port=${port}`,`--user-data-dir=${profile}`,'about:blank'],{windowsHide:true,stdio:'ignore'})
const wait=ms=>new Promise(r=>setTimeout(r,ms))
let ws
try{
 let tabs
 for(let i=0;i<60;i++){try{tabs=await(await fetch(`http://127.0.0.1:${port}/json`)).json();break}catch{await wait(100)}}
 if(!tabs)throw new Error('无法启动封面渲染浏览器')
 ws=new WebSocket(tabs.find(x=>x.type==='page').webSocketDebuggerUrl);await new Promise(r=>ws.once('open',r))
 let seq=0;const pending=new Map()
 ws.on('message',raw=>{const m=JSON.parse(raw);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(m.error):p.resolve(m.result)}})
 const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}))})
 await call('Emulation.setDeviceMetricsOverride',{width:1000,height:800,deviceScaleFactor:1,mobile:false})
 await call('Page.navigate',{url:pathToFileURL(resolve('scripts/water-share-cover.html')).href});await wait(600)
 await call('Runtime.evaluate',{expression:'document.fonts.ready',awaitPromise:true})
 const shot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false})
 await mkdir('src/static/share',{recursive:true});await writeFile('src/static/share/water-card.png',Buffer.from(shot.data,'base64'))
 console.log('已生成饮水提醒分享封面（1000 × 800）')
}finally{ws?.close();if(browser.exitCode===null){const stopped=new Promise(r=>browser.once('exit',r));browser.kill();await stopped}if(!resolve(profile).startsWith(resolve(tmpdir())+'\\water-cover-'))throw new Error('意外的临时目录');await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:100})}
