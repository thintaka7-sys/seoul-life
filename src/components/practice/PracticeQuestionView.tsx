import { useState, type KeyboardEvent, type ReactNode } from 'react'
import { playSfx } from '../../audio/sfx'
import { useFuriganaDisplay } from '../../app/hooks'
import { isAlternative, optionState } from '../../learning/feedback/missed'
import type { FuriganaDisplay } from '../../learning/furigana/furigana'
import { judgePractice, type PracticeResult } from '../../learning/practice/judge'
import type { ChoiceOption, Phrase, PracticeQuestion, Prompt } from '../../learning/practice/questions'
import { AnswerInput } from '../AnswerInput'
import { Button } from '../Button'
import { NamePlate } from '../dialogue/NamePlate'
import { FormationFigure } from '../figures/Figure'
import { KoreanText } from '../KoreanText'
import { Notice } from '../Notice'
import { SpeakButton } from '../SpeakButton'
import { TaskLabel } from '../TaskLabel'
import { AnswerCompare, ListenButtons, ListenCompare, OptionMark } from './AnswerFeedback'
import { optionClass } from './optionClass'

function PhraseLine({ phrase, display }: { phrase: Phrase; display: FuriganaDisplay }) {
  return (
    <div className="ko-row">
      <KoreanText korean={phrase.korean} reading={phrase.pronunciation} display={display} />
      <SpeakButton text={phrase.korean} />
    </div>
  )
}

/** 問題で見せるもの。answered なら、聞く問題の文字も見せる */
function PromptView({ prompt, display, answered }: { prompt: Prompt; display: FuriganaDisplay; answered: boolean }) {
  switch (prompt.kind) {
    case 'korean':
      return (
        <div className="ko-row">
          <KoreanText className="quiz-target" korean={prompt.phrase.korean} reading={prompt.phrase.pronunciation} display={display} />
          <SpeakButton text={prompt.phrase.korean} />
        </div>
      )
    case 'japanese':
      return (
        <div className="practice-ja">
          <p className="practice-ja__text">{prompt.text}</p>
          {prompt.hint !== null && <p className="muted small">（{prompt.hint}）</p>}
        </div>
      )
    case 'audio':
      return <ListenButtons text={prompt.phrase.korean} label={answered ? 'もう一度聞く' : '聞く'} />
    case 'blank':
      return (
        <div className="practice-ja">
          <p className="practice-blank" lang="ko">
            {prompt.before}
            <span className="practice-blank__hole">（　　）</span>
            {prompt.after}
          </p>
          <p className="muted">{prompt.japanese}</p>
        </div>
      )
    case 'conversation':
      return (
        <div className="practice-scene">
          {prompt.lines.map((line, i) => (
            <div key={i} className="practice-scene__line">
              <NamePlate speaker={line.speaker} display={display} />
              <PhraseLine phrase={line} display={display} />
              <p className="muted small">{line.japanese}</p>
            </div>
          ))}
          {prompt.task !== null && <TaskLabel task={prompt.task} />}
        </div>
      )
    case 'formation':
      return (
        <div className="practice-ja">
          <FormationFigure parts={prompt.parts} result={null} />
          <p className="muted">{prompt.japanese}</p>
        </div>
      )
  }
}

/**
 * 選択肢のフリガナ。答える前は、「タップで表示」なら隠す（押すと答えになるため）。
 * 聞く問題では、答えるまでいつも隠す（読みを見れば答えが分かってしまうため。計画 Q6）
 */
function optionDisplay(display: FuriganaDisplay, answered: boolean, listening: boolean): FuriganaDisplay {
  if (!answered) return listening || display === 'tap' ? 'hide' : display
  return display === 'tap' ? 'show' : display
}

