import { Fragment, useState, type ReactNode } from 'react'
import { pairReading, type FuriganaDisplay, type RubySegment } from '../learning/furigana/furigana'
import type { GlossSpan } from '../learning/gloss/resolve'
import { plainSegments, revealSegments } from './dialogue/typewriter'

interface KoreanTextProps {
  korean: string
  /** 読み（カタカナ）。ない場合はフリガナなしで表示する */
  reading: string | null
  display: FuriganaDisplay
  className?: string
  /** 文字送りの途中なら、見せる文字数。省略したら全文 */
  visibleChars?: number
  /** タップで意味を見る語句（全文を表示しているときだけ押せる。GAME_SPEC 4-8） */
  glossSpans?: readonly GlossSpan[]
  onGloss?: (span: GlossSpan) => void
}

function segmentBody(seg: RubySegment, withRuby: boolean): ReactNode {
  return withRuby && seg.ruby !== null ? (
    <ruby>
      {seg.base}
      <rt lang="ja">{seg.ruby}</rt>
    </ruby>
  ) : (
    seg.base
  )
}

/** 語句をタップできる本文。語句ごとにボタンにし、ほかの区切りはそのまま出す */
function glossBody(segments: readonly RubySegment[], spans: readonly GlossSpan[], withRuby: boolean, onGloss: (span: GlossSpan) => void): ReactNode {
  const parts: ReactNode[] = []
  let i = 0
  while (i < segments.length) {
    const span = spans.find((s) => s.start === i)
    if (i > 0) parts.push(' ')
    if (span !== undefined) {
      const inner = segments.slice(span.start, span.end).map((seg, j) => (
        <Fragment key={j}>
          {j > 0 && ' '}
          {segmentBody(seg, withRuby)}
        </Fragment>
      ))
      parts.push(
        <button
          key={`g${i}`}
          type="button"
          className="gloss"
          aria-label={`意味を見る：${span.text}`}
          onClick={(e) => {
            // 台詞の枠のタップ（次へ）や、フリガナの出し入れと区別する
            e.stopPropagation()
            onGloss(span)
          }}
        >
          {inner}
        </button>,
      )
      i = span.end
    } else {
      const seg = segments[i]
      if (seg !== undefined) parts.push(<Fragment key={i}>{segmentBody(seg, withRuby)}</Fragment>)
      i++
    }
  }
  return parts
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
export function KoreanText({ korean, reading, display, className, visibleChars, glossSpans, onGloss }: KoreanTextProps) {
  const [open, setOpen] = useState(false)
  const segments = reading === null ? null : pairReading(korean, reading)
  const show = segments !== null && (display === 'show' || (display === 'tap' && open))
  const classes = ['ko-text', className].filter(Boolean).join(' ')

  // 語句をタップできるとき：語句はボタン。「タップで表示」のフリガナは、語句以外のところをタップして出し入れする
  if (visibleChars === undefined && onGloss !== undefined && glossSpans !== undefined && glossSpans.length > 0) {
    const segs = segments ?? korean.trim().split(/\s+/).filter((t) => t !== '').map((base) => ({ base, ruby: null }))
    const body = glossBody(segs, glossSpans, show, onGloss)
    if (display === 'tap' && segments !== null) {
      return (
        <span
          className={`${classes} ko-text--tap ko-text--glossed`}
          lang="ko"
          title={open ? 'タップでフリガナを隠す' : 'タップでフリガナを表示'}
          onClick={(e) => {
            e.stopPropagation()
            setOpen((o) => !o)
          }}
        >
          {body}
        </span>
      )
    }
    return (
      <span className={`${classes} ko-text--glossed`} lang="ko">
        {body}
      </span>
    )
  }

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
