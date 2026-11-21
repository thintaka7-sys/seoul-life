// 1つの会話の進み方。会話は1つ以上の往復（turn）からなり、往復ごとに
// 「台詞を1つずつ見せる → 返事をする → 主人公の返事と相手の反応（reply）を見せる」と進む。
// 返事の方法（answer mode）はここで切り替える。「選ぶ」「書く」「話す」（Phase 2）。
// Phase 7 の「AI会話」も、ここに方法を足して同じ入口から使う。
// プレイヤーが選んだ答え方（preferred）は往復をまたいで覚えておき、使える往復ではその方法で始める（計画 Q9）。

import { DEFAULT_EXPRESSION, PLAYER_SPEAKER_ID, type Conversation, type ConversationLine, type ConversationTurn, type Expression } from '../../data/types'
import { judgeAnswer, normalizeAnswer, type JudgeResult } from '../judge/judgeAnswer'
import { judgeSpoken } from '../judge/judgeSpoken'

export type AnswerMode = 'choice' | 'write' | 'speak'

/** 主人公の返事として会話に加える行 */
export interface PlayerLine {
  korean: string
  /** 読み。書いた答えで、同じ文の選択肢がない場合は null（フリガナなし） */
  pronunciation: string | null
  japanese: string
}

/** 往復の答え。decision は選択の往復で選んだもの（正解・不正解なし） */
export interface TurnAnswer {
  method: 'choice' | 'write' | 'speak' | 'revealed' | 'decision'
  line: PlayerLine
  /** 書いた答えが分かち書きだけ違った */
  spacingNote: boolean
  /** 書いた文・聞き取られた言葉（書く・話すで正解したときだけ。選んだとき・答えを見たときは null） */
  given: string | null
  /** 相手の反応 */
  reply: ConversationLine[]
}

/** 間違えた答え（答えた後の見せ方・会話の最後のふり返りのため。GAME_SPEC 4-0。保存はしない） */
export interface TurnMistake {
  turn: number
  method: 'choice' | 'write' | 'speak'
  /** 選んだ選択肢・書いた文・聞き取られた言葉 */
  given: string
}

export interface ConversationSession {
  /** いまの往復の番号（0始まり） */
  turn: number
  /** いまの往復で見せている台詞の数（0〜lines.length） */
  shownLines: number
  mode: AnswerMode
  /** プレイヤーが選んだ答え方。いまの往復で使えなければ mode は別の方法になる */
  preferred: AnswerMode
  /** いまの往復で間違えた選択肢の番号 */
  wrongChoices: number[]
  /** いまの往復で書いて（話して）間違えた回数 */
  writeMisses: number
  /** 直近の書いた答えの判定 */
  lastJudge: JudgeResult | null
  /** 直近の話した答えが通じなかったときの、聞き取った言葉（通じなかったときだけ。なければ null） */
  lastHeard: string | null
  /** 直前に間違えた選択肢への相手の反応（なければ null） */
  wrongReply: ConversationLine[] | null
  /** いまの往復の答え。答えるまでは null */
  answer: TurnAnswer | null
  /** 見せている反応（reply）の数（0〜reply.length） */
  shownReply: number
  /** 終えた往復の答え（会話の記録を見返すため） */
  history: TurnAnswer[]
  /** この会話で間違えた答え（古い順） */
  mistakes: TurnMistake[]
}

/**
 * 会話の操作。speakAvailable は、いま「話す」が使えるか（音声認識が使え、設定でオン）。
 * 会話の途中でマイクを拒否されるなど変わることがあるので、往復を始めるとき（next）と答え方を変えるときに渡す。省略したら使えない。
 */
export type SessionAction =
  | { type: 'next'; speakAvailable?: boolean }
  | { type: 'setMode'; mode: AnswerMode; speakAvailable?: boolean }
  | { type: 'choose'; index: number }
  | { type: 'submitWrite'; text: string }
  /** 話した答え。alternatives は音声認識の候補（確からしい順） */
  | { type: 'submitSpeech'; alternatives: string[] }
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

/**
 * その往復で使える返事の方法（返事のない往復では空。書く問題がない往復・選択の往復では「選ぶ」だけ）。
 * 「話す」は、書く問題があり、音声認識が使える（speakAvailable）ときだけ。
 */
