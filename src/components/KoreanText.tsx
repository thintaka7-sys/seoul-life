import { Fragment, useState, type ReactNode } from 'react'
import { pairReading, type FuriganaDisplay, type RubySegment } from '../learning/furigana/furigana'
import { plainSegments, revealSegments } from './dialogue/typewriter'

interface KoreanTextProps {
  korean: string
  /** 読み（カタカナ）。ない場合はフリガナなしで表示する */
  reading: string | null
  display: FuriganaDisplay
  className?: string
  /** 文字送りの途中なら、見せる文字数。省略したら全文 */
  visibleChars?: number
}

/** 文字送りの途中の表示。まだ見えない文字は場所だけ取り（行がずれないように）、フリガナは区切りを表示し終えてから出す */
function typedBody(segments: readonly RubySegment[], visible: number, withRuby: boolean): ReactNode {
  return revealSegments(segments, visible).map((seg, i) => {
    const text = (
      <>
        {seg.shown}
        {seg.hidden !== '' && <span className="tw-hidden">{seg.hidden}</span>}
      </>
    )
    return (
      <Fragment key={i}>
        {i > 0 && (seg.spaceShown ? ' ' : <span className="tw-hidden"> </span>)}
        {withRuby && seg.ruby !== null ? (
          <ruby>
            {text}
            <rt lang="ja" className={seg.complete ? undefined : 'tw-hidden'}>
              {seg.ruby}
            </rt>
          </ruby>
        ) : (
          text
        )}
      </Fragment>
    )
  })
}

/**
 * 韓国語を、区切り（空白）ごとにフリガナ（ルビ）を付けて表示する。
 * display が tap のときは、文をタップするとフリガナが出たり消えたりする。
 */
export function KoreanText({ korean, reading, display, className, visibleChars }: KoreanTextProps) {
  const [open, setOpen] = useState(false)
  const segments = reading === null ? null : pairReading(korean, reading)
  const show = segments !== null && (display === 'show' || (display === 'tap' && open))
  const classes = ['ko-text', className].filter(Boolean).join(' ')

  let body: ReactNode
  if (visibleChars !== undefined) {
    body = typedBody(segments ?? plainSegments(korean), visibleChars, show)
  } else if (show && segments !== null) {
    body = segments.map((seg, i) => (
      <Fragment key={i}>
        {i > 0 && ' '}
        {seg.ruby === null ? (
          seg.base
        ) : (
          <ruby>
            {seg.base}
            <rt lang="ja">{seg.ruby}</rt>
          </ruby>
        )}
      </Fragment>
    ))
  } else {
    body = korean
  }

  if (display === 'tap' && segments !== null) {
    return (
      <button
        type="button"
        className={`${classes} ko-text--tap`}
        lang="ko"
        aria-pressed={open}
        title={open ? 'タップでフリガナを隠す' : 'タップでフリガナを表示'}
        onClick={(e) => {
          // 台詞の枠のタップ（文字送り・次へ）と区別する
          e.stopPropagation()
          setOpen((o) => !o)
        }}
      >
        {body}
      </button>
    )
  }
  return (
    <span className={classes} lang="ko">
      {body}
    </span>
  )
}
