import { describe, expect, it } from 'vitest'
import type { Balance, GameEvent } from '../data/types'
import { DEFAULT_BALANCE } from '../data/validate'
import { daysBetween } from '../learning/review/dates'
import { isMastered } from '../learning/review/review'
import { createNewSave, type SaveData } from '../storage/saveData'
import { allEventsCompleted, backgroundAt, completedEventsAt, conversationsOf, eventsOfDay, nextEvent, nextEventAt, playableStep, resumeStep, stepProgress, vocabularyOf } from './events/events'
import { advanceEvent, answerReview, clearConversationTurn, learnItems, passHangulLesson, recordListeningCorrect, startEvent } from './progression/progression'

const T0 = '2026-11-18T10:00:00.000Z'
const T1 = '2026-11-18T10:05:00.000Z'

const balance: Balance = DEFAULT_BALANCE

const ev = (id: string, location: string, requires: string[], steps = 2): GameEvent => ({
  id,
  chapter: 1,
  location,
  requires,
  objectiveJa: `${id}の目標`,
  actionJa: '始める',
  steps: Array.from({ length: steps }, (_, i) => ({ type: 'message' as const, textJa: `${i}` })),
})

const events = [ev('event_001', 'home', []), ev('event_002', 'cafe', ['event_001']), ev('event_003', 'home', ['event_002'], 1)]

function withProgress(progress: Partial<SaveData['progress']>): SaveData {
  const save = createNewSave(T0)
  return { ...save, progress: { ...save.progress, ...progress } }
}

describe('イベントの進み具合', () => {
  it('最初は前提のないイベントだけを始められる', () => {
    const p = createNewSave(T0).progress
    expect(nextEvent(events, p)?.id).toBe('event_001')
    expect(nextEventAt(events, p, 'home')?.id).toBe('event_001')
    expect(nextEventAt(events, p, 'cafe')).toBeUndefined()
  })

  it('前提を終えると次のイベントを始められる', () => {
    const p = withProgress({ completedEvents: ['event_001'] }).progress
    expect(nextEventAt(events, p, 'home')).toBeUndefined()
    expect(nextEventAt(events, p, 'cafe')?.id).toBe('event_002')
  })

  it('途中のイベントがあれば、それだけを進められる', () => {
    const p = withProgress({ activeEvent: { id: 'event_001', step: 1 } }).progress
    expect(nextEvent(events, p)?.id).toBe('event_001')
    expect(nextEventAt(events, p, 'cafe')).toBeUndefined()
  })

  it('途中のイベントがデータからなくなっていたら、次の未完了のイベントにする', () => {
    const p = withProgress({ activeEvent: { id: 'event_099', step: 1 } }).progress
    expect(nextEvent(events, p)?.id).toBe('event_001')
  })

  it('終えたイベントを施設ごとに一覧にでき、すべて終えたかが分かる', () => {
    const p = withProgress({ completedEvents: ['event_001', 'event_002', 'event_003'] }).progress
    expect(completedEventsAt(events, p, 'home').map((e) => e.id)).toEqual(['event_001', 'event_003'])
    expect(nextEvent(events, p)).toBeUndefined()
    expect(allEventsCompleted(events, p)).toBe(true)
  })
})

