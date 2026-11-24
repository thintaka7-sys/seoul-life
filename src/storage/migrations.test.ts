import { describe, expect, it } from 'vitest'
import { MIGRATIONS, migrate } from './migrations'
import { CURRENT_SAVE_VERSION, isSaveData, type SaveData, type SaveDataV1, type SaveDataV2, type SaveDataV3, type SaveDataV4 } from './saveData'
import { SAVE_KEY, loadSave } from './saveStore'
import { MemoryStorage } from './testing'

describe('migrate', () => {
  it('現在のバージョンなら何もしない', () => {
    expect(migrate({ version: 2, x: 1 }, {}, 2)).toEqual({ ok: true, data: { version: 2, x: 1 }, from: 2 })
  })

  it('順番に1つずつ移行する', () => {
    const calls: number[] = []
    const result = migrate(
      { version: 1 },
      {
        1: (d) => (calls.push(1), { ...d, version: 2 }),
        2: (d) => (calls.push(2), { ...d, version: 3 }),
        3: (d) => (calls.push(3), { ...d, version: 4 }),
      },
      4,
    )
    expect(calls).toEqual([1, 2, 3])
    expect(result).toEqual({ ok: true, data: { version: 4 }, from: 1 })
  })

  it('途中のバージョンからも移行できる', () => {
    const result = migrate({ version: 2 }, { 1: () => ({ version: 2 }), 2: (d) => ({ ...d, version: 3 }) }, 3)
    expect(result).toEqual({ ok: true, data: { version: 3 }, from: 2 })
  })

  it('新しいバージョンは newer_version', () => {
    expect(migrate({ version: 5 }, {}, 3)).toMatchObject({ ok: false, reason: 'newer_version' })
  })

  it.each([{}, { version: 0 }, { version: 1.5 }, { version: '1' }])('version が正しくなければ invalid_shape: %j', (data) => {
    expect(migrate(data, {}, 1)).toMatchObject({ ok: false, reason: 'invalid_shape' })
  })
})

describe('本番の移行表', () => {
  it('v1 から現在のバージョンまで、すべての段階の移行処理がそろっている', () => {
    for (let v = 1; v < CURRENT_SAVE_VERSION; v++) {
      expect(MIGRATIONS[v], `v${v} → v${v + 1}`).toBeTypeOf('function')
    }
  })
})

describe('v1 → v2', () => {
  const v1: SaveDataV1 = {
    version: 1,
    createdAt: '2026-11-18T10:00:00.000Z',
    updatedAt: '2026-11-18T10:05:00.000Z',
    progress: { currentLocationId: 'cafe' },
  }

  it('いた場所と日時を引き継ぎ、進行・学習記録・経験値は空から始める', () => {
    const result = migrate({ ...v1 }, MIGRATIONS, 2)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data).toEqual({
      version: 2,
      createdAt: v1.createdAt,
      updatedAt: v1.updatedAt,
      progress: { currentLocationId: 'cafe', completedEvents: [], activeEvent: null },
      learning: { words: {}, grammar: {}, conversations: {} },
      stats: { xp: 0 },
    })
  })

  it('v1 から現在のバージョンまで移行すると、正しいセーブデータになる', () => {
    const result = migrate({ ...v1 }, MIGRATIONS, CURRENT_SAVE_VERSION)
    expect(result.ok && isSaveData(result.data)).toBe(true)
  })

  it('マップにいた（null）場合も移行できる', () => {
    const result = migrate({ ...v1, progress: { currentLocationId: null } }, MIGRATIONS, CURRENT_SAVE_VERSION)
    expect(result.ok && isSaveData(result.data)).toBe(true)
  })

  it('保存されている v1 のデータを読み込むと現在のバージョンになり、移行元のバージョンが分かる', () => {
    const storage = new MemoryStorage()
    storage.setItem(SAVE_KEY, JSON.stringify(v1))
    const result = loadSave(storage)
    expect(result).toMatchObject({ kind: 'ok', migratedFrom: 1 })
    if (result.kind === 'ok') expect(result.data.version).toBe(CURRENT_SAVE_VERSION)
  })

  it('壊れた v1（progress がない）は、移行後の検証で壊れたデータとして扱う', () => {
    const storage = new MemoryStorage()
    storage.setItem(SAVE_KEY, JSON.stringify({ version: 1, createdAt: v1.createdAt }))
    expect(loadSave(storage)).toMatchObject({ kind: 'corrupt', reason: 'invalid_shape' })
  })
})

