import { describe, expect, it } from 'vitest'
import type { HangulLesson, Vocab } from '../../data/types'
import { composeSyllable, splitSyllable } from './jamo'
import { buildQuiz, isCorrectAnswer, questionAnswer, questionCandidates, quizScore, readingItems, shuffle, type HangulQuestion } from './quiz'

/** 種を固定した乱数（mulberry32） */
function seeded(seed: number) {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const base = { titleJa: 'レッスン', introJa: ['説明'], letters: [], finals: [], rules: [], words: [], vocabulary: [], reviewed: false }

const vowels: HangulLesson = {
  ...base,
  id: 'hangul_001',
  order: 1,
  kind: 'letters',
  letters: [
    { jamo: 'ㅏ', sounds: [{ korean: '아', pronunciation: 'ア' }], tipJa: 'ア' },
    { jamo: 'ㅓ', sounds: [{ korean: '어', pronunciation: 'オ' }], tipJa: 'オ', confusableWith: ['ㅗ'] },
    { jamo: 'ㅗ', sounds: [{ korean: '오', pronunciation: 'オ' }], tipJa: 'オ', confusableWith: ['ㅓ'] },
    { jamo: 'ㅜ', sounds: [{ korean: '우', pronunciation: 'ウ' }], tipJa: 'ウ' },
    { jamo: 'ㅣ', sounds: [{ korean: '이', pronunciation: 'イ' }], tipJa: 'イ' },
  ],
  words: [
    { id: 'hword_001', korean: '아이', pronunciation: 'アイ', japanese: '子ども' },
    { id: 'hword_002', korean: '오이', pronunciation: 'オイ', japanese: 'きゅうり' },
    { id: 'hword_003', korean: '이', pronunciation: 'イ', japanese: '歯' },
  ],
}

const consonants: HangulLesson = {
  ...base,
  id: 'hangul_002',
  order: 2,
  kind: 'letters',
  letters: [
    { jamo: 'ㄱ', sounds: [{ korean: '가', pronunciation: 'カ' }], tipJa: 'カ' },
    { jamo: 'ㄴ', sounds: [{ korean: '나', pronunciation: 'ナ' }], tipJa: 'ナ' },
    { jamo: 'ㅁ', sounds: [{ korean: '마', pronunciation: 'マ' }], tipJa: 'マ' },
  ],
  words: [{ id: 'hword_004', korean: '나무', pronunciation: 'ナム', japanese: '木' }],
}

const batchim: HangulLesson = {
  ...base,
  id: 'hangul_003',
  order: 3,
  kind: 'batchim',
  finals: [
    { sound: 'ㄱ', letters: ['ㄱ'], sounds: [{ korean: '악', pronunciation: 'アク' }], tipJa: 'ク' },
    { sound: 'ㄴ', letters: ['ㄴ'], sounds: [{ korean: '안', pronunciation: 'アン' }], tipJa: 'ン' },
    { sound: 'ㅁ', letters: ['ㅁ'], sounds: [{ korean: '암', pronunciation: 'アム' }], tipJa: 'ム' },
  ],
  words: [{ id: 'hword_005', korean: '눈', pronunciation: 'ヌン', japanese: '目' }],
}

const soundChange: HangulLesson = {
  ...base,
  id: 'hangul_004',
  order: 4,
  kind: 'soundChange',
  rules: [{ titleJa: '連音化', explanationJa: '説明', examples: [{ korean: '눈이', spoken: '누니', pronunciation: 'ヌニ', japanese: '目が' }] }],
}

const vocab: Vocab = { id: 'vocab_001', korean: '아니요', pronunciation: 'アニヨ', japanese: 'いいえ', partOfSpeech: 'interjection', genre: 'greeting', level: 1, reviewed: true }
const reading: HangulLesson = { ...base, id: 'hangul_005', order: 5, kind: 'reading', vocabulary: ['vocab_001'] }

const all = [vowels, consonants, batchim, soundChange, reading]
const findVocab = (id: string) => (id === vocab.id ? vocab : undefined)
const ofKind = <K extends HangulQuestion['kind']>(qs: HangulQuestion[], kind: K) => qs.filter((q): q is Extract<HangulQuestion, { kind: K }> => q.kind === kind)

describe('composeSyllable', () => {
  it('字母から音節を組み立て、分けた結果と一致する', () => {
    expect(composeSyllable('ㄱ', 'ㅏ')).toBe('가')
    expect(composeSyllable('ㅇ', 'ㅓ', 'ㅄ')).toBe('없')
    for (const ch of ['힣', '와', '깎', '아']) {
      const s = splitSyllable(ch)
      expect(s && composeSyllable(s.initial, s.medial, s.final)).toBe(ch)
    }
  })

  it('組み立てられない字母なら null', () => {
    expect(composeSyllable('ㅏ', 'ㅏ')).toBeNull()
    expect(composeSyllable('ㄱ', 'ㄱ')).toBeNull()
    expect(composeSyllable('ㄱ', 'ㅏ', 'ㄸ')).toBeNull()
  })
})

describe('shuffle', () => {
  it('要素は変えずに並べ替える', () => {
    expect(shuffle([1, 2, 3, 4, 5], seeded(1)).sort()).toEqual([1, 2, 3, 4, 5])
  })
})

describe('questionCandidates', () => {
  it('母音の「聞いて選ぶ」問題は、同じ子音で母音だけ違う音節を選択肢にし、まぎらわしい字母を優先する', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const qs = ofKind(questionCandidates(vowels, [vowels], findVocab, true, seeded(seed)), 'listen')
      expect(qs).toHaveLength(vowels.letters.length)
      for (const q of qs) {
        expect(q.options).toContain(q.korean)
        expect(new Set(q.options).size).toBe(q.options.length)
        expect(q.options).toHaveLength(3)
        for (const o of q.options) expect(splitSyllable(o)?.initial).toBe('ㅇ')
      }
      const eo = qs.find((q) => q.korean === '어')
      expect(eo?.options).toContain('오')
    }
  })

  it('子音の「聞いて選ぶ」問題は、母音が同じで子音だけ違う音節を選択肢にする', () => {
    const qs = ofKind(questionCandidates(consonants, [vowels, consonants], findVocab, true, seeded(3)), 'listen')
    for (const q of qs) {
      const medial = splitSyllable(q.korean)?.medial
      for (const o of q.options) expect(splitSyllable(o)?.medial).toBe(medial)
    }
  })

  it('パッチムの「聞いて選ぶ」問題は、パッチムだけ違う音節を選択肢にする', () => {
    const qs = ofKind(questionCandidates(batchim, [vowels, consonants, batchim], findVocab, true, seeded(5)), 'listen')
    expect(qs).toHaveLength(3)
    for (const q of qs) {
      for (const o of q.options) expect(splitSyllable(o)).toMatchObject({ initial: 'ㅇ', medial: 'ㅏ' })
    }
  })

  it('読み（カタカナ）を選ぶ問題では、同じカタカナの選択肢を並べない（ㅓ と ㅗ）', () => {
    for (let seed = 1; seed <= 30; seed++) {
      for (const q of ofKind(questionCandidates(vowels, [vowels], findVocab, true, seeded(seed)), 'reading')) {
        expect(new Set(q.options).size).toBe(q.options.length)
        expect(q.options).toContain(q.answer)
      }
    }
  })

  it('読み上げが使えないときは、聞いて選ぶ問題を作らない', () => {
    const qs = questionCandidates(vowels, [vowels], findVocab, false, seeded(1))
    expect(ofKind(qs, 'listen')).toEqual([])
    expect(ofKind(qs, 'reading').length).toBeGreaterThan(0)
  })

  it('音の変化の問題は、書いたとおりの形をまぎらわしい選択肢に入れる', () => {
    const [q] = ofKind(questionCandidates(soundChange, all.slice(0, 4), findVocab, true, seeded(1)), 'spoken')
    expect(q?.answer).toBe('누니')
    expect(q?.options).toContain('눈이')
  })

  it('reading のレッスンは、教材の単語（vocabulary）を読む問題にする', () => {
    expect(readingItems(reading, findVocab)).toEqual([{ korean: '아니요', pronunciation: 'アニヨ', japanese: 'いいえ' }])
    const qs = questionCandidates(reading, all, findVocab, true, seeded(1))
    expect(qs.some((q) => q.kind === 'reading' && q.korean === '아니요')).toBe(true)
    expect(qs.some((q) => q.kind === 'build' && q.korean === '아니요')).toBe(true)
  })

  it('まぎらわしい選択肢を作れない問題は出さない', () => {
    const lonely: HangulLesson = { ...vowels, letters: [{ jamo: 'ㅏ', sounds: [{ korean: '아', pronunciation: 'ア' }], tipJa: 'ア' }], words: [{ id: 'hword_001', korean: '아', pronunciation: 'ア', japanese: 'ああ' }] }
    const qs = questionCandidates(lonely, [lonely], findVocab, true, seeded(1))
    expect(qs.map((q) => q.kind).sort()).toEqual(['build', 'build'])
  })
})