function ChooseBody({
  options,
  answers,
  selected,
  display,
  listening,
  onSelect,
}: {
  options: ChoiceOption[]
  answers: string[]
  selected: string | null
  display: FuriganaDisplay
  listening: boolean
  onSelect: (text: string) => void
}) {
  const shown = optionDisplay(display, selected !== null, listening)
  return (
    <ul className="choices quiz-options">
      {options.map((o) => {
        const state = optionState(o.text, answers, selected)
        return (
          <li key={o.text} className="choice">
            <button type="button" className={`choice__button quiz-option${optionClass(state)}`} lang={o.lang} disabled={selected !== null} onClick={() => onSelect(o.text)}>
              {o.lang === 'ko' ? <KoreanText korean={o.text} reading={o.reading} display={shown} /> : o.text}
              {o.meaning !== undefined && <span className="quiz-option__meaning">{o.meaning}</span>}
              <OptionMark state={state} />
            </button>
          </li>
        )
      })}
    </ul>
  )
}

/** 札を並べ替える。札を押すと答えの欄に入り、答えの欄の札を押すと戻る */
function ArrangeBody({ tiles, joiner, done, onSubmit }: { tiles: string[]; joiner: '' | ' '; done: boolean; onSubmit: (text: string) => void }) {
  const [picked, setPicked] = useState<number[]>([])
  const complete = picked.length === tiles.length
  return (
    <div className="arrange">
      <div className={`arrange__answer${joiner === '' ? ' arrange__answer--tight' : ''}`} aria-label="並べた答え" lang="ko">
        {picked.length === 0 && <span className="muted small">下の札を順に押してください</span>}
        {picked.map((tileIndex, i) => (
          <button key={i} type="button" className="letter-tile letter-tile--placed" disabled={done} onClick={() => setPicked((p) => p.filter((_, j) => j !== i))}>
            {tiles[tileIndex]}
          </button>
        ))}
      </div>
      <div className="arrange__pool" lang="ko">
        {tiles.map((tile, i) => (
          <button key={i} type="button" className="letter-tile" disabled={done || picked.includes(i)} onClick={() => setPicked((p) => [...p, i])}>
            {tile}
          </button>
        ))}
      </div>
      {!done && (
        <div className="arrange__actions">
          <Button onClick={() => setPicked([])} disabled={picked.length === 0}>
            やり直す
          </Button>
          <Button variant="primary" disabled={!complete} onClick={() => onSubmit(picked.map((i) => tiles[i] ?? '').join(joiner))}>
            答える
          </Button>
        </div>
      )}
    </div>
  )
}

/** 数字を書く欄（端末の数字キーボードを出す） */
function NumberBody({ onSubmit }: { onSubmit: (text: string) => void }) {
  const [text, setText] = useState('')
  const submit = () => text.trim() !== '' && onSubmit(text)
  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
      e.preventDefault()
      submit()
    }
  }
  // 書く問題の入力欄と同じ入れ物（.answer-input）に入れ、入力欄のもともとの幅で枠を広げない（BUG-005・BUG-008）
  return (
    <div className="answer-input">
      <div className="answer-input__row">
        <input
          className="answer-input__field"
          type="text"
          inputMode="decimal"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
          autoComplete="off"
          aria-label="答え（数字）"
          placeholder="数字で書く"
        />
        <Button variant="primary" onClick={submit} disabled={text.trim() === ''}>
          答える
        </Button>
      </div>
    </div>
  )
}

interface PracticeQuestionViewProps {
  q: PracticeQuestion
  /** 「3 / 10」など */
  position: string
  /** given：選んだ選択肢・並べた答え・書いた答え */
  onAnswered: (correct: boolean, given: string) => void
  onNext: () => void
  nextLabel: string
}