describe('v2 → v3', () => {
  const v2: SaveDataV2 = {
    version: 2,
    createdAt: '2026-11-18T10:00:00.000Z',
    updatedAt: '2026-11-18T10:05:00.000Z',
    progress: { currentLocationId: 'cafe', completedEvents: ['event_001'], activeEvent: { id: 'event_002', step: 4 } },
    learning: {
      words: { vocab_001: { learnedAt: '2026-11-18T10:01:00.000Z', chapter: 1 } },
      grammar: { grammar_001: { learnedAt: '2026-11-18T10:02:00.000Z', chapter: 1 } },
      conversations: { home_001: { choice: true, write: false }, cafe_001: { choice: true, write: true } },
    },
    stats: { xp: 123 },
  }

  it('会話の記録を「会話ID#0」に移し、ほかはそのまま引き継ぐ', () => {
    const result = migrate(structuredClone(v2) as unknown as Record<string, unknown>, MIGRATIONS, 3)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data).toEqual({
      ...v2,
      version: 3,
      learning: { ...v2.learning, conversations: { 'home_001#0': { choice: true, write: false }, 'cafe_001#0': { choice: true, write: true } } },
    })
    const latest = migrate(result.data, MIGRATIONS, CURRENT_SAVE_VERSION)
    expect(latest.ok && isSaveData(latest.data)).toBe(true)
  })

  it('保存されている v2 のデータを読み込むと最新の版になり、経験値が残る（物語の進み具合は v6 で最初からになる）', () => {
    const storage = new MemoryStorage()
    storage.setItem(SAVE_KEY, JSON.stringify(v2))
    const result = loadSave(storage)
    expect(result).toMatchObject({ kind: 'ok', migratedFrom: 2 })
    if (result.kind !== 'ok') return
    expect(result.data.stats.xp).toBe(123)
    expect(result.data.learning.words['vocab_001']).toBeDefined()
    expect(result.data.progress.activeEvent).toBeNull()
    expect(result.data.progress.notices).toEqual(['storyRestructured', 'progressionIntroduced'])
  })

  it('learning が壊れた v2 は、移行後の検証で壊れたデータとして扱う', () => {
    const storage = new MemoryStorage()
    storage.setItem(SAVE_KEY, JSON.stringify({ ...v2, learning: null }))
    expect(loadSave(storage)).toMatchObject({ kind: 'corrupt', reason: 'invalid_shape' })
  })
})

describe('v3 → v4', () => {
  const v3: SaveDataV3 = {
    version: 3,
    createdAt: '2026-11-18T10:00:00.000Z',
    updatedAt: '2026-11-18T10:05:00.000Z',
    progress: { currentLocationId: 'home', completedEvents: ['event_001'], activeEvent: null },
    learning: {
      words: { vocab_001: { learnedAt: '2026-11-18T10:01:00.000Z', chapter: 1 } },
      grammar: {},
      conversations: { 'home_003#0': { choice: true, write: false } },
    },
    stats: { xp: 45 },
  }

  it('ハングルとリスニングの記録を空で足し、ほかはそのまま引き継ぐ', () => {
    const result = migrate(structuredClone(v3) as unknown as Record<string, unknown>, MIGRATIONS, 4)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data).toEqual({ ...v3, version: 4, learning: { ...v3.learning, hangul: {}, listening: {} } })
  })

  it('保存されている v3 のデータを読み込むと、v4 を経て今のバージョンになる', () => {
    const storage = new MemoryStorage()
    storage.setItem(SAVE_KEY, JSON.stringify(v3))
    const result = loadSave(storage)
    expect(result).toMatchObject({ kind: 'ok', migratedFrom: 3 })
    if (result.kind !== 'ok') return
    expect(result.data.learning.hangul).toEqual({})
    expect(result.data.stats.xp).toBe(45)
  })

  it('ハングル・リスニングの記録の値が正しくなければ、壊れたデータとして扱う', () => {
    const migrated = migrate(structuredClone(v3) as unknown as Record<string, unknown>, MIGRATIONS, CURRENT_SAVE_VERSION)
    if (!migrated.ok) throw new Error(migrated.detail)
    const v5 = migrated.data as unknown as SaveData
    const bad = { ...v5, learning: { ...v5.learning, hangul: { hangul_001: { passedAt: 'x', bestScore: 80 } } } }
    expect(isSaveData(bad)).toBe(false)
    const over = { ...v5, learning: { ...v5.learning, hangul: { hangul_001: { passedAt: v3.createdAt, bestScore: 120 } } } }
    expect(isSaveData(over)).toBe(false)
    const ok = { ...v5, learning: { ...v5.learning, hangul: { hangul_001: { passedAt: v3.createdAt, bestScore: 100 } }, listening: { 'word:vocab_001': { correctAt: v3.createdAt } } } }
    expect(isSaveData(ok)).toBe(true)
  })
})

