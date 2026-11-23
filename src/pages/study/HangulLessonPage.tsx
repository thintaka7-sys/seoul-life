import { useState } from 'react'
import { playSfx } from '../../audio/sfx'
import { nowIso, useGame } from '../../app/GameContext'
import { useSpeechStatus } from '../../app/hooks'
import { AnswerInput } from '../../components/AnswerInput'
import { Button } from '../../components/Button'
import { DraftBadge } from '../../components/DraftBadge'
import { Notice } from '../../components/Notice'
import { AnswerCompare, ListenButtons, ListenCompare, MissedList } from '../../components/practice/AnswerFeedback'
import { QuizOptions } from '../../components/QuizOptions'
import { ScreenLayout } from '../../components/ScreenLayout'
import { SpeakButton } from '../../components/SpeakButton'
import { SpeechNotice } from '../../components/SpeechNotice'
import { content, findHangulLesson, findVocab } from '../../data'
import type { HangulFinal, HangulLesson, HangulLetter, SoundChangeRule } from '../../data/types'
import { hangulHeading, missedFromHangul, type MissedItem } from '../../learning/feedback/missed'
import { buildQuiz, isCorrectAnswer, questionAnswer, quizScore, readingItems, type HangulQuestion, type ReadingItem } from '../../learning/hangul/quiz'
import { Figures } from '../../components/figures/Figure'
import { TeacherSays } from '../../components/TeacherCall'

const CONTINUE_HINT = '続きのレッスンは、自宅の「勉強する」→「ハングル」から、いつでも進められます。'

type Card = { kind: 'letter'; letter: HangulLetter } | { kind: 'final'; final: HangulFinal } | { kind: 'rule'; rule: SoundChangeRule }

type Phase = { name: 'intro' } | { name: 'cards'; index: number } | { name: 'words' } | { name: 'quiz' } | { name: 'result'; correct: number; total: number; missed: MissedItem[] }

function cardsOf(lesson: HangulLesson): Card[] {
  return [
    ...lesson.letters.map((letter): Card => ({ kind: 'letter', letter })),
    ...lesson.finals.map((final): Card => ({ kind: 'final', final })),
    ...lesson.rules.map((rule): Card => ({ kind: 'rule', rule })),
  ]
}

function SoundList({ sounds }: { sounds: readonly { korean: string; pronunciation: string }[] }) {
  return (
    <ul className="sound-list">
      {sounds.map((s) => (
        <li key={s.korean} className="sound-list__item">
          <span className="sound-list__ko" lang="ko">
            {s.korean}
          </span>
          <span className="sound-list__kana">{s.pronunciation}</span>
          <SpeakButton text={s.korean} />
        </li>
      ))}
    </ul>
  )
}

function LessonCard({ card }: { card: Card }) {
  switch (card.kind) {
    case 'letter':
      return (
        <article className="card hangul-card">
          <p className="jamo-big" lang="ko">
            {card.letter.jamo}
          </p>
          <SoundList sounds={card.letter.sounds} />
          <TeacherSays paragraphs={[card.letter.tipJa]}>
            <Figures figures={card.letter.figures} />
          </TeacherSays>
        </article>
      )
    case 'final':
      return (
        <article className="card hangul-card">
          <p className="learn-card__kind">パッチム：{card.final.sound} の音になる文字</p>
          <p className="jamo-row" lang="ko">
            {card.final.letters.join(' ')}
          </p>
          <SoundList sounds={card.final.sounds} />
          <TeacherSays paragraphs={[card.final.tipJa]}>
            <Figures figures={card.final.figures} />
          </TeacherSays>
        </article>
      )
    case 'rule':
      return (
        <article className="card hangul-card">
          <h2 className="learn-card__title">{card.rule.titleJa}</h2>
          <TeacherSays paragraphs={[card.rule.explanationJa]}>
            <Figures figures={card.rule.figures} />
          </TeacherSays>
          <ul className="sound-change-list">
            {card.rule.examples.map((ex) => (
              <li key={ex.korean}>
                <div className="ko-row">
                  <span className="sound-change__ko" lang="ko">
                    {ex.korean}
                  </span>
                  <span className="sound-change__arrow" aria-hidden="true">
                    →
                  </span>
                  <span className="sound-change__spoken" lang="ko">
                    [{ex.spoken}]
                  </span>
                  <SpeakButton text={ex.korean} />
                </div>
                <p className="muted">
                  {ex.pronunciation}（{ex.japanese}）
                </p>
              </li>
            ))}
          </ul>
        </article>
      )
  }
}

