// 1回分の出題の進み方（今日の復習・練習・ドリル・章末テストで共通）。
// 間違えた問題は、その回の最後にもう1度だけ出す（計画 Q5）。2回目の答えは記録に使わない。

import { shuffle, type Random } from '../hangul/quiz'
import type { PracticeQuestion } from './questions'

export interface RoundResult {
  key: string
  correct: boolean
  /** 自分の答え（選んだ選択肢・並べた答え・書いた答え）。結果画面で見返すため（GAME_SPEC 4-0） */
  given: string
}

export interface PracticeRound {
  /** 出す問題（最初の出題の後ろに、もう一度出す問題が付く） */
  questions: PracticeQuestion[]
  /** 最初の出題の数 */
  firstCount: number
  /** いまの問題の番号 */
  index: number
  /** 最初の出題の結果（出した順） */
  results: RoundResult[]
  /** 間違えた問題を最後にもう一度出すか（章末テストでは出さない） */
  retry: boolean
}

export function startRound(questions: readonly PracticeQuestion[], retry: boolean): PracticeRound {
  return { questions: [...questions], firstCount: questions.length, index: 0, results: [], retry }
}

export function currentQuestion(round: PracticeRound): PracticeQuestion | undefined {
  return round.questions[round.index]
}

/** いまの問題が「もう一度」の問題か */
export function isRetry(round: PracticeRound): boolean {
  return round.index >= round.firstCount
}

/** すべて出し終えたか */
export function isFinished(round: PracticeRound): boolean {
  return round.index >= round.questions.length
}

/** いまの問題に答えた。最初の出題のときだけ結果を残す */
export function answerRound(round: PracticeRound, correct: boolean, given = ''): PracticeRound {
  const q = currentQuestion(round)
  if (q === undefined || isRetry(round) || round.results.length > round.index) return round
  return { ...round, results: [...round.results, { key: q.key, correct, given }] }
}

/** 最初の出題で間違えた問題と、そのときの答え（出した順） */
export function missedQuestions(round: PracticeRound): { question: PracticeQuestion; given: string; index: number }[] {
  return round.results.flatMap((r, index) => {
    const question = round.questions[index]
    return r.correct || question === undefined ? [] : [{ question, given: r.given, index }]
  })
}

/** 選択肢・札の並びを変える（もう一度出すとき、同じ位置を覚えて答えられないように） */
function reshuffle(q: PracticeQuestion, random: Random): PracticeQuestion {
  switch (q.body.type) {
    case 'choose':
      return { ...q, body: { ...q.body, options: shuffle(q.body.options, random) } }
    case 'arrange':
      return { ...q, body: { ...q.body, tiles: shuffle(q.body.tiles, random) } }
    case 'write':
    case 'number':
      return q
  }
}

/** 次の問題へ。最初の出題を終えたら、間違えた問題を後ろに足す */
export function nextQuestion(round: PracticeRound, random: Random): PracticeRound {
  const index = round.index + 1
  if (index !== round.firstCount || !round.retry) return { ...round, index }
  const wrong = round.questions.slice(0, round.firstCount).filter((_, i) => round.results[i]?.correct === false)
  return { ...round, index, questions: [...round.questions, ...wrong.map((q) => reshuffle(q, random))] }
}

/** 最初の出題で正解した数 */
export function correctCount(round: PracticeRound): number {
  return round.results.filter((r) => r.correct).length
}
