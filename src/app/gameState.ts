// ゲーム全体の状態と、画面遷移の reducer。
// reducer は純粋な関数にする（日時は action で受け取る）ので、画面なしでテストできる。

import type { Balance, GameEvent } from '../data/types'
import { findEvent, nextEvent } from '../game/events/events'
import { advanceEvent, clearConversation, learnItems, startEvent, type ClearMethod, type Reward } from '../game/progression/progression'
import { createNewSave, type SaveData } from '../storage/saveData'
import type { CorruptReason, LoadResult } from '../storage/saveStore'
import type { Settings } from '../storage/settings'

export type Scene =
  | { name: 'title' }
  | { name: 'settings'; back: Scene }
  | { name: 'main' }
  | { name: 'location'; locationId: string }
  /** イベントの段階を進めている画面（中身は run で決まる） */
  | { name: 'event'; locationId: string }
  | { name: 'dictionary'; back: Scene }
  | { name: 'saveError'; reason: CorruptReason; detail: string; backupKey: string | null }

/** 進めているイベント。replay は終えたイベントの遊び直し（記録・経験値は付けない） */
export interface EventRun {
  eventId: string
  step: number
  replay: boolean
}

/** 画面に一時的に出す「経験値 +n」の知らせ。seq は同じ値が続いても出し直すための番号 */
export interface RewardNotice extends Reward {
  seq: number
}

export interface GameState {
  scene: Scene
  /** 遊んでいるセーブデータ。タイトル画面で「はじめから」を選ぶまでは null のこともある */
  save: SaveData | null
  settings: Settings
  /** このブラウザで保存できるか */
  storageAvailable: boolean
  /** 直近の保存の失敗（成功したら null に戻る） */
  saveFailure: string | null
  run: EventRun | null
  reward: RewardNotice | null
}

export type GameAction =
  | { type: 'startNew'; now: string }
  | { type: 'continue' }
  | { type: 'goToLocation'; locationId: string; now: string }
  | { type: 'backToMap'; now: string }
  | { type: 'backToTitle' }
  | { type: 'openSettings' }
  | { type: 'closeSettings' }
  | { type: 'changeSettings'; settings: Settings }
  | { type: 'openDictionary' }
  | { type: 'closeDictionary' }
  | { type: 'startEvent'; eventId: string; now: string }
  /** message・dictionary・dayEnd の段階を終えた */
  | { type: 'stepDone'; now: string }
  /** learn の段階（単語カード）を見終えた */
  | { type: 'learnDone'; now: string }
  | { type: 'conversationDone'; method: ClearMethod; now: string }
  /** イベントを途中でやめる（続きから再開できる） */
  | { type: 'leaveEvent' }
  /** ブラウザの「戻る」。画面内の「戻る」ボタンと同じ動きにする */
  | { type: 'back'; now: string }
  | { type: 'dismissReward' }
  | { type: 'saveSucceeded' }
  | { type: 'saveFailed'; message: string }

export interface GameDeps {
  events: readonly GameEvent[]
  balance: Balance
  locationIds: ReadonlySet<string>
}

export function createInitialState(load: LoadResult, backupKey: string | null, settings: Settings): GameState {
  const base = { settings, saveFailure: null, run: null, reward: null }
  switch (load.kind) {
    case 'ok':
      return { ...base, scene: { name: 'title' }, save: load.data, storageAvailable: true }
    case 'empty':
      return { ...base, scene: { name: 'title' }, save: null, storageAvailable: true }
    case 'unavailable':
      return { ...base, scene: { name: 'title' }, save: null, storageAvailable: false }
    case 'corrupt':
      return { ...base, scene: { name: 'saveError', reason: load.reason, detail: load.detail, backupKey }, save: null, storageAvailable: true }
  }
}

function withLocation(save: SaveData, locationId: string | null, now: string): SaveData {
  return { ...save, updatedAt: now, progress: { ...save.progress, currentLocationId: locationId } }
}

function addReward(state: GameState, reward: Reward): RewardNotice | null {
  if (reward.xp === 0 && reward.newWords === 0) return state.reward
  return { ...reward, seq: (state.reward?.seq ?? 0) + 1 }
}

function sumRewards(a: Reward, b: Reward): Reward {
  return { xp: a.xp + b.xp, newWords: a.newWords + b.newWords }
}

/** 段階の番号を、データの段階数の範囲に収める（データが変わって段階が減った場合に備える） */
function clampStep(event: GameEvent, step: number): number {
  return Math.min(Math.max(step, 0), event.steps.length - 1)
}

/** 画面内で「戻る」を押したときの行き先。戻れない画面では null */
export function backTarget(state: GameState): GameAction['type'] | null {
  switch (state.scene.name) {
    case 'settings':
      return 'closeSettings'
    case 'dictionary':
      return 'closeDictionary'
    case 'event':
      return 'leaveEvent'
    case 'location':
    case 'main':
      return state.scene.name === 'main' ? 'backToTitle' : 'backToMap'
    case 'title':
    case 'saveError':
      return null
  }
}