describe('進行と経験値', () => {
  it('イベントを始めると段階0から。途中のものを始め直しても段階は保つ', () => {
    let save = startEvent(createNewSave(T0), events[0] as GameEvent, T1)
    expect(save.progress.activeEvent).toEqual({ id: 'event_001', step: 0 })
    save = advanceEvent(save, events[0] as GameEvent, balance, T1).save
    expect(startEvent(save, events[0] as GameEvent, T1).progress.activeEvent).toEqual({ id: 'event_001', step: 1 })
  })

  it('最後の段階を終えるとイベントが完了し、経験値が付く', () => {
    const event = events[0] as GameEvent
    let save = startEvent(createNewSave(T0), event, T0)
    const r1 = advanceEvent(save, event, balance, T1)
    expect(r1.finished).toBe(false)
    save = r1.save
    const r2 = advanceEvent(save, event, balance, T1)
    expect(r2.finished).toBe(true)
    expect(r2.reward.xp).toBe(20)
    expect(r2.save.progress).toMatchObject({ completedEvents: ['event_001'], activeEvent: null })
    expect(r2.save.stats.xp).toBe(20)
  })

  it('途中ではないイベントは進めない', () => {
    const save = createNewSave(T0)
    expect(advanceEvent(save, events[0] as GameEvent, balance, T1)).toEqual({ save, reward: { xp: 0, newWords: 0 }, finished: false })
  })

  it('単語は初めて覚えたときだけ図鑑に入り、経験値が付く', () => {
    const first = learnItems(createNewSave(T0), { vocabulary: ['vocab_001', 'vocab_002'], grammar: ['grammar_001'] }, 3, balance, T1)
    expect(first.reward).toEqual({ xp: 4, newWords: 2 })
    expect(first.save.learning.words['vocab_001']).toEqual({ learnedAt: T1, chapter: 3 })
    expect(first.save.learning.grammar['grammar_001']).toEqual({ learnedAt: T1, chapter: 3 })

    const again = learnItems(first.save, { vocabulary: ['vocab_002', 'vocab_003'], grammar: ['grammar_001'] }, 1, balance, '2026-11-19T00:00:00.000Z')
    expect(again.reward).toEqual({ xp: 2, newWords: 1 })
    expect(again.save.learning.words['vocab_002']).toEqual({ learnedAt: T1, chapter: 3 })
    expect(again.save.stats.xp).toBe(6)
  })

  it('会話は往復ごとに、選んで・書いて、それぞれ初めて正解したときだけ経験値が付く', () => {
    const c1 = clearConversationTurn(createNewSave(T0), 'cafe_001', 0, 'choice', balance, T1)
    expect(c1.reward.xp).toBe(10)
    const c2 = clearConversationTurn(c1.save, 'cafe_001', 0, 'choice', balance, T1)
    expect(c2.reward.xp).toBe(0)
    expect(c2.save).toBe(c1.save)
    const c3 = clearConversationTurn(c2.save, 'cafe_001', 0, 'write', balance, T1)
    expect(c3.reward.xp).toBe(15)
    expect(c3.save.learning.conversations['cafe_001#0']).toEqual({ choice: true, write: true })
    expect(c3.save.stats.xp).toBe(25)
    const c4 = clearConversationTurn(c3.save, 'cafe_001', 1, 'choice', balance, T1)
    expect(c4.reward.xp).toBe(10)
    expect(c4.save.learning.conversations['cafe_001#1']).toEqual({ choice: true, write: false })
  })

  it('「答えを見る」で進んだ会話には経験値も正解の記録も付けず、「間違えた」として翌日の復習に入れる', () => {
    const save = createNewSave(T0)
    const result = clearConversationTurn(save, 'cafe_001', 0, 'revealed', balance, T1)
    expect(result.reward).toEqual({ xp: 0, newWords: 0 })
    expect(result.save.stats.xp).toBe(0)
    expect(result.save.learning.conversations).toEqual({})
    expect(result.save.learning.review).toEqual({ 'turn:cafe_001#0': { stage: 0, due: '2026-11-19', correct: 0, wrong: 1, lastAt: null } })
  })

  it('正解した往復と、初めて覚えた単語・文法は、翌日の復習に入る（すでにある記録は変えない）', () => {
    const learned = learnItems(createNewSave(T0), { vocabulary: ['vocab_001'], grammar: ['grammar_001'] }, 1, balance, T0).save
    expect(Object.keys(learned.learning.review).sort()).toEqual(['grammar:grammar_001', 'word:vocab_001'])
    expect(learned.learning.review['word:vocab_001']?.due).toBe('2026-11-19')
    const cleared = clearConversationTurn(learned, 'cafe_001', 1, 'choice', balance, T1).save
    expect(cleared.learning.review['turn:cafe_001#1']).toEqual({ stage: 0, due: '2026-11-19', correct: 0, wrong: 0, lastAt: null })
    const again = clearConversationTurn(cleared, 'cafe_001', 1, 'write', balance, '2026-11-25T10:00:00.000Z').save
    expect(again.learning.review['turn:cafe_001#1']?.due).toBe('2026-11-19')
  })
})

