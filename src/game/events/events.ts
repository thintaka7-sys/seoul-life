// イベントの進み具合の判定（どの施設で、どのイベントを始められるか）。
// 一度に進められるイベントは1つだけ。途中のイベント（activeEvent）があるときは、ほかのイベントは始められない。

import type { GameEvent } from '../../data/types'
import type { SaveData } from '../../storage/saveData'

type Progress = SaveData['progress']

export function findEvent(events: readonly GameEvent[], id: string): GameEvent | undefined {
  return events.find((e) => e.id === id)
}

export function requirementsMet(event: GameEvent, completed: readonly string[]): boolean {
  return event.requires.every((r) => completed.includes(r))
}

/** 次に進めるイベント（途中のイベントがあればそれ。なければ、前提を満たした未完了のイベントのうちファイルで先のもの） */
export function nextEvent(events: readonly GameEvent[], progress: Progress): GameEvent | undefined {
  if (progress.activeEvent !== null) {
    const active = findEvent(events, progress.activeEvent.id)
    if (active !== undefined) return active
  }
  return events.find((e) => !progress.completedEvents.includes(e.id) && requirementsMet(e, progress.completedEvents))
}

/** その施設で始められる（または続きから進められる）イベント */
export function nextEventAt(events: readonly GameEvent[], progress: Progress, locationId: string): GameEvent | undefined {
  const next = nextEvent(events, progress)
  return next?.location === locationId ? next : undefined
}

/** その施設で終えたイベント（もう一度遊べるもの） */
export function completedEventsAt(events: readonly GameEvent[], progress: Progress, locationId: string): GameEvent[] {
  return events.filter((e) => e.location === locationId && progress.completedEvents.includes(e.id))
}

/** すべてのイベントを終えたか */
export function allEventsCompleted(events: readonly GameEvent[], progress: Progress): boolean {
  return events.every((e) => progress.completedEvents.includes(e.id))
}

/**
 * その日のイベント（1日の終わりの画面を出したイベントの次から、eventId のイベントまで。データの順）。
 * 1日の終わりの画面で、その日に覚えた単語や会話をまとめるのに使う。
 */
export function eventsOfDay(events: readonly GameEvent[], eventId: string): GameEvent[] {
  const end = events.findIndex((e) => e.id === eventId)
  if (end < 0) return []
  let start = end
  while (start > 0 && !(events[start - 1]?.steps.some((s) => s.type === 'dayEnd') ?? false)) start--
  return events.slice(start, end + 1)
}

/** イベントの中で覚える単語のID（重複なし、出てくる順） */
export function vocabularyOf(events: readonly GameEvent[]): string[] {
  return [...new Set(events.flatMap((e) => e.steps.flatMap((s) => (s.type === 'learn' ? s.vocabulary : []))))]
}

/** イベントの中で行う会話のID（出てくる順） */
export function conversationsOf(events: readonly GameEvent[]): string[] {
  return events.flatMap((e) => e.steps.flatMap((s) => (s.type === 'conversation' ? [s.id] : [])))
}
