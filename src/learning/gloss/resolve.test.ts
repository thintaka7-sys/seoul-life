import { describe, expect, it } from 'vitest'
import type { Vocab } from '../../data/types'
import { buildGlossIndex, resolveGlosses } from './resolve'

const v = (id: string, korean: string, extra: Partial<Vocab> = {}): Vocab => ({ id, korean, pronunciation: 'ア', japanese: '意味', partOfSpeech: 'noun', genre: 'greeting', level: 1, reviewed: true, ...extra })

const index = buildGlossIndex([
  v('vocab_001', '안녕히 가세요'),
  v('vocab_002', '가세요'),
  v('vocab_003', '주세요', { base: { korean: '주다', pronunciation: 'チュダ' }, forms: [{ kind: 'present', korean: '줘요', pronunciation: 'チュォヨ', parts: ['주', '어요'] }] }),
  v('vocab_004', '짜장면', { alternatives: ['자장면'] }),
  v('vocab_005', '커피'),
])

describe('resolveGlosses', () => {
  it('単語の見出し語と字が同じ語句を自動でつなぐ（前後の句読点は外す）', () => {
    expect(resolveGlosses('커피 주세요.', undefined, index)).toEqual([
      { start: 0, end: 1, text: '커피', target: { kind: 'vocab', vocabId: 'vocab_005' } },
      { start: 1, end: 2, text: '주세요', target: { kind: 'vocab', vocabId: 'vocab_003' } },
    ])
  })

  it('空白を含む見出し語は、長いものを先につなぐ', () => {
    expect(resolveGlosses('네, 안녕히 가세요!', undefined, index).map((s) => [s.start, s.end, s.target])).toEqual([[1, 3, { kind: 'vocab', vocabId: 'vocab_001' }]])
  })

  it('別表記・形が変わった言葉もつなぐ', () => {
    expect(resolveGlosses('자장면 줘요', undefined, index).map((s) => s.target)).toEqual([
      { kind: 'vocab', vocabId: 'vocab_004' },
      { kind: 'vocab', vocabId: 'vocab_003' },
    ])
  })

  it('教材の glosses を優先し、まとまりの一部とは一致させない', () => {
    const spans = resolveGlosses('커피는 맛있어요?', [{ text: '커피는', vocab: 'vocab_005', noteJa: '커피＋는' }, { text: '맛있어요', pronunciation: 'マシッソヨ', japanese: 'おいしいです' }], index)
    expect(spans).toEqual([
      { start: 0, end: 1, text: '커피는', target: { kind: 'vocab', vocabId: 'vocab_005', noteJa: '커피＋는' } },
      { start: 1, end: 2, text: '맛있어요', target: { kind: 'note', pronunciation: 'マシッソヨ', japanese: 'おいしいです' } },
    ])
    expect(resolveGlosses('커피는 좋아요', undefined, index)).toEqual([])
  })

  it('句読点だけの区切りは数えるが、つながない', () => {
    expect(resolveGlosses('커피 ! 커피', undefined, index).map((s) => s.start)).toEqual([0, 2])
  })
})
