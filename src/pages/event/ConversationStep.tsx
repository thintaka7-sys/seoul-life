import { useMemo, useReducer, useState } from 'react'
import { useGame, nowIso } from '../../app/GameContext'
import { useFuriganaDisplay } from '../../app/hooks'
import { AnswerInput } from '../../components/AnswerInput'
import { Button } from '../../components/Button'
import { KoreanText } from '../../components/KoreanText'
import { Notice } from '../../components/Notice'
import { SpeakButton } from '../../components/SpeakButton'
import { SpeechNotice } from '../../components/SpeechNotice'
import { content, findCharacter } from '../../data'
import { PLAYER_SPEAKER_ID, type Conversation, type ConversationChoice } from '../../data/types'
import { availableModes, canReveal, createSessionReducer, initialSession, isAnswering } from '../../learning/conversation/session'
import type { FuriganaDisplay } from '../../learning/furigana/furigana'

function speakerName(speaker: string): string {
  if (speaker === PLAYER_SPEAKER_ID) return 'あなた'
  return findCharacter(speaker)?.roleJa ?? speaker
}

function Line({ speaker, korean, reading, japanese, display }: { speaker: string; korean: string; reading: string | null; japanese: string; display: FuriganaDisplay }) {
  return (
    <li className={`line${speaker === PLAYER_SPEAKER_ID ? ' line--player' : ''}`}>
      <span className="line__speaker">{speakerName(speaker)}</span>
      <div className="ko-row">
        <KoreanText korean={korean} reading={reading} display={display} className="line__ko" />
        <SpeakButton text={korean} />
      </div>
      <p className="line__ja">{japanese}</p>
    </li>
  )
}

/** 選択肢。フリガナが「タップで表示」のときは、選択肢を押すと答えになってしまうため、横の「読み」ボタンで出す */
function ChoiceItem({ choice, wrong, display, onChoose }: { choice: ConversationChoice; wrong: boolean; display: FuriganaDisplay; onChoose: () => void }) {
  const [showReading, setShowReading] = useState(false)
  const choiceDisplay: FuriganaDisplay = display === 'tap' ? (showReading ? 'show' : 'hide') : display
  return (
    <li className="choice">
      <button type="button" className={`choice__button${wrong ? ' choice__button--wrong' : ''}`} onClick={onChoose} disabled={wrong}>
        <KoreanText korean={choice.korean} reading={choice.pronunciation} display={choiceDisplay} />
      </button>
      {display === 'tap' && (
        <button type="button" className="icon-button icon-button--text" aria-pressed={showReading} onClick={() => setShowReading((s) => !s)}>
          読み
        </button>
      )}
      <SpeakButton text={choice.korean} />
    </li>
  )
}

export function ConversationStep({ conversation }: { conversation: Conversation }) {
  const { dispatch } = useGame()
  const display = useFuriganaDisplay(conversation.chapter)
  const reducer = useMemo(() => createSessionReducer(conversation, content.balance.writeAttemptsBeforeReveal), [conversation])
  const [s, send] = useReducer(reducer, undefined, initialSession)
  const modes = availableModes(conversation)
  const answering = isAnswering(conversation, s)
  const lastWrong = s.wrongChoices.at(-1)
  const lastWrongChoice = lastWrong === undefined ? undefined : conversation.choices[lastWrong]

  return (
    <>
      <SpeechNotice />
      <ol className="lines">
        {conversation.lines.slice(0, s.shownLines).map((line, i) => (
          <Line key={i} speaker={line.speaker} korean={line.korean} reading={line.pronunciation} japanese={line.japanese} display={display} />
        ))}
        {s.result !== null && (
          <Line speaker={PLAYER_SPEAKER_ID} korean={s.result.line.korean} reading={s.result.line.pronunciation} japanese={s.result.line.japanese} display={display} />
        )}
      </ol>

      {!answering && s.result === null && (
        <Button variant="primary" onClick={() => send({ type: 'nextLine' })}>
          次へ
        </Button>
      )}

      {answering && (
        <section className="answer" aria-label="返事をする">
          {modes.length > 1 && (
            <div className="mode-tabs" role="group" aria-label="答え方">
              {modes.map((mode) => (
                <button key={mode} type="button" className="mode-tab" aria-pressed={s.mode === mode} onClick={() => send({ type: 'setMode', mode })}>
                  {mode === 'choice' ? '選んで答える' : '書いて答える'}
                </button>
              ))}
            </div>
          )}

          {s.mode === 'choice' && (
            <>
              <p className="step-heading">返事を選んでください</p>
              <ul className="choices">
                {conversation.choices.map((choice, i) => (
                  <ChoiceItem key={choice.korean} choice={choice} wrong={s.wrongChoices.includes(i)} display={display} onChoose={() => send({ type: 'choose', index: i })} />
                ))}
              </ul>
              {lastWrongChoice !== undefined && (
                <Notice tone="warn">
                  「<span lang="ko">{lastWrongChoice.korean}</span>」は「{lastWrongChoice.japanese}」という意味です。もう一度選んでみましょう。
                </Notice>
              )}
            </>
          )}

          {s.mode === 'write' && conversation.freeAnswer !== undefined && (
            <>
              <p className="step-heading">「{conversation.freeAnswer.prompt}」を韓国語で書いてみましょう</p>
              <AnswerInput onSubmit={(text) => send({ type: 'submitWrite', text })} />
              {s.lastJudge?.kind === 'incorrect' && <Notice tone="warn">ちがうようです。もう一度書いてみましょう。</Notice>}
              {canReveal(s, content.balance.writeAttemptsBeforeReveal) && <Button onClick={() => send({ type: 'reveal' })}>答えを見る</Button>}
            </>
          )}
        </section>
      )}

      {s.result !== null && (
        <section className="result" aria-live="polite">
          {s.result.method === 'revealed' ? (
            <Notice>
              答え：<span lang="ko">{s.result.line.korean}</span>（次は書けるようにしてみましょう）
            </Notice>
          ) : s.result.spacingNote ? (
            <Notice tone="warn">
              正解。ただし分かち書きに注意：<span lang="ko">{s.result.line.korean}</span>
            </Notice>
          ) : (
            <p className="correct">正解！</p>
          )}
          <Button variant="primary" onClick={() => s.result !== null && dispatch({ type: 'conversationDone', method: s.result.method, now: nowIso() })}>
            次へ
          </Button>
        </section>
      )}
    </>
  )
}