describe('復習の問題に答える（answerReview）', () => {
  const key = 'word:vocab_001'
  const learned = learnItems(createNewSave(T0), { vocabulary: ['vocab_001'], grammar: [] }, 1, balance, T0).save
  const day = (d: string) => `2026-11-${d}T03:00:00.000Z`

  it('期限前の今日の復習・練習で正解しても、予定は変わらない', () => {
    expect(answerReview(learned, key, true, 'review', balance, day('18')).save).toBe(learned)
    expect(answerReview(learned, key, true, 'practice', balance, day('25')).save).toBe(learned)
  })

  it('期限の来た今日の復習で正解すると、間隔を延ばして経験値（1日 → 3日 → 7日 → 14日 → 30日）。14日の間隔で正解したら「覚えた」', () => {
    let save = learned
    let today = '2026-11-19'
    const gaps: number[] = []
    const mastered: boolean[] = []
    for (let i = 0; i < 5; i++) {
      const result = answerReview(save, key, true, 'review', balance, `${today}T03:00:00.000Z`)
      expect(result.reward.xp).toBe(balance.xp.review)
      save = result.save
      const record = save.learning.review[key]
      if (record === undefined) throw new Error('記録がない')
      gaps.push(daysBetween(today, record.due))
      mastered.push(isMastered(record, balance.review))
      today = record.due
    }
    expect(gaps).toEqual([3, 7, 14, 30, 30])
    expect(mastered).toEqual([false, false, false, true, true])
    expect(save.learning.review[key]).toMatchObject({ stage: 5, correct: 5, wrong: 0 })
  })

  it('期限の来た今日の復習で間違えると、翌日に戻す（経験値なし）', () => {
    const result = answerReview(learned, key, false, 'review', balance, day('19'))
    expect(result.reward.xp).toBe(0)
    expect(result.save.learning.review[key]).toMatchObject({ stage: 0, due: '2026-11-20', wrong: 1, lastAt: day('19') })
  })

  it('練習で間違えると、翌日の復習に戻す。今日の復習の上限には数えない（lastAt は変えない）', () => {
    const result = answerReview(learned, key, false, 'practice', balance, day('25'))
    expect(result.reward.xp).toBe(0)
    expect(result.save.learning.review[key]).toMatchObject({ stage: 0, due: '2026-11-26', wrong: 1, lastAt: null })
  })

  it('記録のない問題（ドリルなど）を間違えると、新しく復習に入れる', () => {
    expect(answerReview(learned, 'drill:dq_001', false, 'practice', balance, day('25')).save.learning.review['drill:dq_001']).toEqual({ stage: 0, due: '2026-11-26', correct: 0, wrong: 1, lastAt: null })
    expect(answerReview(learned, 'drill:dq_001', true, 'practice', balance, day('25')).save).toBe(learned)
  })
})

describe('1日のまとめ', () => {
  const day = (id: string, steps: GameEvent['steps']): GameEvent => ({ ...ev(id, 'home', []), steps })
  const list = [
    day('event_001', [{ type: 'learn', vocabulary: ['vocab_001', 'vocab_002'], grammar: [] }, { type: 'conversation', id: 'home_001' }]),
    day('event_002', [{ type: 'learn', vocabulary: ['vocab_002', 'vocab_003'], grammar: ['grammar_001'] }]),
    day('event_003', [{ type: 'dayEnd', textJa: '1日目おわり' }]),
    day('event_004', [{ type: 'learn', vocabulary: ['vocab_004'], grammar: [] }, { type: 'conversation', id: 'cafe_005' }]),
    day('event_005', [{ type: 'dayEnd', textJa: '2日目おわり' }]),
  ]

  it('その日のイベントは、前の1日の終わりの次から', () => {
    expect(eventsOfDay(list, 'event_003').map((e) => e.id)).toEqual(['event_001', 'event_002', 'event_003'])
    expect(eventsOfDay(list, 'event_005').map((e) => e.id)).toEqual(['event_004', 'event_005'])
    expect(eventsOfDay(list, 'event_999')).toEqual([])
  })

  it('その日に覚えた単語（重複なし）と会話', () => {
    const today = eventsOfDay(list, 'event_003')
    expect(vocabularyOf(today)).toEqual(['vocab_001', 'vocab_002', 'vocab_003'])
    expect(conversationsOf(today)).toEqual(['home_001'])
  })
})

