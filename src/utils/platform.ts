function copyWithNotice(value: string, title = '链接已复制') {
  uni.setClipboardData({ data: value, success: () => uni.showToast({ title, icon: 'none' }) })
}

export function openExternalUrl(url: string) {
  if (!/^https?:\/\//i.test(url)) {
    uni.showToast({ title: '链接格式不正确', icon: 'none' })
    return
  }
  // #ifdef H5
  window.open(url, '_blank', 'noopener,noreferrer')
  // #endif
  // #ifdef APP-PLUS
  try {
    plus.runtime.openURL(url, () => copyWithNotice(url))
  } catch {
    copyWithNotice(url)
  }
  // #endif
  // #ifdef MP-WEIXIN
  copyWithNotice(url, '原文链接已复制')
  // #endif
}

export function shareText({ title, content, href = '' }: { title: string; content: string; href?: string }) {
  // #ifdef APP-PLUS
  try {
    plus.share.sendWithSystem({ type: 'text', title, content, href }, () => {}, () => copyWithNotice(href || content, '分享内容已复制'))
    return
  } catch {
    copyWithNotice(href || content, '分享内容已复制')
    return
  }
  // #endif
  copyWithNotice(href || content, '分享内容已复制')
}

export function publicShareUrl(route: string) {
  const configured = String(import.meta.env.VITE_PUBLIC_BASE_URL || '').trim().replace(/\/$/, '')
  const apiBase = String(import.meta.env.VITE_API_BASE || '').trim().replace(/\/$/, '')
  const origin = configured || (/^https?:\/\//i.test(apiBase) ? apiBase.replace(/\/api$/i, '') : '')
  return origin && /^\/pages\//.test(route) ? `${origin}/#${route}` : ''
}
