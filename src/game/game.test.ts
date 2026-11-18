import { describe, expect, it } from 'vitest'
import type { Balance, GameEvent } from '../data/types'
import { createNewSave, type SaveData } from '../storage/saveData'
import { allEventsCompleted, completedEventsAt, nextEvent, nextEventAt } from './events/events'
import { advanceEvent, clearConversation, learnItems, startEvent } from './progression/progression'

const T0 = '2026-11-18T10:00:00.000Z'
const T1 = '2026-11-18T10:05:00.000Z'

const balance: Balance = {
  xp: { learnWord: 2, conversationChoice: 10, conversationWrite: 15, eventComplete: 20 },
  furiganaAlwaysUntilChapter: 3,
  initialLocations: ['home', 'cafe'],
  startLocation: 'home',
  writeAttemptsBeforeReveal: 2,
}

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
    let save = startEvent(createNewSave(T0), 'event_001', T1)
    expect(save.progress.activeEvent).toEqual({ id: 'event_001', step: 0 })
    save = advanceEvent(save, events[0] as GameEvent, balance, T1).save
    expect(startEvent(save, 'event_001', T1).progress.activeEvent).toEqual({ id: 'event_001', step: 1 })
  })

  it('最後の段階を終えるとイベントが完了し、経験値が付く', () => {
    const event = events[0] as GameEvent
    let save = startEvent(createNewSave(T0), event.id, T0)
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

  it('会話は、選んで・書いて、それぞれ初めて正解したときだけ経験値が付く', () => {
    const c1 = clearConversation(createNewSave(T0), 'cafe_001', 'choice', balance, T1)
    expect(c1.reward.xp).toBe(10)
    const c2 = clearConversation(c1.save, 'cafe_001', 'choice', balance, T1)
    expect(c2.reward.xp).toBe(0)
    const c3 = clearConversation(c2.save, 'cafe_001', 'write', balance, T1)
    expect(c3.reward.xp).toBe(15)
    expect(c3.save.learning.conversations['cafe_001']).toEqual({ choice: true, write: true })
    expect(c3.save.stats.xp).toBe(25)
  })

  it('「答えを見る」で進んだ会話には経験値も記録も付けない', () => {
    const save = createNewSave(T0)
    expect(clearConversation(save, 'cafe_001', 'revealed', balance, T1)).toEqual({ save, reward: { xp: 0, newWords: 0 } })
  })
})