describe('背景を切り替える段階（background）', () => {
  const msg = { type: 'message', textJa: 'a' } as const
  // 0 message, 1 background(entrance), 2 message, 3 message, 4 background(home), 5 message
  const event: GameEvent = {
    id: 'event_010',
    chapter: 1,
    location: 'home',
    requires: [],
    objectiveJa: 'x',
    actionJa: 'y',
    steps: [msg, { type: 'background', id: 'entrance' }, msg, msg, { type: 'background', id: 'home' }, msg],
  }

  it('切り替えた背景は、次の切り替えまで続く。切り替える前は施設の背景', () => {
    expect([0, 1, 2, 3, 4, 5].map((i) => backgroundAt(event, i))).toEqual(['home', 'home', 'entrance', 'entrance', 'entrance', 'home'])
  })

  it('background の段階は飛ばして進む', () => {
    let save = startEvent(createNewSave(T0), event, T0)
    expect(save.progress.activeEvent?.step).toBe(0)
    const steps: number[] = []
    for (let i = 0; i < 10; i++) {
      const r = advanceEvent(save, event, balance, T1)
      save = r.save
      if (r.finished) break
      steps.push(save.progress.activeEvent?.step ?? -1)
    }
    expect(steps).toEqual([2, 3, 5])
    expect(save.progress.completedEvents).toEqual(['event_010'])
  })

  it('最初の段階が background なら、その次から始める', () => {
    const first: GameEvent = { ...event, steps: [{ type: 'background', id: 'entrance' }, msg] }
    expect(startEvent(createNewSave(T0), first, T0).progress.activeEvent).toEqual({ id: 'event_010', step: 1 })
    expect(backgroundAt(first, 1)).toBe('entrance')
  })

  it('セーブデータの段階が background や範囲外を指していても、画面に出す段階から再開する（教材が変わった場合）', () => {
    expect(playableStep(event, 1)).toBe(2)
    expect(resumeStep(event, 4)).toBe(5)
    expect(resumeStep(event, 99)).toBe(5)
    expect(resumeStep(event, -1)).toBe(0)
    const old = { ...createNewSave(T0), progress: { ...createNewSave(T0).progress, activeEvent: { id: 'event_010', step: 4 } } }
    expect(startEvent(old, event, T1).progress.activeEvent).toEqual({ id: 'event_010', step: 5 })
  })

  it('進み具合の表示では background を数えない', () => {
    expect(stepProgress(event, 0)).toEqual({ done: 0, total: 4 })
    expect(stepProgress(event, 3)).toEqual({ done: 2, total: 4 })
  })
})

describe('ハングルのレッスンとリスニングの記録', () => {
  it('小テストに初めて合格したときだけ経験値を付け、点が上がったときだけ記録を更新する', () => {
    const save = createNewSave(T0)
    const first = passHangulLesson(save, 'hangul_001', 80, balance, T1)
    expect(first.reward.xp).toBe(balance.xp.hangulLesson)
    expect(first.save.learning.hangul['hangul_001']).toEqual({ passedAt: T1, bestScore: 80 })
    expect(first.save.stats.xp).toBe(balance.xp.hangulLesson)

    const lower = passHangulLesson(first.save, 'hangul_001', 75, balance, '2026-11-19T00:00:00.000Z')
    expect(lower.save).toBe(first.save)
    expect(lower.reward.xp).toBe(0)

    const higher = passHangulLesson(first.save, 'hangul_001', 100, balance, '2026-11-19T00:00:00.000Z')
    expect(higher.reward.xp).toBe(0)
    expect(higher.save.learning.hangul['hangul_001']).toEqual({ passedAt: T1, bestScore: 100 })
    expect(higher.save.stats.xp).toBe(balance.xp.hangulLesson)
  })

  it('リスニングの問題は、初めて正解したときだけ経験値を付ける', () => {
    const first = recordListeningCorrect(createNewSave(T0), 'word:vocab_001', balance, T1)
    expect(first.reward.xp).toBe(balance.xp.listening)
    expect(first.save.learning.listening['word:vocab_001']).toEqual({ correctAt: T1 })
    const again = recordListeningCorrect(first.save, 'word:vocab_001', balance, T1)
    expect(again.save).toBe(first.save)
    expect(again.reward.xp).toBe(0)
  })
})
