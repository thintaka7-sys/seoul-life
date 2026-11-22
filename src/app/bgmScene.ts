// 場面ごとに流す BGM（GAME_SPEC 10-4）。画面なしでテストできる純粋な関数にする。

import { STUDY_VOLUME } from '../audio/bgmTiming'
import { findLocation } from '../data'
import type { BgmId } from '../data/types'
import type { Scene } from './gameState'

export interface BgmChoice {
  track: BgmId | null
  /** 曲の大きさ（0〜1） */
  level: number
}

const STUDY: BgmChoice = { track: 'study', level: STUDY_VOLUME }

function locationTrack(locationId: string): BgmId {
  return findLocation(locationId)?.bgm ?? 'map'
}

/**
 * 場面の曲。override はおはなしで指定した曲（null なら場所の曲のまま、none なら止める）。
 * - タイトル：title、マップ：map、施設・イベント：施設の曲（なければ map）
 * - 学習画面のなかま：study（小さめ）
 * - 設定・図鑑・スタンプ・アルバム：開く前の画面と同じ
 */
export function bgmFor(scene: Scene, override: BgmId | 'none' | null = null): BgmChoice {
  switch (scene.name) {
    case 'title':
      return { track: 'title', level: 1 }
    case 'main':
      return { track: 'map', level: 1 }
    case 'location':
      return { track: locationTrack(scene.locationId), level: 1 }
    case 'event':
      if (override === 'none') return { track: null, level: 1 }
      return { track: override ?? locationTrack(scene.locationId), level: 1 }
    case 'conversationReplay':
      return { track: locationTrack(scene.locationId), level: 1 }
    case 'storyReplay':
      if (override === 'none') return { track: null, level: 1 }
      return override === null ? bgmFor(scene.back) : { track: override, level: 1 }
    case 'settings':
    case 'dictionary':
    case 'stamps':
    case 'album':
      return bgmFor(scene.back, override)
    case 'study':
    case 'hangul':
    case 'hangulLesson':
    case 'listening':
    case 'review':
    case 'practice':
    case 'drills':
    case 'drill':
    case 'chapterTest':
    case 'conversations':
    case 'ear':
    case 'earSet':
      return STUDY
    case 'saveError':
      return { track: null, level: 1 }
  }
}