/** 読む練習の言葉。まず自分で読んでから、「答えを見る」で読みと意味を確かめる */
function WordItem({ item }: { item: ReadingItem }) {
  const [open, setOpen] = useState(false)
  return (
    <li className="word-item">
      <div className="ko-row">
        <span className="word-item__ko" lang="ko">
          {item.korean}
        </span>
        <SpeakButton text={item.korean} />
      </div>
      {open ? (
        <p>
          {item.pronunciation}（{item.japanese}）
        </p>
      ) : (
        <button type="button" className="link-button" onClick={() => setOpen(true)}>
          読みと意味を見る
        </button>
      )}
    </li>
  )
}

function QuestionPrompt({ q }: { q: HangulQuestion }) {
  const heading = <p className="step-heading">{hangulHeading(q)}</p>
  switch (q.kind) {
    case 'listen':
    case 'listenSpelling':
      return (
        <>
          {heading}
          <ListenButtons text={q.korean} label="音を聞く" />
        </>
      )
    case 'reading':
      return (
        <>
          {heading}
          <p className="quiz-target" lang="ko">
            {q.korean}
          </p>
        </>
      )
    case 'meaning':
      return (
        <>
          {heading}
          <div className="ko-row">
            <span className="quiz-target" lang="ko">
              {q.korean}
            </span>
            <SpeakButton text={q.korean} />
          </div>
        </>
      )
    case 'spoken':
      return (
        <>
          {heading}
          <div className="ko-row">
            <span className="quiz-target" lang="ko">
              {q.korean}
            </span>
            <SpeakButton text={q.korean} />
          </div>
        </>
      )
    case 'build':
      return (
        <>
          {heading}
          <div className="ko-row">
            <span className="quiz-target" lang="ko">
              {q.korean}
            </span>
            <SpeakButton text={q.korean} />
          </div>
          <p className="muted">{q.reading}</p>
        </>
      )
  }
}

function QuizRunner({ questions, onFinish }: { questions: readonly HangulQuestion[]; onFinish: (correct: number, missed: MissedItem[]) => void }) {
  const [index, setIndex] = useState(0)
  const [given, setGiven] = useState<string | null>(null)
  const [correct, setCorrect] = useState(0)
  const [missed, setMissed] = useState<MissedItem[]>([])
  const q = questions[index]
  if (q === undefined) return null
  const answer = questionAnswer(q)
  const ok = given !== null && isCorrectAnswer(q, given)
  const last = index === questions.length - 1

  function answerWith(text: string) {
    if (given !== null || q === undefined) return
    const right = isCorrectAnswer(q, text)
    playSfx(right ? 'correct' : 'wrong')
    setGiven(text)
    if (right) setCorrect((c) => c + 1)
    else setMissed((m) => [...m, missedFromHangul(q, text, `h${index}`)])
  }

  function next() {
    if (last) {
      onFinish(correct, missed)
      return
    }
    setIndex((i) => i + 1)
    setGiven(null)
  }

  return (
    <section className="panel quiz" aria-label="小テスト">
      <p className="muted small">
        小テスト {index + 1} / {questions.length}
      </p>
      <QuestionPrompt q={q} />
      {q.kind === 'build' ? (
        given === null && <AnswerInput key={index} onSubmit={answerWith} />
      ) : (
        <QuizOptions
          options={q.options}
          answer={answer}
          selected={given}
          onSelect={answerWith}
          lang={q.kind === 'listen' || q.kind === 'listenSpelling' || q.kind === 'spoken' ? 'ko' : 'ja'}
          render={q.kind === 'spoken' ? (o) => `[${o}]` : undefined}
        />
      )}
      {given !== null && (
        <>
          {ok ? (
            <p className="correct" aria-live="polite">
              正解！
            </p>
          ) : q.kind === 'build' ? (
            <>
              <Notice tone="warn">おしい！自分の答えと正解をくらべてみましょう。</Notice>
              <AnswerCompare given={given} answers={[answer]} />
            </>
          ) : (
            <Notice tone="warn">おしい！✗ があなたの答え、✓ が正解です。</Notice>
          )}
          {(q.kind === 'listen' || q.kind === 'listenSpelling') && <ListenCompare given={given} answer={answer} />}
          <Button variant="primary" onClick={next}>
            {last ? '結果を見る' : '次へ'}
          </Button>
        </>
      )}
    </section>
  )
}

