import assert from 'node:assert/strict'
import test from 'node:test'
import { parseNovelChapters } from './novel-chapters.mjs'

test('cloud novels are split into individually retrievable chapters', () => {
  const chapters = parseNovelChapters(`写在前面\n\n第一章 相遇\n第一章正文。\n\n第二章\n第二章正文。`)
  assert.deepEqual(chapters.map(item => item.title), ['正文前', '第一章 相遇', '第二章'])
  assert.equal(chapters[2].content, '第二章正文。')
})

test('heading-free cloud novels are split into bounded sections', () => {
  const chapters = parseNovelChapters(`${'甲'.repeat(4_000)}\n\n${'乙'.repeat(4_000)}`)
  assert.equal(chapters.length, 2)
  assert.equal(chapters[0].content.length, 4_000)
  const unbroken = parseNovelChapters('丙'.repeat(15_000))
  assert.equal(unbroken.length, 3)
  assert.ok(unbroken.every(chapter => chapter.content.length <= 6_000))
})
