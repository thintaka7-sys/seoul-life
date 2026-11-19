import type { MouseEvent, ReactNode } from 'react'
import type { ShownLine } from '../../learning/conversation/session'
import type { FuriganaDisplay } from '../../learning/furigana/furigana'
import { KoreanText } from '../KoreanText'
import { SpeakButton } from '../SpeakButton'
import { Translation } from '../Translation'
import { characterColors } from './characterColors'
import { NamePlate } from './NamePlate'

interface DialogueBoxProps {
  line: ShownLine
  display: FuriganaDisplay
  /** 文字送りで見せている文字数と、表示し終えたか */
  typing: { visible: number; done: boolean; complete: () => void }
  /** 「次へ」で進めるか（返事を選ぶ間は進めない） */
  canAdvance: boolean
  onAdvance: () => void
  onOpenLog: () => void
  /** 台詞の上に出す知らせ（「正解！」など） */
  badge?: ReactNode
}

/**
 * いまの台詞を1つだけ見せる枠。枠をタップすると、文字送りの途中なら全文を表示し、表示し終えていれば次へ進む。
 * 日本語訳は、韓国語を表示し終えてから出す。
 */
export function DialogueBox({ line, display, typing, canAdvance, onAdvance, onOpenLog, badge }: DialogueBoxProps) {
  function tap(e: MouseEvent<HTMLElement>) {
    // 枠の中のボタン（読み上げ・フリガナ・ログ・次へ）は、それぞれの動きだけにする
    if (e.target instanceof Element && e.target.closest('button') !== null) return
    if (!typing.done) typing.complete()
    else if (canAdvance) onAdvance()
  }

  function next() {
    if (!typing.done) typing.complete()
    else onAdvance()
  }

  return (
    <section className={`dialogue dialogue--${line.kind}`} style={characterColors(line.speaker)} onClick={tap} aria-label="台詞">
      <div className="dialogue__head">
        <NamePlate speaker={line.speaker} display={display} />
        <button type="button" className="link-button dialogue__log" onClick={onOpenLog}>
          ログ
        </button>
      </div>
      {badge}
      <div className="ko-row">
        <KoreanText korean={line.korean} reading={line.pronunciation} display={display} className="dialogue__ko" visibleChars={typing.done ? undefined : typing.visible} />
        <SpeakButton text={line.korean} />
      </div>
      <Translation text={line.japanese} className={`dialogue__ja${typing.done ? '' : ' dialogue__ja--waiting'}`} />
      {(canAdvance || !typing.done) && (
        <button type="button" className="button button--primary dialogue__next" onClick={next}>
          次へ
          <span aria-hidden="true" className="dialogue__next-mark">
            ▼
          </span>
        </button>
      )}
    </section>
  )
}
