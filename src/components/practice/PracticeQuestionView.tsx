import { useState, type KeyboardEvent } from 'react'
import { playSfx } from '../../audio/sfx'
import { useFuriganaDisplay, useSpeak } from '../../app/hooks'
import type { FuriganaDisplay } from '../../learning/furigana/furigana'
import { judgePractice, type PracticeResult } from '../../learning/practice/judge'
import type { ChoiceOption, Phrase, PracticeQuestion, Prompt } from '../../learning/practice/questions'
import { AnswerInput } from '../AnswerInput'
import { Button } from '../Button'
import { NamePlate } from '../dialogue/NamePlate'
import { KoreanText } from '../KoreanText'
import { Notice } from '../Notice'
import { SpeakButton } from '../SpeakButton'
import { TaskLabel } from '../TaskLabel'

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
  const speak = useSpeak()
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
      return (
        <Button variant="primary" sound={null} onClick={() => speak(prompt.phrase.korean)}>
          ▶ {answered ? 'もう一度聞く' : '聞く'}
        </Button>
      )
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
  }
}

function ChooseBody({ options, answers, selected, display, onSelect }: { options: ChoiceOption[]; answers: string[]; selected: string | null; display: FuriganaDisplay; onSelect: (text: string) => void }) {
  return (
    <ul className="choices quiz-options">
      {options.map((o) => {
        const mark = selected === null ? '' : answers.includes(o.text) ? ' quiz-option--answer' : o.text === selected ? ' quiz-option--wrong' : ''
        return (
          <li key={o.text} className="choice">
            <button type="button" className={`choice__button quiz-option${mark}`} lang={o.lang} disabled={selected !== null} onClick={() => onSelect(o.text)}>
              {o.lang === 'ko' ? <KoreanText korean={o.text} reading={o.reading} display={display === 'tap' ? 'hide' : display} /> : o.text}
              {selected !== null && answers.includes(o.text) && <span className="quiz-option__mark">（正解）</span>}
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
  return (
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
        placeholder="数字で書く（例：3500、3:30）"
      />
      <Button variant="primary" onClick={submit} disabled={text.trim() === ''}>
        答える
      </Button>
    </div>
  )
}

interface PracticeQuestionViewProps {
  q: PracticeQuestion
  /** 「3 / 10」など */
  position: string
  /** もう一度出した問題か */
  retry: boolean
  onAnswered: (correct: boolean) => void
  onNext: () => void
  nextLabel: string
}

/** 復習・練習・ドリル・章末テストの1問 */
export function PracticeQuestionView({ q, position, retry, onAnswered, onNext, nextLabel }: PracticeQuestionViewProps) {
  const display = useFuriganaDisplay(q.chapter)
  const [result, setResult] = useState<PracticeResult | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [digitsWarning, setDigitsWarning] = useState(false)
  const answered = result !== null

  function answer(given: string) {
    if (answered) return
    const r = judgePractice(q, given)
    // 韓国語で書く問題に数字で答えたときは、答えにせず、書き直してもらう
    if (!r.correct && r.digits) {
      setDigitsWarning(true)
      return
    }
    playSfx(r.correct ? 'correct' : 'wrong')
    setResult(r)
    onAnswered(r.correct)
  }

  return (
    <section className="panel quiz practice" aria-label="問題">
      <p className="muted small">
        {position}
        {retry && '（もう一度）'}
      </p>
      <p className="step-heading">{q.heading}</p>
      <PromptView prompt={q.prompt} display={display} answered={answered} />

      {q.body.type === 'choose' && (
        <ChooseBody
          options={q.body.options}
          answers={q.body.answers}
          selected={selected}
          display={display}
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
        <div className="practice-feedback" aria-live="polite">
          {result.correct ? (
            result.spacing ? (
              <Notice tone="warn">
                正解。ただし分かち書きに注意：<span lang="ko">{result.matched}</span>
              </Notice>
            ) : (
              <p className="correct">正解！</p>
            )
          ) : (
            <Notice tone="warn">ざんねん。正解はこちらです。</Notice>
          )}
          <div className="practice-model">
            <PhraseLine phrase={q.model} display={display === 'tap' ? 'show' : display} />
            <p className="muted small">{q.model.japanese}</p>
          </div>
          <Button variant="primary" onClick={onNext}>
            {nextLabel}
          </Button>
        </div>
      )}
    </section>
  )
}
