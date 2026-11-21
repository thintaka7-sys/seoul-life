// 答えた後の見せ方（GAME_SPEC 4-0）：選択肢の印と、結果画面で見返す「間違えた問題」。
// 画面（components/practice/AnswerFeedback.tsx）は、ここで作ったものをそのまま出す。

import { questionAnswer, type HangulQuestion } from '../hangul/quiz'
import { normalizeAnswer } from '../judge/judgeAnswer'
import type { ListeningKind, ListeningQuestion } from '../listening/questions'
import type { PracticeQuestion, Prompt } from '../practice/questions'

/**
 * 答えた後の選択肢の印。
 * - chosenAnswer：選んだもの（正解）
 * - wrong：選んだもの（不正解）
 * - answer：選ばなかった正解
 * - null：印なし（答える前・それ以外の選択肢）
 */
export type OptionState = 'chosenAnswer' | 'wrong' | 'answer' | null

export function optionState(option: string, answers: readonly string[], selected: string | null): OptionState {
  if (selected === null) return null
  const isAnswer = answers.includes(option)
  if (option === selected) return isAnswer ? 'chosenAnswer' : 'wrong'
  return isAnswer ? 'answer' : null
}

/** 結果画面で見返す、間違えた問題1つ */
export interface MissedItem {
  /** 画面の key（同じ問題を2回間違えることはないので、問題の番号などから作る） */
  id: string
  /** 問題文（例：韓国語で何と言いますか） */
  heading: string
  /** 問題で見せたもの（聞く問題では null） */
  question: { text: string; lang: 'ko' | 'ja' } | null
  /** choice：選ぶ問題（✓・✗ で見せる）、text：韓国語を書く問題（違う文字を目立たせる）、digits：数字を書く問題 */
  style: 'choice' | 'text' | 'digits'
  /** 自分の答え */
  given: string
  givenLang: 'ko' | 'ja'
  /** 正解（choice では正解の選択肢、text・digits では正解として認める文。先頭が模範解答） */
  answers: string[]
  /** 正解の文と意味（なければ null） */
  model: { korean: string; japanese: string } | null
  /** 聞き比べる音（聞く問題だけ）。given は、選んだものが韓国語のときだけ */
  listen: { given: string | null; answer: string } | null
  /** 正解の下に添える説明 */
  note: string | null
}

/** 問題で見せたもの（結果画面の一覧のため） */
function questionOf(prompt: Prompt): MissedItem['question'] {
  switch (prompt.kind) {
    case 'korean':
      return { text: prompt.phrase.korean, lang: 'ko' }
    case 'japanese':
      return { text: prompt.hint === null ? prompt.text : `${prompt.text}（${prompt.hint}）`, lang: 'ja' }
    case 'audio':
      return null
    case 'blank':
      return { text: `${prompt.before}（　）${prompt.after}`, lang: 'ko' }
    case 'conversation': {
      if (prompt.task !== null) return { text: `言うこと：${prompt.task}`, lang: 'ja' }
      const last = prompt.lines.at(-1)
      return last === undefined ? null : { text: last.korean, lang: 'ko' }
    }
  }
}

/** 練習・復習・ドリル・章末テスト・聞き分けの問題から、見返す内容を作る */
export function missedFromPractice(q: PracticeQuestion, given: string, id: string): MissedItem {
  const body = q.body
  const listenTarget = q.prompt.kind === 'audio' ? q.prompt.phrase.korean : null
  const base = { id, heading: q.heading, question: questionOf(q.prompt), given, model: { korean: q.model.korean, japanese: q.model.japanese }, note: q.note ?? null }
  switch (body.type) {
    case 'choose': {
      const lang = body.options.find((o) => o.text === given)?.lang ?? 'ko'
      return { ...base, style: 'choice', givenLang: lang, answers: body.answers, listen: listenTarget === null ? null : { given: lang === 'ko' ? given : null, answer: listenTarget } }
    }
    case 'arrange':
      return { ...base, style: 'text', givenLang: 'ko', answers: [body.answer], listen: null }
    case 'write':
      return { ...base, style: 'text', givenLang: 'ko', answers: body.answers, listen: null }
    case 'number':
      return { ...base, style: 'digits', givenLang: 'ja', answers: [body.digits], listen: listenTarget === null ? null : { given: null, answer: listenTarget } }
  }
}

/** ハングルの小テストの問題文 */
export function hangulHeading(q: HangulQuestion): string {
  switch (q.kind) {
    case 'listen':
      return '音を聞いて、合う文字を選んでください'
    case 'listenSpelling':
      return '音を聞いて、正しいつづりを選んでください'
    case 'reading':
      return [...q.korean].length > 1 ? 'この言葉の読みを選んでください' : 'この文字の読みを選んでください'
    case 'meaning':
      return 'この言葉の意味を選んでください'
    case 'spoken':
      return '発音どおりに書くと、どれになりますか'
    case 'build':
      return 'キーボードで、この文字を組み立ててください'
  }
}

/** ハングルの小テストの問題から、見返す内容を作る */
export function missedFromHangul(q: HangulQuestion, given: string, id: string): MissedItem {
  const answer = questionAnswer(q)
  const base = { id, heading: hangulHeading(q), given, answers: [answer], model: null, note: null }
  switch (q.kind) {
    case 'listen':
    case 'listenSpelling':
      return { ...base, question: null, style: 'choice', givenLang: 'ko', listen: { given, answer } }
    case 'reading':
    case 'meaning':
      return { ...base, question: { text: q.korean, lang: 'ko' }, style: 'choice', givenLang: 'ja', listen: null }
    case 'spoken':
      // 発音どおりの形は [ ] で囲んで見せる（レッスンと同じ）
      return { ...base, question: { text: q.korean, lang: 'ko' }, style: 'choice', givenLang: 'ko', given: `[${given}]`, answers: [`[${answer}]`], listen: null }
    case 'build':
      return { ...base, question: { text: q.korean, lang: 'ko' }, style: 'text', givenLang: 'ko', listen: null }
  }
}

/** リスニングの問題文 */
export const LISTENING_HEADINGS: Record<ListeningKind, string> = {
  word: '聞こえた言葉を選んでください',
  reply: '相手の言葉を聞いて、返事を選んでください',
  sentence: '聞こえた文を選んでください',
}

/** リスニングの問題から、見返す内容を作る。返事の問題では、聞いた相手の言葉も見せる */
export function missedFromListening(q: ListeningQuestion, given: string, id: string): MissedItem {
  const answer = q.answers[0] ?? q.audio.korean
  const correct = q.options.find((o) => o.korean === answer)
  return {
    id,
    heading: LISTENING_HEADINGS[q.kind],
    question: q.kind === 'reply' ? { text: q.audio.korean, lang: 'ko' } : null,
    style: 'choice',
    given,
    givenLang: 'ko',
    answers: q.answers,
    model: correct === undefined ? null : { korean: correct.korean, japanese: correct.japanese },
    listen: { given, answer },
    note: null,
  }
}

/** 書いて正解した答えが、模範解答と違う形（別解）か */
export function isAlternative(matched: string, model: string): boolean {
  return normalizeAnswer(matched).replace(/ /g, '') !== normalizeAnswer(model).replace(/ /g, '')
}
