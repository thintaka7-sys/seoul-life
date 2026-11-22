import { useState } from 'react'
import { useGame } from '../app/GameContext'
import type { TranslationMode } from '../storage/settings'

interface TranslationProps {
  /** 日本語訳 */
  text: string
  className?: string
}

function TranslationBody({ text, className, mode }: TranslationProps & { mode: TranslationMode }) {
  const [open, setOpen] = useState(false)
  if (mode === 'off') return null
  if (mode === 'always') return <p className={className}>{text}</p>
  return (
    <p className={className}>
      <button
        type="button"
        className={`translation-tap${open ? ' translation-tap--open' : ''}`}
        aria-expanded={open}
        title={open ? 'タップで日本語訳を隠す' : 'タップで日本語訳を表示'}
        onClick={(e) => {
          // 台詞の枠のタップ（文字送り・次へ）と区別する
          e.stopPropagation()
          setOpen((o) => !o)
        }}
      >
        {open ? text : '日本語訳を見る'}
      </button>
    </p>
  )
}

/**
 * 日本語訳。設定（GAME_SPEC 9-3：いつも表示／タップで表示／表示しない）に従って出す。
 * 「タップで表示」は文ごとに出し入れする。文が変わったら閉じた状態に戻す。
 * 使う場所：台詞・反応・ログ・単語カードの例文・コラムの韓国語（選択肢・単語の意味・書く問題のお題には使わない）。
 * mode を渡すと、設定の代わりにその出し方にする（おはなしの画面で、その場で切り替えたとき）。
 */
export function Translation({ text, className, mode }: TranslationProps & { mode?: TranslationMode }) {
  const { state } = useGame()
  return <TranslationBody key={text} text={text} className={className} mode={mode ?? state.settings.translation} />
}
