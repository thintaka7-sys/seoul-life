import type { ReactNode } from 'react'
import { optionState } from '../learning/feedback/missed'
import { OptionMark } from './practice/AnswerFeedback'
import { optionClass } from './practice/optionClass'

interface QuizOptionsProps {
  options: readonly string[]
  answer: string
  /** 選んだ選択肢。選ぶまでは null。選んだ後は押せなくし、正解と選んだものに印を付ける */
  selected: string | null
  onSelect: (option: string) => void
  /** 選択肢の言語（韓国語なら ko） */
  lang?: 'ko' | 'ja'
  /** 選択肢の表示（省略したらそのまま） */
  render?: (option: string) => ReactNode
}

/** 小テスト・リスニングの選択肢。1回だけ選べる */
export function QuizOptions({ options, answer, selected, onSelect, lang = 'ja', render }: QuizOptionsProps) {
  return (
    <ul className="choices quiz-options">
      {options.map((o) => {
        const state = optionState(o, [answer], selected)
        return (
          <li key={o} className="choice">
            <button type="button" className={`choice__button quiz-option${optionClass(state)}`} lang={lang} disabled={selected !== null} onClick={() => onSelect(o)}>
              {render === undefined ? o : render(o)}
              <OptionMark state={state} />
            </button>
          </li>
        )
      })}
    </ul>
  )
}
