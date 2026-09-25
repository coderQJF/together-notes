export interface Attachment {id:string;name:string;size:number}
export interface User {id:string;nickname:string;vip:boolean;vipExpiresAt?:string|null;partner:{id:string;nickname:string}|null}
export interface CloudNovelSummary {id:string;title:string;author:string;characterCount:number;createdAt:string;updatedAt:string}
export interface CloudNovelChapterSummary {chapterIndex:number;title:string;characterCount:number}
export interface CloudNovelCatalog {id:string;title:string;author:string;chapterCount:number;chapters:CloudNovelChapterSummary[];createdAt:string;updatedAt:string}
export interface CloudNovelChapter extends CloudNovelChapterSummary {content:string}
export interface Item {id?:string;owner?:string;kind:'note'|'reminder';title:string;content:string;scope:'mine'|'shared';pinned?:boolean;attachments?:Attachment[];links:string[];sourceKey?:string;nextAt?:string;repeat?:string;recipient?:string;advance?:number;done?:boolean;updatedAt?:string}
export interface Message {id:string;title:string;due:string;seen:number}

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

export function apiAssetUrl(value?: string | null) {
  if (!value || /^https?:\/\//i.test(value)) return value || ''
  if (!value.startsWith('/')) return value
  const base = apiBase()
  if (base.startsWith('/')) return value
  return base.replace(/\/api$/i, '') + value
}

export const request = <T>(path: string, method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET', data?: unknown, options: { timeout?: number } = {}): Promise<T> => new Promise((resolve, reject) => uni.request({
  url: apiBase() + path,
  method,
  timeout: options.timeout ?? 15000,
  data: data as any,
  header: { Authorization: 'Bearer ' + (uni.getStorageSync('session') || '') },
  success: response => {
    if (response.statusCode >= 200 && response.statusCode < 300) {
      resolve(response.data as T)
      return
    }
    if (response.statusCode === 401) uni.removeStorageSync('session')
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
function rememberSession(result:{token:string;user:User}){uni.setStorageSync('session',result.token);return result.user}
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
   reject(new Error(payload?.error?.message||payload?.message||'上传失败'))
  },
  fail:()=>reject(new Error('上传失败')),
 }))
 // #endif
 // #ifndef APP-PLUS
 const bytes=await readUploadBytes(file)
 if(bytes.byteLength>12*1024*1024)throw new Error('单张图片不能超过 12MB');
 return new Promise((resolve,reject)=>uni.request({url:(import.meta.env.VITE_API_BASE||'/api')+'/files',method:'POST',data:bytes,header:{Authorization:'Bearer '+uni.getStorageSync('session'),'Content-Type':'application/octet-stream','X-File-Name':encodeURIComponent(name)},success:r=>r.statusCode===200?resolve(r.data as Attachment):reject(new Error((r.data as any).message||'上传失败')),fail:()=>reject(new Error('上传失败'))}));
 // #endif
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
 for(let index=0;index<paths.length;index+=1)attachments.push(await uploadAttachment(paths[index],index))
 return attachments
}

export async function attachFile():Promise<Attachment>{
 const [attachment]=await attachImages(1)
 if(!attachment)throw new Error('未选择图片')
 return attachment
}
export async function attachmentBase64(file:Attachment):Promise<string>{
 const url=(import.meta.env.VITE_API_BASE||'/api')+'/files/'+encodeURIComponent(file.id)
 const response=await new Promise<UniApp.RequestSuccessCallbackResult>((resolve,reject)=>uni.request({url,method:'GET',responseType:'arraybuffer',header:{Authorization:'Bearer '+uni.getStorageSync('session')},success:resolve,fail:()=>reject(new Error('图片下载失败'))}))
 if(response.statusCode!==200||!(response.data instanceof ArrayBuffer))throw new Error('图片下载失败或无权访问')
 return uni.arrayBufferToBase64(response.data)
}
export async function attachmentPreviewUrl(file:Attachment):Promise<string>{
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
 const url=(import.meta.env.VITE_API_BASE||'/api')+'/files/'+file.id;
 // #ifdef H5
 const response=await fetch(url,{headers:{Authorization:'Bearer '+uni.getStorageSync('session')}});if(!response.ok)throw new Error('下载失败或无权访问');const blob=await response.blob(),href=URL.createObjectURL(blob),a=document.createElement('a');a.href=href;a.download=file.name;a.click();setTimeout(()=>URL.revokeObjectURL(href),60000);
 // #endif
 // #ifndef H5
 const r=await new Promise<UniApp.DownloadSuccessData>((resolve,reject)=>uni.downloadFile({url,header:{Authorization:'Bearer '+uni.getStorageSync('session')},success:resolve,fail:()=>reject(new Error('下载失败'))}));if(r.statusCode!==200)throw new Error('下载失败或无权访问');if(/\.(png|jpe?g|webp|gif)$/i.test(file.name))uni.previewImage({urls:[r.tempFilePath]});else uni.openDocument({filePath:r.tempFilePath,fileType:file.name.split('.').pop() as any,showMenu:true,fail:()=>uni.showToast({title:'该文件格式暂不支持预览',icon:'none'})});
 // #endif
}
