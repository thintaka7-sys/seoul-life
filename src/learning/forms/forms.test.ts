import { describe, expect, it } from 'vitest'
import type { Vocab } from '../../data/types'
import { createPracticeIndex } from '../practice/questions'
import { baseOfForm, formId, formKeysOf, formQuestions, parseFormId } from './forms'

const random = () => 0.42

function vocab(over: Partial<Vocab> & Pick<Vocab, 'id' | 'korean'>): Vocab {
  return { pronunciation: 'カナ', japanese: '意味', partOfSpeech: 'verb', genre: 'daily_life', level: 1, reviewed: false, ...over }
}

const go = vocab({
  id: 'vocab_901',
  korean: '가다',
  pronunciation: 'カダ',
  japanese: '行く',
  forms: [
    { kind: 'present', korean: '가요', pronunciation: 'カヨ', parts: ['가', '아요'], wrong: ['가아요'], noteJa: 'ㅏ＋아요 は 아 が1つになります' },
    { kind: 'past', korean: '갔어요', pronunciation: 'カッソヨ', parts: ['가', '았어요'] },
  ],
})
const give = vocab({
  id: 'vocab_902',
  korean: '주세요',
  pronunciation: 'チュセヨ',
  japanese: 'ください',
  base: { korean: '주다', pronunciation: 'チュダ', japanese: 'あげる・くれる' },
  forms: [{ kind: 'seyo', korean: '주세요', pronunciation: 'チュセヨ', parts: ['주', '세요'] }],
})
const me = vocab({ id: 'vocab_903', korean: '저는', partOfSpeech: 'pronoun', japanese: '私は', forms: [{ kind: 'contraction', korean: '전', pronunciation: 'チョン', parts: ['저', '는'] }] })
const pool = [go, give, me]

describe('形が変わる言葉の問題（GAME_SPEC 4-3）', () => {
  it('復習のキーは form:単語ID#くっついた形。分けて元に戻せる', () => {
    expect(formKeysOf(go)).toEqual(['form:vocab_901#가요', 'form:vocab_901#갔어요'])
    expect(formKeysOf(undefined)).toEqual([])
    expect(parseFormId(formId('vocab_901', go.forms?.[0] ?? { kind: 'present', korean: 'x', pronunciation: '', parts: [] }))).toEqual({ vocabId: 'vocab_901', korean: '가요' })
    expect(parseFormId('vocab_901')).toBeNull()
  })

  it('元の形：base があれば base、縮んだ形は部品をつないだ形、それ以外は見出し語', () => {
    expect(baseOfForm(give, give.forms?.[0] ?? (undefined as never)).korean).toBe('주다')
    expect(baseOfForm(me, me.forms?.[0] ?? (undefined as never)).korean).toBe('저는')
    expect(baseOfForm(go, go.forms?.[0] ?? (undefined as never)).korean).toBe('가다')
  })

  it('元の形を選ぶ問題と、部品から形を選ぶ問題を作る（不正解は wrong とほかの単語の同じ種類の形）', () => {
    const qs = formQuestions(go, go.forms?.[0] ?? (undefined as never), pool, { audio: false, random })
    const base = qs.find((q) => q.form === 'formBase')
    const build = qs.find((q) => q.form === 'formBuild')
    expect(base?.body).toMatchObject({ type: 'choose', answers: ['가다'] })
    if (base?.body.type === 'choose') expect(base.body.options.map((o) => o.text)).toContain('가요')
    expect(build?.prompt).toEqual({ kind: 'formation', parts: ['가', '아요'], japanese: '行く（です・ます形（해요の形））' })
    if (build?.body.type === 'choose') {
      expect(build.body.answers).toEqual(['가요'])
      expect(build.body.options.map((o) => o.text)).toContain('가아요')
    }
    expect(build?.note).toBe('ㅏ＋아요 は 아 が1つになります')
  })

  it('縮んだ形は「縮める前の形」を聞く', () => {
    const qs = formQuestions(me, me.forms?.[0] ?? (undefined as never), pool, { audio: false, random })
    expect(qs.find((q) => q.form === 'formBase')?.heading).toBe('縮める前の形を選んでください')
  })

  it('不正解の選択肢が作れなければ、その形の問題は作らない', () => {
    const lone = vocab({ id: 'vocab_904', korean: '오다', forms: [{ kind: 'past', korean: '왔어요', pronunciation: 'ワッソヨ', parts: ['오', '았어요'] }] })
    const qs = formQuestions(lone, lone.forms?.[0] ?? (undefined as never), [lone], { audio: false, random })
    expect(qs.map((q) => q.form)).toEqual(['formBase'])
  })

  it('問題の索引から form: のキーで作れる。消えた形は作れない', () => {
    const index = createPracticeIndex({ vocabulary: pool, grammar: [], conversations: [], drillGroups: [] })
    expect(index.exists('form:vocab_901#가요')).toBe(true)
    expect(index.exists('form:vocab_901#없어요')).toBe(false)
    expect(index.candidates('form:vocab_902#주세요', { audio: false, random }).length).toBeGreaterThan(0)
  })
})
