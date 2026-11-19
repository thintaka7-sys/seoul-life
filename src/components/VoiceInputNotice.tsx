import { useEffect, useRef } from 'react'
import { Button } from './Button'

/**
 * 音声入力を初めて使うときの説明（GAME_SPEC 4-5）。
 * 音声はブラウザの提供元のサーバーで文字にされることがあるため、使う前に知らせて選んでもらう。
 */
export function VoiceInputNotice({ onAccept, onDecline }: { onAccept: () => void; onDecline: () => void }) {
  const acceptRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    acceptRef.current?.focus()
  }, [])
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="voice-notice-title">
      <div className="overlay__panel">
        <h2 id="voice-notice-title" className="section-title">
          話して答える前に
        </h2>
        <p>話した声は、ブラウザの音声認識の機能で文字にします。このとき、声がブラウザの提供元（Google・Apple など）のサーバーに送られて処理されることがあります。</p>
        <p>このゲームは、声も文字にした結果も保存しません。発音の採点はせず、正しい文として通じたかだけを確かめます。</p>
        <p className="muted small">あとから設定の「音声入力（話して答える）」で、いつでもオン・オフできます。</p>
        <Button ref={acceptRef} variant="primary" onClick={onAccept}>
          使う
        </Button>
        <Button onClick={onDecline}>使わない</Button>
      </div>
    </div>
  )
}
