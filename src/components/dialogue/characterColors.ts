import type { CSSProperties } from 'react'
import { findCharacter } from '../../data'
import { readableTextOn } from '../../game/theme/color'

/** キャラクターのテーマカラーを CSS 変数にする（名前の札の色・台詞の枠の線）。色のないキャラクターは空 */
export function characterColors(characterId: string): CSSProperties {
  const color = findCharacter(characterId)?.themeColor
  if (color === undefined) return {}
  return { '--char-color': color, '--char-on': readableTextOn(color) } as CSSProperties
}
