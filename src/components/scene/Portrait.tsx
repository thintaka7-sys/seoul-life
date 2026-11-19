import type { CSSProperties } from 'react'
import { assets, findCharacter } from '../../data'
import { EXPRESSIONS, type Expression } from '../../data/types'
import { assetUrl } from './assetUrl'

const EXPRESSION_LABEL: Record<Expression, string> = { normal: '通常', smile: '笑顔', troubled: '困り顔' }

/**
 * キャラクターの立ち絵。表情ごとの画像を重ねておき、いまの表情だけを見せる（切り替えは重ねて変わる）。
 * 画像がないキャラクターは、テーマカラーの仮の絵（人の形）を出す。
 */
export function Portrait({ characterId, expression, className = '' }: { characterId: string; expression: Expression; className?: string }) {
  const character = findCharacter(characterId)
  const images = assets.characters[characterId]
  const shown: Expression = images?.[expression] !== undefined ? expression : 'normal'
  const label = `${character?.roleJa ?? characterId}（${EXPRESSION_LABEL[shown]}）`
  const color = { '--char-color': character?.themeColor ?? '#b9a48f' } as CSSProperties
  const base = images?.normal

  if (images === undefined || base === undefined) {
    return (
      <div className={`portrait portrait--placeholder ${className}`} role="img" aria-label={label} data-expression={expression} style={color}>
        <svg viewBox="0 0 100 150" className="portrait__silhouette" aria-hidden="true">
          <circle cx="50" cy="38" r="24" />
          <path d="M8 150 C8 98 26 76 50 76 C74 76 92 98 92 150 Z" />
        </svg>
        <span className="portrait__face" aria-hidden="true">
          {expression === 'smile' ? '😊' : expression === 'troubled' ? '😅' : '🙂'}
        </span>
      </div>
    )
  }

  return (
    <div
      className={`portrait ${className}`}
      role="img"
      aria-label={label}
      data-expression={shown}
      style={{ ...color, aspectRatio: `${base.width} / ${base.height}` }}
    >
      {EXPRESSIONS.map((e) => {
        const image = images[e]
        if (image === undefined) return null
        return (
          <img
            key={e}
            className={`portrait__img${e === shown ? ' portrait__img--shown' : ''}`}
            src={assetUrl(image.src)}
            width={image.width}
            height={image.height}
            alt=""
            decoding="async"
          />
        )
      })}
    </div>
  )
}
