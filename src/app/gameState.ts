// ゲーム全体の状態と、画面遷移の reducer。
// reducer は純粋な関数にする（日時は action で受け取る）ので、画面なしでテストできる。

import type { Balance, GameEvent } from '../data/types'
import type { AnswerMode } from '../learning/conversation/session'
import { findEvent, nextEvent, playableStep, resumeStep } from '../game/events/events'
import { advanceEvent, clearConversationTurn, learnItems, passHangulLesson, recordListeningCorrect, startEvent, type ClearMethod, type Reward } from '../game/progression/progression'
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
  /** 「はじめから」の直後に1度だけ聞く：ハングルから学ぶか、このまま始めるか */
  | { name: 'onboarding' }
  /** 学習画面（GAME_SPEC 3-1 E）。自宅の「勉強する」から開く */
  | { name: 'study'; back: Scene }
  /** ハングルのレッスンの一覧 */
  | { name: 'hangul'; back: Scene }
  /** ハングルのレッスン。onboarding は「はじめから」の直後の案内から来たか（終わったら物語を始める） */
  | { name: 'hangulLesson'; lessonId: string; back: Scene; onboarding: boolean }
  /** リスニング */
  | { name: 'listening'; back: Scene }
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
  /** 会話で選んでいた答え方。次の会話もこの方法で始める（ゲームを開いている間だけ。保存しない。計画 Q9） */
  answerPreference: AnswerMode
}

export type GameAction =
  | { type: 'startNew'; now: string }
  | { type: 'continue'; now: string }
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
  /** 会話の1往復に答えた（往復ごとに経験値を付ける） */
  | { type: 'conversationAnswered'; turn: number; method: ClearMethod; now: string }
  /** 会話を最後まで見た */
  | { type: 'conversationDone'; now: string }
  /** イベントを途中でやめる（続きから再開できる） */
  | { type: 'leaveEvent' }
  /** ブラウザの「戻る」。画面内の「戻る」ボタンと同じ動きにする */
  | { type: 'back'; now: string }
  /** 「はじめから」の直後の案内に答える */
  | { type: 'chooseOnboarding'; learnHangul: boolean }
  | { type: 'openStudy' }
  | { type: 'openHangul' }
  | { type: 'openHangulLesson'; lessonId: string }
  | { type: 'openListening' }
  /** 学習画面・レッスン一覧・レッスン・リスニングを閉じて、開く前の画面に戻る */
  | { type: 'closeStudyScene' }
  /** ハングルのレッスンの小テストに合格した（score は 0〜100） */
  | { type: 'hangulLessonPassed'; lessonId: string; score: number; now: string }
  /** リスニングの問題に正解した（key は listeningKey） */
  | { type: 'listeningCorrect'; key: string; now: string }
  /** 会話で答え方を選んだ */
  | { type: 'setAnswerPreference'; mode: AnswerMode }
  | { type: 'dismissReward' }
  | { type: 'saveSucceeded' }
  | { type: 'saveFailed'; message: string }

export interface GameDeps {
  events: readonly GameEvent[]
  balance: Balance
  locationIds: ReadonlySet<string>
  /** 最初のハングルのレッスンのID。あれば「はじめから」の直後に、ハングルから学ぶかを聞く */
  firstHangulLessonId?: string | null
}

