import type { OptionState } from '../../learning/feedback/missed'

/** 選択肢のボタンに付ける class（答えた後の印に合わせた枠の色。GAME_SPEC 4-0） */
export function optionClass(state: OptionState): string {
  return state === null ? '' : state === 'wrong' ? ' quiz-option--wrong' : ' quiz-option--answer'
}
