import { assets, backgroundImage, findGameEvent } from '../data'
import type { ImageAsset } from '../data/types'
import { backgroundAt } from '../game/events/events'
import type { EventRun, Scene } from './gameState'

/**
 * 背景のID（施設ID か場面の背景のID）の絵。
 * 引っ越しを終えるまで（movedIn が false）は、自宅（home）を引っ越したばかりの部屋（home_moving）にする（Phase 4 計画 Q1）。
 * その絵がなければ、自宅のふだんの絵。
 */
export function sceneBackground(id: string, movedIn: boolean): ImageAsset | undefined {
  if (id === 'home' && !movedIn) return backgroundImage('home_moving') ?? backgroundImage('home')
  return backgroundImage(id)
}

/** 家具を重ねる部屋の絵か（自宅のふだんの絵。引っ越したばかりの部屋には重ねない） */
export function isRoomBackdrop(image: ImageAsset | undefined): boolean {
  return image !== undefined && image === backgroundImage('home')
}

/**
 * イベントの段階を出しているときの背景。background の段階で切り替えた背景があればそれ、
 * なければ（または画像がまだなければ）施設のふだんの背景。
 */
export function eventBackdrop(locationId: string, run: EventRun | null, movedIn = true): ImageAsset | undefined {
  const event = run === null ? undefined : findGameEvent(run.eventId)
  const id = event === undefined ? locationId : backgroundAt(event, run?.step ?? 0)
  return sceneBackground(id, movedIn) ?? sceneBackground(locationId, movedIn)
}

/**
 * 画面の後ろに敷く絵。
 * - タイトル：街のマップ
 * - マップ画面：敷かない（画面の中にマップの絵があり、二重に見えるため。GAME_SPEC 6-1）
 * - 施設：その施設の背景。イベント：上の eventBackdrop
 * - 設定・図鑑・学習画面（ハングル・リスニング）：開く前の画面と同じ
 * - 部屋を飾る画面：敷かない（画面の中に部屋の絵があるため）
 * movedIn は、引っ越しを終えたか（sceneBackground）
 */
export function backdropFor(scene: Scene, run: EventRun | null = null, movedIn = true): ImageAsset | undefined {
  switch (scene.name) {
    case 'title':
      return assets.map ?? undefined
    case 'main':
      return undefined
    case 'location':
      return sceneBackground(scene.locationId, movedIn)
    case 'event':
      return eventBackdrop(scene.locationId, run, movedIn)
    case 'conversationReplay':
    case 'order':
      return sceneBackground(scene.locationId, movedIn)
    case 'settings':
    case 'dictionary':
    case 'study':
    case 'hangul':
    case 'hangulLesson':
    case 'listening':
    case 'album':
    case 'storyReplay':
      return backdropFor(scene.back, run, movedIn)
    case 'saveError':
      return undefined
  }
}