describe('buildQuiz', () => {
  it('指定した数だけ、いろいろな種類の問題を選ぶ', () => {
    const quiz = buildQuiz(vowels, all, findVocab, { count: 8, audio: true, random: seeded(7) })
    expect(quiz).toHaveLength(8)
    expect(new Set(quiz.map((q) => q.kind)).size).toBeGreaterThanOrEqual(3)
  })

  it('候補が足りなければ、あるだけ出す', () => {
    const quiz = buildQuiz(soundChange, all, findVocab, { count: 8, audio: true, random: seeded(7) })
    expect(quiz).toHaveLength(1)
  })

  it('同じ種を使えば同じ問題になる', () => {
    const a = buildQuiz(vowels, all, findVocab, { count: 8, audio: true, random: seeded(9) })
    const b = buildQuiz(vowels, all, findVocab, { count: 8, audio: true, random: seeded(9) })
    expect(a).toEqual(b)
  })
})

describe('答えの判定と点数', () => {
  it('選ぶ問題は正解の選択肢と同じなら正解', () => {
    const q: HangulQuestion = { kind: 'reading', korean: '아', answer: 'ア', options: ['ア', 'イ'] }
    expect(isCorrectAnswer(q, 'ア')).toBe(true)
    expect(isCorrectAnswer(q, 'イ')).toBe(false)
    expect(questionAnswer({ kind: 'listen', korean: '아', options: ['아', '어'] })).toBe('아')
  })

  it('組み立てる問題は、空白や前後の空白の違いを無視する', () => {
    const q: HangulQuestion = { kind: 'build', korean: '나무', reading: 'ナム' }
    expect(isCorrectAnswer(q, ' 나 무 ')).toBe(true)
    expect(isCorrectAnswer(q, '나모')).toBe(false)
  })

  it('点数は四捨五入、合否は基準以上で合格', () => {
    expect(quizScore(7, 8, 80)).toEqual({ score: 88, passed: true })
    expect(quizScore(6, 8, 80)).toEqual({ score: 75, passed: false })
    expect(quizScore(4, 5, 80)).toEqual({ score: 80, passed: true })
    expect(quizScore(0, 0, 80)).toEqual({ score: 0, passed: false })
  })
})
