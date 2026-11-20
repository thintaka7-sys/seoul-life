import { describe, expect, it } from 'vitest'
import type { ChapterTest, Conversation, GameEvent } from '../../data/types'
import { DEFAULT_BALANCE } from '../../data/validate'
import { createNewSave } from '../../storage/saveData'
import { answerDrillItem, finishChapterTest, stampToday } from '../progression/progression'
import { chapterTestKeys, pickTestKeys, testProgress, testSettings } from '../tests/chapterTest'
import { currentStreak, monthGrid, shiftMonth, withStamp } from './stamps'

const balance = DEFAULT_BALANCE
const at = (date: string) => `${date}T12:00:00`

describe('スタンプ', () => {
  it('1日1つ。日付の順に並べる', () => {
    expect(withStamp(['2026-11-20'], '2026-11-18')).toEqual(['2026-11-18', '2026-11-20'])
    expect(withStamp(['2026-11-20'], '2026-11-20')).toEqual(['2026-11-20'])
  })

  it('続いている日数：今日押していなくても、昨日まで続いていれば数える。休んだら途切れる（スタンプは消えない）', () => {
    const stamps = ['2026-11-10', '2026-11-18', '2026-11-19', '2026-11-20']
    expect(currentStreak(stamps, '2026-11-20')).toBe(3)
    expect(currentStreak(stamps, '2026-11-21')).toBe(3)
    expect(currentStreak(stamps, '2026-11-22')).toBe(0)
    expect(currentStreak(['2026-11-30', '2026-12-01'], '2026-12-01')).toBe(2)
  })

  it('カレンダー：日曜始まり、前後の月の日は空ける', () => {
    const weeks = monthGrid(2026, 11)
    expect(weeks[0]).toEqual(['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07'])
    expect(weeks.at(-1)).toEqual(['2026-11-29', '2026-11-30', null, null, null, null, null])
    expect(monthGrid(2026, 12)[0]?.slice(0, 2)).toEqual([null, null])
    expect(shiftMonth(2026, 12, 1)).toEqual({ year: 2027, month: 1 })
    expect(shiftMonth(2027, 1, -1)).toEqual({ year: 2026, month: 12 })
  })

  it('決めた学習を終えたら今日のスタンプを押す（1日1つ。stampActivities にない学習では押さない）', () => {
    const save = createNewSave(at('2026-11-20'))
    const first = stampToday(save, 'drill', balance, at('2026-11-20'))
    expect(first.stamped).toBe(true)
    expect(first.save.daily.stamps).toEqual(['2026-11-20'])
    expect(stampToday(first.save, 'review', balance, at('2026-11-20')).stamped).toBe(false)
    expect(stampToday(first.save, 'review', balance, at('2026-11-21')).save.daily.stamps).toEqual(['2026-11-20', '2026-11-21'])
    expect(stampToday(save, 'drill', { ...balance, stampActivities: ['review'] }, at('2026-11-20')).stamped).toBe(false)
  })
})

describe('基礎ドリルの記録', () => {
  it('初めて正解したときだけ経験値。間違えたら翌日の復習へ', () => {
    const save = createNewSave(at('2026-11-20'))
    const first = answerDrillItem(save, 'dq_001', true, balance, at('2026-11-20'))
    expect(first.reward.xp).toBe(balance.xp.drillItem)
    expect(first.save.learning.drills['dq_001']).toEqual({ correctAt: at('2026-11-20') })
    expect(answerDrillItem(first.save, 'dq_001', true, balance, at('2026-11-21')).save).toBe(first.save)
    const wrong = answerDrillItem(first.save, 'dq_002', false, balance, at('2026-11-20'))
    expect(wrong.reward.xp).toBe(0)
    expect(wrong.save.learning.review['drill:dq_002']).toMatchObject({ due: '2026-11-21', wrong: 1 })
  })
})

