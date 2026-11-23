// カフェの注文（GAME_SPEC 4-4。docs/CONTENT_FORMAT.md 27-1）の判定。
// 正解にする形：［前に付けてよい言葉］＋ 品名 ＋［数］＋ 終わりの言い方（［ ］はなくてもよい）。1回に1品。
// 空白・句読点・全角半角の違いは吸収する（空白を除いてくらべる）。話して答えたときは、数を数字（1잔）で言っても認める。
// 店員の反応は、すべて教材に書いた台詞を使う（プログラムで韓国語を組み立てない）。

import type { ConversationLine, Menu, MenuItem, Order, OrderCount, OrderEnding, OrderModifier, Vocab } from '../../data/types'
import { normalizeAnswer } from '../judge/judgeAnswer'

export type OrderJudge =
  /** 注文できた。counterMismatch：数え方の単位が品物と合わない（通じたものとして進め、注意を出す） */
  | { kind: 'ok'; item: MenuItem; count: OrderCount | null; counterMismatch: boolean }
  /** 形は合っているが、メニューにない品物 */
  | { kind: 'notOnMenu' }
  /** 言い方が分からない */
  | { kind: 'unclear' }

export interface OrderContext {
  order: Order
  menu: Menu
  vocab: (id: string) => Vocab | undefined
}

function squash(s: string): string {
  return normalizeAnswer(s).replace(/ /g, '')
}

/** 品物の名前（単語の見出し語と別表記）。空白を除いた形 */
function itemNames(item: MenuItem, vocab: OrderContext['vocab']): string[] {
  const v = vocab(item.vocab)
  return v === undefined ? [] : [v.korean, ...(v.alternatives ?? [])].map(squash)
}

/** 数の言い方（話したときは、数字の言い方 1잔 も） */
function countForms(count: OrderCount, spoken: boolean): string[] {
  const forms = [squash(count.korean)]
  if (spoken) forms.push(`${count.number}${count.counter ?? ''}`)
  return forms
}

const RANK = { ok: 2, notOnMenu: 1, unclear: 0 } as const

/** 1つの言い方を判定する */
export function judgeOrder(input: string, ctx: OrderContext, spoken = false): OrderJudge {
  const text = squash(input)
  if (text === '') return { kind: 'unclear' }
  const { order, menu } = ctx
  let best: OrderJudge = { kind: 'unclear' }
  const consider = (j: OrderJudge) => {
    if (RANK[j.kind] > RANK[best.kind]) best = j
  }

  const endings: OrderEnding[] = [...order.endings].sort((a, b) => squash(b.korean).length - squash(a.korean).length)
  const counts: (OrderCount | null)[] = [null, ...order.counts]
  const modifiers: (OrderModifier | null)[] = [null, ...(order.modifiers ?? [])]
  // いちばん長く一致した終わりの言い方だけを使う（주세요 を 주세＋요 と分けないため）
  const ending = endings.find((e) => text.endsWith(squash(e.korean)))
  /** 数だけで品名がない言い方（한 잔 주세요）があったか。それなら「メニューにない」ではなく、分からないとする */
  let countOnly = false
  const end = ending === undefined ? '' : squash(ending.korean)
  if (ending !== undefined && text.length > end.length) {
    const beforeEnding = text.slice(0, text.length - end.length)
    for (const count of counts) {
      for (const countText of count === null ? [''] : countForms(count, spoken)) {
        if (!beforeEnding.endsWith(countText)) continue
        const beforeCount = beforeEnding.slice(0, beforeEnding.length - countText.length)
        for (const modifier of modifiers) {
          const mod = modifier === null ? '' : squash(modifier.korean)
          if (!beforeCount.startsWith(mod)) continue
          const name = beforeCount.slice(mod.length)
          if (name === '') {
            if (count !== null) countOnly = true
            continue
          }
          const item = menu.items.find((i) => itemNames(i, ctx.vocab).includes(name))
          if (item === undefined) {
            // ハングルだけの名前なら「メニューにない品物」、それ以外は分からない
            if (/^[가-힣]+$/.test(name)) consider({ kind: 'notOnMenu' })
            continue
          }
          // 前に付ける言葉は、その数え方の品物にだけ付けられる（아이스 치즈케이크 は分からない）
          if (modifier?.counter !== undefined && modifier.counter !== item.counter) continue
          consider({ kind: 'ok', item, count, counterMismatch: count?.counter !== undefined && count.counter !== item.counter })
        }
      }
    }
  }
  const result = best as OrderJudge
  return result.kind === 'notOnMenu' && countOnly ? { kind: 'unclear' } : result
}

/** 話した答え（聞き取りの候補がいくつかある）を判定する。いちばん良い結果を使う */
export function judgeSpokenOrder(alternatives: readonly string[], ctx: OrderContext): OrderJudge {
  let best: OrderJudge = { kind: 'unclear' }
  for (const alt of alternatives) {
    const j = judgeOrder(alt, ctx, true)
    if (RANK[j.kind] > RANK[best.kind]) best = j
  }
  return best
}

/** 店員の反応：数を言ったらその数の確かめ → 品物のひとこと → 締め。メニューにない・分からないときは、その台詞 */
export function orderReaction(judge: OrderJudge, order: Order): ConversationLine[] {
  switch (judge.kind) {
    case 'ok':
      return [...(judge.count?.confirm ?? []), ...judge.item.reply, ...order.closing]
    case 'notOnMenu':
      return order.notOnMenu
    case 'unclear':
      return order.unclear
  }
}

/** 答えの例：最初の品物＋その単位の最初の数＋くっつけない最初の言い方（読みは、それぞれの読みをつなぐ） */
export function orderExample(ctx: OrderContext): { korean: string; pronunciation: string; item: MenuItem } | null {
  const item = ctx.menu.items[0]
  const v = item === undefined ? undefined : ctx.vocab(item.vocab)
  const ending = ctx.order.endings.find((e) => e.attached !== true && e.pronunciation !== undefined)
  if (item === undefined || v === undefined || ending === undefined) return null
  const count = ctx.order.counts.find((c) => c.counter === item.counter) ?? ctx.order.counts.find((c) => c.counter === undefined)
  const words = [v.korean, ...(count === undefined ? [] : [count.korean]), ending.korean]
  const readings = [v.pronunciation, ...(count === undefined ? [] : [count.pronunciation]), ending.pronunciation ?? '']
  return { korean: words.join(' '), pronunciation: readings.join(' '), item }
}
