// 答えた後の見せ方（GAME_SPEC 4-0）の部品。すべての問題（練習・復習・ドリル・章末テスト・ハングルの小テスト・
// リスニング・聞き分け・会話）で同じ見た目にする。
// - 選ぶ問題：選択肢に ✓・✗ と言葉の印（色だけに頼らない）
// - 書く問題：自分の答えと正解を上下に並べ、違う文字を目立たせる
// - 聞く問題：選んだ音と正解の音を聞き比べる
// - 結果画面：間違えた問題の一覧

import { useSpeak, useSpeechStatus } from '../../app/hooks'
import { diffAnswer, diffDigits, type DiffPart } from '../../learning/feedback/diff'
import type { MissedItem, OptionState } from '../../learning/feedback/missed'
import { Button } from '../Button'

const MARK_LABELS: Record<Exclude<OptionState, null>, string> = {
  chosenAnswer: '✓ あなたの答え（正解）',
  wrong: '✗ あなたの答え',
  answer: '✓ 正解',
}

/** 選択肢に付ける印（印がなければ何も出さない） */
export function OptionMark({ state }: { state: OptionState }) {
  if (state === null) return null
  return <span className={`quiz-option__mark quiz-option__mark--${state === 'wrong' ? 'wrong' : 'answer'}`}>{MARK_LABELS[state]}</span>
}

/** 違う文字に印を付けた1行。空白だけの違いは、見える幅の印にする */
function DiffLine({ parts, side }: { parts: DiffPart[]; side: 'given' | 'expected' }) {
  return (
    <>
      {parts.map((p, i) =>
        !p.diff ? (
          <span key={i}>{p.text}</span>
        ) : p.text.trim() === '' ? (
          <mark key={i} className={`diff diff--${side} diff--space`} title="空白">
            {' '}
          </mark>
        ) : (
          <mark key={i} className={`diff diff--${side}`}>
            {p.text}
          </mark>
        ),
      )}
    </>
  )
}

interface AnswerCompareProps {
  /** 自分の答え（書いた文・並べた札・聞き取られた言葉） */
  given: string
  /** 正解として認める文（先頭が模範解答）。いちばん近いものと比べる */
  answers: readonly string[]
  /** 数字の問題 */
  digits?: boolean
  givenLabel?: string
  answerLabel?: string
}

/** 自分の答えと正解を上下に並べ、違う文字を目立たせる */
export function AnswerCompare({ given, answers, digits = false, givenLabel = 'あなたの答え', answerLabel = '正解' }: AnswerCompareProps) {
  const first = answers[0]
  const d = digits ? (first === undefined ? null : diffDigits(given, first)) : diffAnswer(given, answers)
  if (d === null) return null
  const lang = digits ? undefined : 'ko'
  return (
    <dl className="answer-compare">
      <div className="answer-compare__row">
        <dt>{givenLabel}</dt>
        <dd lang={lang}>{d.given.length === 0 ? <span className="muted">（なし）</span> : <DiffLine parts={d.given} side="given" />}</dd>
      </div>
      <div className="answer-compare__row">
        <dt>{answerLabel}</dt>
        <dd lang={lang}>
          <DiffLine parts={d.expected} side="expected" />
        </dd>
      </div>
      {d.distance > 0 && <p className="answer-compare__legend muted small">色の付いた文字が、違うところです</p>}
    </dl>
  )
}

/** 「▶ 聞く」と「ゆっくり」 */
export function ListenButtons({ text, label = '聞く' }: { text: string; label?: string }) {
  const speak = useSpeak()
  return (
    <div className="listen-buttons">
      <Button variant="primary" sound={null} onClick={() => speak(text)}>
        ▶ {label}
      </Button>
      <Button sound={null} onClick={() => speak(text, 'slow')}>
        ゆっくり
      </Button>
    </div>
  )
}

/** 選んだ音と正解の音を聞き比べる（選んだものが正解なら、正解の音だけ） */
export function ListenCompare({ given, answer }: { given: string | null; answer: string }) {
  const speak = useSpeak()
  const available = useSpeechStatus().state === 'available'
  if (!available) return null
  const same = given === null || given === answer
  return (
    <div className="listen-compare" role="group" aria-label="聞き比べる">
      <span className="muted small">聞き比べる</span>
      {!same && (
        <Button sound={null} onClick={() => speak(given)}>
          ▶ あなたの答え <span lang="ko">{given}</span>
        </Button>
      )}
      <Button sound={null} onClick={() => speak(answer)}>
        ▶ 正解 <span lang="ko">{answer}</span>
      </Button>
    </div>
  )
}

/** 結果画面：間違えた問題を一覧にし、自分の答えと正解を見返す */
export function MissedList({ items }: { items: readonly MissedItem[] }) {
  if (items.length === 0) return null
  return (
    <section className="missed" aria-labelledby="missed-heading">
      <h2 id="missed-heading" className="step-heading">
        間違えた問題（{items.length}問）
      </h2>
      <ol className="missed__list">
        {items.map((m) => (
          <li key={m.id} className="missed__item">
            <p className="muted small">{m.heading}</p>
            {m.question !== null && (
              <p className="missed__question" lang={m.question.lang === 'ko' ? 'ko' : undefined}>
                {m.question.text}
              </p>
            )}
            {m.style === 'choice' ? (
              <dl className="answer-compare">
                <div className="answer-compare__row">
                  <dt>✗ あなたの答え</dt>
                  <dd lang={m.givenLang === 'ko' ? 'ko' : undefined}>{m.given}</dd>
                </div>
                <div className="answer-compare__row">
                  <dt>✓ 正解</dt>
                  <dd lang={m.givenLang === 'ko' ? 'ko' : undefined}>{m.answers.join(' ／ ')}</dd>
                </div>
              </dl>
            ) : (
              <AnswerCompare given={m.given} answers={m.answers} digits={m.style === 'digits'} />
            )}
            {m.model !== null && (
              <p className="missed__model">
                <span lang="ko">{m.model.korean}</span>
                <span className="muted small">（{m.model.japanese}）</span>
              </p>
            )}
            {m.note !== null && <p className="answer-note small">{m.note}</p>}
            {m.listen !== null && <ListenCompare given={m.listen.given} answer={m.listen.answer} />}
          </li>
        ))}
      </ol>
    </section>
  )
}
