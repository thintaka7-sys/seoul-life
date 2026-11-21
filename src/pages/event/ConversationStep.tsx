import { useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { useGame } from '../../app/GameContext'
import { playSfx } from '../../audio/sfx'
import { useCanSpeak, useFuriganaDisplay } from '../../app/hooks'
import { AnswerInput } from '../../components/AnswerInput'
import { Button } from '../../components/Button'
import { DialogueBox } from '../../components/dialogue/DialogueBox'
import { LogPanel } from '../../components/dialogue/LogPanel'
import { ProfileCard } from '../../components/dialogue/ProfileCard'
import { TEXT_SPEED_MS, plainSegments, totalChars } from '../../components/dialogue/typewriter'
import { useTypewriter } from '../../components/dialogue/useTypewriter'
import { KoreanText } from '../../components/KoreanText'
import { MicButton } from '../../components/MicButton'
import { Notice } from '../../components/Notice'
import { Stage } from '../../components/scene/Stage'
import { TaskLabel } from '../../components/TaskLabel'
import { SpeakButton } from '../../components/SpeakButton'
import { SpeechNotice } from '../../components/SpeechNotice'
import { content, findCharacter, firstConversationWith } from '../../data'
import type { Conversation, ConversationChoice } from '../../data/types'
import type { ClearMethod } from '../../game/progression/progression'
import { judgeSpoken } from '../../learning/judge/judgeSpoken'
import {
  availableModes,
  canReveal,
  characterExpression,
  createSessionReducer,
  initialSession,
  sessionPhase,
  shownLines,
  type AnswerMode,
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

/** 答えた直後に、主人公の返事の上に出す知らせ（選択の往復では出さない） */
function AnswerBadge({ answer }: { answer: TurnAnswer }) {
  if (answer.method === 'decision') return null
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

const MODE_LABELS: Record<AnswerMode, string> = {
  choice: '選んで答える',
  write: '書いて答える',
  speak: '話して答える',
}

/** 答え方が3つあるときの短い名前（幅375pxに収めるため） */
/** 話して通じなかったときのコツ（BUG-004） */
const SPEAK_TIP = 'ボタンを押して「どうぞ、話してください」と出てから、ゆっくり、はっきり話してみましょう。'

const MODE_SHORT_LABELS: Record<AnswerMode, string> = {
  choice: '選ぶ',
  write: '書く',
  speak: '話す',
}

/** 選んだ返事を、声に出して言ってみる（練習。経験値・記録は付けない。GAME_SPEC 4-4） */
function SayItPractice({ korean }: { korean: string }) {
  const [result, setResult] = useState<{ ok: boolean; heard: string } | null>(null)
  return (
    <section className="panel say-it" aria-label="声に出して言ってみる">
      {result !== null &&
        (result.ok ? (
          <p className="correct" aria-live="polite">
            通じました！
          </p>
        ) : (
          <Notice tone="warn">
            聞き取った言葉：「<span lang="ko">{result.heard}</span>」。もう一度言ってみましょう。
            <br />
            {SPEAK_TIP}
          </Notice>
        ))}
      <MicButton
        label="声に出して言ってみる"
        retryLabel="もう一度言ってみる"
        onHeard={(alternatives) => {
          const judge = judgeSpoken(alternatives, [korean])
          playSfx(judge.kind === 'correct' ? 'correct' : 'wrong')
          setResult({ ok: judge.kind === 'correct', heard: judge.heard })
        }}
      />
    </section>
  )
}

/** 返事をする欄（選ぶ・書く・話す） */
function AnswerArea({
  conversation,
  s,
  send,
  display,
  canSpeak,
  onChooseMode,
}: {
  conversation: Conversation
  s: ConversationSession
  send: (a: Parameters<ReturnType<typeof createSessionReducer>>[1]) => void
  display: FuriganaDisplay
  canSpeak: boolean
  onChooseMode: (mode: AnswerMode) => void
}) {
  const turn = conversation.turns[s.turn]
  if (turn?.choices === undefined) return null
  const modes = availableModes(turn, canSpeak)
  const labels = modes.length > 2 ? MODE_SHORT_LABELS : MODE_LABELS
  const lastWrong = s.wrongChoices.at(-1)
  const lastWrongChoice = lastWrong === undefined ? undefined : turn.choices[lastWrong]
  const reveal = canReveal(conversation, s, content.balance.writeAttemptsBeforeReveal) && (
    <Button onClick={() => send({ type: 'reveal' })}>答えを見る</Button>
  )

  return (
    <section className="answer panel" aria-label="返事をする">
      {modes.length > 1 && (
        <div className={`mode-tabs mode-tabs--${modes.length}`} role="group" aria-label="答え方">
          {modes.map((mode) => (
            <button key={mode} type="button" className="mode-tab" aria-pressed={s.mode === mode} aria-label={MODE_LABELS[mode]} onClick={() => onChooseMode(mode)}>
              {labels[mode]}
            </button>
          ))}
        </div>
      )}
      {s.mode !== s.preferred && (
        <p className="muted small">
          この返事は{s.mode === 'choice' ? '選んで' : '書いて'}答えます（{MODE_LABELS[s.preferred]}ことはできません）。
        </p>
      )}

      {turn.task !== undefined && <TaskLabel task={turn.task} />}

      {s.mode === 'choice' && (
        <>
          <p className="step-heading">{turn.kind === 'decision' ? 'どうしますか？ 選んでください' : '返事を選んでください'}</p>
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
          {reveal}
        </>
      )}

      {s.mode === 'speak' && turn.freeAnswer !== undefined && (
        <>
          <p className="step-heading">「{turn.freeAnswer.prompt}」を韓国語で言ってみましょう</p>
          {s.lastHeard !== null && (
            <Notice tone="warn">
              聞き取った言葉：「<span lang="ko">{s.lastHeard}</span>」。ちがうようです。もう一度話してみましょう。
              <br />
              {SPEAK_TIP}
            </Notice>
          )}
          <MicButton key={s.turn} onHeard={(alternatives) => send({ type: 'submitSpeech', alternatives })} />
          {s.lastHeard !== null && (
            <button type="button" className="link-button" onClick={() => onChooseMode('write')}>
              書いて答える
            </button>
          )}
          {reveal}
        </>
      )}
    </section>
  )
}

interface ConversationStepProps {
  conversation: Conversation
  /** 遊び直し（紹介のカードを出さない） */
  replay: boolean
  /** 背景の絵があるか（立ち絵の置き方に使う） */
  hasBackground: boolean
  /** 問題の往復に答えた（選択の往復では呼ばない） */
  onTurnAnswered: (turn: number, method: ClearMethod) => void
  /** 会話を最後まで見た */
  onDone: () => void
}

/** 会話の画面。イベントの中（EventPage）と「会話をもう一度」（ConversationReplayPage）で使う */
export function ConversationStep({ conversation, replay, hasBackground, onTurnAnswered, onDone }: ConversationStepProps) {
  const { state, dispatch } = useGame()
  const display = useFuriganaDisplay(conversation.chapter)
  const canSpeak = useCanSpeak()
  const reducer = useMemo(() => createSessionReducer(conversation, content.balance.writeAttemptsBeforeReveal), [conversation])
  const [s, send] = useReducer(reducer, conversation, (c) => initialSession(c, state.answerPreference, canSpeak))
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

  // 最新の onTurnAnswered を使う（答えたときに1回だけ呼ぶため、effect の依存には入れない）
  const onAnsweredRef = useRef(onTurnAnswered)
  useEffect(() => {
    onAnsweredRef.current = onTurnAnswered
  })
  // 往復に答えたら、その場で経験値を付ける（選択の往復は、経験値・記録・復習なし。計画 Q3）
  const answer = s.answer
  const answeredTurn = s.turn
  useEffect(() => {
    if (answer === null || answer.method === 'decision') return
    if (answer.method !== 'revealed') playSfx('correct')
    // 話して正解は、書いて正解と同じ記録・経験値にする（計画 Q10）
    onAnsweredRef.current(answeredTurn, answer.method === 'speak' ? 'write' : answer.method)
  }, [answer, answeredTurn])

  // 間違えたら音で知らせる（往復が変わると数は0に戻る）
  const misses = s.wrongChoices.length + s.writeMisses
  useEffect(() => {
    if (misses > 0) playSfx('wrong')
  }, [misses])

  // 話している途中でマイクが使えなくなったら（拒否された・設定でオフにした）、書いて答える
  useEffect(() => {
    if (s.mode === 'speak' && !canSpeak) send({ type: 'setMode', mode: 'write', speakAvailable: false })
  }, [s.mode, canSpeak])

  function chooseMode(mode: AnswerMode) {
    send({ type: 'setMode', mode, speakAvailable: canSpeak })
    dispatch({ type: 'setAnswerPreference', mode })
  }

  const writing = phase === 'answer' && s.mode === 'write'
  const advance = () => (phase === 'end' ? onDone() : send({ type: 'next', speakAvailable: canSpeak }))

  return (
    <div className="conversation">
      <Stage
        locationId={conversation.location}
        characterId={conversation.character}
        expression={characterExpression(conversation, s)}
        size={writing ? 'compact' : 'normal'}
        hasBackground={hasBackground}
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
      {phase === 'answer' && typing.done && !profileOpen && (
        <AnswerArea conversation={conversation} s={s} send={send} display={display} canSpeak={canSpeak} onChooseMode={chooseMode} />
      )}
      {current?.kind === 'player' && (answer?.method === 'choice' || answer?.method === 'decision') && canSpeak && <SayItPractice key={s.turn} korean={answer.line.korean} />}
      {logOpen && <LogPanel lines={lines} display={display} onClose={() => setLogOpen(false)} />}
      {profileOpen && character !== undefined && <ProfileCard character={character} display={display} onClose={() => setProfileOpen(false)} />}
    </div>
  )
}
