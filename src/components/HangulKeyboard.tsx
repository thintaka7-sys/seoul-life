import { useState } from 'react'
import { KEY_ROWS, SHIFTED, keyLabel } from '../learning/hangul/keyboard'

interface HangulKeyboardProps {
  onJamo: (jamo: string) => void
  onBackspace: () => void
  onSpace: () => void
}

/**
 * ゲーム内ハングルキーボード（2ボル式）。
 * 1段目は10キーあるため、幅375pxではキーの幅が44pxに届かない。キーの高さを48pxにし、
 * キーの間にすき間を作らないことで押しやすくしている（計画 Q5 で承認済み）。
 */
export function HangulKeyboard({ onJamo, onBackspace, onSpace }: HangulKeyboardProps) {
  const [shift, setShift] = useState(false)

  function type(jamo: string) {
    onJamo(keyLabel(jamo, shift))
    if (shift) setShift(false)
  }

  const [row1 = [], row2 = [], row3 = []] = KEY_ROWS
  const key = (jamo: string) => {
    const label = keyLabel(jamo, shift)
    return (
      <button key={jamo} type="button" className={`kb-key${shift && SHIFTED[jamo] ? ' kb-key--shifted' : ''}`} onClick={() => type(jamo)} aria-label={label}>
        {label}
      </button>
    )
  }

  return (
    <div className="keyboard" role="group" aria-label="ハングルキーボード" lang="ko">
      <div className="kb-row kb-row--10">{row1.map(key)}</div>
      <div className="kb-row kb-row--9">{row2.map(key)}</div>
      <div className="kb-row kb-row--3">
        <button type="button" className="kb-key kb-key--wide" aria-pressed={shift} onClick={() => setShift((s) => !s)} lang="ja" aria-label="シフト（濃音・ㅒ・ㅖ）">
          ⇧
        </button>
        {row3.map(key)}
        <button type="button" className="kb-key kb-key--wide" onClick={onBackspace} lang="ja" aria-label="1文字消す">
          ⌫
        </button>
      </div>
      <div className="kb-row kb-row--space">
        <button type="button" className="kb-key kb-key--space" onClick={onSpace} lang="ja">
          空白
        </button>
      </div>
    </div>
  )
}
