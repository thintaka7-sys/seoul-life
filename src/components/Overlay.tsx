import { useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

/** 重ねて出す画面の置き場所（App の一番外側の枠の中。設定の「動き」などの指定が届くように、body ではなくここに置く） */
export const OVERLAY_ROOT_ID = 'overlay-root'

interface OverlayProps {
  /** 見出しの id（aria-labelledby）。見出しがなければ label を使う */
  labelledBy?: string
  label?: string
  /** 板に足すクラス */
  className?: string
  style?: CSSProperties
  children: ReactNode
  /** 板の下に、いつも見えるように置くボタン（中身がスクロールしても隠れない） */
  actions?: ReactNode
}

/**
 * 画面全体に重ねて出す板（説明・ログ・紹介など）。
 * ぼかし（backdrop-filter）などのある板の中で出すと、「画面全体」がその板の大きさになってはみ出すため、
 * 画面の一番外側に移して出す（BUG-003）。高さが足りないときは中身だけをスクロールし、ボタンは下にいつも見せる。
 */
export function Overlay({ labelledBy, label, className, style, children, actions }: OverlayProps) {
  const [root] = useState(() => (typeof document === 'undefined' ? null : (document.getElementById(OVERLAY_ROOT_ID) ?? document.body)))
  const content = (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby={labelledBy} aria-label={labelledBy === undefined ? label : undefined}>
      <div className={`overlay__panel${className === undefined ? '' : ` ${className}`}`} style={style}>
        <div className="overlay__body">{children}</div>
        {actions !== undefined && <div className="overlay__actions">{actions}</div>}
      </div>
    </div>
  )
  return root === null ? content : createPortal(content, root)
}
