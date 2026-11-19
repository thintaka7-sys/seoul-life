// 1つの会話の進み方。会話は1つ以上の往復（turn）からなり、往復ごとに
// 「台詞を1つずつ見せる → 返事をする → 主人公の返事と相手の反応（reply）を見せる」と進む。
// 返事の方法（answer mode）はここで切り替える。Phase 1 は「選ぶ」「書く」。
// Phase 2 の「話す」、Phase 7 の「AI会話」も、ここに方法を足して同じ入口から使う。

import { DEFAULT_EXPRESSION, PLAYER_SPEAKER_ID, type Conversation, type ConversationLine, type ConversationTurn, type Expression } from '../../data/types'
import { judgeAnswer, normalizeAnswer, type JudgeResult } from '../judge/judgeAnswer'

export type AnswerMode = 'choice' | 'write'

/** 主人公の返事として会話に加える行 */
export interface PlayerLine {
  korean: string
  /** 読み。書いた答えで、同じ文の選択肢がない場合は null（フリガナなし） */
  pronunciation: string | null
  japanese: string
}

/** 往復の答え */
export interface TurnAnswer {
  method: 'choice' | 'write' | 'revealed'
  line: PlayerLine
  /** 書いた答えが分かち書きだけ違った */
  spacingNote: boolean
  /** 相手の反応 */
  reply: ConversationLine[]
}

export interface ConversationSession {
  /** いまの往復の番号（0始まり） */
  turn: number
  /** いまの往復で見せている台詞の数（0〜lines.length） */
  shownLines: number
  mode: AnswerMode
  /** いまの往復で間違えた選択肢の番号 */
  wrongChoices: number[]
  /** いまの往復で書いて間違えた回数 */
  writeMisses: number
  /** 直近の書いた答えの判定 */
  lastJudge: JudgeResult | null
  /** 直前に間違えた選択肢への相手の反応（なければ null） */
  wrongReply: ConversationLine[] | null
  /** いまの往復の答え。答えるまでは null */
  answer: TurnAnswer | null
  /** 見せている反応（reply）の数（0〜reply.length） */
  shownReply: number
  /** 終えた往復の答え（会話の記録を見返すため） */
  history: TurnAnswer[]
}

export type SessionAction =
  | { type: 'next' }
  | { type: 'setMode'; mode: AnswerMode }
  | { type: 'choose'; index: number }
  | { type: 'submitWrite'; text: string }
  | { type: 'reveal' }

/**
 * いまの段階。
 * - lines：台詞を見せている途中（「次へ」で次の台詞）
 * - answer：返事をする
 * - reply：主人公の返事と相手の反応を見せている途中（「次へ」で次の反応・次の往復）
 * - end：会話の最後まで見せた（「次へ」で会話を終える）
 */
export type SessionPhase = 'lines' | 'answer' | 'reply' | 'end'

function turnAt(conversation: Conversation, index: number): ConversationTurn | undefined {
  return conversation.turns[index]
}

/** その往復で使える返事の方法（返事のない往復では空。書く問題がない往復では「選ぶ」だけ） */
export function availableModes(turn: ConversationTurn | undefined): AnswerMode[] {
  if (turn?.choices === undefined) return []
  return turn.freeAnswer === undefined ? ['choice'] : ['choice', 'write']
}

function enterTurn(conversation: Conversation, index: number, mode: AnswerMode, history: TurnAnswer[]): ConversationSession {
  const turn = turnAt(conversation, index)
  const modes = availableModes(turn)
  return {
    turn: index,
    shownLines: Math.min(1, turn?.lines.length ?? 0),
    // 前の往復で「書く」を選んでいたら、次の往復でも続けて書けるようにする
    mode: modes.includes(mode) ? mode : 'choice',
    wrongChoices: [],
    writeMisses: 0,
    lastJudge: null,
    wrongReply: null,
    answer: null,
    shownReply: 0,
    history,
  }
}