describe('v4 → v5', () => {
  const v4: SaveDataV4 = {
    version: 4,
    createdAt: '2026-11-18T10:00:00.000Z',
    updatedAt: '2026-11-19T03:00:00.000Z',
    progress: { currentLocationId: 'home', completedEvents: ['event_001'], activeEvent: null },
    learning: {
      words: { vocab_001: { learnedAt: '2026-11-18T03:00:00.000Z', chapter: 1 } },
      grammar: { grammar_001: { learnedAt: '2026-11-18T04:00:00.000Z', chapter: 1 } },
      conversations: { 'home_003#0': { choice: true, write: false }, 'home_003#1': { choice: false, write: false } },
      hangul: { hangul_001: { passedAt: '2026-11-18T05:00:00.000Z', bestScore: 100 } },
      listening: {},
    },
    stats: { xp: 80 },
  }

  it('覚えた単語・文法と正解した往復を、覚えた日（往復は最後に保存した日）の翌日から復習に出す。ほかはそのまま', () => {
    const result = migrate(structuredClone(v4) as unknown as Record<string, unknown>, MIGRATIONS, 5)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const fresh = (due: string) => ({ stage: 0, due, correct: 0, wrong: 0, lastAt: null })
    expect(result.data).toEqual({
      ...v4,
      version: 5,
      learning: {
        ...v4.learning,
        review: { 'word:vocab_001': fresh('2026-11-19'), 'grammar:grammar_001': fresh('2026-11-19'), 'turn:home_003#0': fresh('2026-11-20') },
        drills: {},
        tests: {},
      },
      daily: { stamps: [] },
    })
    const latest = migrate(result.data, MIGRATIONS, CURRENT_SAVE_VERSION)
    expect(latest.ok && isSaveData(latest.data)).toBe(true)
  })

  it('v5 の記録の値が正しくなければ、壊れたデータとして扱う', () => {
    const migrated = migrate(structuredClone(v4) as unknown as Record<string, unknown>, MIGRATIONS, CURRENT_SAVE_VERSION)
    if (!migrated.ok) throw new Error(migrated.detail)
    const v5 = migrated.data as unknown as SaveData
    const withReview = (r: unknown) => ({ ...v5, learning: { ...v5.learning, review: { 'word:vocab_001': r } } })
    expect(isSaveData(withReview({ stage: 0, due: '2026/11/19', correct: 0, wrong: 0, lastAt: null }))).toBe(false)
    expect(isSaveData(withReview({ stage: -1, due: '2026-11-19', correct: 0, wrong: 0, lastAt: null }))).toBe(false)
    expect(isSaveData(withReview({ stage: 1, due: '2026-11-19', correct: 1, wrong: 0, lastAt: v4.updatedAt }))).toBe(true)
    expect(isSaveData({ ...v5, daily: { stamps: ['2026-11-19', 'x'] } })).toBe(false)
    expect(isSaveData({ ...v5, learning: { ...v5.learning, tests: { test_001: { passedAt: null, bestScore: 60 } } } })).toBe(true)
    expect(isSaveData({ ...v5, learning: { ...v5.learning, tests: { test_001: { passedAt: null, bestScore: 160 } } } })).toBe(false)
  })
})

