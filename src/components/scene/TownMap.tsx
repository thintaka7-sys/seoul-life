import type { CSSProperties } from 'react'
import type { ImageAsset, Location } from '../../data/types'
import { assetUrl } from './assetUrl'

interface TownMapProps {
  image: ImageAsset
  /** マップの上に置く施設（mapArea のあるもの） */
  locations: readonly (Location & { mapArea: NonNullable<Location['mapArea']> })[]
  isOpen: (locationId: string) => boolean
  /** 目標の施設（印を付ける） */
  targetId: string | undefined
  onSelect: (locationId: string) => void
}

/** 街のマップの絵と、施設を押せる印 */
export function TownMap({ image, locations, isOpen, targetId, onSelect }: TownMapProps) {
  return (
    <div className="town-map" style={{ aspectRatio: `${image.width} / ${image.height}` }}>
      <img className="town-map__img" src={assetUrl(image.src)} width={image.width} height={image.height} alt="" decoding="async" />
      {locations.map((loc) => {
        const open = isOpen(loc.id)
        const target = loc.id === targetId
        const area = loc.mapArea
        const style = { left: `${area.x}%`, top: `${area.y}%`, width: `${area.w}%`, height: `${area.h}%` } as CSSProperties
        return (
          <button
            key={loc.id}
            type="button"
            className={`town-map__spot${open ? '' : ' town-map__spot--locked'}${target ? ' town-map__spot--target' : ''}`}
            style={style}
            disabled={!open}
            onClick={() => onSelect(loc.id)}
          >
            <span className="town-map__label">
              {!open && <span aria-hidden="true">🔒 </span>}
              {loc.nameJa}
              {!open && <span className="visually-hidden">（まだ行けません）</span>}
              {open && target && <span className="town-map__badge">目標</span>}
            </span>
          </button>
        )
      })}
    </div>
  )
}
