// 実際に data/ に置かれている JSON がすべて検証を通ることを確かめる。
// CI で失敗すると公開されないため、壊れた教材が公開URLに出ることはない。

import { describe, expect, it } from 'vitest'
import { content } from './index'
import { contrastRatio, readableTextOn } from '../game/theme/color'
import { formatIssue } from './validate'

describe('data/ の実データ', () => {
  it('検証で問題が1件もない', () => {
    expect(content.issues.map(formatIssue)).toEqual([])
  })

  it('施設・キャラクター・イベントが読み込まれている', () => {
    expect(content.locations.length).toBeGreaterThan(0)
    expect(content.characters.length).toBeGreaterThan(0)
    expect(content.events.length).toBeGreaterThan(0)
  })

  it('仮データ（900番台のID）は reviewed: false になっている', () => {
    const items = [...content.vocabulary, ...content.grammar, ...content.conversations, ...content.columns, ...content.hangulLessons, ...content.listening]
    const drafts = items.filter((item) => /_9\d\d$/.test(item.id))
    for (const item of drafts) expect(item.reviewed, item.id).toBe(false)
  })

  it('すべての単語・文法は、どこかのイベントで覚える段階に入っている', () => {
    const learned = new Set(content.events.flatMap((e) => e.steps.flatMap((s) => (s.type === 'learn' ? [...s.vocabulary, ...s.grammar] : []))))
    const missing = [...content.vocabulary, ...content.grammar].map((x) => x.id).filter((id) => !learned.has(id))
    expect(missing).toEqual([])
  })

  it('すべての会話は、どこかのイベントで使われている', () => {
    const used = new Set(content.events.flatMap((e) => e.steps.flatMap((s) => (s.type === 'conversation' ? [s.id] : []))))
    expect(content.conversations.map((c) => c.id).filter((id) => !used.has(id))).toEqual([])
  })

  it('すべてのコラムは、どこかのイベントで使われている', () => {
    const used = new Set(content.events.flatMap((e) => e.steps.flatMap((s) => (s.type === 'column' ? [s.id] : []))))
    expect(content.columns.map((c) => c.id).filter((id) => !used.has(id))).toEqual([])
  })

  it('すべてのおはなしは、どこかのイベントで使われている', () => {
    const used = new Set(content.events.flatMap((e) => e.steps.flatMap((s) => (s.type === 'story' ? [s.id] : []))))
    expect(content.stories.map((st) => st.id).filter((id) => !used.has(id))).toEqual([])
  })

  it('仮データ（900番台のID）のおはなしは reviewed: false になっている', () => {
    for (const st of content.stories.filter((x) => /_9\d\d$/.test(x.id))) expect(st.reviewed, st.id).toBe(false)
  })

  it('キャラクターのテーマカラーの上の文字は、読みやすさの基準（コントラスト比4.5以上）を満たす', () => {
    for (const c of content.characters) {
      if (c.themeColor === undefined) continue
      expect(contrastRatio(c.themeColor, readableTextOn(c.themeColor)), c.id).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('前提のないイベントが、最初にいる施設に1つ以上ある（はじめからで進められる）', () => {
    expect(content.events.some((e) => e.requires.length === 0 && e.location === content.balance.startLocation)).toBe(true)
  })
})
