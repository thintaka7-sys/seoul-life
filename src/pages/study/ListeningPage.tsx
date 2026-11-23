import { useState } from 'react'
import { playSfx } from '../../audio/sfx'
import { nowIso, useGame } from '../../app/GameContext'
import { useFuriganaDisplay, useSpeechStatus } from '../../app/hooks'
import { Button } from '../../components/Button'
import { KoreanText } from '../../components/KoreanText'
import { Notice } from '../../components/Notice'
import { ListenButtons, ListenCompare, MissedList, OptionMark } from '../../components/practice/AnswerFeedback'
import { optionClass } from '../../components/practice/optionClass'
import { ScreenLayout } from '../../components/ScreenLayout'
import { content } from '../../data'
import { LISTENING_HEADINGS, missedFromListening, optionState, type MissedItem } from '../../learning/feedback/missed'
import { buildListeningRound, isListeningCorrect, listeningCandidates, type ListeningQuestion } from '../../learning/listening/questions'

/** リスニングの1問（イベントの listening の段階でも使う） */
export function ListeningQuestionView({
  q,
  index,
  total,
  onAnswered,
  onNext,
}: {
  q: ListeningQuestion
  index: number
  total: number
  onAnswered: (correct: boolean, given: string) => void
  onNext: () => void
}) {
  const display = useFuriganaDisplay(q.chapter)
  const [selected, setSelected] = useState<string | null>(null)
  const ok = selected !== null && isListeningCorrect(q, selected)

  function choose(korean: string) {
    if (selected !== null) return
    const right = isListeningCorrect(q, korean)
    playSfx(right ? 'correct' : 'wrong')
    setSelected(korean)
    onAnswered(right, korean)
  }
  // 答えるまでフリガナを出さない（読みを見れば答えが分かってしまうため。計画 Q6）
  const optionDisplay = selected === null ? 'hide' : display === 'tap' ? 'show' : display

  return (
    <section className="panel quiz" aria-label="リスニング">
      <p className="muted small">
        {index + 1} / {total}
      </p>
      <p className="step-heading">{LISTENING_HEADINGS[q.kind]}</p>
      <ListenButtons text={q.audio.korean} label={selected === null ? '聞く' : 'もう一度聞く'} />
      <ul className="choices quiz-options">
        {q.options.map((o) => {
          const state = optionState(o.korean, q.answers, selected)
          return (
            <li key={o.korean} className="choice">
              <button type="button" className={`choice__button quiz-option${optionClass(state)}`} disabled={selected !== null} onClick={() => choose(o.korean)}>
                <KoreanText korean={o.korean} reading={o.pronunciation} display={optionDisplay} />
                {selected !== null && <span className="quiz-option__meaning">{o.japanese}</span>}
                <OptionMark state={state} />
              </button>
            </li>
          )
        })}
      </ul>
      {selected !== null && (
        <>
          {ok ? (
            <p className="correct" aria-live="polite">
              正解！
            </p>
          ) : (
            <Notice tone="warn">ざんねん。✗ があなたの答え、✓ が正解です。</Notice>
          )}
          <ListenCompare given={selected} answer={q.answers[0] ?? q.audio.korean} />
          {q.kind === 'reply' && (
            <p>
              聞こえた言葉：
              <KoreanText korean={q.audio.korean} reading={q.audio.pronunciation} display={display} />（{q.audio.japanese}）
            </p>
          )}
          <Button variant="primary" onClick={onNext}>
            {index === total - 1 ? '結果を見る' : '次へ'}
          </Button>
        </>
      )}
    </section>
  )
}

/** リスニング（GAME_SPEC 4-5）。1回 listeningQuestionsPerRound 問。読み上げが使えない端末では出題しない */
export function ListeningPage() {
  const { state, dispatch } = useGame()
  const speech = useSpeechStatus()
  const save = state.save
  const [round, setRound] = useState<{ questions: ListeningQuestion[]; index: number; correct: number; missed: MissedItem[]; seq: number } | null>(null)
  const close = () => dispatch({ type: 'closeStudyScene' })

  const candidates =
    save === null
      ? []
      : listeningCandidates(
          { vocabulary: content.vocabulary, conversations: content.conversations, events: content.events, sentences: content.listening },
          { words: save.learning.words, completedEvents: save.progress.completedEvents },
          Math.random,
        )

  function start() {
    const answered = new Set(Object.keys(save?.learning.listening ?? {}))
    const questions = buildListeningRound(candidates, answered, content.balance.listeningQuestionsPerRound, Math.random)
    setRound((r) => ({ questions, index: 0, correct: 0, missed: [], seq: (r?.seq ?? 0) + 1 }))
  }

  let body
  if (speech.state !== 'available') {
    body = <Notice tone="warn">{speech.state === 'checking' ? '読み上げの準備中です。少し待ってから開き直してください。' : `リスニングは使えません：${speech.reason}`}</Notice>
  } else if (round === null) {
    body = (
      <section className="panel">
        <p>学んだ単語や、終えた会話の言葉を聞いて、答えを選びます。1回 {content.balance.listeningQuestionsPerRound} 問です。</p>
        {candidates.length === 0 ? (
          <Notice>まだ問題がありません。物語を進めて単語や会話を覚えると、問題が出るようになります。</Notice>
        ) : (
          <Button variant="primary" onClick={start}>
            はじめる
          </Button>
        )}
      </section>
    )
  } else {
    const q = round.questions[round.index]
    body =
      q === undefined ? (
        <section className="panel result" aria-live="polite">
          <p className="correct">おつかれさまでした</p>
          <p>
            {round.questions.length}問中 {round.correct}問正解
          </p>
          <MissedList items={round.missed} />
          <Button variant="primary" onClick={start}>
            もう一度
          </Button>
          <Button onClick={close}>戻る</Button>
        </section>
      ) : (
        <ListeningQuestionView
          key={`${round.seq}:${round.index}`}
          q={q}
          index={round.index}
          total={round.questions.length}
          onAnswered={(right, given) => {
            if (!right) {
              setRound((r) => (r === null ? r : { ...r, missed: [...r.missed, missedFromListening(q, given, `l${r.index}`)] }))
              return
            }
            setRound((r) => (r === null ? r : { ...r, correct: r.correct + 1 }))
            dispatch({ type: 'listeningCorrect', key: q.key, now: nowIso() })
          }}
          onNext={() => {
            // 最後の問題を終えたら、今日のスタンプ
            if (round.index === round.questions.length - 1) dispatch({ type: 'activityCompleted', activity: 'listening', now: nowIso() })
            setRound((r) => (r === null ? r : { ...r, index: r.index + 1 }))
          }}
        />
      )
  }

  return (
    <ScreenLayout eyebrow="勉強する" title="リスニング" footer={<Button onClick={close}>戻る</Button>}>
      {body}
    </ScreenLayout>
  )
}