describe('章末テスト', () => {
  const conversations: Conversation[] = [
    {
      id: 'home_005',
      chapter: 1,
      location: 'home',
      character: 'neighbor',
      reviewed: true,
      turns: [
        { task: 'あいさつ', lines: [], choices: [{ korean: '안녕하세요.', pronunciation: 'アンニョンハセヨ', japanese: 'こんにちは。', correct: true }] },
        { kind: 'decision', lines: [], choices: [{ korean: '네.', pronunciation: 'ネ', japanese: 'はい。', correct: false, reply: [] }] },
        { task: 'お礼', lines: [], choices: [{ korean: '감사합니다.', pronunciation: 'カムサハムニダ', japanese: 'ありがとう。', correct: true }] },
        { lines: [{ speaker: 'neighbor', korean: '네.', pronunciation: 'ネ', japanese: 'はい。' }] },
      ],
    },
    { id: 'cafe_008', chapter: 3, location: 'cafe', character: 'cafe_staff', reviewed: true, turns: [{ task: '注文', lines: [], choices: [{ korean: '커피 주세요.', pronunciation: 'コピ ジュセヨ', japanese: 'コーヒーを。', correct: true }] }] },
  ]
  const events: GameEvent[] = [
    { id: 'event_001', chapter: 1, location: 'home', requires: [], objectiveJa: '目標', actionJa: '始める', steps: [{ type: 'learn', vocabulary: ['vocab_001', 'vocab_002'], grammar: ['grammar_001'] }] },
    { id: 'event_002', chapter: 3, location: 'cafe', requires: [], objectiveJa: '目標', actionJa: '始める', steps: [{ type: 'learn', vocabulary: ['vocab_012'], grammar: [] }] },
  ]
  const test: ChapterTest = { id: 'test_001', chapter: 1, titleJa: '第1章のテスト', reviewed: true, items: [{ id: 'dq_201', korean: '아니요', pronunciation: 'アニヨ', japanese: 'いいえ' }] }

  it('その章の会話の問題の往復（選択の往復は除く）に、すべて答えたら受けられる', () => {
    expect(testProgress(test, conversations, {})).toEqual({ answered: 0, total: 2, unlocked: false })
    expect(testProgress(test, conversations, { 'home_005#0': { choice: true, write: false } })).toEqual({ answered: 1, total: 2, unlocked: false })
    expect(testProgress(test, conversations, { 'home_005#0': { choice: true, write: false }, 'home_005#2': { choice: false, write: true } })).toEqual({ answered: 2, total: 2, unlocked: true })
    expect(testProgress({ ...test, chapter: 5 }, conversations, {}).unlocked).toBe(false)
  })

  it('問題のもと：その章のイベントの単語・文法、会話の問題の往復、追加の問題', () => {
    expect(chapterTestKeys(test, { events, conversations }).sort()).toEqual(['drill:dq_201', 'grammar:grammar_001', 'turn:home_005#0', 'turn:home_005#2', 'word:vocab_001', 'word:vocab_002'].sort())
  })

  it('種類がかたよらないように選ぶ（あるだけ）', () => {
    const keys = chapterTestKeys(test, { events, conversations })
    let seed = 0.37
    const random = () => (seed = (seed * 9301 + 0.49297) % 1)
    const four = pickTestKeys(keys, 4, random)
    expect(new Set(four.map((k) => k.split(':')[0]))).toEqual(new Set(['word', 'grammar', 'turn', 'drill']))
    expect(pickTestKeys(keys, 50, random)).toHaveLength(keys.length)
  })

  it('問題数と合格の基準は、省略したら balance の値', () => {
    expect(testSettings(test, balance)).toEqual({ count: 10, passPercent: 80 })
    expect(testSettings({ ...test, questionCount: 5, passPercent: 60 }, balance)).toEqual({ count: 5, passPercent: 60 })
  })

  it('初めて合格したときだけ経験値。いちばん良い点を残す', () => {
    const save = createNewSave(at('2026-11-20'))
    const failed = finishChapterTest(save, 'test_001', 60, false, balance, at('2026-11-20'))
    expect(failed.reward.xp).toBe(0)
    expect(failed.save.learning.tests['test_001']).toEqual({ passedAt: null, bestScore: 60 })
    const passed = finishChapterTest(failed.save, 'test_001', 90, true, balance, at('2026-11-21'))
    expect(passed.reward.xp).toBe(balance.xp.chapterTest)
    expect(passed.save.learning.tests['test_001']).toEqual({ passedAt: at('2026-11-21'), bestScore: 90 })
    const again = finishChapterTest(passed.save, 'test_001', 80, true, balance, at('2026-11-22'))
    expect(again.reward.xp).toBe(0)
    expect(again.save).toBe(passed.save)
  })
})
