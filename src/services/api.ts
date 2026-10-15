import { offlineItems } from './offline-items'
import { guestWorkspace, guestUser } from './guest-workspace'
// #ifdef APP-PLUS
import { copyAndroidImage } from './local-images'
// #endif

export interface Attachment {id:string;name:string;size:number;localPath?:string}
export interface User {id:string;nickname:string;vip:boolean;vipExpiresAt?:string|null;partner:{id:string;nickname:string}|null;guest?:boolean}
export interface CloudNovelSummary {id:string;title:string;author:string;characterCount:number;createdAt:string;updatedAt:string}
export interface CloudNovelChapterSummary {chapterIndex:number;title:string;characterCount:number}
export interface CloudNovelCatalog {id:string;title:string;author:string;chapterCount:number;chapters:CloudNovelChapterSummary[];createdAt:string;updatedAt:string}
export interface CloudNovelChapter extends CloudNovelChapterSummary {content:string}
export interface CloudGame {id:string;title:string;description:string;filename:string;bytes:number;sha256:string;downloadPath:string;updatedAt:string}
export interface NoteBlockStyle {bold?:boolean;italic?:boolean;underline?:boolean;align?:'left'|'center'|'right';list?:'none'|'ordered'|'bullet';color?:string}
export interface NoteBlock {id:string;type:'paragraph'|'todo'|'image'|'drawing'|'link';text?:string;checked?:boolean;attachmentId?:string;url?:string;style?:NoteBlockStyle}
export interface Item {id?:string;owner?:string;kind:'note'|'reminder';title:string;content:string;scope:'mine'|'shared';pinned?:boolean;attachments?:Attachment[];links:string[];noteFormat?:'classic'|'paper';blocks?:NoteBlock[];sourceKey?:string;nextAt?:string;repeat?:string;recipient?:string;advance?:number;done?:boolean;updatedAt?:string;syncPending?:boolean}
export interface Message {id:string;title:string;due:string;seen:number;itemId?:string|null}
export interface HomeSnapshot {user:User;items:Item[];messages:Message[];savedAt:number}

const HOME_SNAPSHOT_KEY='home-snapshot-v1'

export function readHomeSnapshot(session:string):HomeSnapshot|null{
 if(!session)return null
 try{
  const cached=uni.getStorageSync(HOME_SNAPSHOT_KEY) as {session?:string;snapshot?:HomeSnapshot}|null
  if(!cached||cached.session!==session||!cached.snapshot?.user||!Array.isArray(cached.snapshot.items)||!Array.isArray(cached.snapshot.messages))return null
  return cached.snapshot
 }catch{return null}
}

export function saveHomeSnapshot(session:string,snapshot:Omit<HomeSnapshot,'savedAt'>){
 if(!session)return
 try{uni.setStorageSync(HOME_SNAPSHOT_KEY,{session,snapshot:{...snapshot,savedAt:Date.now()}})}catch{}
}

export function clearHomeSnapshot(){
 try{uni.removeStorageSync(HOME_SNAPSHOT_KEY)}catch{}
}

export class ApiError extends Error {
  status: number
  code: string