export function initialSession(conversation: Conversation): ConversationSession {
  return enterTurn(conversation, 0, 'choice', [])
}

export function sessionPhase(conversation: Conversation, s: ConversationSession): SessionPhase {
  const turn = turnAt(conversation, s.turn)
  if (turn === undefined) return 'end'
  const isLastTurn = s.turn >= conversation.turns.length - 1
  if (s.answer !== null) {
    if (s.shownReply < s.answer.reply.length || !isLastTurn) return 'reply'
    return 'end'
  }
  if (s.shownLines < turn.lines.length) return 'lines'
  if (turn.choices !== undefined) return 'answer'
  return 'end'
}

/** 返事ができる状態か */
export function isAnswering(conversation: Conversation, s: ConversationSession): boolean {
  return sessionPhase(conversation, s) === 'answer'
}

/** 「答えを見る」を出してよいか */
export function canReveal(conversation: Conversation, s: ConversationSession, attemptsBeforeReveal: number): boolean {
  return isAnswering(conversation, s) && s.mode === 'write' && s.writeMisses >= attemptsBeforeReveal
}

/** 書いた答えに対応する選択肢（同じ文の選択肢があればそれ） */
function matchingChoice(turn: ConversationTurn, korean: string) {
  const key = normalizeAnswer(korean)
  return turn.choices?.find((c) => normalizeAnswer(c.korean) === key)
}

/** 書いた答えへの反応：freeAnswer.reply → 同じ文の選択肢の reply → 最初の正解の選択肢の reply */
function replyForWritten(turn: ConversationTurn, korean: string): ConversationLine[] {
  return turn.freeAnswer?.reply ?? matchingChoice(turn, korean)?.reply ?? turn.choices?.find((c) => c.correct)?.reply ?? []
}

function writtenAnswer(turn: ConversationTurn, korean: string, method: 'write' | 'revealed', prompt: string, spacingNote: boolean): TurnAnswer {
  return {
    method,
    line: { korean, pronunciation: matchingChoice(turn, korean)?.pronunciation ?? null, japanese: prompt },
    spacingNote,
    reply: replyForWritten(turn, korean),
  }
}

export function createSessionReducer(conversation: Conversation, attemptsBeforeReveal: number) {
  return function sessionReducer(s: ConversationSession, action: SessionAction): ConversationSession {
    const turn = turnAt(conversation, s.turn)
    if (turn === undefined) return s
    const phase = sessionPhase(conversation, s)

    switch (action.type) {
      case 'next':
        if (phase === 'lines') return { ...s, shownLines: s.shownLines + 1 }
        if (phase === 'reply' && s.answer !== null) {
          if (s.shownReply < s.answer.reply.length) return { ...s, shownReply: s.shownReply + 1 }
          return enterTurn(conversation, s.turn + 1, s.mode, [...s.history, s.answer])
        }
        return s

      case 'setMode':
        if (phase !== 'answer' || !availableModes(turn).includes(action.mode) || s.mode === action.mode) return s
        return { ...s, mode: action.mode, lastJudge: null, wrongReply: null }

      case 'choose': {
        if (phase !== 'answer' || s.mode !== 'choice') return s
        const choice = turn.choices?.[action.index]
        if (choice === undefined || s.wrongChoices.includes(action.index)) return s
        if (!choice.correct) return { ...s, wrongChoices: [...s.wrongChoices, action.index], wrongReply: choice.reply ?? null }
        return {
          ...s,
          wrongReply: null,
          answer: {
            method: 'choice',
            line: { korean: choice.korean, pronunciation: choice.pronunciation, japanese: choice.japanese },
            spacingNote: false,
            reply: choice.reply ?? [],
          },
        }
      }

      case 'submitWrite': {
        const free = turn.freeAnswer
        if (phase !== 'answer' || s.mode !== 'write' || free === undefined) return s
        const judge = judgeAnswer(action.text, free.answers)
        if (judge.kind === 'incorrect') return { ...s, lastJudge: judge, writeMisses: s.writeMisses + 1 }
        return { ...s, lastJudge: judge, answer: writtenAnswer(turn, judge.matched, 'write', free.prompt, judge.kind === 'spacing') }
      }

      case 'reveal': {
        const free = turn.freeAnswer
        const model = free?.answers[0]
        if (!canReveal(conversation, s, attemptsBeforeReveal) || free === undefined || model === undefined) return s
        return { ...s, answer: writtenAnswer(turn, model, 'revealed', free.prompt, false) }
      }
    }
  }
}