/** 復習・練習・ドリル・章末テストの1問 */
export function PracticeQuestionView({ q, position, onAnswered, onNext, nextLabel }: PracticeQuestionViewProps) {
  const display = useFuriganaDisplay(q.chapter)
  const [result, setResult] = useState<PracticeResult | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [given, setGiven] = useState('')
  const [digitsWarning, setDigitsWarning] = useState(false)
  const answered = result !== null
  const listening = q.prompt.kind === 'audio'

  function answer(input: string) {
    if (answered) return
    const r = judgePractice(q, input)
    // 韓国語で書く問題に数字で答えたときは、答えにせず、書き直してもらう
    if (!r.correct && r.digits) {
      setDigitsWarning(true)
      return
    }
    playSfx(r.correct ? 'correct' : 'wrong')
    setGiven(input.trim())
    setResult(r)
    onAnswered(r.correct, input.trim())
  }

  return (
    <section className="panel quiz practice" aria-label="問題">
      <p className="muted small">{position}</p>
      <p className="step-heading">{q.heading}</p>
      <PromptView prompt={q.prompt} display={display} answered={answered} />

      {q.body.type === 'choose' && (
        <ChooseBody
          options={q.body.options}
          answers={q.body.answers}
          selected={selected}
          display={display}
          listening={listening}
          onSelect={(text) => {
            setSelected(text)
            answer(text)
          }}
        />
      )}
      {q.body.type === 'arrange' && <ArrangeBody tiles={q.body.tiles} joiner={q.body.joiner} done={answered} onSubmit={answer} />}
      {q.body.type === 'write' && !answered && (
        <>
          <AnswerInput onSubmit={answer} />
          {digitsWarning && <Notice tone="warn">数字ではなく、韓国語（ハングル）で書いてみましょう。</Notice>}
        </>
      )}
      {q.body.type === 'number' && !answered && <NumberBody onSubmit={answer} />}

      {result !== null && (
        <PracticeFeedback q={q} result={result} given={given} selected={selected} display={display} listening={listening}>
          <Button variant="primary" onClick={onNext}>
            {nextLabel}
          </Button>
        </PracticeFeedback>
      )}
    </section>
  )
}

/** 答えた直後に見せるもの（GAME_SPEC 4-0）：自分の答えと正解、模範解答、説明、聞き比べ */
function PracticeFeedback({
  q,
  result,
  given,
  selected,
  display,
  listening,
  children,
}: {
  q: PracticeQuestion
  result: PracticeResult
  given: string
  selected: string | null
  display: FuriganaDisplay
  listening: boolean
  children: ReactNode
}) {
  const body = q.body
  const written = body.type === 'write' || body.type === 'arrange' || body.type === 'number'
  const answers = body.type === 'write' ? body.answers : body.type === 'arrange' ? [body.answer] : body.type === 'number' ? [body.digits] : []
  // 書いて正解したが、模範解答と違う形（別解）なら「模範解答」として添える
  const alternative = result.correct && body.type === 'write' && isAlternative(result.matched, q.model.korean)
  const chosenKorean = body.type === 'choose' && body.options.find((o) => o.text === selected)?.lang === 'ko' ? selected : null
  return (
    <div className="practice-feedback" aria-live="polite">
      {result.correct ? (
        result.spacing ? (
          <Notice tone="warn">正解。ただし分かち書きに注意</Notice>
        ) : (
          <p className="correct">正解！</p>
        )
      ) : (
        <Notice tone="warn">{written ? 'おしい！自分の答えと正解をくらべてみましょう。' : 'おしい！✗ があなたの答え、✓ が正解です。'}</Notice>
      )}
      {written && (!result.correct || result.spacing) && <AnswerCompare given={given} answers={result.correct ? [result.matched] : answers} digits={body.type === 'number'} />}
      <div className="practice-model">
        <p className="muted small">{alternative ? '模範解答' : '正解'}</p>
        {q.model.korean === '' ? (
          // 読み物の日本語の選択肢・数字の問題は、正解を日本語（数字）だけで見せる
          <p className="practice-model__ja">{q.model.japanese}</p>
        ) : (
          <>
            <PhraseLine phrase={q.model} display={display === 'tap' ? 'show' : display} />
            {q.model.japanese !== '' && <p className="muted small">{q.model.japanese}</p>}
          </>
        )}
      </div>
      {q.note !== undefined && <p className="answer-note small">{q.note}</p>}
      {listening && q.prompt.kind === 'audio' && <ListenCompare given={chosenKorean} answer={q.prompt.phrase.korean} />}
      {children}
    </div>
  )
}
