import type { ReactNode } from 'react'
import type { Expression } from '../data/types'
import { characterColors } from './dialogue/characterColors'
import { NamePlate } from './dialogue/NamePlate'
import { Portrait } from './scene/Portrait'

/** 先生のキャラクターID（オンラインの家庭教師。GAME_SPEC 2-3） */
export const TEACHER_ID = 'teacher'

/**
 * ビデオ通話の枠（オンライン授業）。枠は画面の作りで描き、中に立ち絵の顔と肩のあたりを出す。
 * size：story はおはなしの画面の上、mini は学習画面の説明の横に置く小さな枠
 */
export function CallFrame({ characterId = TEACHER_ID, expression = 'normal', size = 'story' }: { characterId?: string; expression?: Expression; size?: 'story' | 'mini' }) {
  return (
    <div className={`call-frame call-frame--${size}`} style={characterColors(characterId)} aria-label="ビデオ通話">
      {size === 'story' && (
        <div className="call-frame__bar">
          <span className="call-frame__dot" aria-hidden="true" />
          <span className="call-frame__label">ビデオ通話</span>
        </div>
      )}
      <div className="call-frame__video">
        <Portrait characterId={characterId} expression={expression} className="call-frame__portrait" />
      </div>
    </div>
  )
}

/**
 * 学習画面の説明を、先生が話す形で出す（GAME_SPEC 2-3。計画 Q7：説明の上に横長の枠）。
 * 段落（paragraphs）ごとに吹き出しを分ける。children は吹き出しの後に置くもの（図など）
 */
export function TeacherSays({ paragraphs, expression = 'normal', children }: { paragraphs: readonly string[]; expression?: Expression; children?: ReactNode }) {
  return (
    <section className="teacher-says" aria-label="先生の説明">
      <div className="teacher-says__head">
        <CallFrame size="mini" expression={expression} />
        <NamePlate speaker={TEACHER_ID} display="hide" />
      </div>
      <div className="teacher-says__bubbles">
        {paragraphs.map((p, i) => (
          <p key={i} className="teacher-says__bubble">
            {p}
          </p>
        ))}
        {children}
      </div>
    </section>
  )
}