describe('v5 → v6', () => {
  const v5 = {
    version: 5,
    createdAt: '2026-11-18T10:00:00.000Z',
    updatedAt: '2026-11-22T03:00:00.000Z',
    progress: { currentLocationId: 'cafe', completedEvents: ['event_001'], activeEvent: { id: 'event_002', step: 3 } },
    learning: {
      words: { vocab_001: { learnedAt: '2026-11-18T03:00:00.000Z', chapter: 1 } },
      grammar: {},
      conversations: { 'home_005#0': { choice: true, write: false } },
      hangul: { hangul_001: { passedAt: '2026-11-18T05:00:00.000Z', bestScore: 100 } },
      listening: {},
      review: { 'word:vocab_001': { stage: 1, due: '2026-11-25', correct: 1, wrong: 0, lastAt: '2026-11-22T03:00:00.000Z' } },
      drills: {},
      tests: {},
    },
    stats: { xp: 200 },
    daily: { stamps: ['2026-11-22'] },
  }

  it('物語の進み具合だけを最初からにし、学習の記録・経験値・スタンプは残す。一度だけのお知らせを足す', () => {
    const result = migrate(structuredClone(v5), MIGRATIONS, 6)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data).toEqual({
      ...v5,
      version: 6,
      progress: { currentLocationId: null, completedEvents: [], activeEvent: null, storiesSeen: {}, notices: ['storyRestructured'] },
      learning: { ...v5.learning, seen: {}, readings: {}, orders: {}, forms: {} },
    })
    const latest = migrate(structuredClone(v5), MIGRATIONS, CURRENT_SAVE_VERSION)
    expect(latest.ok && isSaveData(latest.data)).toBe(true)
  })

  it('物語を始めていなければ、お知らせは出さない', () => {
    const fresh = { ...v5, progress: { currentLocationId: 'home', completedEvents: [], activeEvent: null } }
    const result = migrate(structuredClone(fresh), MIGRATIONS, 6)
    expect(result.ok && (result.data['progress'] as { notices: unknown }).notices).toEqual([])
  })

  it('v6 の新しい記録の値が正しくなければ、壊れたデータとして扱う', () => {
    const result = migrate(structuredClone(v5), MIGRATIONS, CURRENT_SAVE_VERSION)
    if (!result.ok) throw new Error(result.detail)
    const v6 = result.data as unknown as SaveData
    expect(isSaveData({ ...v6, learning: { ...v6.learning, seen: { vocab_001: { seenAt: v5.createdAt, chapter: 1 } } } })).toBe(true)
    expect(isSaveData({ ...v6, learning: { ...v6.learning, seen: { vocab_001: { seenAt: 'x', chapter: 1 } } } })).toBe(false)
    expect(isSaveData({ ...v6, learning: { ...v6.learning, orders: { order_001: { firstAt: v5.createdAt, items: ['americano'] } } } })).toBe(true)
    expect(isSaveData({ ...v6, learning: { ...v6.learning, orders: { order_001: { firstAt: v5.createdAt, items: [1] } } } })).toBe(false)
    expect(isSaveData({ ...v6, progress: { ...v6.progress, storiesSeen: { story_001: { seenAt: v5.createdAt } } } })).toBe(true)
    expect(isSaveData({ ...v6, progress: { ...v6.progress, notices: ['unknown'] } })).toBe(false)
  })
})

describe('v6 → v7', () => {
  const v6 = {
    version: 6,
    createdAt: '2026-11-18T10:00:00.000Z',
    updatedAt: '2026-11-25T03:00:00.000Z',
    progress: { currentLocationId: 'home', completedEvents: ['event_004', 'event_005'], activeEvent: null, storiesSeen: {}, notices: [] },
    learning: { words: {}, grammar: {}, conversations: {}, hangul: {}, listening: {}, review: {}, drills: {}, tests: {}, seen: {}, readings: {}, orders: {}, forms: {} },
    stats: { xp: 230 },
    daily: { stamps: ['2026-11-22', '2026-11-23'] },
  }

  it('コイン 0・レベルはまだ数えていない（0）・実績・家具・節目を空で足す。遊んでいたデータには一度だけお知らせを出す', () => {
    const result = migrate(structuredClone(v6), MIGRATIONS, 7)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data).toEqual({
      ...v6,
      version: 7,
      progress: { ...v6.progress, notices: ['progressionIntroduced'] },
      stats: { xp: 230, coins: 0, levelShown: 0 },
      achievements: {},
      home: { owned: {}, placement: {} },
      daily: { stamps: v6.daily.stamps, rewards: {} },
    })
    expect(isSaveData(result.data)).toBe(true)
  })

  it('まだ遊んでいない（イベントも経験値もない）データには、お知らせを出さない', () => {
    const fresh = { ...v6, progress: { ...v6.progress, completedEvents: [] }, stats: { xp: 0 } }
    const result = migrate(structuredClone(fresh), MIGRATIONS, 7)
    expect(result.ok && (result.data['progress'] as { notices: unknown }).notices).toEqual([])
  })

  it('v7 の新しい記録の値が正しくなければ、壊れたデータとして扱う', () => {
    const result = migrate(structuredClone(v6), MIGRATIONS, 7)
    if (!result.ok) throw new Error(result.detail)
    const v7 = result.data as unknown as SaveData
    const at = { at: v6.createdAt }
    expect(isSaveData({ ...v7, achievements: { achievement_001: at }, home: { owned: { furniture_001: at }, placement: { wall_left: 'furniture_001' } }, daily: { ...v7.daily, rewards: { '3': at } } })).toBe(true)
    expect(isSaveData({ ...v7, stats: { ...v7.stats, coins: -1 } })).toBe(false)
    expect(isSaveData({ ...v7, stats: { xp: 1, coins: 0 } })).toBe(false)
    expect(isSaveData({ ...v7, achievements: { achievement_001: { at: 'x' } } })).toBe(false)
    expect(isSaveData({ ...v7, home: { owned: {}, placement: { wall_left: 1 } } })).toBe(false)
    expect(isSaveData({ ...v7, daily: { stamps: [] } })).toBe(false)
  })
})
