import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
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

test('travel screenshot totals all 47 expenses across 16 labeled rows, including wrapped continuations', () => {
  const text = readFileSync(new URL('./fixtures/travel-ledger.txt', import.meta.url), 'utf8')
  assert.equal([...text.matchAll(/-\d+/g)].length, 47)
  assert.deepEqual(parseLedgerText(text), { expense: 9545, income: 0, net: -9545, recordCount: 16 })
  assert.deepEqual(parseLedgerText(text.replace(/\n(?=-)/g, ' ')), { expense: 9545, income: 0, net: -9545, recordCount: 16 })
  assert.deepEqual(summarizeLedgerBlocks(text.split('\n').map((line, index) => ({ id: String(index), type: 'paragraph', text: line }))),
    { expense: 9545, income: 0, net: -9545, recordCount: 16 })
})

test('signed rows accept income, refunds, currency, cents, annotations and full-width signs', () => {
  assert.deepEqual(parseLedgerText(`工资：+¥12,345.67
早餐：-￥12.50 -0.10 -0.20
退款：＋2.80
交通：－3元 −2.5块钱
跑腿：-23（现金）-48`), { expense: 89.3, income: 12348.47, net: 12259.17, recordCount: 5 })
  assert.deepEqual(parseLedgerText('支出 -0.10\n消费0.20元\n收入 +0.30\n咖啡：-0.10 -0.20'),
    { expense: 0.6, income: 0.3, net: -0.3, recordCount: 4 })
  assert.deepEqual(parseLedgerText('小计：-1.005 -2.004\n退款：+0.009'),
    { expense: 3.01, income: 0.01, net: -3, recordCount: 2 })
  assert.deepEqual(parseLedgerText('电话费：-20\n手机充值：-50\n手机：-2999'),
    { expense: 3069, income: 0, net: -3069, recordCount: 3 })
})

test('dates, identifiers and ordinary numeric prose do not become financial records', () => {
  assert.equal(parseLedgerText(`25号出门，10-19回来
日期：2026-10-19
电话：-13800138000
订单号：-123456
温度：-10
买了2本书，花了3天读完，赢得了12次掌声。
今天记下：-10分，明天加油
编号：+86
-20 -1 -25`), null)
  assert.deepEqual(parseLedgerText('夜市：-50\n电话：13800138000\n-20 -1 -25\n退款收入6'),
    { expense: 50, income: 6, net: -44, recordCount: 2 })
  assert.equal(parseLedgerText('约定：2026-10-19\n电话：138-0013-8000\n行程：10-19'), null)
})
