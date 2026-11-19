import { assets, backgroundImage } from '../data'
import type { ImageAsset } from '../data/types'
import type { Scene } from './gameState'

/**
 * 画面の後ろに敷く絵。
 * - タイトル：街のマップ
 * - マップ画面：敷かない（画面の中にマップの絵があり、二重に見えるため。GAME_SPEC 6-1）
 * - 施設とイベント：その施設の背景
 * - 設定・図鑑：開く前の画面と同じ
 */
export function backdropFor(scene: Scene): ImageAsset | undefined {
  switch (scene.name) {
    case 'title':
      return assets.map ?? undefined
    case 'main':
      return undefined
    case 'location':
    case 'event':
      return backgroundImage(scene.locationId)
    case 'settings':
    case 'dictionary':
      return backdropFor(scene.back)
    case 'saveError':
      return undefined
  }
}
