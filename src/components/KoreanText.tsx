import { Fragment, useState } from 'react'
import { pairReading, type FuriganaDisplay } from '../learning/furigana/furigana'

interface KoreanTextProps {
  korean: string
  /** 読み（カタカナ）。ない場合はフリガナなしで表示する */
  reading: string | null
  display: FuriganaDisplay
  className?: string
}

/**
 * 韓国語を、区切り（空白）ごとにフリガナ（ルビ）を付けて表示する。
 * display が tap のときは、文をタップするとフリガナが出たり消えたりする。
 */
export function KoreanText({ korean, reading, display, className }: KoreanTextProps) {
  const [open, setOpen] = useState(false)
  const segments = reading === null ? null : pairReading(korean, reading)
  const show = segments !== null && (display === 'show' || (display === 'tap' && open))
  const classes = ['ko-text', className].filter(Boolean).join(' ')

  const body =
    show && segments !== null
      ? segments.map((seg, i) => (
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
      : korean

  if (display === 'tap' && segments !== null) {
    return (
      <button
        type="button"
        className={`${classes} ko-text--tap`}
        lang="ko"
        aria-pressed={open}
        title={open ? 'タップでフリガナを隠す' : 'タップでフリガナを表示'}
        onClick={() => setOpen((o) => !o)}
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
