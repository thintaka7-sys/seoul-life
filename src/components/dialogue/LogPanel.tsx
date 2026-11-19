import { useEffect, useRef } from 'react'
import type { ShownLine } from '../../learning/conversation/session'
import type { FuriganaDisplay } from '../../learning/furigana/furigana'
import { Button } from '../Button'
import { KoreanText } from '../KoreanText'
import { SpeakButton } from '../SpeakButton'
import { Translation } from '../Translation'
import { characterColors } from './characterColors'
import { NamePlate } from './NamePlate'

/** これまでの台詞を見返す一覧（ログ） */
export function LogPanel({ lines, display, onClose }: { lines: readonly ShownLine[]; display: FuriganaDisplay; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="会話のログ">
      <div className="overlay__panel">
        <h2 className="section-title">会話のログ</h2>
        <ol className="log-list">
          {lines
            .filter((l) => l.kind !== 'wrongReply')
            .map((l, i) => (
              <li key={i} className={`log-line log-line--${l.kind}`} style={characterColors(l.speaker)}>
                <NamePlate speaker={l.speaker} display={display} />
                <div className="ko-row">
                  <KoreanText korean={l.korean} reading={l.pronunciation} display={display} />
                  <SpeakButton text={l.korean} />
                </div>
                <Translation text={l.japanese} className="log-line__ja" />
              </li>
            ))}
        </ol>
        <Button ref={closeRef} variant="primary" onClick={onClose}>
          閉じる
        </Button>
      </div>
    </div>
  )
}
