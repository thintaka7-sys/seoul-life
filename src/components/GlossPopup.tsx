import { useEffect, useRef, type ReactNode } from 'react'
import { nowIso, useGame } from '../app/GameContext'
import { findVocab } from '../data'
import type { GlossSpan } from '../learning/gloss/resolve'
import { Button } from './Button'
import { Overlay } from './Overlay'
import { SpeakButton } from './SpeakButton'

/**
 * タップした語句の意味を見せる小さな窓（GAME_SPEC 4-8）。読み・意味・読み上げと、単語の教材にある語句なら「覚える」。
 * 「覚える」を押すと、図鑑の「見かけた単語」に入り、翌日から復習に出る。
 */
export function GlossPopup({ span, chapter, onClose }: { span: GlossSpan; chapter: number; onClose: () => void }) {
  const { state, dispatch } = useGame()
  const closeRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const target = span.target
  const vocab = target.kind === 'vocab' ? findVocab(target.vocabId) : undefined
  const learned = vocab !== undefined && state.save?.learning.words[vocab.id] !== undefined
  const seen = vocab !== undefined && state.save?.learning.seen[vocab.id] !== undefined

  let body: ReactNode
  if (target.kind === 'note') {
    body = (
      <>
        <p className="gloss-popup__reading">{target.pronunciation}</p>
        <p className="gloss-popup__meaning">{target.japanese}</p>
      </>
    )
  } else if (vocab === undefined) {
    body = <p className="muted">この言葉の説明が見つかりませんでした。</p>
  } else {
    body = (
      <>
        {vocab.korean !== span.text && (
          <p className="gloss-popup__head">
            <span lang="ko">{vocab.korean}</span>
            <span className="muted small">（単語の形）</span>
          </p>
        )}
        <p className="gloss-popup__reading">{vocab.pronunciation}</p>
        <p className="gloss-popup__meaning">{vocab.japanese}</p>
        {vocab.base !== undefined && (
          <p className="muted small">
            元の形：<span lang="ko">{vocab.base.korean}</span>（{vocab.base.pronunciation}）{vocab.base.japanese !== undefined && `＝${vocab.base.japanese}`}
          </p>
        )}
      </>
    )
  }

  return (
    <Overlay
      label={`言葉の意味：${span.text}`}
      className="gloss-popup"
      actions={
        <>
          {target.kind === 'note' && <p className="muted small gloss-popup__status">名前やその場だけの言い方なので、図鑑には入りません</p>}
          {vocab !== undefined &&
            (learned ? (
              <p className="muted small gloss-popup__status">図鑑で覚えた単語です</p>
            ) : seen ? (
              <p className="muted small gloss-popup__status">✓ 見かけた単語に入れました（翌日から復習に出ます）</p>
            ) : (
              <Button variant="primary" onClick={() => dispatch({ type: 'rememberWord', vocabId: vocab.id, chapter, now: nowIso() })}>
                覚える（復習に加える）
              </Button>
            ))}
          <Button ref={closeRef} onClick={onClose}>
            閉じる
          </Button>
        </>
      }
    >
      <div className="ko-row gloss-popup__word">
        <span className="gloss-popup__text" lang="ko">
          {span.text}
        </span>
        <SpeakButton text={vocab?.korean ?? span.text} />
      </div>
      {body}
      {target.noteJa !== undefined && <p className="gloss-popup__note">{target.noteJa}</p>}
    </Overlay>
  )
}
