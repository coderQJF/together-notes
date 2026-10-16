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


test('spaced prologues and numbered acts are recognized without swallowing the book', () => {
  const chapters = parseNovelChapters('献词。\n\n序 章\n\n城堡\n序章正文。\n\n第一幕\n开学\n第一幕正文。\n第二幕\n第二幕正文。\n尾声\n结尾。')
  assert.deepEqual(chapters.map(chapter => chapter.title), ['正文前', '序 章', '第一幕', '第二幕', '尾声'])
  assert.equal(chapters[2].content, '开学\n第一幕正文。')
})

test('every section is bounded even when only a tail heading was recognized', () => {
  const body = Array.from({length: 400}, () => '一段正文。'.repeat(20)).join('\n')
  for (const source of [body + '\n尾声\n结束。', '第一幕\n' + body]) {
    const chapters = parseNovelChapters(source)
    assert.ok(chapters.length > 2)
    assert.ok(chapters.every(chapter => chapter.content.length <= 6000))
    const compact = value => value.replace(/\s/g, '')
    assert.ok(compact(chapters.map(chapter => chapter.content).join('')).startsWith(compact(body)))
  }
  assert.deepEqual(parseNovelChapters('他走进了第一幕。\n屏幕上最后一幕。').map(chapter => chapter.title), ['正文'])
})
