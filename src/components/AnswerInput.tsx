import { useState, type KeyboardEvent } from 'react'
import { backspace, typeJamo, typeSpace } from '../learning/hangul/keyboard'
import { Button } from './Button'
import { HangulKeyboard } from './HangulKeyboard'

interface AnswerInputProps {
  onSubmit: (text: string) => void
}

/**
 * 韓国語を書いて答える入力欄。最初はゲーム内キーボードで、端末のキーボードにも切り替えられる。
 * ゲーム内キーボードを使う間は inputMode="none" にして、スマホの端末キーボードが重なって出ないようにする。
 */
export function AnswerInput({ onSubmit }: AnswerInputProps) {
  const [text, setText] = useState('')
  const [deviceKeyboard, setDeviceKeyboard] = useState(false)

  function submit() {
    if (text.trim() !== '') onSubmit(text)
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    // 端末のIMEで変換中の Enter は、答えの送信にしない
    if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
      e.preventDefault()
      submit()
    }
  }

  return (
    <div className="answer-input">
      <div className="answer-input__row">
        <input
          className="answer-input__field"
          type="text"
          lang="ko"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          inputMode={deviceKeyboard ? 'text' : 'none'}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          aria-label="答え（韓国語）"
          placeholder="ここに韓国語で書く"
        />
        <Button variant="primary" onClick={submit} disabled={text.trim() === ''}>
          答える
        </Button>
      </div>
      <button type="button" className="link-button" onClick={() => setDeviceKeyboard((d) => !d)}>
        {deviceKeyboard ? 'ゲーム内のキーボードを使う' : '端末のキーボードを使う'}
      </button>
      {!deviceKeyboard && (
        <HangulKeyboard
          onJamo={(j) => setText((t) => typeJamo(t, j))}
          onBackspace={() => setText((t) => backspace(t))}
          onSpace={() => setText((t) => typeSpace(t))}
        />
      )}
    </div>
  )
}
