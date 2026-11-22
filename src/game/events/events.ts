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

// ---------- 背景を切り替える段階（background） ----------
// background の段階は画面に何も出さず、すぐ次へ進む。進行の番号（activeEvent.step）が background を指さないようにする。

/** step から先で、画面に出す最初の段階の番号（background を飛ばす。なければ段階の数） */
export function playableStep(event: GameEvent, step: number): number {
  let i = Math.max(step, 0)
  while (i < event.steps.length && event.steps[i]?.type === 'background') i++
  return i
}

/**
 * 途中から再開するときの段階の番号。データが変わって番号がずれていても、範囲に収め、background を飛ばす。
 * （最後の段階は background にできないので、必ず画面に出す段階になる）
 */
export function resumeStep(event: GameEvent, step: number): number {
  const clamped = Math.min(Math.max(step, 0), event.steps.length - 1)
  return Math.min(playableStep(event, clamped), event.steps.length - 1)
}

/** step の段階を出しているときの背景のID（それより前の最後の background。なければイベントの施設） */
export function backgroundAt(event: GameEvent, step: number): string {
  for (let i = Math.min(step, event.steps.length) - 1; i >= 0; i--) {
    const s = event.steps[i]
    if (s?.type === 'background') return s.id
  }
  return event.location
}

/** 進み具合の表示用：画面に出す段階の数と、step より前に終えた数 */
export function stepProgress(event: GameEvent, step: number): { done: number; total: number } {
  const playable = event.steps.map((s, i) => ({ s, i })).filter(({ s }) => s.type !== 'background')
  return { done: playable.filter(({ i }) => i < step).length, total: playable.length }
}

// ---------- 施設の解放と、自動で始まるイベント（Phase 3） ----------

/** 行ける施設：最初から行ける施設と、終えたイベントの unlocks で開いた施設 */
export function unlockedLocations(events: readonly GameEvent[], initial: readonly string[], completed: readonly string[]): Set<string> {
  const open = new Set(initial)
  for (const e of events) {
    if (completed.includes(e.id)) for (const id of e.unlocks ?? []) open.add(id)
  }
  return open
}

/** 自動で始めるイベント（途中のイベントがなく、次に進めるイベントが start: "auto" のとき）。なければ undefined */
export function autoStartEvent(events: readonly GameEvent[], progress: Progress): GameEvent | undefined {
  if (progress.activeEvent !== null) return undefined
  const next = nextEvent(events, progress)
  return next?.start === 'auto' ? next : undefined
}

/** そのイベントで新しく開く施設（まだ開いていないもの） */
export function newlyUnlocked(event: GameEvent, events: readonly GameEvent[], initial: readonly string[], completedBefore: readonly string[]): string[] {
  const open = unlockedLocations(events, initial, completedBefore)
  return (event.unlocks ?? []).filter((id) => !open.has(id))
}

/** その章のイベントで覚える単語・文法と、その章のイベントで行う会話（章の終わりのまとめに使う） */
export function chapterSummary(events: readonly GameEvent[], chapter: number): { vocabulary: string[]; grammar: string[]; conversations: string[] } {
  const inChapter = events.filter((e) => e.chapter === chapter)
  const learn = inChapter.flatMap((e) => e.steps.flatMap((s) => (s.type === 'learn' ? [s] : [])))
  return {
    vocabulary: [...new Set(learn.flatMap((s) => s.vocabulary))],
    grammar: [...new Set(learn.flatMap((s) => s.grammar))],
    conversations: conversationsOf(inChapter),
  }
}