export function createGameReducer(deps: GameDeps) {
  const { events, balance, locationIds } = deps
  const unlocked = new Set(balance.initialLocations)

  /** 段階を1つ進める。イベントの最後なら、その施設の画面に戻る */
  function finishStep(state: GameState, extra: Reward, now: string): GameState {
    const run = state.run
    if (run === null || state.save === null) return state
    const event = findEvent(events, run.eventId)
    if (event === undefined) return { ...state, run: null, scene: { name: 'main' } }

    if (run.replay) {
      const step = run.step + 1
      if (step >= event.steps.length) return { ...state, run: null, scene: { name: 'location', locationId: event.location } }
      return { ...state, run: { ...run, step } }
    }

    const advanced = advanceEvent(state.save, event, balance, now)
    const reward = addReward(state, sumRewards(extra, advanced.reward))
    if (advanced.finished) {
      return { ...state, save: advanced.save, run: null, reward, scene: { name: 'location', locationId: event.location } }
    }
    const step = advanced.save.progress.activeEvent?.step ?? run.step + 1
    return { ...state, save: advanced.save, run: { ...run, step }, reward }
  }

  function currentStep(state: GameState) {
    if (state.run === null) return undefined
    return findEvent(events, state.run.eventId)?.steps[state.run.step]
  }

  return function gameReducer(state: GameState, action: GameAction): GameState {
    switch (action.type) {
      case 'startNew': {
        const save = withLocation(createNewSave(action.now), balance.startLocation, action.now)
        return { ...state, save, run: null, reward: null, scene: { name: 'location', locationId: balance.startLocation } }
      }

      case 'continue': {
        const save = state.save
        if (save === null) return state
        // 途中のイベントがあれば、その続きから再開する
        const active = save.progress.activeEvent
        const event = active === null ? undefined : findEvent(events, active.id)
        if (active !== null && event !== undefined) {
          return { ...state, run: { eventId: event.id, step: clampStep(event, active.step), replay: false }, scene: { name: 'event', locationId: event.location } }
        }
        const loc = save.progress.currentLocationId
        if (loc !== null && locationIds.has(loc)) return { ...state, scene: { name: 'location', locationId: loc } }
        return { ...state, scene: { name: 'main' } }
      }

      case 'goToLocation':
        if (state.save === null || !locationIds.has(action.locationId) || !unlocked.has(action.locationId)) return state
        return { ...state, save: withLocation(state.save, action.locationId, action.now), scene: { name: 'location', locationId: action.locationId } }

      case 'backToMap':
        if (state.save === null) return state
        return { ...state, save: withLocation(state.save, null, action.now), run: null, scene: { name: 'main' } }

      case 'backToTitle':
        return { ...state, run: null, scene: { name: 'title' } }

      case 'openSettings':
        if (state.scene.name === 'settings') return state
        return { ...state, scene: { name: 'settings', back: state.scene } }

      case 'closeSettings':
        return state.scene.name === 'settings' ? { ...state, scene: state.scene.back } : state

      case 'changeSettings':
        return { ...state, settings: action.settings }

      case 'openDictionary':
        if (state.save === null || state.scene.name === 'dictionary') return state
        return { ...state, scene: { name: 'dictionary', back: state.scene } }

      case 'closeDictionary':
        return state.scene.name === 'dictionary' ? { ...state, scene: state.scene.back } : state

      case 'startEvent': {
        const save = state.save
        const event = findEvent(events, action.eventId)
        if (save === null || event === undefined) return state
        const isActive = save.progress.activeEvent?.id === event.id
        const done = save.progress.completedEvents.includes(event.id)
        // 終えたイベントは遊び直し（記録しない）。未完了のものは、いま進められるイベントだけ始められる
        if (done && !isActive) {
          return { ...state, run: { eventId: event.id, step: 0, replay: true }, scene: { name: 'event', locationId: event.location } }
        }
        if (nextEvent(events, save.progress)?.id !== event.id) return state
        const started = startEvent(save, event.id, action.now)
        const step = clampStep(event, started.progress.activeEvent?.step ?? 0)
        return { ...state, save: started, run: { eventId: event.id, step, replay: false }, scene: { name: 'event', locationId: event.location } }
      }

      case 'stepDone': {
        const step = currentStep(state)
        if (step === undefined || step.type === 'learn' || step.type === 'conversation') return state
        return finishStep(state, { xp: 0, newWords: 0 }, action.now)
      }

      case 'learnDone': {
        const step = currentStep(state)
        const run = state.run
        if (step?.type !== 'learn' || run === null || state.save === null) return state
        if (run.replay) return finishStep(state, { xp: 0, newWords: 0 }, action.now)
        const chapter = findEvent(events, run.eventId)?.chapter ?? 1
        const learned = learnItems(state.save, step, chapter, balance, action.now)
        return finishStep({ ...state, save: learned.save }, learned.reward, action.now)
      }

      case 'conversationDone': {
        const step = currentStep(state)
        const run = state.run
        if (step?.type !== 'conversation' || run === null || state.save === null) return state
        if (run.replay) return finishStep(state, { xp: 0, newWords: 0 }, action.now)
        const cleared = clearConversation(state.save, step.id, action.method, balance, action.now)
        return finishStep({ ...state, save: cleared.save }, cleared.reward, action.now)
      }

      case 'leaveEvent': {
        if (state.run === null) return state
        const event = findEvent(events, state.run.eventId)
        return { ...state, run: null, scene: event === undefined ? { name: 'main' } : { name: 'location', locationId: event.location } }
      }

      case 'back': {
        const target = backTarget(state)
        if (target === null) return state
        if (target === 'backToMap') return gameReducer(state, { type: 'backToMap', now: action.now })
        if (target === 'closeSettings' || target === 'closeDictionary' || target === 'leaveEvent' || target === 'backToTitle') {
          return gameReducer(state, { type: target })
        }
        return state
      }

      case 'dismissReward':
        return state.reward === null ? state : { ...state, reward: null }

      case 'saveSucceeded':
        return state.saveFailure === null ? state : { ...state, saveFailure: null }

      case 'saveFailed':
        return { ...state, saveFailure: action.message }
    }
  }
}
