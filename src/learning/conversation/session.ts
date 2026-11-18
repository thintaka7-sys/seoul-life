// 1つの会話の進み方（台詞を1つずつ見せる → 返事をする → 結果）。
// 返事の方法（answer mode）はここで切り替える。Phase 1 は「選ぶ」「書く」。
// Phase 2 の「話す」、Phase 7 の「AI会話」も、ここに方法を足して同じ入口から使う。

import type { Conversation } from '../../data/types'
import { judgeAnswer, normalizeAnswer, type JudgeResult } from '../judge/judgeAnswer'

export type AnswerMode = 'choice' | 'write'

/** その会話で使える返事の方法（書く問題がない会話では「選ぶ」だけ） */
export function availableModes(conversation: Conversation): AnswerMode[] {
  return conversation.freeAnswer === undefined ? ['choice'] : ['choice', 'write']
}

/** 主人公の返事として会話に加える行 */
export interface PlayerLine {
  korean: string
  /** 読み。書いた答えで、同じ文の選択肢がない場合は null（フリガナなし） */
  pronunciation: string | null
  japanese: string
}

export interface SessionResult {
  method: 'choice' | 'write' | 'revealed'
  line: PlayerLine
  /** 書いた答えが分かち書きだけ違った */
  spacingNote: boolean
}

export interface ConversationSession {
  /** 見せている台詞の数（1〜lines.length） */
  shownLines: number
  mode: AnswerMode
  /** 間違えた選択肢の番号 */
  wrongChoices: number[]
  /** 書いて答えた回数（間違えた回数） */
  writeMisses: number
  /** 直近の書いた答えの判定 */
  lastJudge: JudgeResult | null
  result: SessionResult | null
}

export type SessionAction =
  | { type: 'nextLine' }
  | { type: 'setMode'; mode: AnswerMode }
  | { type: 'choose'; index: number }
  | { type: 'submitWrite'; text: string }
  | { type: 'reveal' }

export function initialSession(): ConversationSession {
  return { shownLines: 1, mode: 'choice', wrongChoices: [], writeMisses: 0, lastJudge: null, result: null }
}

/** 台詞をすべて見せ終え、返事ができる状態か */
export function isAnswering(conversation: Conversation, s: ConversationSession): boolean {
  return s.result === null && s.shownLines >= conversation.lines.length
}

/** 「答えを見る」を出してよいか */
export function canReveal(s: ConversationSession, attemptsBeforeReveal: number): boolean {
  return s.mode === 'write' && s.result === null && s.writeMisses >= attemptsBeforeReveal
}

/** 書いた答えに対応する読み（同じ文の選択肢があればその読み） */
function readingFor(conversation: Conversation, korean: string): string | null {
  const key = normalizeAnswer(korean)
  return conversation.choices.find((c) => normalizeAnswer(c.korean) === key)?.pronunciation ?? null
}

export function createSessionReducer(conversation: Conversation, attemptsBeforeReveal: number) {
  const modes = availableModes(conversation)
  return function sessionReducer(s: ConversationSession, action: SessionAction): ConversationSession {
    switch (action.type) {
      case 'nextLine':
        if (s.shownLines >= conversation.lines.length) return s
        return { ...s, shownLines: s.shownLines + 1 }

      case 'setMode':
        if (s.result !== null || !modes.includes(action.mode) || s.mode === action.mode) return s
        return { ...s, mode: action.mode, lastJudge: null }

      case 'choose': {
        if (!isAnswering(conversation, s) || s.mode !== 'choice') return s
        const choice = conversation.choices[action.index]
        if (choice === undefined || s.wrongChoices.includes(action.index)) return s
        if (!choice.correct) return { ...s, wrongChoices: [...s.wrongChoices, action.index] }
        return {
          ...s,
          result: { method: 'choice', line: { korean: choice.korean, pronunciation: choice.pronunciation, japanese: choice.japanese }, spacingNote: false },
        }
      }

      case 'submitWrite': {
        const free = conversation.freeAnswer
        if (!isAnswering(conversation, s) || s.mode !== 'write' || free === undefined) return s
        const judge = judgeAnswer(action.text, free.answers)
        if (judge.kind === 'incorrect') return { ...s, lastJudge: judge, writeMisses: s.writeMisses + 1 }
        return {
          ...s,
          lastJudge: judge,
          result: {
            method: 'write',
            line: { korean: judge.matched, pronunciation: readingFor(conversation, judge.matched), japanese: free.prompt },
            spacingNote: judge.kind === 'spacing',
          },
        }
      }

      case 'reveal': {
        const free = conversation.freeAnswer
        const model = free?.answers[0]
        if (!canReveal(s, attemptsBeforeReveal) || free === undefined || model === undefined) return s
        return { ...s, result: { method: 'revealed', line: { korean: model, pronunciation: readingFor(conversation, model), japanese: free.prompt }, spacingNote: false } }
      }
    }
  }
}
