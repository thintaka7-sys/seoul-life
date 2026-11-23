// 読み物（GAME_SPEC 4-7）の問題。選ぶ・数字・書く問題は、復習の問題と同じ形（PracticeQuestion）にして、同じ画面で答える。
// 「本文から探して押す」（find）は、本文のまとまり（空白で区切った語）を押して答える。
// 復習には入れない（本文がないと解けないため。計画 Q12）。経験値は、問題ごとに初めて正解したときだけ。

import type { Reading, ReadingQuestion } from '../../data/types'
import { textChunks } from '../gloss/chunks'
import { shuffle, type Random } from '../hangul/quiz'
import { normalizeAnswer } from '../judge/judgeAnswer'
import type { PracticeQuestion } from '../practice/questions'

/** 問題の記録のキー（reading_001#0） */
export function readingQuestionKey(readingId: string, index: number): string {
  return `${readingId}#${index}`
}

/** 値段などの数字を、3けたごとにカンマで区切る（5500 → 5,500） */
export function formatNumber(digits: string): string {
  return /^\d+$/.test(digits) ? Number(digits).toLocaleString('en-US') : digits
}

/**
 * 選ぶ・数字・書く問題を、復習の問題と同じ形にする（find は null）。
 * model.korean が空のときは、正解を日本語（または数字）だけで見せる
 */
export function readingPracticeQuestion(reading: Reading, index: number, random: Random): PracticeQuestion | null {
  const q: ReadingQuestion | undefined = reading.questions[index]
  if (q === undefined || q.type === 'find') return null
  const base = { key: `reading:${readingQuestionKey(reading.id, index)}`, chapter: reading.chapter, prompt: { kind: 'japanese' as const, text: q.questionJa, hint: null }, ...(q.explanationJa === undefined ? {} : { note: q.explanationJa }) }
  switch (q.type) {
    case 'choice': {
      const correct = q.choices.find((c) => c.correct)
      if (correct === undefined) return null
      const text = (c: (typeof q.choices)[number]) => ('textJa' in c ? c.textJa : c.korean)
      return {
        ...base,
        form: 'koJa',
        heading: '答えを選んでください',
        body: {
          type: 'choose',
          options: shuffle(q.choices, random).map((c) => ('textJa' in c ? { text: c.textJa, reading: null, lang: 'ja' as const } : { text: c.korean, reading: c.pronunciation, lang: 'ko' as const })),
          answers: [text(correct)],
        },
        model: 'textJa' in correct ? { korean: '', pronunciation: null, japanese: correct.textJa } : { korean: correct.korean, pronunciation: correct.pronunciation, japanese: correct.japanese },
      }
    }
    case 'number':
      return { ...base, form: 'number', heading: '数字で書いてください', body: { type: 'number', digits: q.digits }, model: { korean: '', pronunciation: null, japanese: formatNumber(q.digits) } }
    case 'write':
      return { ...base, form: 'write', heading: '韓国語で書いてみましょう', body: { type: 'write', answers: q.answers, rejectDigits: false }, model: { korean: q.answers[0] ?? '', pronunciation: null, japanese: '' } }
  }
}

/** 本文から探して押す問題の正解か（押したまとまりと答えを、句読点・空白・全角半角をそろえて比べる） */
export function isFoundAnswer(answer: string, tapped: string): boolean {
  return normalizeAnswer(textChunks(tapped).join(' ')) === normalizeAnswer(textChunks(answer).join(' '))
}
