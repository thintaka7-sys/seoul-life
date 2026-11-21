import { describe, expect, it } from 'vitest'
import type { EarSet } from '../../data/types'
import { createPracticeIndex } from '../practice/questions'
import { balancedPicks, earRound } from './round'

/** 種を固定した乱数（テストで同じ結果にする） */
function seeded(seed: number) {
  let s = seed
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648
    return s / 2147483648
  }
}

const set = (id: string, words: [string, string][]): EarSet => ({
  id,
  theme: 'plain_aspirated_tense',
  titleJa: id,
  focusJa: 'テスト',
  tipJa: `${id} のこつ`,
  stumbling: [],
  items: words.map(([korean, japanese]) => ({ korean, pronunciation: 'プル', japanese })),
  reviewed: false,
})
const fire = set('ear_001', [
  ['불', '火'],
  ['풀', '草'],
  ['뿔', '角'],
])
const coffee = set('ear_002', [
  ['커피', 'コーヒー'],
  ['코피', '鼻血'],
])

const count = <T,>(xs: readonly T[]) => xs.reduce((m, x) => m.set(x, (m.get(x) ?? 0) + 1), new Map<T, number>())

describe('balancedPicks（かたよらない並び）', () => {
  it('それぞれの回数の差は1回まで。つなぎ目で同じものが続かない', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const picks = balancedPicks(['a', 'b', 'c'], 10, seeded(seed))
      expect(picks).toHaveLength(10)
      const counts = [...count(picks).values()]
      expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1)
      expect(picks.some((p, i) => i > 0 && p === picks[i - 1])).toBe(false)
    }
  })

  it('1つしかなければ、それをくり返す。空なら空', () => {
    expect(balancedPicks(['a'], 3, seeded(1))).toEqual(['a', 'a', 'a'])
    expect(balancedPicks([], 3, seeded(1))).toEqual([])
  })
})

describe('earRound（聞き分けの1回分）', () => {
  it('1つの組：選択肢はいつもその組の音だけで、読み上げる音がかたよらない', () => {
    const qs = earRound([fire], 10, seeded(7))
    expect(qs).toHaveLength(10)
    for (const q of qs) {
      expect(q.form).toBe('ear')
      expect(q.key).toBe('ear:ear_001')
      expect(q.body.type === 'choose' ? q.body.options.map((o) => o.text).sort() : []).toEqual(['불', '뿔', '풀'])
      expect(q.prompt.kind === 'audio' && q.body.type === 'choose' && q.body.answers).toEqual([q.prompt.kind === 'audio' ? q.prompt.phrase.korean : ''])
      expect(q.note).toBe('ear_001 のこつ')
    }
    const targets = [...count(qs.map((q) => q.model.korean)).values()]
    expect(Math.max(...targets) - Math.min(...targets)).toBeLessThanOrEqual(1)
  })

  it('選択肢には、答える前から意味を添える', () => {
    const [q] = earRound([coffee], 1, seeded(1))
    expect(q?.body.type === 'choose' ? q.body.options.map((o) => `${o.text}（${o.meaning}）`).sort() : []).toEqual(['커피（コーヒー）', '코피（鼻血）'])
  })

  it('まぜた練習：組の回数がかたよらず、選択肢に別の組の音を混ぜない', () => {
    const qs = earRound([fire, coffee], 10, seeded(3))
    const bySet = count(qs.map((q) => q.key))
    expect([bySet.get('ear:ear_001'), bySet.get('ear:ear_002')]).toEqual([5, 5])
    for (const q of qs) {
      const own = (q.key === 'ear:ear_001' ? fire : coffee).items.map((i) => i.korean).sort()
      expect(q.body.type === 'choose' ? q.body.options.map((o) => o.text).sort() : []).toEqual(own)
    }
  })
})

describe('復習の索引（ear:ear_001）', () => {
  const index = createPracticeIndex({ vocabulary: [], grammar: [], conversations: [], drillGroups: [], earSets: [fire] })

  it('組があれば問題を作れる。読み上げが使えないときは作らない（期限を残すため）', () => {
    expect(index.exists('ear:ear_001')).toBe(true)
    expect(index.exists('ear:ear_999')).toBe(false)
    expect(index.candidates('ear:ear_001', { audio: true, random: seeded(1) })).toHaveLength(1)
    expect(index.candidates('ear:ear_001', { audio: false, random: seeded(1) })).toEqual([])
  })
})
