import { useEffect, useMemo, useReducer, useState } from 'react'
import { useGame, nowIso } from '../../app/GameContext'
import { useFuriganaDisplay } from '../../app/hooks'
import { AnswerInput } from '../../components/AnswerInput'
import { Button } from '../../components/Button'
import { DialogueBox } from '../../components/dialogue/DialogueBox'
import { LogPanel } from '../../components/dialogue/LogPanel'
import { ProfileCard } from '../../components/dialogue/ProfileCard'
import { TEXT_SPEED_MS, plainSegments, totalChars } from '../../components/dialogue/typewriter'
import { useTypewriter } from '../../components/dialogue/useTypewriter'
import { KoreanText } from '../../components/KoreanText'
import { Notice } from '../../components/Notice'
import { Stage } from '../../components/scene/Stage'
import { SpeakButton } from '../../components/SpeakButton'
import { SpeechNotice } from '../../components/SpeechNotice'
import { backgroundImage, content, findCharacter, firstConversationWith } from '../../data'
import type { Conversation, ConversationChoice } from '../../data/types'
import {
  availableModes,
  canReveal,
  characterExpression,
  createSessionReducer,
  initialSession,
  sessionPhase,
  shownLines,
  type ConversationSession,
  type TurnAnswer,
} from '../../learning/conversation/session'
import { pairReading, type FuriganaDisplay } from '../../learning/furigana/furigana'

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

/** 答えた直後に、主人公の返事の上に出す知らせ */
function AnswerBadge({ answer }: { answer: TurnAnswer }) {
  if (answer.method === 'revealed') {
    return (
      <Notice>
        答え：<span lang="ko">{answer.line.korean}</span>（次は書けるようにしてみましょう）
      </Notice>
    )
  }
  if (answer.spacingNote) {
    return (
      <Notice tone="warn">
        正解。ただし分かち書きに注意：<span lang="ko">{answer.line.korean}</span>
      </Notice>
    )
  }
  return (
    <p className="correct" aria-live="polite">
      正解！
    </p>
  )
}

/** 返事をする欄（選ぶ・書く） */
function AnswerArea({
  conversation,
  s,
  send,
  display,
}: {
  conversation: Conversation
  s: ConversationSession
  send: (a: Parameters<ReturnType<typeof createSessionReducer>>[1]) => void
  display: FuriganaDisplay
}) {
  const turn = conversation.turns[s.turn]
  if (turn?.choices === undefined) return null
  const modes = availableModes(turn)
  const lastWrong = s.wrongChoices.at(-1)
  const lastWrongChoice = lastWrong === undefined ? undefined : turn.choices[lastWrong]

  return (
    <section className="answer panel" aria-label="返事をする">
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
            {turn.choices.map((choice, i) => (
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

      {s.mode === 'write' && turn.freeAnswer !== undefined && (
        <>
          <p className="step-heading">「{turn.freeAnswer.prompt}」を韓国語で書いてみましょう</p>
          <AnswerInput key={s.turn} onSubmit={(text) => send({ type: 'submitWrite', text })} />
          {s.lastJudge?.kind === 'incorrect' && <Notice tone="warn">ちがうようです。もう一度書いてみましょう。</Notice>}
          {canReveal(conversation, s, content.balance.writeAttemptsBeforeReveal) && <Button onClick={() => send({ type: 'reveal' })}>答えを見る</Button>}
        </>
      )}
    </section>
  )
}

export function ConversationStep({ conversation, replay }: { conversation: Conversation; replay: boolean }) {
  const { state, dispatch } = useGame()
  const display = useFuriganaDisplay(conversation.chapter)
  const reducer = useMemo(() => createSessionReducer(conversation, content.balance.writeAttemptsBeforeReveal), [conversation])
  const [s, send] = useReducer(reducer, conversation, initialSession)
  const [logOpen, setLogOpen] = useState(false)
  const character = findCharacter(conversation.character)
  const [profileOpen, setProfileOpen] = useState(() => !replay && character !== undefined && firstConversationWith(conversation.character) === conversation.id)

  const phase = sessionPhase(conversation, s)
  const lines = shownLines(conversation, s)
  const current = lines.at(-1)
  const lineKey = `${s.turn}:${lines.length}:${current?.kind ?? ''}`
  const segments = current === undefined ? [] : current.pronunciation === null ? plainSegments(current.korean) : (pairReading(current.korean, current.pronunciation) ?? plainSegments(current.korean))
  // 紹介のカードを出している間と、主人公の返事は文字送りしない
  const msPerChar = profileOpen || current?.kind === 'player' ? 0 : TEXT_SPEED_MS[state.settings.textSpeed]
  const typing = useTypewriter(lineKey, totalChars(segments), msPerChar)

  // 往復に答えたら、その場で経験値を付ける
  const answer = s.answer
  const answeredTurn = s.turn
  useEffect(() => {
    if (answer !== null) dispatch({ type: 'conversationAnswered', turn: answeredTurn, method: answer.method, now: nowIso() })
  }, [answer, answeredTurn, dispatch])

  const writing = phase === 'answer' && s.mode === 'write'
  const advance = () => (phase === 'end' ? dispatch({ type: 'conversationDone', now: nowIso() }) : send({ type: 'next' }))

  return (
    <div className="conversation">
      <Stage
        locationId={conversation.location}
        characterId={conversation.character}
        expression={characterExpression(conversation, s)}
        size={writing ? 'compact' : 'normal'}
        hasBackground={backgroundImage(conversation.location) !== undefined}
      />
      <SpeechNotice />
      {current !== undefined && (
        <DialogueBox
          line={current}
          display={display}
          typing={typing}
          canAdvance={phase !== 'answer'}
          onAdvance={advance}
          onOpenLog={() => setLogOpen(true)}
          badge={current.kind === 'player' && answer !== null ? <AnswerBadge answer={answer} /> : undefined}
        />
      )}
      {phase === 'answer' && typing.done && !profileOpen && <AnswerArea conversation={conversation} s={s} send={send} display={display} />}
      {logOpen && <LogPanel lines={lines} display={display} onClose={() => setLogOpen(false)} />}
      {profileOpen && character !== undefined && <ProfileCard character={character} display={display} onClose={() => setProfileOpen(false)} />}
    </div>
  )
}
