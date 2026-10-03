import type { NoteBlock } from './api'

export function materializeNoteBlocks(blocks: NoteBlock[]) {
  const content = blocks.flatMap((block, index) => {
    if (block.type === 'paragraph') return [block.style?.list === 'ordered' ? `${index + 1}. ${block.text || ''}` : block.style?.list === 'bullet' ? `• ${block.text || ''}` : block.text || '']
    if (block.type === 'todo') return [`${block.checked ? '[已完成]' : '[待办]'} ${block.text || ''}`]
    if (block.type === 'link') return [block.text || block.url || '']
    return []
  }).map(value => value.trim()).filter(Boolean).join('\n')
  const links = blocks.filter(block => block.type === 'link').map(block => String(block.url || '').trim()).filter(Boolean)
  return { content, links }
}
