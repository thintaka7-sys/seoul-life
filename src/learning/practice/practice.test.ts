import { describe, expect, it } from 'vitest'
import type { Conversation, DrillItem, Grammar, Vocab } from '../../data/types'
import { judgePractice, normalizeDigits } from './judge'
import { buildQuestions, createPracticeIndex, drillQuestions, grammarQuestions, turnQuestions, wordQuestions, type PracticeQuestion } from './questions'
import { answerRound, correctCount, isFinished, isRetry, missedQuestions, nextQuestion, startRound } from './round'

function seeded(seed: number) {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const v = (id: string, korean: string, japanese: string, extra: Partial<Vocab> = {}): Vocab => ({
  id,
  korean,
  pronunciation: 'カナ',
  japanese,
  partOfSpeech: 'noun',
  genre: 'food_drink',
  level: 1,
  reviewed: true,
  ...extra,
})

const coffee = v('vocab_001', '커피', 'コーヒー', { example: '커피 주세요.', exampleJapanese: 'コーヒーをください。' })
const vocabulary = [coffee, v('vocab_002', '녹차', '緑茶'), v('vocab_003', '물', '水'), v('vocab_004', '네', 'はい', { genre: 'greeting', alternatives: ['예'] })]

const grammar: Grammar = {
  id: 'grammar_001',
  title: '〜주세요（〜ください）',
  level: 1,
  explanation: '説明',
  reviewed: true,
  examples: [{ korean: '물 좀 주세요.', pronunciation: 'ムル ジョム ジュセヨ', japanese: '水をください。', blank: '주세요', blankWrong: ['있어요'] }],
}

const conversation: Conversation = {
  id: 'cafe_008',
  chapter: 3,
  location: 'cafe',
  character: 'cafe_staff',
  reviewed: true,
  turns: [
    {
      task: 'コーヒーを注文しよう',
      lines: [{ speaker: 'cafe_staff', korean: '뭐 드릴까요?', pronunciation: 'ムォ ドゥリルッカヨ', japanese: '何になさいますか？' }],
      choices: [
        { korean: '커피 주세요.', pronunciation: 'コピ ジュセヨ', japanese: 'コーヒーをください。', correct: true },
        { korean: '안녕히 계세요.', pronunciation: 'アンニョンヒ ゲセヨ', japanese: 'さようなら。', correct: false, reply: [] },
      ],
      freeAnswer: { prompt: 'コーヒーをください', answers: ['커피 주세요.', '커피 한 잔 주세요.'] },
    },
    {
      kind: 'decision',
      lines: [{ speaker: 'cafe_staff', korean: '케이크도 드릴까요?', pronunciation: 'ケイクド ドゥリルッカヨ', japanese: 'ケーキもいかがですか？' }],
      choices: [
        { korean: '네, 주세요.', pronunciation: 'ネ ジュセヨ', japanese: 'はい、ください。', correct: false, reply: [] },
        { korean: '아니요, 괜찮아요.', pronunciation: 'アニヨ ケンチャナヨ', japanese: 'いいえ、大丈夫です。', correct: false, reply: [] },
      ],
    },
    { lines: [{ speaker: 'cafe_staff', korean: '감사합니다.', pronunciation: 'カムサハムニダ', japanese: 'ありがとうございます。' }] },
  ],
}

const kanji: DrillItem[] = [
  { id: 'dq_001', korean: '삼천오백 원', pronunciation: 'サムチョノベ グォン', japanese: '3,500ウォン', digits: '3500' },
  { id: 'dq_002', korean: '세 시 삼십 분', pronunciation: 'セ シ サムシプ プン', japanese: '3時30分', digits: '3:30' },
]
const days: DrillItem[] = [
  { id: 'dq_021', korean: '월요일', pronunciation: 'ウォリョイル', japanese: '月曜日' },
  { id: 'dq_022', korean: '화요일', pronunciation: 'ファヨイル', japanese: '火曜日' },
  { id: 'dq_023', korean: '수요일', pronunciation: 'スヨイル', japanese: '水曜日' },
]
const counters: DrillItem[] = [{ id: 'dq_011', korean: '하나', alternatives: ['한 개'], pronunciation: 'ハナ', japanese: '1つ', digits: '1', hintJa: '固有数詞で' }]

const forms = (qs: PracticeQuestion[]) => qs.map((q) => q.form).sort()

describe('単語の問題', () => {
  it('使える形をすべて作る（聞く問題は音声があるときだけ）', () => {
    expect(forms(wordQuestions(coffee, vocabulary, { audio: true, random: seeded(1) }))).toEqual(['arrange', 'blank', 'jaKo', 'koJa', 'listen', 'write'])
    expect(forms(wordQuestions(coffee, vocabulary, { audio: false, random: seeded(1) }))).not.toContain('listen')
  })

  it('選択肢には正解が1つだけ入り、同じジャンルの言葉を先に使う', () => {
    for (let seed = 1; seed <= 5; seed++) {
      const q = wordQuestions(coffee, vocabulary, { audio: false, random: seeded(seed) }).find((x) => x.form === 'jaKo')
      if (q?.body.type !== 'choose') throw new Error('選ぶ問題がない')
      expect(q.body.options.map((o) => o.text).sort()).toEqual(['녹차', '물', '커피'])
      expect(q.body.answers).toEqual(['커피'])
    }
  })

  it('文字の並べ替えは、札をつなげると言葉になる。1音節の言葉では作らない', () => {
    const q = wordQuestions(coffee, vocabulary, { audio: false, random: seeded(3) }).find((x) => x.form === 'arrange')
    if (q?.body.type !== 'arrange') throw new Error('並べ替えがない')
    expect(q.body.tiles).toEqual(['피', '커'])
    expect(judgePractice(q, '커피').correct).toBe(true)
    expect(judgePractice(q, '피커').correct).toBe(false)
    expect(forms(wordQuestions(vocabulary[2] as Vocab, vocabulary, { audio: false, random: seeded(1) }))).not.toContain('arrange')
  })

  it('例文の穴埋めは、例文にその言葉がそのまま入っているときだけ', () => {
    const q = wordQuestions(coffee, vocabulary, { audio: false, random: seeded(1) }).find((x) => x.form === 'blank')
    expect(q?.prompt).toEqual({ kind: 'blank', before: '', after: ' 주세요.', japanese: 'コーヒーをください。' })
  })

  it('同じ意味の言葉は、まぎらわしい選択肢に使わず、書く問題では正解にする', () => {
    const thanks = [v('vocab_101', '감사합니다', 'ありがとうございます', { genre: 'greeting' }), v('vocab_102', '고맙습니다', 'ありがとうございます', { genre: 'greeting' }), ...vocabulary]
    for (let seed = 1; seed <= 8; seed++) {
      const qs = wordQuestions(thanks[0] as Vocab, thanks, { audio: true, random: seeded(seed) })
      for (const q of qs) if (q.body.type === 'choose') expect(q.body.options.map((o) => o.text)).not.toContain('고맙습니다')
      const write = qs.find((q) => q.form === 'write')
      expect(write !== undefined && judgePractice(write, '고맙습니다').correct).toBe(true)
    }
  })

  it('書く問題は別解も正解', () => {
    const q = wordQuestions(vocabulary[3] as Vocab, vocabulary, { audio: false, random: seeded(1) }).find((x) => x.form === 'write')
    if (q === undefined) throw new Error('書く問題がない')
    expect(judgePractice(q, '예').correct).toBe(true)
    expect(judgePractice(q, '네.').correct).toBe(true)
  })
})

describe('文法の問題', () => {
  it('穴埋め（blank があるときだけ）・語の並べ替え・書く', () => {
    const qs = grammarQuestions(grammar, { audio: false, random: seeded(1) })
    expect(forms(qs)).toEqual(['grammarArrange', 'grammarBlank', 'grammarWrite'])
    const blank = qs.find((q) => q.form === 'grammarBlank')
    expect(blank?.prompt).toEqual({ kind: 'blank', before: '물 좀 ', after: '.', japanese: '水をください。' })
    expect(blank !== undefined && judgePractice(blank, '주세요').correct).toBe(true)
    const arrange = qs.find((q) => q.form === 'grammarArrange')
    if (arrange?.body.type !== 'arrange') throw new Error('並べ替えがない')
    expect([...arrange.body.tiles].sort()).toEqual(['물', '좀', '주세요'])
    expect(judgePractice(arrange, '물 좀 주세요').correct).toBe(true)
    const noBlank = { ...grammar, examples: grammar.examples.map(({ blank: _b, blankWrong: _w, ...ex }) => ex) }
    expect(forms(grammarQuestions(noBlank, { audio: false, random: seeded(1) }))).toEqual(['grammarArrange', 'grammarWrite'])
  })
})

describe('会話の往復の問題', () => {
  it('言うことを見せて選ぶ・書く。台詞と言うことを場面として出す', () => {
    const qs = turnQuestions(conversation, 0, { audio: false, random: seeded(1) })
    expect(forms(qs)).toEqual(['turnChoose', 'turnWrite'])
    expect(qs[0]?.prompt).toMatchObject({ kind: 'conversation', task: 'コーヒーを注文しよう', lines: [{ korean: '뭐 드릴까요?' }] })
    expect(qs[0]?.chapter).toBe(3)
    const write = qs.find((q) => q.form === 'turnWrite')
    expect(write !== undefined && judgePractice(write, '커피 한 잔 주세요').correct).toBe(true)
  })

  it('選択の往復・締めの台詞は問題にしない', () => {
    expect(turnQuestions(conversation, 1, { audio: true, random: seeded(1) })).toEqual([])
    expect(turnQuestions(conversation, 2, { audio: true, random: seeded(1) })).toEqual([])
  })
})

describe('ドリルの問題', () => {
  it('数字の問題は選択肢を出さない（韓国語を見て・聞いて数字を書く、日本語を見て韓国語を書く）', () => {
    const qs = drillQuestions(kanji[0] as DrillItem, kanji, { audio: true, random: seeded(1) })
    expect(forms(qs)).toEqual(['number', 'numberListen', 'write'])
    expect(qs.every((q) => q.body.type !== 'choose')).toBe(true)
  })

  it('数字を書く問題：カンマ・全角・単位があっても正解。時刻は : で区切る', () => {
    const [price, time] = kanji.map((item) => drillQuestions(item, kanji, { audio: false, random: seeded(1) }).find((q) => q.form === 'number'))
    if (price === undefined || time === undefined) throw new Error('数字の問題がない')
    for (const given of ['3500', '3,500', '３５００', '3500원', '3,500ウォン']) expect(judgePractice(price, given).correct).toBe(true)
    expect(judgePractice(price, '350').correct).toBe(false)
    expect(judgePractice(price, '삼천오백 원').correct).toBe(false)
    for (const given of ['3:30', '３：３０', '03:30', '3時30分']) expect(judgePractice(time, given).correct).toBe(true)
    expect(judgePractice(time, '330').correct).toBe(false)
  })

  it('日本語を見て韓国語を書く問題では、数字で書いた答えを正解にしない（修正3）', () => {
    const write = drillQuestions(kanji[0] as DrillItem, kanji, { audio: false, random: seeded(1) }).find((q) => q.form === 'write')
    if (write === undefined) throw new Error('書く問題がない')
    expect(judgePractice(write, '3500')).toEqual({ correct: false, digits: true })
    expect(judgePractice(write, '3500원')).toEqual({ correct: false, digits: true })
    expect(judgePractice(write, '삼천오백 원').correct).toBe(true)
    expect(judgePractice(write, '삼천오백원')).toMatchObject({ correct: true, spacing: true })
  })

  it('別解（alternatives）も正解。hintJa を日本語に添える', () => {
    const write = drillQuestions(counters[0] as DrillItem, counters, { audio: false, random: seeded(1) }).find((q) => q.form === 'write')
    if (write === undefined) throw new Error('書く問題がない')
    expect(write.prompt).toEqual({ kind: 'japanese', text: '1つ', hint: '固有数詞で' })
    expect(judgePractice(write, '한 개').correct).toBe(true)
    expect(judgePractice(write, '1').correct).toBe(false)
  })

  it('数字でない問題は、同じドリルの問題から選択肢を作る', () => {
    const qs = drillQuestions(days[0] as DrillItem, days, { audio: true, random: seeded(1) })
    expect(forms(qs)).toEqual(['jaKo', 'koJa', 'listen', 'write'])
    const koJa = qs.find((q) => q.form === 'koJa')
    if (koJa?.body.type !== 'choose') throw new Error('選ぶ問題がない')
    expect(koJa.body.options.map((o) => o.text).sort()).toEqual(['月曜日', '水曜日', '火曜日'].sort())
  })
})

describe('復習のキーから問題を作る', () => {
  const index = createPracticeIndex({ vocabulary, grammar: [grammar], conversations: [conversation], drillGroups: [kanji, days] })

  it('教材があるキーだけ問題を作れる', () => {
    expect(['word:vocab_001', 'grammar:grammar_001', 'turn:cafe_008#0', 'drill:dq_021'].every(index.exists)).toBe(true)
    expect(['word:vocab_999', 'turn:cafe_008#1', 'turn:cafe_008#2', 'turn:home_003#0', 'drill:dq_999', 'listen:x'].some(index.exists)).toBe(false)
  })

  it('1回分の問題を作る（作れないキーは飛ばす。直前と同じ形はなるべく避ける）', () => {
    const keys = ['word:vocab_001', 'word:vocab_999', 'word:vocab_002', 'word:vocab_003', 'drill:dq_021']
    for (let seed = 1; seed <= 10; seed++) {
      const qs = buildQuestions(index, keys, { audio: true, random: seeded(seed), chapterOf: () => 2 })
      expect(qs.map((q) => q.key)).toEqual(['word:vocab_001', 'word:vocab_002', 'word:vocab_003', 'drill:dq_021'])
      expect(qs.every((q) => q.chapter === 2)).toBe(true)
      qs.forEach((q, i) => i > 0 && expect(q.form).not.toBe(qs[i - 1]?.form))
    }
  })

  it('問題の形をばらけさせる：並べ替えを作れる問題が1つでもあれば、1回に1問以上は出る（BUG-009）', () => {
    // 並べ替えと穴埋めを作れるのは 커피 だけ（물・네・빵・떡 は1音節）。取り合っても、並べ替えは必ず出る
    const many = createPracticeIndex({ vocabulary: [...vocabulary, v('vocab_005', '빵', 'パン'), v('vocab_006', '떡', 'お餅')], grammar: [], conversations: [], drillGroups: [] })
    const keys = ['word:vocab_003', 'word:vocab_004', 'word:vocab_005', 'word:vocab_006', 'word:vocab_001']
    for (let seed = 1; seed <= 30; seed++) {
      const forms = buildQuestions(many, keys, { audio: true, random: seeded(seed) }).map((q) => q.form)
      expect(forms).toContain('arrange')
      // 使える形（意味・日本語から選ぶ・聞く・並べ替え・穴埋め・書く）が5問にばらける：同じ形は2問まで
      expect(Math.max(...[...new Set(forms)].map((f) => forms.filter((x) => x === f).length))).toBeLessThanOrEqual(2)
    }
  })
})

describe('数字の答えを整える', () => {
  it.each([
    ['3,500', '3500'],
    ['０５００', '500'],
    ['5月15日', '5/15'],
    ['03:05', '3:5'],
    ['원', null],
  ])('%s → %s', (input, expected) => {
    expect(normalizeDigits(input)).toBe(expected)
  })
})

describe('1回分の出題の進み方', () => {
  const index = createPracticeIndex({ vocabulary, grammar: [grammar], conversations: [conversation], drillGroups: [kanji, days] })
  const qs = buildQuestions(index, ['word:vocab_001', 'word:vocab_002', 'drill:dq_021'], { audio: false, random: seeded(1) })

  it('間違えた問題を最後にもう一度だけ出す。2回目の答えは結果に入れない', () => {
    let round = startRound(qs, true)
    const answers = [true, false, false]
    for (const [i, correct] of answers.entries()) {
      round = nextQuestion(answerRound(round, correct, `答え${i}`), seeded(2))
    }
    expect(isFinished(round)).toBe(false)
    expect(isRetry(round)).toBe(true)
    expect(round.questions.slice(3).map((q) => q.key)).toEqual(['word:vocab_002', 'drill:dq_021'])
    round = nextQuestion(answerRound(round, true, 'もう一度1'), seeded(2))
    round = nextQuestion(answerRound(round, false, 'もう一度2'), seeded(2))
    expect(isFinished(round)).toBe(true)
    expect(round.results).toEqual([
      { key: 'word:vocab_001', correct: true, given: '答え0' },
      { key: 'word:vocab_002', correct: false, given: '答え1' },
      { key: 'drill:dq_021', correct: false, given: '答え2' },
    ])
    expect(correctCount(round)).toBe(1)
    // 結果画面で見返すのは、最初の出題で間違えた問題と、そのときの答え（もう一度出したときの答えではない）
    expect(missedQuestions(round).map((m) => [m.question.key, m.given])).toEqual([
      ['word:vocab_002', '答え1'],
      ['drill:dq_021', '答え2'],
    ])
  })

  it('もう一度出さない設定（章末テスト）・全問正解なら、そのまま終わる', () => {
    let round = startRound(qs, false)
    for (const correct of [false, false, false]) round = nextQuestion(answerRound(round, correct), seeded(2))
    expect(isFinished(round)).toBe(true)
    let all = startRound(qs, true)
    for (let i = 0; i < 3; i++) all = nextQuestion(answerRound(all, true), seeded(2))
    expect(isFinished(all)).toBe(true)
  })

  it('同じ問題に2回答えても、結果は1つ', () => {
    const round = answerRound(answerRound(startRound(qs, true), true), false)
    expect(round.results).toEqual([{ key: 'word:vocab_001', correct: true, given: '' }])
  })
})
