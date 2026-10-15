// Public recommendation payloads must never depend on a user, note or current route.
export const APP_SHARE_TITLE = '小记｜一个人记事，两个人共享'
export const APP_SHARE_IMAGE = '/static/share/app-card.png'
export const APP_TIMELINE_IMAGE = '/static/share/app-timeline.png'
export function appFriendShare() {
  return { title: APP_SHARE_TITLE, path: '/pages/index/index', imageUrl: APP_SHARE_IMAGE }
}
export function appTimelineShare() {
  return { title: APP_SHARE_TITLE, query: '', imageUrl: APP_TIMELINE_IMAGE }
}
export function enableAppShareMenu(timeline = false) {
  // #ifdef MP-WEIXIN
  uni.showShareMenu({ menus: timeline ? ['shareAppMessage', 'shareTimeline'] : ['shareAppMessage'] })
  // #endif
}
