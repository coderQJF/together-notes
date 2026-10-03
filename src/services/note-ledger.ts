import type { NoteBlock } from './api'

export interface LedgerSummary {
  expense: number
  income: number
  net: number
  recordCount: number
}

const amountExpression = String.raw`(?:[¥￥]\s*)?\d[\d,]*(?:\.\d+)?(?:\s*\+\s*(?:[¥￥]\s*)?\d[\d,]*(?:\.\d+)?)*`
const expensePattern = new RegExp(String.raw`(?:支出|消费|花费|买入|亏损|花|买|亏)(?:了)?\s*[:：]?\s*(${amountExpression})`, 'g')
const incomePattern = new RegExp(String.raw`(?:收入|进账|盈利|卖出|赚到|赢得|赚|赢)(?:了)?\s*[:：]?\s*(${amountExpression})`, 'g')

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function expressionTotal(expression: string) {
  return roundMoney(expression.split('+').reduce((total, part) => {
    const amount = Number(part.replace(/[¥￥,\s]/g, ''))
    return total + (Number.isFinite(amount) ? amount : 0)
  }, 0))
}

function totalsFor(line: string, pattern: RegExp) {
  pattern.lastIndex = 0
  const values: number[] = []
  for (const match of line.matchAll(pattern)) values.push(expressionTotal(match[1]))
  return values
}

export function parseLedgerText(text: string): LedgerSummary | null {
  let expense = 0
  let income = 0
  let recordCount = 0
  for (const line of String(text || '').split(/\r?\n/)) {
    const expenses = totalsFor(line, expensePattern)
    const incomes = totalsFor(line, incomePattern)
    if (!expenses.length && !incomes.length) continue
    recordCount += 1
    expense += expenses.reduce((sum, value) => sum + value, 0)
    income += incomes.reduce((sum, value) => sum + value, 0)
  }
  if (!recordCount) return null
  expense = roundMoney(expense)
  income = roundMoney(income)
  return { expense, income, net: roundMoney(income - expense), recordCount }
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