export function availableModes(turn: ConversationTurn | undefined, speakAvailable = false): AnswerMode[] {
  if (turn?.choices === undefined) return []
  if (turn.freeAnswer === undefined || turn.kind === 'decision') return ['choice']
  return speakAvailable ? ['choice', 'write', 'speak'] : ['choice', 'write']
}

/** 選んだ答え方が使えなければ、近い方法にする（話す → 書く → 選ぶ） */
export function modeFor(preferred: AnswerMode, modes: readonly AnswerMode[]): AnswerMode {
  if (modes.includes(preferred)) return preferred
  if (preferred === 'speak' && modes.includes('write')) return 'write'
  return 'choice'
}

function enterTurn(conversation: Conversation, index: number, preferred: AnswerMode, history: TurnAnswer[], mistakes: TurnMistake[], speakAvailable: boolean): ConversationSession {
  const turn = turnAt(conversation, index)
  return {
    turn: index,
    shownLines: Math.min(1, turn?.lines.length ?? 0),
    mode: modeFor(preferred, availableModes(turn, speakAvailable)),
    preferred,
    wrongChoices: [],
    writeMisses: 0,
    lastJudge: null,
    lastHeard: null,
    wrongReply: null,
    answer: null,
    shownReply: 0,
    history,
    mistakes,
  }
}

/** 会話を始める。preferred は前の会話で選んでいた答え方（ゲームを開いている間だけ覚えておく） */
export function initialSession(conversation: Conversation, preferred: AnswerMode = 'choice', speakAvailable = false): ConversationSession {
  return enterTurn(conversation, 0, preferred, [], [], speakAvailable)
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

/** 「答えを見る」を出してよいか（書く・話すで、合わせて attemptsBeforeReveal 回間違えたら） */
export function canReveal(conversation: Conversation, s: ConversationSession, attemptsBeforeReveal: number): boolean {
  return isAnswering(conversation, s) && (s.mode === 'write' || s.mode === 'speak') && s.writeMisses >= attemptsBeforeReveal
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

function writtenAnswer(turn: ConversationTurn, korean: string, method: 'write' | 'speak' | 'revealed', prompt: string, spacingNote: boolean, given: string | null): TurnAnswer {
  return {
    method,
    line: { korean, pronunciation: matchingChoice(turn, korean)?.pronunciation ?? null, japanese: prompt },
    spacingNote,
    given,
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
          return enterTurn(conversation, s.turn + 1, s.preferred, [...s.history, s.answer], s.mistakes, action.speakAvailable ?? false)
        }
        return s

      case 'setMode':
        if (phase !== 'answer' || !availableModes(turn, action.speakAvailable ?? false).includes(action.mode) || s.mode === action.mode) return s
        return { ...s, mode: action.mode, preferred: action.mode, lastJudge: null, lastHeard: null, wrongReply: null }

      case 'choose': {
        if (phase !== 'answer' || s.mode !== 'choice') return s
        const choice = turn.choices?.[action.index]
        if (choice === undefined || s.wrongChoices.includes(action.index)) return s
        // 選択の往復：どれを選んでも、その選択肢への反応を見せて進む（GAME_SPEC 4-4）
        if (turn.kind === 'decision') {
          const line = { korean: choice.korean, pronunciation: choice.pronunciation, japanese: choice.japanese }
          return { ...s, wrongReply: null, answer: { method: 'decision', line, spacingNote: false, given: null, reply: choice.reply ?? [] } }
        }
        if (!choice.correct) {
          const mistakes = [...s.mistakes, { turn: s.turn, method: 'choice' as const, given: choice.korean }]
          return { ...s, wrongChoices: [...s.wrongChoices, action.index], wrongReply: choice.reply ?? null, mistakes }
        }
        return {
          ...s,
          wrongReply: null,
          answer: {
            method: 'choice',
            line: { korean: choice.korean, pronunciation: choice.pronunciation, japanese: choice.japanese },
            spacingNote: false,
            given: null,
            reply: choice.reply ?? [],
          },
        }
      }

      case 'submitWrite': {
        const free = turn.freeAnswer
        if (phase !== 'answer' || s.mode !== 'write' || free === undefined) return s
        const judge = judgeAnswer(action.text, free.answers)
        if (judge.kind === 'incorrect') {
          const mistakes = [...s.mistakes, { turn: s.turn, method: 'write' as const, given: action.text.trim() }]
          return { ...s, lastJudge: judge, writeMisses: s.writeMisses + 1, mistakes }
        }
        return { ...s, lastJudge: judge, answer: writtenAnswer(turn, judge.matched, 'write', free.prompt, judge.kind === 'spacing', action.text.trim()) }
      }

      case 'submitSpeech': {
        const free = turn.freeAnswer
        if (phase !== 'answer' || s.mode !== 'speak' || free === undefined) return s
        const judge = judgeSpoken(action.alternatives, free.answers)
        if (judge.kind === 'incorrect') {
          const mistakes = [...s.mistakes, { turn: s.turn, method: 'speak' as const, given: judge.heard }]
          return { ...s, lastHeard: judge.heard, writeMisses: s.writeMisses + 1, mistakes }
        }
        // 話した答えは分かち書きの注意を出さない（話した人の誤りではないため）
        return { ...s, lastHeard: null, answer: writtenAnswer(turn, judge.matched, 'speak', free.prompt, false, judge.heard) }
      }

      case 'reveal': {
        const free = turn.freeAnswer
        const model = free?.answers[0]
        if (!canReveal(conversation, s, attemptsBeforeReveal) || free === undefined || model === undefined) return s
        return { ...s, answer: writtenAnswer(turn, model, 'revealed', free.prompt, false, null) }
      }
    }
  }
}

