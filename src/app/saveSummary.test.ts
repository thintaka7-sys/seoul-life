import { describe, expect, it } from 'vitest'
import type { Chapter, GameEvent } from '../data/types'
import { createNewSave } from '../storage/saveData'
import { formatDateTime, summarizeSave } from './saveSummary'

const chapters: Chapter[] = [
  { chapter: 1, titleJa: '一', goalJa: '' },
  { chapter: 2, titleJa: '二', goalJa: '' },
]
const ev = (id: string, chapter: number) => ({ id, chapter }) as GameEvent

describe('読み込む前の要約', () => {
  it('すべてのイベントを終えた章のうち、いちばん後の章・覚えた単語・経験値・スタンプを数える', () => {
    const save = createNewSave('2026-11-20T09:00:00.000Z')
    const events = [ev('a', 1), ev('b', 1), ev('c', 2)]
    expect(summarizeSave(save, chapters, events).lastChapter).toBeNull()
    const played = {
      ...save,
      progress: { ...save.progress, completedEvents: ['a', 'b'] },
      learning: { ...save.learning, words: { v1: { learnedAt: save.createdAt, chapter: 1 }, v2: { learnedAt: save.createdAt, chapter: 1 } } },
      stats: { xp: 90 },
      daily: { stamps: ['2026-11-20'] },
    }
    expect(summarizeSave(played, chapters, events)).toEqual({ lastChapter: chapters[0], words: 2, xp: 90, stamps: 1, updatedAt: save.updatedAt })
  })

  it('日時を端末の時刻で読みやすくする', () => {
    const d = new Date(2026, 10, 25, 21, 5)
    expect(formatDateTime(d.toISOString())).toBe('2026年11月25日 21:05')
    expect(formatDateTime('x')).toBe('x')
  })
})
