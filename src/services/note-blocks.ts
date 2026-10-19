import type { Attachment, NoteBlock } from './api'

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

/** Keep a lossless round trip until plain text is edited in the classic form. */
export function classicToPaperBlocks(
  content: string,
  links: string[],
  attachments: Attachment[],
  retained: NoteBlock[],
  createId: () => string,
): NoteBlock[] {
  const materialized = materializeNoteBlocks(retained)
  const attachmentIds = new Set(attachments.map(attachment => attachment.id))
  const isMedia = (block: NoteBlock) => block.type === 'drawing' || block.type === 'image'
  const media = retained.filter(block => isMedia(block) && attachmentIds.has(String(block.attachmentId)))
  const retainedLinks = retained.filter(block => block.type === 'link' && links.includes(String(block.url)))
  let blocks: NoteBlock[]

  const sameLinks = materialized.links.length === links.length && materialized.links.every((url, index) => url === links[index])
  if (materialized.content === content && sameLinks) {
    blocks = retained.filter(block => isMedia(block) ? attachmentIds.has(String(block.attachmentId)) : block.type === 'link' ? links.includes(String(block.url)) : true)
  } else {
    // The classic form owns the edited plain text. Reusing old paragraph/todo
    // blocks here would silently restore their stale text on the next switch.
    blocks = []
    const remainingLinks = [...retainedLinks]
    let paragraph: string[] = []
    const flush = () => {
      const text = paragraph.join('\n').trim()
      if (text) blocks.push({ id: createId(), type: 'paragraph', text, style: { align: 'left', list: 'none', color: '#3e382d' } })
      paragraph = []
    }
    for (const line of content.split('\n')) {
      // Materialized classic text includes link labels. Keep an unchanged link
      // line as its original card, so it is not duplicated in a new paragraph.
      const linkIndex = remainingLinks.findIndex(block => String(block.text || block.url || '').trim() === line.trim())
      if (linkIndex < 0) paragraph.push(line)
      else {
        flush()
        blocks.push(remainingLinks.splice(linkIndex, 1)[0])
      }
    }
    flush()
    if (!blocks.some(block => block.type === 'paragraph')) blocks.unshift({ id: createId(), type: 'paragraph', text: '' })
    blocks.push(...media)
  }

  for (const attachment of attachments) {
    if (!blocks.some(block => block.attachmentId === attachment.id)) blocks.push({ id: createId(), type: 'image', attachmentId: attachment.id })
  }
  for (const url of links) {
    if (!blocks.some(block => block.type === 'link' && block.url === url)) blocks.push(retainedLinks.find(block => block.url === url) || { id: createId(), type: 'link', text: '', url })
  }
  if (!blocks.length) blocks.push({ id: createId(), type: 'paragraph', text: content })
  return blocks
}