// ---------- 答えた後の見せ方（GAME_SPEC 4-0） ----------

/** 往復の正解（模範解答）。書く問題があれば、その正解と正解の選択肢の文 */
export interface TurnModel {
  /** 模範解答（正解の選択肢。なければ書く問題の最初の正解） */
  line: PlayerLine
  /** 正解として認める文（書いた答えと比べるため） */
  answers: string[]
}

export function turnModel(turn: ConversationTurn | undefined): TurnModel | null {
  const choice = turn?.choices?.find((c) => c.correct)
  const free = turn?.freeAnswer
  const first = choice?.korean ?? free?.answers[0]
  if (turn === undefined || first === undefined) return null
  const line: PlayerLine =
    choice !== undefined ? { korean: choice.korean, pronunciation: choice.pronunciation, japanese: choice.japanese } : { korean: first, pronunciation: null, japanese: free?.prompt ?? '' }
  return { line, answers: [...new Set([...(free?.answers ?? []), ...(choice === undefined ? [] : [choice.korean])])] }
}

/** いまの往復で、最後に書いた（話した）間違いの答え。「答えを見る」の後に正解と並べるため */
export function lastWrittenMistake(s: ConversationSession): TurnMistake | undefined {
  return s.mistakes.findLast((m) => m.turn === s.turn && m.method !== 'choice')
}

/** 会話の最後のふり返り：間違えた往復ごとに、間違えた答えと正解 */
export interface TurnReview {
  turn: number
  task: string | null
  mistakes: TurnMistake[]
  model: TurnModel
}

export function conversationReview(conversation: Conversation, s: ConversationSession): TurnReview[] {
  const turns = [...new Set(s.mistakes.map((m) => m.turn))].sort((a, b) => a - b)
  return turns.flatMap((index) => {
    const turn = turnAt(conversation, index)
    const model = turnModel(turn)
    if (model === null) return []
    return [{ turn: index, task: turn?.task ?? null, mistakes: s.mistakes.filter((m) => m.turn === index), model }]
  })
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
  // 正解した後は笑顔。「答えを見る」と選択の往復は、ふだんの顔（台詞に表情が書かれていればそれ）
  const reaction: Expression = answer.method === 'revealed' || answer.method === 'decision' ? DEFAULT_EXPRESSION : 'smile'
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
  const missed = s.wrongChoices.length > 0 || s.lastJudge?.kind === 'incorrect' || s.lastHeard !== null
  if (s.answer === null && s.wrongReply === null && missed) return 'troubled'
  const own = lines.findLast((l) => l.speaker === conversation.character)
  return own === undefined ? DEFAULT_EXPRESSION : (own.expression ?? own.autoExpression)
}
