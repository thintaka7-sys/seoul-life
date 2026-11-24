import { useMemo, useState, type ReactNode } from 'react'
import { nowIso, useGame } from '../../app/GameContext'
import { glossSpansOf } from '../../app/glossary'
import { useFuriganaDisplay } from '../../app/hooks'
import { playSfx } from '../../audio/sfx'
import { Button } from '../../components/Button'
import { DraftBadge } from '../../components/DraftBadge'
import { KoreanText } from '../../components/KoreanText'
import { MenuBoard } from '../../components/MenuBoard'
import { Notice } from '../../components/Notice'
import { PracticeQuestionView } from '../../components/practice/PracticeQuestionView'
import { SpeakButton } from '../../components/SpeakButton'
import { Translation } from '../../components/Translation'
import { useGlossPopup } from '../../components/useGlossPopup'
import { content } from '../../data'
import type { FindPlace, Reading, ReadingLine } from '../../data/types'
import { pairReading, type FuriganaDisplay } from '../../learning/furigana/furigana'
import { isFoundAnswer, readingPracticeQuestion, readingQuestionKey } from '../../learning/reading/reading'
import { plainSegments } from '../../components/dialogue/typewriter'

const STYLE_LABELS: Record<Reading['style'], string> = { memo: 'メモ', notice: 'お知らせ', message: 'メッセージ', diary: '日記', menu: 'メニュー' }

/** 本文の1文。探す問題の間は、まとまりごとに押せるようにする */
function ReadingLineView({
  line,
  chapter,
  display,
  showJapanese,
  onFind,
  onGloss,
}: {
  line: ReadingLine
  chapter: number
  display: FuriganaDisplay
  showJapanese: boolean
  onFind: ((text: string) => void) | undefined
  onGloss: ReturnType<typeof useGlossPopup>['onGloss']
}) {
  const spans = useMemo(() => glossSpansOf(line.korean, line.glosses), [line])
  if (onFind !== undefined) {
    const segments = pairReading(line.korean, line.pronunciation) ?? plainSegments(line.korean)
    const shown = display === 'tap' ? 'hide' : display
    return (
      <li className="reading__line">
        <p className="reading__find" lang="ko">
          {segments.map((seg, i) => (
            <button key={i} type="button" className="find-chip" onClick={() => onFind(seg.base)}>
              <KoreanText korean={seg.base} reading={seg.ruby} display={shown} />
            </button>
          ))}
        </p>
      </li>
    )
  }
  return (
    <li className="reading__line" data-chapter={chapter}>
      <div className="ko-row">
        <KoreanText korean={line.korean} reading={line.pronunciation} display={display} glossSpans={spans} onGloss={onGloss} />
        <SpeakButton text={line.korean} />
      </div>
      {showJapanese && <p className="reading__ja">{line.japanese}</p>}
    </li>
  )
}

/** 問題文の韓国語（読み上げ・単語のタップができる。訳は設定にかかわらず「タップで表示」。GAME_SPEC 4-7） */
function QuestionKorean({ line, display, onGloss }: { line: ReadingLine; display: FuriganaDisplay; onGloss: ReturnType<typeof useGlossPopup>['onGloss'] }) {
  const spans = useMemo(() => glossSpansOf(line.korean, line.glosses), [line])
  return (
    <div className="reading-question-ko">
      <div className="ko-row">
        <KoreanText korean={line.korean} reading={line.pronunciation} display={display} glossSpans={spans} onGloss={onGloss} />
        <SpeakButton text={line.korean} />
      </div>
      <Translation text={line.japanese} mode="tap" className="reading-question-ko__ja" />
    </div>
  )
}

const FIND_HINTS: Record<FindPlace, string> = {
  menu: '上のメニューの中から、答えの言葉を押してください。',
  lines: '上の本文の中から、答えの言葉を押してください。',
}

/** 本文から探して押す問題 */
function FindQuestion({
  questionJa,
  questionKorean,
  findIn,
  position,
  result,
  explanationJa,
  answer,
  onNext,
  nextLabel,
}: {
  questionJa: string
  questionKorean: ReactNode
  findIn: FindPlace
  position: string
  result: 'correct' | 'wrong' | null
  explanationJa: string | undefined
  answer: string
  onNext: () => void
  nextLabel: string
}) {
  return (
    <section className="panel quiz practice" aria-label="問題">
      <p className="muted small">{position}</p>
      <p className="step-heading">{questionJa}</p>
      {questionKorean}
      {result === null ? (
        <p className="muted small">{FIND_HINTS[findIn]}</p>
      ) : (
        <div className="practice-feedback" aria-live="polite">
          {result === 'correct' ? <p className="correct">正解！</p> : <Notice tone="warn">おしい！正解は「<span lang="ko">{answer}</span>」です。</Notice>}
          {explanationJa !== undefined && <p className="answer-note small">{explanationJa}</p>}
          <Button variant="primary" onClick={onNext}>
            {nextLabel}
          </Button>
        </div>
      )}
    </section>
  )
}