export function createInitialState(load: LoadResult, backupKey: string | null, settings: Settings): GameState {
  const base = { settings, saveFailure: null, run: null, reward: null, answerPreference: 'choice' as const }
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

/** 画面内で「戻る」を押したときの行き先。戻れない画面では null */
export function backTarget(state: GameState): GameAction['type'] | null {
  switch (state.scene.name) {
    case 'settings':
      return 'closeSettings'
    case 'dictionary':
      return 'closeDictionary'
    case 'event':
      return 'leaveEvent'
    case 'study':
    case 'hangul':
    case 'hangulLesson':
    case 'listening':
      return 'closeStudyScene'
    case 'location':
    case 'main':
      return state.scene.name === 'main' ? 'backToTitle' : 'backToMap'
    case 'title':
    case 'onboarding':
    case 'saveError':
      return null
  }
}

/** 学習画面のなかまの画面（閉じると back に戻る） */
type StudyScene = Extract<Scene, { name: 'study' | 'hangul' | 'hangulLesson' | 'listening' }>

function isStudyScene(scene: Scene): scene is StudyScene {
  return scene.name === 'study' || scene.name === 'hangul' || scene.name === 'hangulLesson' || scene.name === 'listening'
}

export function createGameReducer(deps: GameDeps) {
  const { events, balance, locationIds } = deps
  const firstHangulLessonId = deps.firstHangulLessonId ?? null
  const unlocked = new Set(balance.initialLocations)

  /** 段階を1つ進める。イベントの最後なら、その施設の画面に戻る */
  function finishStep(state: GameState, extra: Reward, now: string): GameState {
    const run = state.run
    if (run === null || state.save === null) return state
    const event = findEvent(events, run.eventId)
    if (event === undefined) return { ...state, run: null, scene: { name: 'main' } }

    if (run.replay) {
      const step = playableStep(event, run.step + 1)
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
        const scene: Scene = firstHangulLessonId === null ? { name: 'location', locationId: balance.startLocation } : { name: 'onboarding' }
        return { ...state, save, run: null, reward: null, scene }
      }

      case 'chooseOnboarding': {
        if (state.scene.name !== 'onboarding') return state
        const start: Scene = { name: 'location', locationId: balance.startLocation }
        if (!action.learnHangul || firstHangulLessonId === null) return { ...state, scene: start }
        return { ...state, scene: { name: 'hangulLesson', lessonId: firstHangulLessonId, back: start, onboarding: true } }
      }

      case 'openStudy':
        if (state.save === null || isStudyScene(state.scene)) return state
        return { ...state, scene: { name: 'study', back: state.scene } }

      case 'openHangul':
        if (state.scene.name !== 'study') return state
        return { ...state, scene: { name: 'hangul', back: state.scene } }

      case 'openHangulLesson':
        if (state.scene.name !== 'hangul') return state
        return { ...state, scene: { name: 'hangulLesson', lessonId: action.lessonId, back: state.scene, onboarding: false } }

      case 'openListening':
        if (state.scene.name !== 'study') return state
        return { ...state, scene: { name: 'listening', back: state.scene } }

      case 'closeStudyScene':
        return isStudyScene(state.scene) ? { ...state, scene: state.scene.back } : state

      case 'hangulLessonPassed': {
        if (state.save === null) return state
        const passed = passHangulLesson(state.save, action.lessonId, action.score, balance, action.now)
        if (passed.save === state.save) return state
        return { ...state, save: passed.save, reward: addReward(state, passed.reward) }
      }

      case 'listeningCorrect': {
        if (state.save === null) return state
        const recorded = recordListeningCorrect(state.save, action.key, balance, action.now)
        if (recorded.save === state.save) return state
        return { ...state, save: recorded.save, reward: addReward(state, recorded.reward) }
      }

      case 'continue': {
        const save = state.save
        if (save === null) return state
        // 途中のイベントがあれば、その続きから再開する
        const active = save.progress.activeEvent
        const event = active === null ? undefined : findEvent(events, active.id)
        if (active !== null && event !== undefined) {
          const started = startEvent(save, event, action.now)
          const step = started.progress.activeEvent?.step ?? 0
          return { ...state, save: started, run: { eventId: event.id, step, replay: false }, scene: { name: 'event', locationId: event.location } }
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
          return { ...state, run: { eventId: event.id, step: resumeStep(event, 0), replay: true }, scene: { name: 'event', locationId: event.location } }
        }
        if (nextEvent(events, save.progress)?.id !== event.id) return state
        const started = startEvent(save, event, action.now)
        const step = started.progress.activeEvent?.step ?? 0
        return { ...state, save: started, run: { eventId: event.id, step, replay: false }, scene: { name: 'event', locationId: event.location } }
      }

      case 'stepDone': {
        const step = currentStep(state)
        if (step === undefined || step.type === 'learn' || step.type === 'conversation') return state
        // message・column・dictionary・dayEnd は見終えたら次へ（経験値なし）
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

      case 'conversationAnswered': {
        const step = currentStep(state)
        const run = state.run
        if (step?.type !== 'conversation' || run === null || state.save === null || run.replay) return state
        const cleared = clearConversationTurn(state.save, step.id, action.turn, action.method, balance, action.now)
        if (cleared.save === state.save) return state
        return { ...state, save: cleared.save, reward: addReward(state, cleared.reward) }
      }

      case 'conversationDone': {
        if (currentStep(state)?.type !== 'conversation') return state
        return finishStep(state, { xp: 0, newWords: 0 }, action.now)
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
        if (target === 'closeSettings' || target === 'closeDictionary' || target === 'leaveEvent' || target === 'backToTitle' || target === 'closeStudyScene') {
          return gameReducer(state, { type: target })
        }
        return state
      }

      case 'setAnswerPreference':
        return state.answerPreference === action.mode ? state : { ...state, answerPreference: action.mode }

      case 'dismissReward':
        return state.reward === null ? state : { ...state, reward: null }

      case 'saveSucceeded':
        return state.saveFailure === null ? state : { ...state, saveFailure: null }

      case 'saveFailed':
        return { ...state, saveFailure: action.message }
    }
  }
}
