import { request, type User } from './api'

let redirecting = false

function leaveReader(message: string) {
  if (redirecting) return
  redirecting = true
  uni.showToast({ title: message, icon: 'none', duration: 1800 })
  setTimeout(() => {
    uni.reLaunch({ url: '/pages/index/index' })
    redirecting = false
  }, 350)
}

export async function ensureReaderVipAccess() {
  if (!uni.getStorageSync('session')) {
    leaveReader('小说阅读暂未开放')
    return false
  }
  try {
    const user = await request<User>('/me')
    if (user.vip) return true
    leaveReader('小说阅读暂未开放')
  } catch {
    leaveReader(uni.getStorageSync('session') ? '暂时无法验证阅读权限' : '请先登录')
  }
  return false
}