  constructor(message: string, status = 0, code = 'NETWORK_ERROR') {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

const apiBase = () => String(import.meta.env.VITE_API_BASE || '/api').replace(/\/$/, '')
export const reminderSyncApiBase = () => apiBase()

export function apiAssetUrl(value?: string | null) {
  if (!value || /^https?:\/\//i.test(value)) return value || ''
  if (!value.startsWith('/')) return value
  const base = apiBase()
  if (base.startsWith('/')) return value
  return base.replace(/\/api$/i, '') + value
}

const remoteRequest = <T>(path: string, method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET', data?: unknown, options: { timeout?: number } = {}): Promise<T> => {
const authorizedSession=String(uni.getStorageSync('session')||'')
return new Promise((resolve, reject) => uni.request({
  url: apiBase() + path,
  method,
  timeout: options.timeout ?? 15000,
  data: data as any,
  header: { Authorization: 'Bearer ' + authorizedSession },
  success: response => {
    if (response.statusCode >= 200 && response.statusCode < 300) {
      resolve(response.data as T)
      return
    }
    if (response.statusCode === 401 && uni.getStorageSync('session') === authorizedSession) { uni.removeStorageSync('session'); clearHomeSnapshot() }
    const body = response.data as { message?: string; code?: string; error?: { message?: string; code?: string } } | undefined
    reject(new ApiError(body?.error?.message || body?.message || '请求失败', response.statusCode, body?.error?.code || body?.code || `HTTP_${response.statusCode}`))
  },
  fail: failure => {
    const timedOut = /timeout/i.test(String(failure?.errMsg || ''))
    reject(new ApiError(
      timedOut ? (options.timeout && options.timeout > 15000 ? '同步等待超时，服务器可能仍在继续更新，请稍后再试' : '请求超时，请稍后重试') : '连接失败，请检查网络或后端服务',
      0,
      timedOut ? 'REQUEST_TIMEOUT' : 'NETWORK_ERROR',
    ))
  },
}))
}
export function cachedHome() {
 if(isGuestSession())return {user:guestUser,items:guestStore().items(),messages:[],savedAt:Date.now()} as HomeSnapshot
 const snapshot=readHomeSnapshot(String(uni.getStorageSync('session')||''))
 if(!snapshot)return null
 return {...snapshot,items:outbox(snapshot.user).merge(snapshot.items)}
}
const outbox=(user:User)=>offlineItems(user.id,{read:key=>uni.getStorageSync(key),write:(key,value)=>uni.setStorageSync(key,value)})
const guestStore=()=>guestWorkspace({read:key=>uni.getStorageSync(key),write:(key,value)=>uni.setStorageSync(key,value)})
export const isGuestSession=()=>!uni.getStorageSync('session')
export const guestItemCount=()=>guestStore().items().length
export function openAccountLogin(){uni.navigateTo({url:'/pages/index/index?login=1'})}
export async function importGuestItems(){
 const home=cachedHome()
 if(!home||home.user.guest)throw new Error('请先登录账号')
 const count=guestStore().importInto(home.user.id,outbox(home.user))
 saveHomeSnapshot(String(uni.getStorageSync('session')),{...home,items:outbox(home.user).merge(home.items)})
 void syncOfflineItems().catch(()=>{})
 return count
}
export function hasPendingOfflineItems(){const home=cachedHome();return Boolean(home&&outbox(home.user).pending().length)}
const syncJobs=new Map<string,Promise<void>>()
async function prepareItemUploads(payload:Item){
 const attachments:Attachment[]=[]
 for(const file of payload.attachments||[])attachments.push(file.localPath&&file.id.startsWith('local-file-')?await uploadAttachment({path:file.localPath,name:file.name},0):{id:file.id,name:file.name,size:file.size})
 const ids=new Map((payload.attachments||[]).map((file,index)=>[file.id,attachments[index]?.id]))
 return {...payload,attachments,blocks:payload.blocks?.map(block=>({...block,attachmentId:ids.get(block.attachmentId||'')||block.attachmentId}))}
}
function retainLocalImages(item:Item,source?:Item):Item{
 return {...item,attachments:item.attachments?.map((file,index)=>{
  const candidate=source?.attachments?.[index]
  const cached=source?.attachments?.find(value=>value.id===file.id)||(candidate?.id.startsWith('local-file-')?candidate:undefined)
  return cached?.localPath?{...file,localPath:cached.localPath}:file
 })}
}
export function syncOfflineItems():Promise<void>{
 const session=String(uni.getStorageSync('session')||''),snapshot=readHomeSnapshot(session)
 if(!snapshot)return Promise.resolve()
 const current=syncJobs.get(session)
 if(current)return current
 const store=outbox(snapshot.user)
 let completed=false
 // Frontends may upload before the API release finishes. Keep the outbox intact
 // until the server supports stable client ids, rather than creating duplicates
 // against an older API that silently ignores clientId.
 const readiness=store.pending().length?remoteRequest<{offlineItemsSupported?:boolean}>('/health','GET',undefined,{timeout:5000}).then(health=>{
  if(!health.offlineItemsSupported)throw new ApiError('同步服务暂未就绪，内容已保存在本机',0,'OFFLINE_SYNC_UNAVAILABLE')
 }):Promise.resolve()
 const job=readiness.then(()=>store.flush(async(path,method,data)=>{
  if(uni.getStorageSync('session')!==session)throw new Error('账号已切换')
  const payload=data as Item|undefined
  const body=payload?await prepareItemUploads(payload):undefined
  if(uni.getStorageSync('session')!==session)throw new Error('账号已切换')
  return retainLocalImages(await remoteRequest<Item>(path,method,body),payload)
 },item=>{
  if(uni.getStorageSync('session')!==session)return
  const latest=readHomeSnapshot(session)
  if(!latest)return
  saveHomeSnapshot(session,{...latest,items:store.merge([...latest.items.filter(value=>value.id!==item.id),item])})
 })).then(()=>{completed=true}).finally(()=>{
  syncJobs.delete(session)
  if(completed&&store.pending().length&&uni.getStorageSync('session')===session)void syncOfflineItems().catch(()=>{})
 })
 syncJobs.set(session,job)
 return job
}

export async function request<T>(path:string,method:'GET'|'POST'|'PUT'|'DELETE'='GET',data?:unknown,options:{timeout?:number}={}):Promise<T>{
 if(isGuestSession()&&!/^\/(?:auth\/|shared\/items\/|invites\/|health$)/.test(path)){
  const store=guestStore(),localItems=store.items(),match=path.match(/^\/items\/([^/]+)$/)
  if(method==='GET'&&path==='/me')return guestUser as T
  if(method==='GET'&&path==='/items')return localItems as T
  if(method==='GET'&&path==='/notifications')return [] as T
  if(method==='GET'&&path==='/wechat/subscription/status')return {configured:false,templateId:null} as T
  if(method==='GET'&&path==='/ai/status')return {configured:false,localSearch:true} as T
  if(method==='POST'&&path==='/items')return store.save({...data as Item,id:undefined}) as T
  if(match){
   const id=decodeURIComponent(match[1]),item=localItems.find(value=>value.id===id)
   if(!item)throw new ApiError('本机记录不存在',404,'ITEM_NOT_FOUND')
   if(method==='GET')return item as T
   if(method==='PUT')return store.save({...data as Item,id}) as T
   if(method==='DELETE'){store.remove(id);return {ok:true} as T}
  }
  if(method==='POST'&&path==='/ai/search'){
   const input=data as {query:string;scope?:string;strategy?:string}
   if(input.strategy==='online')throw new ApiError('联网模型需要登录，本地搜索无需登录',401,'LOGIN_REQUIRED')
   const query=String(input.query||'').trim().toLowerCase()
   const found=['sports','news'].includes(input.scope||'')?[]:localItems.filter(item=>query&&`${item.title}\n${item.content}`.toLowerCase().includes(query))
   return {answer:'',mode:found.length?'local':'empty',citations:found.map(item=>({id:item.id,type:item.kind,title:item.title,subtitle:item.updatedAt,route:`/pages/detail/detail?id=${encodeURIComponent(item.id!)}`})),model:'本机搜索',generatedAt:new Date().toISOString()} as T
  }
  throw new ApiError('此功能需要登录；你仍可继续使用本地小记和待办',401,'LOGIN_REQUIRED')
 }
 const session=String(uni.getStorageSync('session')||''),snapshot=cachedHome()
 const itemRoute=/^\/items\/[^/]+$/.test(path),id=itemRoute?decodeURIComponent(path.split('/')[2]):''
 const existing=snapshot?.items.find(item=>item.id===id)
 const payload=data as Item&{wechatSubscribe?:boolean}|undefined
 const privateItem=payload?.scope==='mine'&&(payload.kind==='note'||payload.recipient==='me')&&(!payload.owner||payload.owner===snapshot?.user.id)
 if(snapshot&&((method==='POST'&&path==='/items'||method==='PUT'&&itemRoute)&&privateItem&&!payload?.wechatSubscribe||method==='DELETE'&&itemRoute&&existing?.scope==='mine'&&existing.owner===snapshot?.user.id)){
  const store=outbox(snapshot.user)
  let saved:Item|undefined
  if(method==='DELETE')store.remove(id)
  else saved=store.save({...payload!,id:id||undefined})
  saveHomeSnapshot(session,{...snapshot,items:store.merge(snapshot.items),messages:snapshot.messages.filter(message=>method!=='DELETE'||message.itemId!==id)})
  void syncOfflineItems().catch(()=>{})
  return (saved||{ok:true}) as T
 }
 if(method==='GET'&&itemRoute&&existing?.syncPending)return existing as T
 try{
  if(method==='GET'&&path==='/items')await syncOfflineItems().catch(()=>{})
  // Publish any locally created item before changing its scope or making a share link.
  if(method!=='GET'&&/^\/items\//.test(path))await syncOfflineItems()
  const itemWrite=payload&&(path==='/items'||itemRoute)&&(method==='POST'||method==='PUT')
  const body=itemWrite?await prepareItemUploads(payload):data
  const response=await remoteRequest<T>(path,method,body,options)
  const result=itemWrite?retainLocalImages(response as Item,payload) as T:response
  if(path==='/me'&&method==='DELETE'&&snapshot)uni.removeStorageSync(`offline-items-v1:${snapshot.user.id}`)
  if(session!==String(uni.getStorageSync('session')||''))throw new ApiError('账号已切换，请重新打开内容',409,'SESSION_CHANGED')
  if(path==='/items'&&method==='GET'&&snapshot){const latest=cachedHome();return outbox(snapshot.user).merge((result as Item[]).map(item=>retainLocalImages(item,latest?.items.find(value=>value.id===item.id)))) as T}
  if(path==='/me'&&method==='GET')saveHomeSnapshot(session,{user:result as User,items:cachedHome()?.items||[],messages:cachedHome()?.messages||[]})
  return result
 }catch(reason){
  // Authorization and validation failures must never be disguised as offline success.
  if((reason as ApiError).status!==0)throw reason
  if(session!==String(uni.getStorageSync('session')||''))throw reason
  const latest=cachedHome()
  if(method==='GET'&&path==='/me'&&latest)return latest.user as T
  if(method==='GET'&&path==='/items'&&latest)return latest.items as T
  if(method==='GET'&&itemRoute&&existing)return existing as T
  if(method==='GET'&&path==='/notifications'&&latest)return latest.messages as T
  if(snapshot&&privateItem&&payload?.wechatSubscribe){
   const saved=outbox(snapshot.user).save({...payload,id:id||undefined})
   saveHomeSnapshot(session,{...snapshot,items:outbox(snapshot.user).merge(snapshot.items)})
   return saved as T
  }
  throw reason
 }
}
function rememberSession(result:{token:string;user:User}){if(uni.getStorageSync('session')!==result.token)clearHomeSnapshot();uni.setStorageSync('session',result.token);saveHomeSnapshot(result.token,{user:result.user,items:outbox(result.user).merge([]),messages:[]});return result.user}
export async function login(){let result:{token:string;user:User};
 // #ifdef MP-WEIXIN
 const code=await new Promise<string>((resolve,reject)=>uni.login({provider:'weixin',success:r=>resolve(r.code),fail:()=>reject(new Error('微信登录失败'))}));result=await request('/auth/wechat','POST',{code});
 // #endif
 // #ifndef MP-WEIXIN
 throw new Error('请在微信小程序中登录');
 // #endif
 return rememberSession(result!)}
export async function loginWithApp(username:string,password:string){return rememberSession(await request<{token:string;user:User}>('/auth/app/login','POST',{username,password}))}
export async function registerWithApp(username:string,password:string,nickname:string,betaCode:string){return rememberSession(await request<{token:string;user:User}>('/auth/app/register','POST',{username,password,nickname,betaCode,acceptedTerms:true}))}
export async function listCloudNovels(){return (await request<{items:CloudNovelSummary[]}>('/novels')).items}
export async function getCloudNovelCatalog(id:string){return request<CloudNovelCatalog>('/novels/'+encodeURIComponent(id)+'/chapters','GET',undefined,{timeout:60000})}
export async function getCloudNovelChapter(id:string,chapterIndex:number){return request<CloudNovelChapter>('/novels/'+encodeURIComponent(id)+'/chapters/'+Math.max(0,Math.floor(chapterIndex)),'GET',undefined,{timeout:30000})}
export async function listCloudGames(){return (await request<{items:CloudGame[]}>('/games')).items}
export function cloudGameDownloadUrl(id:string){return apiBase()+'/games/'+encodeURIComponent(id)+'/download'}
function imageName(file:any,index:number){
 const original=String(file?.name||'').trim();if(original)return original.slice(0,150)
 const path=String(file?.path||file?.tempFilePath||'');const match=path.match(/\.([a-z0-9]{2,5})(?:[?#].*)?$/i);const extension=match?.[1]?.toLowerCase()||'jpg'
 return `图片-${Date.now()}-${index+1}.${extension}`
}

async function readUploadBytes(file:any):Promise<ArrayBuffer>{
 const path=String(file?.path||file?.tempFilePath||'')
 let bytes:ArrayBuffer;
 // #ifdef H5
 bytes=await fetch(path).then(r=>r.arrayBuffer());
 // #endif
 // #ifdef MP-WEIXIN
 bytes=await new Promise<ArrayBuffer>((resolve,reject)=>uni.getFileSystemManager().readFile({filePath:path,success:r=>resolve(r.data as ArrayBuffer),fail:()=>reject(new Error('读取图片失败'))}));
 // #endif
 // #ifdef APP-PLUS
 bytes=await new Promise<ArrayBuffer>((resolve,reject)=>plus.io.resolveLocalFileSystemURL(path,(entry:any)=>entry.file((f:any)=>{const reader=new plus.io.FileReader();reader.onloadend=(e:any)=>resolve(uni.base64ToArrayBuffer(e.target.result.split(',')[1]));reader.onerror=()=>reject(new Error('读取图片失败'));reader.readAsDataURL(f)}),()=>reject(new Error('读取图片失败'))));
 // #endif
 return bytes!
}

async function uploadAttachment(file:any,index:number):Promise<Attachment>{
 const name=imageName(file,index)
 // Android 相册可能返回 content:// URI，交给原生上传通道直接读取。
 // #ifdef APP-PLUS
 const path=String(file?.path||file?.tempFilePath||'')
 if(!path)throw new Error('读取图片失败')
 if(Number(file?.size||0)>12*1024*1024)throw new Error('单张图片不能超过 12MB')
 return new Promise((resolve,reject)=>uni.uploadFile({
  url:apiBase()+'/files',
  filePath:path,
  name:'file',
  header:{Authorization:'Bearer '+uni.getStorageSync('session'),'X-File-Name':encodeURIComponent(name)},
  success:r=>{
   let payload:any={}
   try{payload=typeof r.data==='string'?JSON.parse(r.data):r.data}catch{}
   if(r.statusCode>=200&&r.statusCode<300&&payload?.id){resolve(payload as Attachment);return}
   if(r.statusCode===401)uni.removeStorageSync('session')
   reject(new ApiError(payload?.error?.message||payload?.message||'上传失败',r.statusCode))
  },
  fail:()=>reject(new ApiError('上传失败')),
 }))
 // #endif
 // #ifndef APP-PLUS
 const bytes=await readUploadBytes(file)
 if(bytes.byteLength>12*1024*1024)throw new Error('单张图片不能超过 12MB');
 return new Promise((resolve,reject)=>uni.request({url:(import.meta.env.VITE_API_BASE||'/api')+'/files',method:'POST',data:bytes,header:{Authorization:'Bearer '+uni.getStorageSync('session'),'Content-Type':'application/octet-stream','X-File-Name':encodeURIComponent(name)},success:r=>r.statusCode===200?resolve(r.data as Attachment):reject(new ApiError((r.data as any).message||'上传失败',r.statusCode)),fail:()=>reject(new ApiError('上传失败'))}));
 // #endif
}

export function uploadImagePath(path:string,name=`手写-${Date.now()}.png`):Promise<Attachment>{
 return keepLocalImage({path,tempFilePath:path,name},0)
}

async function keepLocalImage(file:any,index:number):Promise<Attachment>{
 const name=imageName(file,index)
 // #ifdef APP-PLUS
 const sourcePath=String(file?.path||file?.tempFilePath||'')
 if(/^content:\/\//i.test(sourcePath))return copyAndroidImage(sourcePath,name)
 // #endif
 const bytes=await readUploadBytes(file)
 if(bytes.byteLength>12*1024*1024)throw new Error('单张图片不能超过 12MB')
 let localPath=String(file?.path||file?.tempFilePath||'')
 // #ifdef H5
 const extension=name.split('.').pop()?.toLowerCase()
 const mime=extension==='png'?'image/png':extension==='webp'?'image/webp':extension==='gif'?'image/gif':'image/jpeg'
 localPath=`data:${mime};base64,${uni.arrayBufferToBase64(bytes)}`
 // #endif
 // #ifndef H5
 localPath=await new Promise<string>((resolve,reject)=>uni.saveFile({tempFilePath:localPath,success:result=>resolve(result.savedFilePath),fail:()=>reject(new Error('图片保存到本机失败'))}))
 // #endif
 return {id:`local-file-${Date.now()}-${Math.random().toString(16).slice(2)}`,name,size:bytes.byteLength,localPath}
}

export async function attachImages(count=10):Promise<Attachment[]>{
 const selected=await new Promise<any>((resolve,reject)=>uni.chooseImage({count:Math.max(1,Math.min(10,Math.floor(count))),sourceType:['album'],success:resolve,fail:()=>reject(new Error('未选择图片'))}))
 let paths:any[]=[]
 // #ifdef APP-PLUS
 paths=(selected.tempFilePaths||[]).map((path:string,index:number)=>({path,size:selected.tempFiles?.[index]?.size}))
 // #endif
 // #ifndef APP-PLUS
 paths=(selected.tempFiles?.length?selected.tempFiles:(selected.tempFilePaths||[]).map((path:string)=>({path}))) as any[]
 // #endif
 const attachments:Attachment[]=[]
 for(let index=0;index<paths.length;index+=1)attachments.push(await keepLocalImage(paths[index],index))
 return attachments
}

export async function attachFile():Promise<Attachment>{
 const [attachment]=await attachImages(1)
 if(!attachment)throw new Error('未选择图片')
 return attachment
}
export async function attachmentBase64(file:Attachment):Promise<string>{
 if(file.localPath)return uni.arrayBufferToBase64(await readUploadBytes({path:file.localPath}))
 const url=(import.meta.env.VITE_API_BASE||'/api')+'/files/'+encodeURIComponent(file.id)
 const response=await new Promise<UniApp.RequestSuccessCallbackResult>((resolve,reject)=>uni.request({url,method:'GET',responseType:'arraybuffer',header:{Authorization:'Bearer '+uni.getStorageSync('session')},success:resolve,fail:()=>reject(new Error('图片下载失败'))}))
 if(response.statusCode!==200||!(response.data instanceof ArrayBuffer))throw new Error('图片下载失败或无权访问')
 return uni.arrayBufferToBase64(response.data)
}
export async function attachmentPreviewUrl(file:Attachment):Promise<string>{
 if(file.localPath)return file.localPath
 const url=(import.meta.env.VITE_API_BASE||'/api')+'/files/'+encodeURIComponent(file.id)
 // #ifdef H5
 const response=await fetch(url,{headers:{Authorization:'Bearer '+uni.getStorageSync('session')}})
 if(!response.ok)throw new Error('图片加载失败或无权访问')
 const extension=file.name.split('.').pop()?.toLowerCase()
 const mime=extension==='png'?'image/png':extension==='webp'?'image/webp':extension==='gif'?'image/gif':'image/jpeg'
 return URL.createObjectURL(new Blob([await response.arrayBuffer()],{type:mime}))
 // #endif
 // #ifndef H5
 const result=await new Promise<UniApp.DownloadSuccessData>((resolve,reject)=>uni.downloadFile({url,header:{Authorization:'Bearer '+uni.getStorageSync('session')},success:resolve,fail:()=>reject(new Error('图片加载失败'))}))
 if(result.statusCode!==200)throw new Error('图片加载失败或无权访问')
 return result.tempFilePath
 // #endif
}
export function releaseAttachmentPreviewUrl(url:string){
 // #ifdef H5
 if(url.startsWith('blob:'))URL.revokeObjectURL(url)
 // #endif
}
export async function downloadFile(file:Attachment){
 if(file.localPath){uni.previewImage({urls:[file.localPath]});return}
 const url=(import.meta.env.VITE_API_BASE||'/api')+'/files/'+file.id;
 // #ifdef H5
 const response=await fetch(url,{headers:{Authorization:'Bearer '+uni.getStorageSync('session')}});if(!response.ok)throw new Error('下载失败或无权访问');const blob=await response.blob(),href=URL.createObjectURL(blob),a=document.createElement('a');a.href=href;a.download=file.name;a.click();setTimeout(()=>URL.revokeObjectURL(href),60000);
 // #endif
 // #ifndef H5
 const r=await new Promise<UniApp.DownloadSuccessData>((resolve,reject)=>uni.downloadFile({url,header:{Authorization:'Bearer '+uni.getStorageSync('session')},success:resolve,fail:()=>reject(new Error('下载失败'))}));if(r.statusCode!==200)throw new Error('下载失败或无权访问');if(/\.(png|jpe?g|webp|gif)$/i.test(file.name))uni.previewImage({urls:[r.tempFilePath]});else uni.openDocument({filePath:r.tempFilePath,fileType:file.name.split('.').pop() as any,showMenu:true,fail:()=>uni.showToast({title:'该文件格式暂不支持预览',icon:'none'})});
 // #endif
}
