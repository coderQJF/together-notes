import type { Item } from './api'

export interface HomeWidgetNote {
  id: string
  title: string
  content: string
  date: string
  pinned: boolean
  updatedAt: string
  images: Array<{ id: string; name: string }>
}

export function isImageAttachment(name: string) {
  return /\.(?:png|jpe?g|webp|gif|bmp|heic|heif)$/i.test(name.trim())
}

function formatWidgetDate(value?: string) {
  if (!value) return '最近更新'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '最近更新'
  return `${date.getMonth() + 1}月${date.getDate()}日`
}

export function buildHomeWidgetNotes(items: Item[]): HomeWidgetNote[] {
  return items
    .filter(item => item.kind === 'note' && Boolean(item.id))
    .map(item => ({
      id: String(item.id).slice(0, 200),
      title: (item.title.trim() || '未命名小记').slice(0, 100),
      content: item.content
        .replace(/\r\n?/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim()
        .slice(0, 4000),
      date: formatWidgetDate(item.updatedAt),
      pinned: Boolean(item.pinned),
      updatedAt: item.updatedAt || '',
      images: (item.attachments || [])
        .filter(attachment => isImageAttachment(attachment.name))
        .slice(0, 10)
        .map(attachment => ({ id: attachment.id.slice(0, 200), name: attachment.name.slice(0, 150) })),
    }))
    .sort((left, right) => Number(right.pinned) - Number(left.pinned) || right.updatedAt.localeCompare(left.updatedAt))
    .slice(0, 60)
}