/**
 * 読み物（GAME_SPEC 4-7）。本文（メニュー）を読んで、問題に上から順に答える。
 * 本文は読み上げ・単語のタップができ、日本語訳は問題にすべて答えるまで隠す。経験値は問題ごとに初めて正解したときだけ（読み物は復習に入れない）
 */
export function ReadingStep({ reading, onDone }: { reading: Reading; onDone: () => void }) {
  const { dispatch } = useGame()
  const display = useFuriganaDisplay(reading.chapter)
  const gloss = useGlossPopup(reading.chapter)
  const [index, setIndex] = useState(0)
  const [found, setFound] = useState<{ text: string; correct: boolean } | null>(null)
  const menu = reading.menu === undefined ? undefined : content.menus.find((m) => m.id === reading.menu)
  const question = reading.questions[index]
  const finished = question === undefined
  const practice = useMemo(() => readingPracticeQuestion(reading, index, Math.random), [reading, index])
  const total = reading.questions.length
  const questionKorean = question?.questionKorean === undefined ? null : <QuestionKorean line={question.questionKorean} display={display} onGloss={gloss.onGloss} />
  const position = `問題 ${Math.min(index + 1, total)} / ${total}`
  const nextLabel = index === total - 1 ? '答え合わせを終える' : '次の問題へ'

  function correct() {
    dispatch({ type: 'readingCorrect', key: readingQuestionKey(reading.id, index), now: nowIso() })
  }
  function next() {
    setFound(null)
    setIndex((i) => i + 1)
  }
  const finding = question?.type === 'find' && found === null
  /** 探す問題の間、押せる場所（答えがある場所だけ） */
  const findIn = finding && question.type === 'find' ? question.findIn : null
  function find(text: string) {
    if (question?.type !== 'find' || found !== null) return
    const ok = isFoundAnswer(question.answer, text)
    playSfx(ok ? 'correct' : 'wrong')
    setFound({ text, correct: ok })
    if (ok) correct()
  }
  const markedMenu =
    question?.type === 'find' && question.findIn === 'menu' && found !== null && menu !== undefined
      ? menu.items.flatMap((item): { key: string; tone: 'correct' | 'wrong' }[] => {
          const name = content.vocabulary.find((v) => v.id === item.vocab)?.korean ?? ''
          if (isFoundAnswer(question.answer, name)) return [{ key: item.key, tone: 'correct' as const }]
          if (!found.correct && name === found.text) return [{ key: item.key, tone: 'wrong' as const }]
          return []
        })
      : []

  return (
    <div className="reading-step">
      <section className={`reading reading--${reading.style}`} aria-label={reading.titleJa}>
        {!reading.reviewed && <DraftBadge />}
        <p className="reading__kind">{STYLE_LABELS[reading.style]}</p>
        <h2 className="reading__title">{reading.titleJa}</h2>
        {!finished && <p className="muted small">日本語訳は、問題にすべて答えると出ます。</p>}
        {menu !== undefined && <MenuBoard menu={menu} display={display} showJapanese={finished} onFind={findIn === 'menu' ? find : undefined} marked={markedMenu} />}
        {reading.lines.length > 0 && (
          <ul className="reading__lines">
            {reading.lines.map((line, i) => (
              <ReadingLineView key={i} line={line} chapter={reading.chapter} display={display} showJapanese={finished} onFind={findIn === 'lines' ? find : undefined} onGloss={gloss.onGloss} />
            ))}
          </ul>
        )}
      </section>

      {question !== undefined && question.type === 'find' && (
        <FindQuestion
          key={index}
          questionJa={question.questionJa}
          questionKorean={questionKorean}
          findIn={question.findIn}
          position={position}
          result={found === null ? null : found.correct ? 'correct' : 'wrong'}
          explanationJa={question.explanationJa}
          answer={question.answer}
          onNext={next}
          nextLabel={nextLabel}
        />
      )}
      {question !== undefined && question.type !== 'find' && practice !== null && (
        <PracticeQuestionView
          key={index}
          q={practice}
          position={position}
          promptExtra={questionKorean}
          onAnswered={(ok) => {
            if (ok) correct()
          }}
          onNext={next}
          nextLabel={nextLabel}
        />
      )}
      {finished && (
        <section className="panel" aria-live="polite">
          <p>問題はこれで終わりです。日本語訳を見ながら、もう一度読んでみましょう。</p>
          <Button variant="primary" onClick={onDone}>
            読み終える
          </Button>
        </section>
      )}
      {gloss.popup}
    </div>
  )
}
