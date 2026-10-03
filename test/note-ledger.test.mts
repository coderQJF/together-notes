import assert from 'node:assert/strict'
import test from 'node:test'
import { formatLedgerAmount, parseLedgerText, summarizeLedgerBlocks } from '../src/services/note-ledger.ts'

test('ledger recognition totals screenshot-style buy and win records', () => {
  const summary = parseLedgerText(`6-12: 买42 赢0
6-13: 买120 赢264
6-14: 买160 赢0
6-15: 买190 赢0
6-16: 买350 赢142.2
6-17: 买160 赢0
6-18: 买198+240 赢123
6-19: 买342 赢211.5
6-20: 买288+162+16 赢432.5
6-21: 买258 赢0
6-22: 买170 赢216`)
  assert.deepEqual(summary, { expense: 2696, income: 1389.2, net: -1306.8, recordCount: 11 })
})

test('ledger recognition supports common income and expense wording without matching ordinary prose', () => {
  assert.deepEqual(parseLedgerText('早餐 支出￥18.5\n退款收入 6\n买入 1,200 + 30'), { expense: 1248.5, income: 6, net: -1242.5, recordCount: 3 })
  assert.equal(parseLedgerText('今天买了很好看的花，也赢得了掌声。'), null)
})

test('paper ledger summary only reads paragraph blocks and formats amounts', () => {
  const summary = summarizeLedgerBlocks([
    { id: 'p', type: 'paragraph', text: '买 12.50，赢 20' },
    { id: 't', type: 'todo', text: '支出 999' },
  ])
  assert.deepEqual(summary, { expense: 12.5, income: 20, net: 7.5, recordCount: 1 })
  assert.equal(formatLedgerAmount(1234.5), '1,234.5')
})
