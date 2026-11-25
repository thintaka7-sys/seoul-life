import type { CSSProperties } from 'react'
import { furnitureImage } from '../../data'
import type { ImageAsset, RoomSlot } from '../../data/types'
import type { PlacedFurniture } from '../../game/home/home'
import { assetUrl } from './assetUrl'

/** 家具の絵が届くまでの仮の絵（場所の枠に出す絵文字） */
const PLACEHOLDER_ART: Readonly<Record<string, string>> = {
  furniture_001: '🕰️',
  furniture_002: '🌃',
  furniture_003: '📌',
  furniture_004: '🗃️',
  furniture_005: '💐',
  furniture_006: '🪞',
  furniture_007: '🪴',
  furniture_008: '💡',
  furniture_009: '📚',
  furniture_010: '🗄️',
  furniture_011: '🛋️',
  furniture_012: '📚',
  furniture_013: '🟡',
  furniture_014: '🌱',
  furniture_015: '💨',
  furniture_016: '⭕',
  furniture_017: '🏁',
  furniture_018: '🧩',
  furniture_019: '🌙',
  furniture_020: '☁️',
  furniture_021: '🧰',
}

function rect(slot: RoomSlot): CSSProperties {
  return { left: `${slot.x}%`, top: `${slot.y}%`, width: `${slot.w}%`, height: `${slot.h}%` }
}

function Piece({ slot, item }: PlacedFurniture) {
  const image = furnitureImage(item.image)
  const floor = slot.align === 'bottom'
  if (image === undefined) {
    return (
      <span className={`room__item room__placeholder${floor ? ' room__item--floor' : ''}`} style={rect(slot)} data-furniture={item.id} aria-hidden="true">
        {PLACEHOLDER_ART[item.id] ?? '📦'}
      </span>
    )
  }
  return (
    <img
      className={`room__item room__item--${slot.align}${floor ? ' room__item--floor' : ''}`}
      style={rect(slot)}
      src={assetUrl(image.src)}
      alt=""
      decoding="async"
      data-furniture={item.id}
    />
  )
}

interface RoomSceneProps {
  image: ImageAsset
  /** 置いてある家具（奥から順。placedFurniture） */
  placed: readonly PlacedFurniture[]
  /** 部屋の絵の img に付ける class（背景に敷くときは backdrop__sharp） */
  imageClassName?: string
  /** 枠を見せる場所（部屋を飾る画面）。selected の場所は濃く見せる */
  slots?: readonly RoomSlot[]
  selected?: string | null
}

/**
 * 部屋の絵に、置いた家具を重ねたもの（docs/PHASE4_HOME_PLAN.md 2章）。
 * 家具は場所の枠に、縦横の比を変えずに収める（床のものは枠の下の辺、壁・ラグは枠の中央にそろえる）。
 * 大きさは親が決める（--room-aspect に絵の縦横の比を入れる）
 */
export function RoomScene({ image, placed, imageClassName, slots, selected = null }: RoomSceneProps) {
  const style = { '--room-aspect': `${image.width} / ${image.height}` } as CSSProperties
  return (
    <div className="room" style={style} data-room-items={placed.length}>
      <img className={`room__bg${imageClassName === undefined ? '' : ` ${imageClassName}`}`} src={assetUrl(image.src)} alt="" decoding="async" />
      {placed.map((p) => (
        <Piece key={p.slot.id} {...p} />
      ))}
      {slots?.map((s, i) => (
        <span key={s.id} className={`room__slot${s.id === selected ? ' room__slot--selected' : ''}`} style={rect(s)} aria-hidden="true">
          <span className="room__slot-number">{i + 1}</span>
        </span>
      ))}
    </div>
  )
}
