import { describe, expect, it } from 'vitest'
import type { Menu, Order, Vocab } from '../../data/types'
import { judgeOrder, judgeSpokenOrder, orderExample, orderReaction, type OrderContext } from './order'

const line = (korean: string) => ({ speaker: 'cafe_staff', korean, pronunciation: 'カナ', japanese: '訳' })

const vocab: Record<string, Vocab> = {
  v_americano: { id: 'v_americano', korean: '아메리카노', alternatives: ['아아'], pronunciation: 'アメリカノ', japanese: 'アメリカーノ', partOfSpeech: 'noun', genre: 'food_drink', level: 1, reviewed: false },
  v_cheesecake: { id: 'v_cheesecake', korean: '치즈케이크', pronunciation: 'チジュケイク', japanese: 'チーズケーキ', partOfSpeech: 'noun', genre: 'food_drink', level: 1, reviewed: false },
}

const menu: Menu = {
  id: 'menu_001',
  location: 'cafe',
  titleJa: 'カフェのメニュー',
  currency: { korean: '원', pronunciation: 'ウォン' },
  items: [
    { key: 'americano', display: 'board', vocab: 'v_americano', price: 4500, pricePronunciation: 'サチョノベグォン', counter: '잔', reply: [line('아메리카노 좋아요')] },
    { key: 'cheesecake', display: 'showcase', vocab: 'v_cheesecake', price: 5500, pricePronunciation: 'オチョノベグォン', counter: '개', reply: [line('치즈케이크 맛있어요')] },
  ],
  reviewed: false,
}

const order: Order = {
  id: 'order_001',
  chapter: 3,
  location: 'cafe',
  character: 'cafe_staff',
  menu: 'menu_001',
  task: '好きなものを1つ注文しよう',
  lines: [line('주문하시겠어요?')],
  counts: [
    { korean: '한 잔', pronunciation: 'ハン ジャン', number: 1, counter: '잔', confirm: [line('한 잔이요.')] },
    { korean: '두 잔', pronunciation: 'トゥ ジャン', number: 2, counter: '잔', confirm: [line('두 잔이요.')] },
    { korean: '한 개', pronunciation: 'ハン ゲ', number: 1, counter: '개', confirm: [line('한 개요.')] },
    { korean: '하나', pronunciation: 'ハナ', number: 1, confirm: [line('하나요.')] },
  ],
  endings: [{ korean: '주세요', pronunciation: 'ジュセヨ' }, { korean: '요', attached: true }, { korean: '이요', attached: true }],
  modifiers: [{ korean: '아이스', pronunciation: 'アイス', counter: '잔' }, { korean: '따뜻한', pronunciation: 'タットゥタン', counter: '잔' }],
  closing: [line('잠시만 기다려 주세요.')],
  notOnMenu: [line('그건 없어요.')],
  unclear: [line('네? 다시 한번 말씀해 주시겠어요?')],
  counterNoteJa: '飲み物は 잔 で数えるのが自然です。',
  reviewed: false,
}

const ctx: OrderContext = { order, menu, vocab: (id) => vocab[id] }
const ok = (input: string, spoken = false) => {
  const j = judgeOrder(input, ctx, spoken)
  return j.kind === 'ok' ? { item: j.item.key, count: j.count?.korean ?? null, mismatch: j.counterMismatch } : j.kind
}

describe('注文の判定（CONTENT_FORMAT 27-1）', () => {
  it('品名＋終わりの言い方。前に付ける言葉・数はなくてもよい', () => {
    expect(ok('아메리카노 주세요')).toEqual({ item: 'americano', count: null, mismatch: false })
    expect(ok('아이스 아메리카노 두 잔 주세요.')).toEqual({ item: 'americano', count: '두 잔', mismatch: false })
    expect(ok('치즈케이크 하나요')).toEqual({ item: 'cheesecake', count: '하나', mismatch: false })
    expect(ok('아메리카노요')).toEqual({ item: 'americano', count: null, mismatch: false })
    expect(ok('아메리카노 한 잔이요')).toEqual({ item: 'americano', count: '한 잔', mismatch: false })
  })

  it('空白・句読点・全角の違いと、単語の別表記を認める', () => {
    expect(ok('아메리카노한잔주세요！')).toEqual({ item: 'americano', count: '한 잔', mismatch: false })
    expect(ok('아아 주세요')).toEqual({ item: 'americano', count: null, mismatch: false })
  })

  it('数え方の単位が品物と合わないときは、通じたものとして注意を付ける', () => {
    expect(ok('아메리카노 한 개 주세요')).toEqual({ item: 'americano', count: '한 개', mismatch: true })
  })

  it('話したときだけ、数字の数（1잔）を認める', () => {
    expect(ok('아메리카노 1잔 주세요', true)).toEqual({ item: 'americano', count: '한 잔', mismatch: false })
    expect(ok('아메리카노 1잔 주세요')).toBe('unclear')
    expect(judgeSpokenOrder(['아메리카 노래', '아메리카노 1잔 주세요'], ctx).kind).toBe('ok')
  })

  it('メニューにない品物・分からない言い方', () => {
    expect(ok('라면 주세요')).toBe('notOnMenu')
    expect(ok('아메리카노')).toBe('unclear')
    expect(ok('주세요')).toBe('unclear')
    expect(ok('한 잔 주세요')).toBe('unclear')
    expect(ok('')).toBe('unclear')
    // 아이스 は 잔 の品物にだけ
    expect(ok('아이스 치즈케이크 주세요')).not.toMatchObject({ item: 'cheesecake' })
  })

  it('店員の反応：数の確かめ → 品物のひとこと → 締め。メニューにない・分からないときはその台詞', () => {
    const j = judgeOrder('아메리카노 한 잔 주세요', ctx)
    expect(orderReaction(j, order).map((l) => l.korean)).toEqual(['한 잔이요.', '아메리카노 좋아요', '잠시만 기다려 주세요.'])
    expect(orderReaction(judgeOrder('아메리카노 주세요', ctx), order).map((l) => l.korean)).toEqual(['아메리카노 좋아요', '잠시만 기다려 주세요.'])
    expect(orderReaction({ kind: 'notOnMenu' }, order)).toBe(order.notOnMenu)
    expect(orderReaction({ kind: 'unclear' }, order)).toBe(order.unclear)
  })

  it('答えの例：最初の品物＋その単位の最初の数＋くっつけない最初の言い方', () => {
    expect(orderExample(ctx)).toMatchObject({ korean: '아메리카노 한 잔 주세요', pronunciation: 'アメリカノ ハン ジャン ジュセヨ' })
  })
})