export function HangulLessonPage({ lessonId, onboarding }: { lessonId: string; onboarding: boolean }) {
  const { dispatch } = useGame()
  const speech = useSpeechStatus()
  const lesson = findHangulLesson(lessonId)
  const [phase, setPhase] = useState<Phase>({ name: 'intro' })
  const [questions, setQuestions] = useState<HangulQuestion[]>([])
  /** 小テストを始めた回数（やり直すたびに問題を作り直し、答えた状態を消す） */
  const [round, setRound] = useState(0)
  const close = () => dispatch({ type: 'closeStudyScene' })
  const closeLabel = onboarding ? '物語に戻る' : 'レッスン一覧へ'

  if (lesson === undefined) {
    return (
      <ScreenLayout title="ハングル" footer={<Button onClick={close}>戻る</Button>}>
        <Notice tone="warn">レッスンが見つかりません。</Notice>
      </ScreenLayout>
    )
  }

  const cards = cardsOf(lesson)
  const words = readingItems(lesson, findVocab)
  const { balance } = content

  function startQuiz() {
    if (lesson === undefined) return
    setQuestions(buildQuiz(lesson, content.hangulLessons, findVocab, { count: balance.hangulQuizQuestions, audio: speech.state === 'available', random: Math.random }))
    setRound((r) => r + 1)
    setPhase({ name: 'quiz' })
  }

  function afterCards() {
    if (words.length > 0) setPhase({ name: 'words' })
    else startQuiz()
  }

  function finishQuiz(correct: number, missed: MissedItem[]) {
    if (lesson === undefined) return
    const total = questions.length
    const { score, passed } = quizScore(correct, total, balance.hangulPassPercent)
    if (passed) {
      playSfx('fanfare')
      dispatch({ type: 'hangulLessonPassed', lessonId: lesson.id, score, now: nowIso() })
    }
    setPhase({ name: 'result', correct, total, missed })
  }

  let body
  switch (phase.name) {
    case 'intro':
      body = (
        <section className="panel">
          <TeacherSays paragraphs={lesson.introJa}>
            <Figures figures={lesson.figures} />
          </TeacherSays>
          <Button variant="primary" onClick={() => (cards.length > 0 ? setPhase({ name: 'cards', index: 0 }) : afterCards())}>
            {cards.length > 0 ? '文字を見る' : '読んでみる'}
          </Button>
        </section>
      )
      break
    case 'cards': {
      const card = cards[phase.index]
      const isLast = phase.index >= cards.length - 1
      // 背景の絵の上で読みにくくならないよう、番号と「前へ・次へ」も板の上に置く（BUG-001 と同じ考え方）
      body = (
        <section className="panel lesson-cards">
          <p className="muted small">
            {phase.index + 1} / {cards.length}
          </p>
          {card !== undefined && <LessonCard card={card} />}
          <div className="card-nav">
            <Button disabled={phase.index === 0} onClick={() => setPhase({ name: 'cards', index: phase.index - 1 })}>
              前へ
            </Button>
            <Button variant="primary" onClick={() => (isLast ? afterCards() : setPhase({ name: 'cards', index: phase.index + 1 }))}>
              {isLast ? (words.length > 0 ? '言葉を読む' : '小テストへ') : '次へ'}
            </Button>
          </div>
        </section>
      )
      break
    }
    case 'words':
      body = (
        <section className="panel">
          <p className="step-heading">習った文字で読んでみましょう</p>
          <ul className="word-list">
            {words.map((w) => (
              <WordItem key={w.korean} item={w} />
            ))}
          </ul>
          <Button variant="primary" onClick={startQuiz}>
            小テストへ
          </Button>
        </section>
      )
      break
    case 'quiz':
      body =
        questions.length === 0 ? (
          <Notice tone="warn">小テストの問題を作れませんでした。</Notice>
        ) : (
          <QuizRunner key={round} questions={questions} onFinish={finishQuiz} />
        )
      break
    case 'result': {
      const { score, passed } = quizScore(phase.correct, phase.total, balance.hangulPassPercent)
      body = (
        <section className="panel result" aria-live="polite">
          <p className="correct">{passed ? '合格！' : 'あと少し！'}</p>
          <p>
            {phase.total}問中 {phase.correct}問正解（{score}点）
          </p>
          {!passed && <p>{balance.hangulPassPercent}点以上で合格です。文字を見直して、もう一度挑戦してみましょう。</p>}
          <MissedList items={phase.missed} />
          {onboarding && <Notice>{CONTINUE_HINT}</Notice>}
          <Button variant={passed ? 'secondary' : 'primary'} onClick={startQuiz}>
            もう一度小テスト
          </Button>
          {cards.length > 0 && <Button onClick={() => setPhase({ name: 'cards', index: 0 })}>文字を見直す</Button>}
          <Button variant={passed ? 'primary' : 'secondary'} onClick={close}>
            {closeLabel}
          </Button>
        </section>
      )
      break
    }
  }

  return (
    <ScreenLayout
      eyebrow={`ハングル ${lesson.order}`}
      title={
        <>
          {lesson.titleJa}
          {!lesson.reviewed && <DraftBadge />}
        </>
      }
      footer={
        phase.name !== 'result' && (
          <Button onClick={close}>{onboarding ? 'やめて物語に戻る' : 'やめる'}</Button>
        )
      }
    >
      {onboarding && phase.name === 'intro' && <Notice>{CONTINUE_HINT}</Notice>}
      <SpeechNotice />
      {body}
    </ScreenLayout>
  )
}