// ---------- 画面に出す台詞の並びと、立ち絵の表情 ----------

/**
 * 画面に出す1行。
 * - line：往復の台詞
 * - player：主人公の返事
 * - reply：答えの後の相手の反応
 * - wrongReply：間違えた選択肢への相手の反応（もう一度選ぶまでの一時的な表示）
 */
export interface ShownLine {
  kind: 'line' | 'player' | 'reply' | 'wrongReply'
  speaker: string
  korean: string
  /** 読み（ない場合は null） */
  pronunciation: string | null
  japanese: string
  /** 台詞に書かれた表情。書かれていなければ autoExpression を使う */
  expression: Expression | undefined
  /** 自動で決めた表情（ふだんの台詞は normal、正解の後の反応は笑顔、間違いへの反応は困り顔） */
  autoExpression: Expression
}

function fromLine(kind: ShownLine['kind'], line: ConversationLine, autoExpression: Expression): ShownLine {
  return { kind, speaker: line.speaker, korean: line.korean, pronunciation: line.pronunciation, japanese: line.japanese, expression: line.expression, autoExpression }
}

function fromAnswer(answer: TurnAnswer, shownReply: number): ShownLine[] {
  const reaction: Expression = answer.method === 'revealed' ? DEFAULT_EXPRESSION : 'smile'
  const player: ShownLine = { kind: 'player', speaker: PLAYER_SPEAKER_ID, ...answer.line, expression: undefined, autoExpression: reaction }
  return [player, ...answer.reply.slice(0, shownReply).map((l) => fromLine('reply', l, reaction))]
}

/** これまでに見せた台詞を、古い順に並べる（最後の要素が、いま見せている台詞） */
export function shownLines(conversation: Conversation, s: ConversationSession): ShownLine[] {
  const result: ShownLine[] = []
  s.history.forEach((answer, i) => {
    for (const l of turnAt(conversation, i)?.lines ?? []) result.push(fromLine('line', l, DEFAULT_EXPRESSION))
    result.push(...fromAnswer(answer, answer.reply.length))
  })
  for (const l of turnAt(conversation, s.turn)?.lines.slice(0, s.shownLines) ?? []) result.push(fromLine('line', l, DEFAULT_EXPRESSION))
  if (s.answer !== null) result.push(...fromAnswer(s.answer, s.shownReply))
  else if (s.wrongReply !== null) result.push(...s.wrongReply.map((l) => fromLine('wrongReply', l, 'troubled')))
  return result
}

/**
 * 会話の相手の立ち絵の表情。台詞に expression が書かれていれば、いつもそれを優先する。
 * 書かれていなければ自動：正解した直後とその反応は笑顔、間違えた直後とその反応は困り顔、ほかは normal。
 * 相手以外（主人公など）が話している間は、直前の相手の表情を保つ。ただし答えた直後は反応を見せる。
 */
export function characterExpression(conversation: Conversation, s: ConversationSession): Expression {
  const lines = shownLines(conversation, s)
  const last = lines.at(-1)
  if (last?.kind === 'player') return last.autoExpression
  const missed = s.wrongChoices.length > 0 || s.lastJudge?.kind === 'incorrect'
  if (s.answer === null && s.wrongReply === null && missed) return 'troubled'
  const own = lines.findLast((l) => l.speaker === conversation.character)
  return own === undefined ? DEFAULT_EXPRESSION : (own.expression ?? own.autoExpression)
}
