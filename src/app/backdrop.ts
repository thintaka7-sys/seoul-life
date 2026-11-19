import { assets, backgroundImage, findGameEvent } from '../data'
import type { ImageAsset } from '../data/types'
import { backgroundAt } from '../game/events/events'
import type { EventRun, Scene } from './gameState'

/**
 * イベントの段階を出しているときの背景。background の段階で切り替えた背景があればそれ、
 * なければ（または画像がまだなければ）施設のふだんの背景。
 */
export function eventBackdrop(locationId: string, run: EventRun | null): ImageAsset | undefined {
  const event = run === null ? undefined : findGameEvent(run.eventId)
  const id = event === undefined ? locationId : backgroundAt(event, run?.step ?? 0)
  return backgroundImage(id) ?? backgroundImage(locationId)
}

/**
 * 画面の後ろに敷く絵。
 * - タイトル：街のマップ
 * - マップ画面：敷かない（画面の中にマップの絵があり、二重に見えるため。GAME_SPEC 6-1）
 * - 施設：その施設の背景。イベント：上の eventBackdrop
 * - 設定・図鑑：開く前の画面と同じ
 */
export function backdropFor(scene: Scene, run: EventRun | null = null): ImageAsset | undefined {
  switch (scene.name) {
    case 'title':
      return assets.map ?? undefined
    case 'main':
      return undefined
    case 'location':
      return backgroundImage(scene.locationId)
    case 'event':
      return eventBackdrop(scene.locationId, run)
    case 'settings':
    case 'dictionary':
      return backdropFor(scene.back, run)
    case 'saveError':
      return undefined
  }
}
