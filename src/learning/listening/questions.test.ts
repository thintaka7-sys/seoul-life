import { describe, expect, it } from 'vitest'
import type { Conversation, GameEvent, ListeningSentence, Vocab } from '../../data/types'
import { buildListeningRound, isListeningCorrect, listeningCandidates, listeningKey, type ListeningQuestion, type ListeningSources } from './questions'

function seeded(seed: number) {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const v = (id: string, korean: string, category: Vocab['category']): Vocab => ({
  id,
  korean,
  pronunciation: 'カナ',
  japanese: `${korean}の意味`,
  partOfSpeech: 'noun',
  category,
  level: 1,
  reviewed: true,
})

const vocabulary = [v('vocab_001', '커피', 'drink'), v('vocab_002', '녹차', 'drink'), v('vocab_003', '물', 'drink'), v('vocab_004', '빵', 'food'), v('vocab_005', '네', 'greeting')]

const conversation: Conversation = {
  id: 'cafe_001',
  chapter: 3,
  location: 'cafe',
  character: 'cafe_staff',
  reviewed: true,
  turns: [
    {
      lines: [
        { speaker: 'cafe_staff', korean: '어서 오세요.', pronunciation: 'オソ オセヨ', japanese: 'いらっしゃいませ。' },
        { speaker: 'cafe_staff', korean: '뭐 드릴까요?', pronunciation: 'ムォ ドゥリルッカヨ', japanese: '何になさいますか？' },
      ],
      choices: [
        { korean: '커피 주세요.', pronunciation: 'コピ ジュセヨ', japanese: 'コーヒーをください。', correct: true },
        { korean: '녹차 주세요.', pronunciation: 'ノクチャ ジュセヨ', japanese: '緑茶をください。', correct: true },
        { korean: '안녕히 계세요.', pronunciation: 'アンニョンヒ ゲセヨ', japanese: 'さようなら。', correct: false },
      ],
    },
    { lines: [], choices: [{ korean: '네.', pronunciation: 'ネ', japanese: 'はい。', correct: true }, { korean: '아니요.', pronunciation: 'アニヨ', japanese: 'いいえ。', correct: false }] },
    { lines: [{ speaker: 'cafe_staff', korean: '감사합니다.', pronunciation: 'カムサハムニダ', japanese: 'ありがとうございます。' }] },
  ],
}

const event: GameEvent = {
  id: 'event_002',
  chapter: 3,
  location: 'cafe',
  requires: [],
  objectiveJa: '注文',
  actionJa: '入る',
  steps: [{ type: 'conversation', id: 'cafe_001' }],
}

const sentence: ListeningSentence = {
  id: 'listen_001',
  afterEvent: 'event_002',
  korean: '커피 주세요.',
  pronunciation: 'コピ ジュセヨ',
  japanese: 'コーヒーをください。',
  distractors: [{ korean: '커피 좋아요.', pronunciation: 'コピ ジョアヨ', japanese: 'コーヒーが好きです。' }],
  reviewed: true,
}

const sources: ListeningSources = { vocabulary, conversations: [conversation], events: [event], sentences: [sentence] }
const learnedAll = Object.fromEntries(vocabulary.map((x) => [x.id, { chapter: 3 }]))

describe('listeningCandidates', () => {
  it('覚えた単語だけから、単語の問題を作る（選択肢は同じカテゴリを優先）', () => {
    const qs = listeningCandidates(sources, { words: { vocab_001: { chapter: 1 }, vocab_002: { chapter: 1 }, vocab_003: { chapter: 1 } }, completedEvents: [] }, seeded(1))
    expect(qs.map((q) => q.key).sort()).toEqual(['word:vocab_001', 'word:vocab_002', 'word:vocab_003'])
    for (const q of qs) {
      expect(q.options).toHaveLength(3)
      expect(q.options.map((o) => o.korean)).toContain(q.audio.korean)
      expect(q.answers).toEqual([q.audio.korean])
    }
  })

  it('覚えた単語が1つだけなら、単語の問題は作れない', () => {
    expect(listeningCandidates(sources, { words: { vocab_001: { chapter: 1 } }, completedEvents: [] }, seeded(1))).toEqual([])
  })

  it('終えたイベントの会話から、相手の最後の台詞を聞いて返事を選ぶ問題を作る（台詞のない往復・返事のない往復は使わない）', () => {
    const qs = listeningCandidates(sources, { words: {}, completedEvents: ['event_002'] }, seeded(1)).filter((q) => q.kind === 'reply')
    expect(qs).toHaveLength(1)
    expect(qs[0]).toMatchObject({ key: 'reply:cafe_001#0', chapter: 3, audio: { korean: '뭐 드릴까요?' }, answers: ['커피 주세요.', '녹차 주세요.'] })
    expect(qs[0]?.options).toHaveLength(3)
  })

  it('リスニングの文は、afterEvent のイベントを終えてから出す', () => {
    expect(listeningCandidates(sources, { words: {}, completedEvents: [] }, seeded(1))).toEqual([])
    const qs = listeningCandidates(sources, { words: {}, completedEvents: ['event_002'] }, seeded(1)).filter((q) => q.kind === 'sentence')
    expect(qs).toHaveLength(1)
    expect(qs[0]).toMatchObject({ key: 'sentence:listen_001', chapter: 3, answers: ['커피 주세요.'] })
  })
})

describe('buildListeningRound', () => {
  const all = listeningCandidates(sources, { words: learnedAll, completedEvents: ['event_002'] }, seeded(2))

  it('指定した数だけ選び、種類がかたよらない', () => {
    const round = buildListeningRound(all, new Set(), 3, seeded(3))
    expect(round).toHaveLength(3)
    expect(new Set(round.map((q) => q.kind))).toEqual(new Set(['word', 'reply', 'sentence']))
  })

  it('まだ正解していない問題を先に出す', () => {
    const answered = new Set(['word:vocab_001', 'word:vocab_002', 'word:vocab_003', 'word:vocab_004'])
    for (let seed = 1; seed <= 10; seed++) {
      const words = buildListeningRound(all, answered, 3, seeded(seed)).filter((q) => q.kind === 'word')
      expect(words.map((q) => q.key)).toEqual([listeningKey('word', 'vocab_005')])
    }
  })

  it('候補が足りなければ、あるだけ出す', () => {
    expect(buildListeningRound(all, new Set(), 50, seeded(1))).toHaveLength(all.length)
    expect(buildListeningRound([], new Set(), 5, seeded(1))).toEqual([])
  })
})

describe('isListeningCorrect', () => {
  it('正解が複数ある返事の問題は、どれでも正解', () => {
    const q: ListeningQuestion = { kind: 'reply', key: 'k', chapter: 1, audio: { korean: 'a', pronunciation: 'ア', japanese: 'a' }, options: [], answers: ['커피 주세요.', '녹차 주세요.'] }
    expect(isListeningCorrect(q, '녹차 주세요.')).toBe(true)
    expect(isListeningCorrect(q, '안녕히 계세요.')).toBe(false)
  })
})
