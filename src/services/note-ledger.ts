import type { NoteBlock } from './api'

export interface LedgerSummary {
  expense: number
  income: number
  net: number
  recordCount: number
}

const numberExpression = String.raw`(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?`
const amountExpression = String.raw`[+-]?\s*(?:[¥￥]\s*)?${numberExpression}(?:\s*\+\s*(?:[¥￥]\s*)?${numberExpression})*`
const expenseWords = '支出|消费|花费|买入|亏损|花|买|亏'
const incomeWords = '收入|进账|盈利|卖出|赚到|赢得|赚|赢'
const amountEnd = String.raw`(?:\s*(?:元|块钱?))?(?=$|\s|[，,。；;！!？?）)]|${expenseWords}|${incomeWords})`
const expensePattern = new RegExp(String.raw`(?:${expenseWords})(?:了)?\s*[:：]?\s*(${amountExpression})${amountEnd}`, 'g')
const incomePattern = new RegExp(String.raw`(?:${incomeWords})(?:了)?\s*[:：]?\s*(${amountExpression})${amountEnd}`, 'g')
const signedAmountPattern = new RegExp(String.raw`([+-])\s*(?:[¥￥]\s*)?(${numberExpression})(?:\s*(?:元|块钱?))?`, 'g')
const identifierLabel = /^(?:联系电话|电话(?:号码)?|手机号码?|身份证(?:号码?)?|订单号|单号|编号|邮编|日期|生日|温度|气温|坐标|经度|纬度)$/

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

// Convert each amount from decimal text before summing, so repeated 0.1 / 0.2
// entries and long lists stay exact to the cent.
function amountCents(amount: string) {
  const [whole, fraction = ''] = amount.replace(/[¥￥,+\-\s]/g, '').split('.')
  const cents = Number(whole) * 100 + Number((fraction + '00').slice(0, 2)) + (Number(fraction[2] || 0) >= 5 ? 1 : 0)
  return Number.isSafeInteger(cents) ? cents : 0
}

function expressionCents(expression: string) {
  return expression.split('+').reduce((total, part) => total + amountCents(part), 0)
}

function totalsFor(line: string, pattern: RegExp) {
  pattern.lastIndex = 0
  const values: number[] = []
  for (const match of line.matchAll(pattern)) values.push(expressionCents(match[1]))
  return values
}

function signedAmounts(text: string) {
  const body = text.replace(/[（(][^（）()\r\n]*[）)]/g, ' ').trim()
  signedAmountPattern.lastIndex = 0
  let end = 0
  let count = 0
  let expense = 0
  let income = 0
  for (const match of body.matchAll(signedAmountPattern)) {
    const gap = body.slice(end, match.index)
    if (count ? !/^[\s,，;；、]+$/.test(gap) && !(gap === '' && match[1] === '+') : gap.trim()) return null
    const cents = amountCents(match[2])
    if (match[1] === '-') expense += cents
    else income += cents
    end = match.index! + match[0].length
    count += 1
  }
  if (!count || !/^[\s,，;；、。]*$/.test(body.slice(end))) return null
  return { expense, income }
}

function signedRecord(line: string) {
  const separator = line.search(/[:：]/)
  if (separator < 1) return null
  const label = line.slice(0, separator).trim()
  if (!label || identifierLabel.test(label)) return null
  return signedAmounts(line.slice(separator + 1))
}

export function parseLedgerText(text: string): LedgerSummary | null {
  let expense = 0
  let income = 0
  let recordCount = 0
  let canContinue = false
  for (const rawLine of String(text || '').split(/\r?\n/)) {
    const line = rawLine.replace(/[−－﹣]/g, '-').replace(/[＋﹢]/g, '+').trim()
    if (!line) { canContinue = false; continue }
    const record = signedRecord(line)
    const continuation = !record && canContinue ? signedAmounts(line) : null
    if (record || continuation) {
      const amounts = (record || continuation)!
      expense += amounts.expense
      income += amounts.income
      if (record) recordCount += 1
      canContinue = true
      continue
    }
    canContinue = false
    const expenses = totalsFor(line, expensePattern)
    const incomes = totalsFor(line, incomePattern)
    if (!expenses.length && !incomes.length) continue
    recordCount += 1
    expense += expenses.reduce((sum, value) => sum + value, 0)
    income += incomes.reduce((sum, value) => sum + value, 0)
  }
  if (!recordCount) return null
  return { expense: expense / 100, income: income / 100, net: (income - expense) / 100, recordCount }
}

export function summarizeLedgerBlocks(blocks: NoteBlock[]) {
  return parseLedgerText(blocks
    .filter(block => block.type === 'paragraph')
    .map(block => block.text || '')
    .join('\n'))
}

export function formatLedgerAmount(value: number) {
  const rounded = Math.abs(roundMoney(value))
  const raw = rounded.toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1')
  const [whole, decimal] = raw.split('.')
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return decimal ? `${grouped}.${decimal}` : grouped
}
