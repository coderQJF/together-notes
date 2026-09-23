export interface Attachment {id:string;name:string;size:number}
export interface User {id:string;nickname:string;vip:boolean;vipExpiresAt?:string|null;partner:{id:string;nickname:string}|null}
export interface CloudNovelSummary {id:string;title:string;author:string;characterCount:number;createdAt:string;updatedAt:string}
export interface CloudNovel extends CloudNovelSummary {content:string}
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
export async function getCloudNovel(id:string){return request<CloudNovel>('/novels/'+encodeURIComponent(id))}
export async function attachFile():Promise<Attachment>{
 let file:any;
 // #ifdef H5
 file=await new Promise<any>((resolve,reject)=>uni.chooseFile({count:1,success:r=>resolve((r.tempFiles as any[])[0]),fail:()=>reject(new Error('未选择文件'))}));
 // #endif
 // #ifdef MP-WEIXIN
 file=await new Promise<any>((resolve,reject)=>uni.chooseMessageFile({count:1,type:'all',success:r=>resolve((r.tempFiles as any[])[0]),fail:()=>reject(new Error('未选择文件'))}));
 // #endif
 // #ifdef APP-PLUS
 const selected=await new Promise<any>((resolve,reject)=>uni.chooseImage({count:1,sourceType:['album'],success:resolve,fail:()=>reject(new Error('未选择图片'))}));file={path:selected.tempFilePaths[0],name:'图片.jpg'};
 // #endif
 let bytes:ArrayBuffer;
 // #ifdef H5
 bytes=await fetch(file.path).then(r=>r.arrayBuffer());
 // #endif
 // #ifdef MP-WEIXIN
 bytes=await new Promise<ArrayBuffer>((resolve,reject)=>uni.getFileSystemManager().readFile({filePath:file.path,success:r=>resolve(r.data as ArrayBuffer),fail:()=>reject(new Error('读取附件失败'))}));
 // #endif
 // #ifdef APP-PLUS
 bytes=await new Promise<ArrayBuffer>((resolve,reject)=>plus.io.resolveLocalFileSystemURL(file.path,(entry:any)=>entry.file((f:any)=>{const reader=new plus.io.FileReader();reader.onloadend=(e:any)=>resolve(uni.base64ToArrayBuffer(e.target.result.split(',')[1]));reader.onerror=()=>reject(new Error('读取图片失败'));reader.readAsDataURL(f)}),()=>reject(new Error('读取图片失败'))));
 // #endif
 if(bytes!.byteLength>12*1024*1024)throw new Error('单个附件不能超过 12MB');
 return new Promise((resolve,reject)=>uni.request({url:(import.meta.env.VITE_API_BASE||'/api')+'/files',method:'POST',data:bytes!,header:{Authorization:'Bearer '+uni.getStorageSync('session'),'Content-Type':'application/octet-stream','X-File-Name':encodeURIComponent(file.name||'附件')},success:r=>r.statusCode===200?resolve(r.data as Attachment):reject(new Error((r.data as any).message||'上传失败')),fail:()=>reject(new Error('上传失败'))}));
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
