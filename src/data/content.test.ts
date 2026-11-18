// 実際に data/ に置かれている JSON がすべて検証を通ることを確かめる。
// CI で失敗すると公開されないため、壊れた教材が公開URLに出ることはない。

import { describe, expect, it } from 'vitest'
import { content } from './index'
import { formatIssue } from './validate'

describe('data/ の実データ', () => {
  it('検証で問題が1件もない', () => {
    expect(content.issues.map(formatIssue)).toEqual([])
  })

  it('施設・キャラクターが読み込まれている', () => {
    expect(content.locations.length).toBeGreaterThan(0)
    expect(content.characters.length).toBeGreaterThan(0)
  })

  it('仮データ（900番台のID）は reviewed: false になっている', () => {
    const items = [...content.vocabulary, ...content.grammar, ...content.conversations]
    const drafts = items.filter((item) => /_9\d\d$/.test(item.id))
    for (const item of drafts) expect(item.reviewed, item.id).toBe(false)
  })
})
