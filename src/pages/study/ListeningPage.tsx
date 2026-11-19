import { useState } from 'react'
import { playSfx } from '../../audio/sfx'
import { nowIso, useGame } from '../../app/GameContext'
import { useFuriganaDisplay, useSpeak, useSpeechStatus } from '../../app/hooks'
import { Button } from '../../components/Button'
import { KoreanText } from '../../components/KoreanText'
import { Notice } from '../../components/Notice'
import { ScreenLayout } from '../../components/ScreenLayout'
import { content } from '../../data'
import { buildListeningRound, isListeningCorrect, listeningCandidates, type ListeningKind, type ListeningQuestion } from '../../learning/listening/questions'

const HEADINGS: Record<ListeningKind, string> = {
  word: '聞こえた言葉を選んでください',
  reply: '相手の言葉を聞いて、返事を選んでください',
  sentence: '聞こえた文を選んでください',
}

function ListeningQuestionView({ q, index, total, onAnswered, onNext }: { q: ListeningQuestion; index: number; total: number; onAnswered: (correct: boolean) => void; onNext: () => void }) {
  const speak = useSpeak()
  const display = useFuriganaDisplay(q.chapter)
  const [selected, setSelected] = useState<string | null>(null)
  const ok = selected !== null && isListeningCorrect(q, selected)

  function choose(korean: string) {
    if (selected !== null) return
    const right = isListeningCorrect(q, korean)
    playSfx(right ? 'correct' : 'wrong')
    setSelected(korean)
    onAnswered(right)
  }

  return (
    <section className="panel quiz" aria-label="リスニング">
      <p className="muted small">
        {index + 1} / {total}
      </p>
      <p className="step-heading">{HEADINGS[q.kind]}</p>
      <Button variant="primary" sound={null} onClick={() => speak(q.audio.korean)}>
        ▶ {selected === null ? '聞く' : 'もう一度聞く'}
      </Button>
      <ul className="choices quiz-options">
        {q.options.map((o) => {
          const mark = selected === null ? '' : q.answers.includes(o.korean) ? ' quiz-option--answer' : o.korean === selected ? ' quiz-option--wrong' : ''
          return (
            <li key={o.korean} className="choice">
              <button type="button" className={`choice__button quiz-option${mark}`} disabled={selected !== null} onClick={() => choose(o.korean)}>
                <KoreanText korean={o.korean} reading={o.pronunciation} display={display === 'tap' ? 'hide' : display} />
                {selected !== null && <span className="quiz-option__meaning">{o.japanese}</span>}
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
            <Notice tone="warn">ざんねん。印の付いたものが正解です。</Notice>
          )}
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
  const [round, setRound] = useState<{ questions: ListeningQuestion[]; index: number; correct: number; seq: number } | null>(null)
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
    setRound((r) => ({ questions, index: 0, correct: 0, seq: (r?.seq ?? 0) + 1 }))
  }

  let body
  if (speech.state !== 'available') {
    body = <Notice tone="warn">{speech.state === 'checking' ? '読み上げの準備中です。少し待ってから開き直してください。' : `リスニングは使えません：${speech.reason}`}</Notice>
  } else if (round === null) {
    body = (
      <section className="panel">
        <p>覚えた単語や、終えた会話の言葉を聞いて、答えを選びます。1回 {content.balance.listeningQuestionsPerRound} 問です。</p>
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
          onAnswered={(right) => {
            if (!right) return
            setRound((r) => (r === null ? r : { ...r, correct: r.correct + 1 }))
            dispatch({ type: 'listeningCorrect', key: q.key, now: nowIso() })
          }}
          onNext={() => setRound((r) => (r === null ? r : { ...r, index: r.index + 1 }))}
        />
      )
  }

  return (
    <ScreenLayout eyebrow="勉強する" title="リスニング" footer={<Button onClick={close}>戻る</Button>}>
      {body}
    </ScreenLayout>
  )
}
