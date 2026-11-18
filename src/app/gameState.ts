// ゲーム全体の状態と、画面遷移の reducer。
// reducer は純粋な関数にする（日時は action で受け取る）ので、画面なしでテストできる。

import { createNewSave, type SaveData } from '../storage/saveData'
import type { CorruptReason, LoadResult } from '../storage/saveStore'

export type Scene =
  | { name: 'title' }
  | { name: 'settings' }
  | { name: 'main' }
  | { name: 'location'; locationId: string }
  | { name: 'conversation'; locationId: string; conversationId: string }
  | { name: 'saveError'; reason: CorruptReason; detail: string; backupKey: string | null }

export interface GameState {
  scene: Scene
  /** 遊んでいるセーブデータ。タイトル画面で「はじめから」を選ぶまでは null のこともある */
  save: SaveData | null
  /** このブラウザで保存できるか */
  storageAvailable: boolean
  /** 直近の保存の失敗（成功したら null に戻る） */
  saveFailure: string | null
}

export type GameAction =
  | { type: 'startNew'; now: string }
  | { type: 'continue' }
  | { type: 'goToLocation'; locationId: string; now: string }
  | { type: 'backToMap'; now: string }
  | { type: 'talk'; conversationId: string }
  | { type: 'endConversation' }
  | { type: 'backToTitle' }
  | { type: 'openSettings' }
  | { type: 'closeSettings' }
  | { type: 'saveSucceeded' }
  | { type: 'saveFailed'; message: string }

export function createInitialState(load: LoadResult, backupKey: string | null): GameState {
  switch (load.kind) {
    case 'ok':
      return { scene: { name: 'title' }, save: load.data, storageAvailable: true, saveFailure: null }
    case 'empty':
      return { scene: { name: 'title' }, save: null, storageAvailable: true, saveFailure: null }
    case 'unavailable':
      return { scene: { name: 'title' }, save: null, storageAvailable: false, saveFailure: null }
    case 'corrupt':
      return {
        scene: { name: 'saveError', reason: load.reason, detail: load.detail, backupKey },
        save: null,
        storageAvailable: true,
        saveFailure: null,
      }
  }
}

function withLocation(save: SaveData, locationId: string | null, now: string): SaveData {
  return { ...save, updatedAt: now, progress: { ...save.progress, currentLocationId: locationId } }
}

/** 施設IDの一覧を受け取り、存在しない施設には移動しない reducer を作る */
export function createGameReducer(knownLocationIds: ReadonlySet<string>) {
  return function gameReducer(state: GameState, action: GameAction): GameState {
    switch (action.type) {
      case 'startNew':
        return { ...state, save: createNewSave(action.now), scene: { name: 'main' } }

      case 'continue': {
        if (state.save === null) return state
        const loc = state.save.progress.currentLocationId
        // 施設の中で終えていたら、その施設から再開する（施設がなくなっていたらマップから）
        if (loc !== null && knownLocationIds.has(loc)) return { ...state, scene: { name: 'location', locationId: loc } }
        return { ...state, scene: { name: 'main' } }
      }

      case 'goToLocation':
        if (state.save === null || !knownLocationIds.has(action.locationId)) return state
        return {
          ...state,
          save: withLocation(state.save, action.locationId, action.now),
          scene: { name: 'location', locationId: action.locationId },
        }

      case 'backToMap':
        if (state.save === null) return state
        return { ...state, save: withLocation(state.save, null, action.now), scene: { name: 'main' } }

      case 'talk':
        if (state.scene.name !== 'location') return state
        return { ...state, scene: { name: 'conversation', locationId: state.scene.locationId, conversationId: action.conversationId } }

      case 'endConversation':
        if (state.scene.name !== 'conversation') return state
        return { ...state, scene: { name: 'location', locationId: state.scene.locationId } }

      case 'backToTitle':
        return { ...state, scene: { name: 'title' } }

      case 'openSettings':
        return { ...state, scene: { name: 'settings' } }

      case 'closeSettings':
        return { ...state, scene: { name: 'title' } }

      case 'saveSucceeded':
        return state.saveFailure === null ? state : { ...state, saveFailure: null }

      case 'saveFailed':
        return { ...state, saveFailure: action.message }
    }
  }
}
