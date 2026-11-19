import type { ReactNode } from 'react'
import type { Expression } from '../../data/types'
import { Portrait } from './Portrait'

/** 仮の絵（背景の画像がない施設で出す絵文字） */
const PLACEHOLDER_ART: Readonly<Record<string, string>> = {
  home: '🏠',
  cafe: '☕',
  convenience_store: '🏪',
  bookstore: '📚',
  park: '🌳',
  station: '🚉',
}

interface StageProps {
  locationId: string
  /** 立ち絵を出すキャラクター。いなければ null */
  characterId: string | null
  expression?: Expression
  /** compact：キーボードを出している間など、顔のあたりだけを見せる低い舞台 */
  size?: 'normal' | 'compact'
  /** 背景の画像があるか（なければ施設の絵文字を出す） */
  hasBackground: boolean
  children?: ReactNode
}

/** 立ち絵を立たせる舞台。背景そのものは Backdrop が画面の後ろに敷く */
export function Stage({ locationId, characterId, expression = 'normal', size = 'normal', hasBackground, children }: StageProps) {
  return (
    <div className={`stage stage--${size}${hasBackground ? '' : ' stage--placeholder'}`}>
      {!hasBackground && characterId === null && (
        <span className="stage__art" aria-hidden="true">
          {PLACEHOLDER_ART[locationId] ?? '🏢'}
        </span>
      )}
      {characterId !== null && <Portrait key={characterId} characterId={characterId} expression={expression} className="stage__portrait" />}
      {children}
    </div>
  )
}
