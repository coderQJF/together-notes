export const WATER_CUP_ML = 500
export type WaterMood = 'dry' | 'waking' | 'happy' | 'satisfied' | 'stuffed' | 'sulk'
export function waterMood(cups: number): WaterMood { return cups <= 0 ? 'dry' : cups === 1 ? 'waking' : cups === 2 ? 'happy' : cups === 3 ? 'satisfied' : 'stuffed' }
export const waterLabels: Record<WaterMood, string> = { dry: '干巴巴 · 等待唤醒', waking: '醒过来了 · 小口恢复', happy: '水灵灵 · 元气冒泡', satisfied: '刚刚好 · 悠着点喝', stuffed: '鼓起来了 · 先歇一歇', sulk: '瘪嘴了 · 一小会儿就好' }
export const waterIdle: Record<WaterMood, string> = { dry: '我都快干成小饼干了……', waking: '咕噜！终于活过来了。', happy: '看！我都变得圆滚滚啦。', satisfied: '今天被照顾得很好，舒服～', stuffed: '嗝……装不下啦，先歇会儿。', sulk: '少一杯？哼……记准更重要。' }
export function waterPraise(cups: number, turn: number) {
  if (cups >= 4) return ['认真记录值得夸，但我已经撑啦。', '记好啦，别为了哄我继续喝哦。'][turn % 2]
  if (cups === 3) return ['会照顾自己，今天很棒！先歇歇。', '被你照顾得刚刚好，给你小红花。'][turn % 2]
  if (cups === 1) return '第一杯！你把我救活啦。'
  return ['又照顾了自己一次，真棒！', '咕噜咕噜，你是补水小能手。', '收到！脸蛋都被你养圆啦。'][turn % 3]
}
