// 読み込む前に見せる、セーブデータの要約（どこまで進んだデータか）

import type { Chapter, GameEvent } from '../data/types'
import type { SaveData } from '../storage/saveData'

export interface SaveSummary {
  /** 終えた章（すべてのイベントを終えた章）のうち、いちばん後の章。まだなければ null */
  lastChapter: Chapter | null
  words: number
  xp: number
  stamps: number
  /** 最後に遊んだ日時 */
  updatedAt: string
}

export function summarizeSave(save: SaveData, chapters: readonly Chapter[], events: readonly GameEvent[]): SaveSummary {
  const done = new Set(save.progress.completedEvents)
  const cleared = chapters.filter((c) => {
    const inChapter = events.filter((e) => e.chapter === c.chapter)
    return inChapter.length > 0 && inChapter.every((e) => done.has(e.id))
  })
  return {
    lastChapter: cleared.reduce<Chapter | null>((last, c) => (last === null || c.chapter > last.chapter ? c : last), null),
    words: Object.keys(save.learning.words).length,
    xp: save.stats.xp,
    stamps: save.daily.stamps.length,
    updatedAt: save.updatedAt,
  }
}

/** 日時を、端末の時刻で「2026年11月25日 21:30」の形にする */
export function formatDateTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`
}
