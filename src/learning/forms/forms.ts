// 形が変わる言葉（GAME_SPEC 4-3）の問題を、単語の forms から作る。
// - formBase：くっついた形を見て、元の形（縮んだ形なら、縮める前の形）を選ぶ
// - formBuild：部品（가＋아요）を見て、くっついた形を選ぶ（不正解には wrong と、ほかの単語の同じ種類の形を使う）
// 復習のキーは form:単語ID#くっついた形（例：form:vocab_031#가요）。

import { FORM_KIND_LABELS, type Vocab, type VocabForm } from '../../data/types'
import { shuffle } from '../hangul/quiz'
import type { Phrase, PracticeQuestion, QuestionOptions } from '../practice/questions'
import { reviewKey } from '../review/review'

/** 選択肢の数（正解を含む） */
const OPTION_COUNT = 3

/** 形の問題の ID（復習のキーの form: の後ろ） */
export function formId(vocabId: string, form: VocabForm): string {
  return `${vocabId}#${form.korean}`
}

/** 単語の形の問題の、復習のキー */
export function formKeysOf(v: Vocab | undefined): string[] {
  return (v?.forms ?? []).map((f) => reviewKey('form', formId(v?.id ?? '', f)))
}

/** form: のキーの ID を、単語ID とくっついた形に分ける */
export function parseFormId(id: string): { vocabId: string; korean: string } | null {
  const hash = id.indexOf('#')
  return hash <= 0 || hash === id.length - 1 ? null : { vocabId: id.slice(0, hash), korean: id.slice(hash + 1) }
}

/**
 * 形の元：縮んだ形（contraction）は部品をつないだ形（전 → 저는。読みはない）、それ以外は単語の base、なければ見出し語
 */
export function baseOfForm(v: Vocab, form: VocabForm): { korean: string; pronunciation: string | null; japanese: string } {
  if (form.kind === 'contraction') return { korean: form.parts.join(''), pronunciation: null, japanese: v.japanese }
  if (v.base !== undefined) return { korean: v.base.korean, pronunciation: v.base.pronunciation, japanese: v.base.japanese ?? v.japanese }
  return { korean: v.korean, pronunciation: v.pronunciation, japanese: v.japanese }
}

/** くっついた形の意味（例：行く（です・ます形（해요の形））） */
export function formMeaning(v: Vocab, form: VocabForm): string {
  return `${v.japanese}（${FORM_KIND_LABELS[form.kind]}）`
}

/** 重ならないように、候補から count 個選ぶ */
function distinct(answer: string, pools: readonly (readonly string[])[], random: () => number, count = OPTION_COUNT - 1): string[] {
  const used = new Set([answer])
  const result: string[] = []
  for (const pool of pools) {
    for (const c of shuffle(pool, random)) {
      if (result.length >= count) return result
      if (used.has(c)) continue
      used.add(c)
      result.push(c)
    }
  }
  return result
}

/** 形の問題の候補。pool は、選択肢に使うほかの単語 */
export function formQuestions(v: Vocab, form: VocabForm, pool: readonly Vocab[], options: QuestionOptions): PracticeQuestion[] {
  const { random } = options
  const chapter = options.chapter ?? 1
  const key = reviewKey('form', formId(v.id, form))
  const model: Phrase = { korean: form.korean, pronunciation: form.pronunciation, japanese: formMeaning(v, form) }
  const others = pool.filter((o) => o.id !== v.id)
  const note = form.noteJa
  const questions: PracticeQuestion[] = []

  // 元の形を選ぶ：ほかの単語の元の形 → くっついた形そのもの（元の形とまちがえやすいため）
  const base = baseOfForm(v, form)
  const otherBases = others.filter((o) => (o.forms?.length ?? 0) > 0).flatMap((o) => (o.forms ?? []).filter((f) => (f.kind === 'contraction') === (form.kind === 'contraction')).map((f) => baseOfForm(o, f).korean))
  const wrongBases = distinct(base.korean, [otherBases, [form.korean]], random)
  if (wrongBases.length > 0) {
    questions.push({
      key,
      chapter,
      form: 'formBase',
      heading: form.kind === 'contraction' ? '縮める前の形を選んでください' : '元の形（辞書の形）を選んでください',
      prompt: { kind: 'korean', phrase: model },
      body: { type: 'choose', options: shuffle([base.korean, ...wrongBases], random).map((t) => ({ text: t, reading: null, lang: 'ko' as const })), answers: [base.korean] },
      model: { korean: base.korean, pronunciation: base.pronunciation, japanese: base.japanese },
      note: `${form.parts.join(' ＋ ')} → ${form.korean}${note === undefined ? '' : `　${note}`}`,
    })
  }

  // 部品からくっついた形を選ぶ：初心者が作りがちな形 → ほかの単語の同じ種類の形
  const sameKind = others.flatMap((o) => (o.forms ?? []).filter((f) => f.kind === form.kind).map((f) => f.korean))
  const wrongForms = distinct(form.korean, [form.wrong ?? [], sameKind], random)
  if (wrongForms.length > 0) {
    questions.push({
      key,
      chapter,
      form: 'formBuild',
      heading: 'くっつけた形を選んでください',
      prompt: { kind: 'formation', parts: form.parts, japanese: model.japanese },
      body: { type: 'choose', options: shuffle([form.korean, ...wrongForms], random).map((t) => ({ text: t, reading: null, lang: 'ko' as const })), answers: [form.korean] },
      model,
      ...(note === undefined ? {} : { note }),
    })
  }
  return questions
}
