// 実際に data/ に置かれている JSON がすべて検証を通ることを確かめる。
// CI で失敗すると公開されないため、壊れた教材が公開URLに出ることはない。

import { describe, expect, it } from 'vitest'
import { content } from './index'
import { contrastRatio, readableTextOn } from '../game/theme/color'
import { formatIssue } from './validate'
import { chapterTestKeys, chapterTurnIds, testSettings } from '../game/tests/chapterTest'
import { formKeysOf } from '../learning/forms/forms'

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

  it('すべての単語・文法は、どこかのイベントで覚える段階に入っているか、単語のタップ（glosses の vocab・家具の vocab）で覚えられる', () => {
    // CONTENT_FORMAT 21-2：glosses の vocab でつないだ単語は、learn の段階で教えなくてもよい（窓の「覚える」で図鑑と復習に入る）
    // 家具の vocab（CONTENT_FORMAT 29）も、部屋を飾る画面で韓国語の名前を押すと、同じ窓で覚えられる
    const learned = new Set(content.events.flatMap((e) => e.steps.flatMap((s) => (s.type === 'learn' ? [...s.vocabulary, ...s.grammar] : []))))
    const tappable = new Set<string>()
    const collect = (value: unknown): void => {
      if (Array.isArray(value)) value.forEach(collect)
      else if (typeof value === 'object' && value !== null) {
        for (const [key, child] of Object.entries(value)) {
          if (key === 'glosses' && Array.isArray(child)) for (const g of child as { vocab?: string }[]) if (g.vocab !== undefined) tappable.add(g.vocab)
          collect(child)
        }
      }
    }
    collect([content.stories, content.conversations, content.readings])
    for (const f of content.furniture) if (f.vocab !== null) tappable.add(f.vocab)
    const missing = [...content.vocabulary, ...content.grammar].map((x) => x.id).filter((id) => !learned.has(id) && !tappable.has(id))
    expect(missing).toEqual([])
  })

  it('章末テストは、その章の会話の問題で受けられるようになり、問題数ぶんの問題のもとがある', () => {
    for (const test of content.chapterTests) {
      expect(chapterTurnIds(test.chapter, content.conversations).length, test.id).toBeGreaterThan(0)
      const keys = chapterTestKeys(test, { ...content, formKeysOf: (id) => formKeysOf(content.vocabulary.find((v) => v.id === id)) })
      expect(keys.length, test.id).toBeGreaterThanOrEqual(testSettings(test, content.balance).count)
    }
  })

  it('ハナ（friend）は、間違えた返事に明るく笑って反応する（CONTENT_FORMAT 10-4。表情は smile。選択の往復は正解・不正解がないので除く）', () => {
    const lines = content.conversations.flatMap((c) =>
      c.turns.flatMap((t, i) => (t.kind === 'decision' ? [] : (t.choices ?? [])).filter((ch) => ch.correct === false).flatMap((ch) => (ch.reply ?? []).map((line) => ({ where: `${c.id} 往復${i}`, line })))),
    )
    const friend = lines.filter(({ line }) => line.speaker === 'friend')
    expect(friend.length).toBeGreaterThan(0)
    for (const { where, line } of friend) expect(line.expression, `${where}：${line.korean}`).toBe('smile')
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

describe('家具と部屋（Phase 4 区切り3）', () => {
  it('家具は21点（カタログ17点・節目専用4点）。どの場所にも、カタログで買える家具がある', () => {
    expect(content.furniture).toHaveLength(21)
    expect(content.furniture.filter((f) => f.milestone === null)).toHaveLength(17)
    for (const slot of content.balance.room.slots) {
      expect(content.furniture.some((f) => f.slot === slot.id && f.milestone === null), slot.id).toBe(true)
    }
  })

  it('どの家具にも、韓国語の名前（確認済みの名詞）がある。観葉植物と鉢植え・本棚2つ・ラグ3つは同じ単語', () => {
    for (const f of content.furniture) {
      const v = content.vocabulary.find((x) => x.id === f.vocab)
      expect(v?.reviewed, f.id).toBe(true)
      expect(v?.partOfSpeech, f.id).toBe('noun')
    }
    const shared = (vocab: string) => content.furniture.filter((f) => f.vocab === vocab).map((f) => f.id)
    expect(shared('vocab_070')).toEqual(['furniture_007', 'furniture_014'])
    expect(shared('vocab_072')).toEqual(['furniture_009', 'furniture_012'])
    expect(shared('vocab_077')).toEqual(['furniture_016', 'furniture_017', 'furniture_020'])
    expect(new Set(content.furniture.map((f) => f.vocab)).size).toBe(17)
  })

  it('節目専用の家具は 7・30・50・100 日（docs/PHASE4_HOME_PLAN.md）', () => {
    expect(content.furniture.filter((f) => f.milestone !== null).map((f) => [f.id, f.milestone])).toEqual([
      ['furniture_018', 7],
      ['furniture_019', 30],
      ['furniture_020', 50],
      ['furniture_021', 100],
    ])
  })

  it('引っ越しは第1章のお隣さんへのあいさつ（event_001）を終えたら。そのあとの先生とのふり返り（event_006）は新しい部屋', () => {
    expect(content.balance.room.movedInAfter).toBe('event_001')
    expect(content.events.find((e) => e.id === 'event_006')?.requires).toContain('event_001')
  })

  it('第1章のおはなしの自宅の場面：story_002・story_003 は引っ越したばかりの部屋、story_004 からは自宅', () => {
    const homes = (id: string) => content.stories.find((s) => s.id === id)?.beats.flatMap((b) => (b.type === 'scene' && b.background !== undefined ? [b.background] : [])) ?? []
    expect(homes('story_002')).toContain('home_moving')
    expect(homes('story_003')).toContain('home_moving')
    expect(homes('story_004')).toContain('home')
    expect(homes('story_004')).not.toContain('home_moving')
  })
})
