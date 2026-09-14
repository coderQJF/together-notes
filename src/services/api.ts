export interface Attachment {id:string;name:string;size:number}
export interface User {id:string;nickname:string;partner:{id:string;nickname:string}|null}
export interface Item {id?:string;owner?:string;kind:'note'|'reminder';title:string;content:string;scope:'mine'|'shared';pinned?:boolean;attachments?:Attachment[];links:string[];nextAt?:string;repeat?:string;recipient?:string;advance?:number;done?:boolean;updatedAt?:string}
export interface Message {id:string;title:string;due:string;seen:number}
export const request=<T>(path:string,method:'GET'|'POST'|'PUT'|'DELETE'='GET',data?:unknown):Promise<T>=>new Promise((resolve,reject)=>uni.request({url:(import.meta.env.VITE_API_BASE||'/api')+path,method,data:data as any,header:{Authorization:'Bearer '+(uni.getStorageSync('session')||'')},success:r=>{if(r.statusCode>=200&&r.statusCode<300)resolve(r.data as T);else{if(r.statusCode===401)uni.removeStorageSync('session');reject(new Error((r.data as any)?.message||'请求失败'))}},fail:()=>reject(new Error('连接失败，请检查网络或后端服务'))}));
export async function login(){let result:{token:string;user:User};
// #ifdef MP-WEIXIN
const code=await new Promise<string>((resolve,reject)=>uni.login({provider:'weixin',success:r=>resolve(r.code),fail:()=>reject(new Error('微信登录失败'))}));result=await request('/auth/wechat','POST',{code});
// #endif
// #ifndef MP-WEIXIN
throw new Error('请在微信小程序中登录');
// #endif
uni.setStorageSync('session',result!.token);return result!.user}
export async function attachFile():Promise<Attachment>{
 let file:any;
 // #ifdef H5
 file=await new Promise<any>((resolve,reject)=>uni.chooseFile({count:1,success:r=>resolve((r.tempFiles as any[])[0]),fail:()=>reject(new Error('未选择文件'))}));
 // #endif
 // #ifdef MP-WEIXIN
 file=await new Promise<any>((resolve,reject)=>uni.chooseMessageFile({count:1,type:'all',success:r=>resolve((r.tempFiles as any[])[0]),fail:()=>reject(new Error('未选择文件'))}));
 // #endif
 // #ifdef APP-PLUS
 const selected=await new Promise<any>((resolve,reject)=>uni.chooseImage({count:1,success:resolve,fail:()=>reject(new Error('未选择图片'))}));file={path:selected.tempFilePaths[0],name:'图片.jpg'};
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
