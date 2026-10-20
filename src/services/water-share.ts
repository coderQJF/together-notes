import { publicShareUrl, shareText } from '../utils/platform'
export const WATER_SHARE_TITLE = '忙归忙，别忘了喝口水。'
export const WATER_SHARE_ROUTE = '/pages/water/water'
export const WATER_SHARE_IMAGE = '/static/share/water-card.png'
// A public invitation never contains a sender id, count, date or private log.
export function waterFriendShare() { return {title:WATER_SHARE_TITLE,path:WATER_SHARE_ROUTE,imageUrl:WATER_SHARE_IMAGE} }
export function waterTimelineShare() { return {title:WATER_SHARE_TITLE,query:'',imageUrl:WATER_SHARE_IMAGE} }
export function shareWaterReminder() {
  const href=publicShareUrl(WATER_SHARE_ROUTE)
  shareText({title:WATER_SHARE_TITLE,content:`${WATER_SHARE_TITLE}\n给自己一点休息，喝完一杯碰一下小水杯。${href?'\n'+href:'\n在微信搜索“两个人的小记记”，一起记喝水。'}`,href})
}
