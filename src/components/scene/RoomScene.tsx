import type { CSSProperties } from 'react'
import { content, furnitureImage } from '../../data'
import type { Furniture, ImageAsset, RoomSlot } from '../../data/types'
import type { PlacedFurniture } from '../../game/home/home'
import { furnitureRect, lightAngle, toneSampleRect, unionRect, type RoomRect } from '../../game/home/layout'
import { assetUrl } from './assetUrl'
import { toneColor, useRoomSampler, type RoomSampler } from './roomTone'

/** 家具の絵が届くまでの仮の絵（場所に出す絵文字） */
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

/** 部屋になじませる強さ（docs/PHASE4_HOME_PLAN.md 2-4。試作の案2）。線と鮮やかさは、絵に焼き込んである（npm run assets） */
const TONE = {
  /** その場所の部屋の色を掛け合わせる強さ */
  tint: 0.35,
  /** 窓側を明るく（ソフトライト） */
  light: 0.38,
  /** 反対側を暗く */
  shade: 0.3,
  /** 床に触れる影 */
  contact: 0.6,
  /** 手前へ落ちる薄い影 */
  cast: 0.25,
}

/** 絵の 高さ÷幅（絵が届くまでは 1） */
function ratioOf(item: Furniture): number {
  const image = furnitureImage(item.image)
  return image === undefined ? 1 : image.height / image.width
}

function rectStyle(r: RoomRect): CSSProperties {
  return { left: `${r.x}%`, top: `${r.y}%`, width: `${r.w}%`, height: `${r.h}%` }
}

function Piece({ slot, item, roomAspect, sampler }: PlacedFurniture & { roomAspect: number; sampler: RoomSampler | null }) {
  const room = content.balance.room
  const image = furnitureImage(item.image)
  const ratio = ratioOf(item)
  const rect = furnitureRect(slot, item, ratio, room, roomAspect)
  const style: CSSProperties = { ...rectStyle(rect), zIndex: slot.layer }
  if (image === undefined) {
    return (
      <span className="room__piece room__placeholder" style={style} data-furniture={item.id} aria-hidden="true">
        {PLACEHOLDER_ART[item.id] ?? '📦'}
      </span>
    )
  }
  const src = assetUrl(image.src)
  const mask: CSSProperties = { WebkitMaskImage: `url("${src}")`, maskImage: `url("${src}")` }
  const angle = lightAngle(rect, room, roomAspect)
  const tint = sampler === null ? null : toneColor(sampler(toneSampleRect(slot, rect)))
  // 影の大きさは、家具の絵の高さに対する割合（絵の幅の 0.2 倍・0.35 倍の高さの楕円）
  const contactH = (0.2 / ratio) * 100
  const castH = (0.35 / ratio) * 100
  return (
    <span className={`room__piece room__piece--${slot.kind}`} style={style} data-furniture={item.id} aria-hidden="true">
      {slot.kind === 'floor' && (
        <>
          <span
            className="room__shadow room__shadow--cast"
            style={{
              left: `${Math.sin((angle * Math.PI) / 180) * 18}%`,
              top: `${100 - contactH * 0.5}%`,
              height: `${castH}%`,
              background: `radial-gradient(closest-side, rgb(70 44 24 / ${TONE.cast}), rgb(70 44 24 / 0))`,
            }}
          />
          <span
            className="room__shadow room__shadow--contact"
            style={{
              top: `${100 - contactH * 0.62}%`,
              height: `${contactH}%`,
              background: `radial-gradient(closest-side, rgb(70 44 24 / ${TONE.contact}), rgb(70 44 24 / ${TONE.contact * 0.45}) 55%, rgb(70 44 24 / 0))`,
            }}
          />
        </>
      )}
      <img className="room__item" src={src} alt="" decoding="async" />
      {tint !== null && <span className="room__tone room__tone--tint" style={{ ...mask, background: `rgb(${tint.join(' ')})`, opacity: TONE.tint }} />}
      <span
        className="room__tone room__tone--light"
        style={{
          ...mask,
          background: `linear-gradient(${angle.toFixed(1)}deg, rgb(255 238 205 / ${TONE.light}) 0%, rgb(255 238 205 / 0) 45%, rgb(70 48 32 / 0) 55%, rgb(70 48 32 / ${TONE.shade}) 100%)`,
        }}
      />
    </span>
  )
}

/** 家具より手前にある物（ベッドなど）。部屋の絵のその形の所を、家具の上に描き直す */
function Occluders({ placed, src }: { placed: readonly PlacedFurniture[]; src: string }) {
  const used = new Set(placed.flatMap((p) => p.slot.behind ?? []))
  return content.balance.room.occluders
    .filter((o) => used.has(o.id))
    .map((o) => (
      <span
        key={o.id}
        className="room__occluder"
        data-occluder={o.id}
        style={{ backgroundImage: `url("${src}")`, clipPath: `polygon(${o.points.map(([x, y]) => `${x}% ${y}%`).join(', ')})`, zIndex: o.layer }}
        aria-hidden="true"
      />
    ))
}

/** 場所の枠（部屋を飾る画面）：その場所に置ける家具を置いたときの範囲をすべて囲む */
function slotArea(slot: RoomSlot, roomAspect: number): RoomRect | null {
  const room = content.balance.room
  return unionRect(content.furniture.filter((f) => f.slot === slot.id).map((f) => furnitureRect(slot, f, ratioOf(f), room, roomAspect)))
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
 * 家具は本当の大きさで、奥ほど小さく置く（壁の物は正面の壁、床の物は床に触れる所）。
 * その場所の光の色・窓からの光の向き・床に触れる影で、部屋になじませる。手前にある物（ベッドなど）は家具の上に描き直す。
 * 大きさは親が決める（--room-aspect に絵の縦横の比を入れる）
 */
export function RoomScene({ image, placed, imageClassName, slots, selected = null }: RoomSceneProps) {
  const src = assetUrl(image.src)
  const sampler = useRoomSampler(src)
  const roomAspect = image.height / image.width
  const style = { '--room-aspect': `${image.width} / ${image.height}` } as CSSProperties
  return (
    <div className="room" style={style} data-room-items={placed.length}>
      <img className={`room__bg${imageClassName === undefined ? '' : ` ${imageClassName}`}`} src={src} alt="" decoding="async" />
      {placed.map((p) => (
        <Piece key={p.slot.id} {...p} roomAspect={roomAspect} sampler={sampler} />
      ))}
      <Occluders placed={placed} src={src} />
      {slots?.map((s, i) => {
        const area = slotArea(s, roomAspect)
        if (area === null) return null
        return (
          <span key={s.id} className={`room__slot${s.id === selected ? ' room__slot--selected' : ''}`} style={rectStyle(area)} data-slot-area={s.id} aria-hidden="true">
            <span className="room__slot-number">{i + 1}</span>
          </span>
        )
      })}
    </div>
  )
}
