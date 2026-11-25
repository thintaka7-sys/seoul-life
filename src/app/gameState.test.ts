import { describe, expect, it } from 'vitest'
import { content } from '../data'
import type { GameEvent } from '../data/types'
import { nextEvent } from '../game/events/events'
import { formKeysOf } from '../learning/forms/forms'
import { CURRENT_SAVE_VERSION, createNewSave } from '../storage/saveData'
import { SAVE_KEY, loadSave } from '../storage/saveStore'
import { DEFAULT_SETTINGS } from '../storage/settings'
import { MemoryStorage } from '../storage/testing'
import { boot } from './boot'
import { createGameReducer, createInitialState, type GameAction, type GameState } from './gameState'

const T0 = '2026-11-18T10:00:00.000Z'
const T1 = '2026-11-18T10:05:00.000Z'

const reducer = createGameReducer({
  events: content.events,
  conversations: content.conversations,
  balance: content.balance,
  locationIds: new Set(content.locations.map((l) => l.id)),
  storyIds: new Set(content.stories.map((s) => s.id)),
  formKeysOf: (vocabId) => formKeysOf(content.vocabulary.find((v) => v.id === vocabId)),
  growth: { achievements: content.achievements, chapters: content.chapters, furniture: content.furniture },
})

function run(state: GameState, ...actions: GameAction[]): GameState {
  return actions.reduce(reducer, state)
}

function titleWithoutSave(): GameState {
  return createInitialState({ kind: 'empty' }, null, DEFAULT_SETTINGS)
}

function eventById(id: string): GameEvent {
  const e = content.events.find((x) => x.id === id)
  if (e === undefined) throw new Error(id)
  return e
}

const ALL_EVENTS = content.events.map((e) => e.id)
/** イベントの単語カードで覚える単語（おはなしのタップだけで覚える単語は入らない） */
const LEARN_VOCAB = [...new Set(content.events.flatMap((e) => e.steps.flatMap((st) => (st.type === 'learn' ? st.vocabulary : []))))]

/** eventId のイベントの直前の状態：それより前のイベント（ファイルの順）を終え、そのイベントの施設にいる */
function stateBefore(eventId: string): GameState {
  const event = eventById(eventId)
  const fresh = createNewSave(T0)
  const save = { ...fresh, progress: { ...fresh.progress, completedEvents: ALL_EVENTS.slice(0, ALL_EVENTS.indexOf(eventId)), currentLocationId: event.location } }
  return { ...titleWithoutSave(), save, scene: { name: 'location', locationId: event.location } }
}

/** 第1章のはじめ（空港・先生の授業）を終えて、自宅にいる状態（お隣さんのイベントの前） */
const atHome = () => stateBefore('event_001')
const home = { name: 'location', locationId: content.balance.startLocation } as const

/** 進めているイベントの段階を、種類に合った操作で1つ終える */
function completeCurrentStep(state: GameState, method: 'choice' | 'write' = 'choice'): GameState {
  if (state.run === null) throw new Error('イベント中ではありません')
  const step = eventById(state.run.eventId).steps[state.run.step]
  switch (step?.type) {
    case 'learn':
      return reducer(state, { type: 'learnDone', now: T1 })
    case 'conversation': {
      // 問題の往復にすべて答えてから、会話を終える（選択の往復は、画面が conversationAnswered を送らない）
      const conversation = content.conversations.find((c) => c.id === step.id)
      if (conversation === undefined) throw new Error(step.id)
      let s = state
      conversation.turns.forEach((turn, i) => {
        if (turn.choices !== undefined && turn.kind !== 'decision') s = reducer(s, { type: 'conversationAnswered', turn: i, method, now: T1 })
      })
      return reducer(s, { type: 'conversationDone', now: T1 })
    }
    case 'story':
      return reducer(state, { type: 'storyDone', now: T1 })
    case 'hangulIntro':
      return reducer(state, { type: 'answerHangulIntro', learnHangul: false, now: T1 })
    default:
      return reducer(state, { type: 'stepDone', now: T1 })
  }
}

/** 進めているイベントを最後まで進める */
function finishRun(state: GameState): GameState {
  let s = state
  for (let i = 0; i < 60 && s.run !== null; i++) s = completeCurrentStep(s)
  expect(s.run).toBeNull()
  return s
}

function playWholeEvent(state: GameState, eventId: string): GameState {
  const s = reducer(state, { type: 'startEvent', eventId, now: T1 })
  expect(s.scene.name).toBe('event')
  expect(s.run?.eventId).toBe(eventId)
  return finishRun(s)
}

describe('第1章〜第3章を通して遊ぶ', () => {
  it('はじめから：空港のイベントが自動で始まり、最後まで章の順に進められる', () => {
    let s = reducer(titleWithoutSave(), { type: 'startNew', now: T0 })
    expect(s.scene).toEqual({ name: 'event', locationId: 'home' })
    expect(s.run).toEqual({ eventId: ALL_EVENTS[0], step: 0, replay: false })

    for (let i = 0; i < 40; i++) {
      if (s.run !== null) {
        s = finishRun(s)
        continue
      }
      const save = s.save
      if (save === null) throw new Error('セーブがない')
      const next = nextEvent(content.events, save.progress)
      if (next === undefined) break
      if (s.scene.name !== 'location' || s.scene.locationId !== next.location) s = run(s, { type: 'backToMap', now: T1 }, { type: 'goToLocation', locationId: next.location, now: T1 })
      expect(s.scene).toEqual({ name: 'location', locationId: next.location })
      s = reducer(s, { type: 'startEvent', eventId: next.id, now: T1 })
    }

    expect(s.save?.progress.completedEvents).toEqual(ALL_EVENTS)
    expect(s.save?.progress.activeEvent).toBeNull()
    // 見たおはなしがアルバムに入る
    const stories = content.events.flatMap((e) => e.steps.flatMap((st) => (st.type === 'story' ? [st.id] : [])))
    expect(Object.keys(s.save?.progress.storiesSeen ?? {}).sort()).toEqual([...stories].sort())
    // 単語カードで覚える単語と、すべての文法が図鑑に入っている
    expect(Object.keys(s.save?.learning.words ?? {}).sort()).toEqual([...LEARN_VOCAB].sort())
    expect(Object.keys(s.save?.learning.grammar ?? {}).sort()).toEqual(content.grammar.map((g) => g.id).sort())
    // 経験値：単語 × learnWord ＋ 会話の往復（選ぶ）× conversationChoice ＋ イベント × eventComplete
    const { xp } = content.balance
    const answeredTurns = content.conversations.reduce((n, c) => n + c.turns.filter((t) => t.choices !== undefined && t.kind !== 'decision').length, 0)
    expect(s.save?.stats.xp).toBe(LEARN_VOCAB.length * xp.learnWord + answeredTurns * xp.conversationChoice + ALL_EVENTS.length * xp.eventComplete)
  })

  it('カフェは、開くイベント（unlocks）を終えるまで行けない。開いたら知らせる', () => {
    const opener = content.events.find((e) => e.unlocks?.includes('cafe'))
    if (opener === undefined) throw new Error('カフェを開くイベントがない')
    const before = stateBefore(opener.id)
    expect(run(before, { type: 'backToMap', now: T1 }, { type: 'goToLocation', locationId: 'cafe', now: T1 }).scene).toEqual({ name: 'main' })
    const opened = playWholeEvent(before, opener.id)
    expect(opened.reward?.unlocked).toEqual(['cafe'])
    expect(run(opened, { type: 'backToMap', now: T1 }, { type: 'goToLocation', locationId: 'cafe', now: T1 }).scene).toEqual({ name: 'location', locationId: 'cafe' })
    // 遊び直しでは、もう知らせない
    expect(playWholeEvent(run(opened, { type: 'dismissReward' }), opener.id).reward?.unlocked).toBeUndefined()
  })

  it('まだ行けない施設には移動しない', () => {
    const s = atHome()
    expect(reducer(s, { type: 'goToLocation', locationId: 'park', now: T1 })).toBe(s)
    expect(reducer(s, { type: 'goToLocation', locationId: 'school', now: T1 })).toBe(s)
  })

  it('前提を終えていないイベントは始められない', () => {
    const s = atHome()
    expect(reducer(s, { type: 'startEvent', eventId: 'event_002', now: T1 })).toBe(s)
  })

  it('段階の種類と違う操作は無視する', () => {
    const s = run(atHome(), { type: 'startEvent', eventId: 'event_001', now: T1 })
    // event_001 の最初は message
    expect(reducer(s, { type: 'learnDone', now: T1 })).toBe(s)
    expect(reducer(s, { type: 'conversationDone', now: T1 })).toBe(s)
    expect(reducer(s, { type: 'storyDone', now: T1 })).toBe(s)
    expect(reducer(s, { type: 'answerHangulIntro', learnHangul: true, now: T1 })).toBe(s)
    expect(reducer(s, { type: 'conversationAnswered', turn: 0, method: 'choice', now: T1 })).toBe(s)
  })
})

describe('おはなし・アルバム・見かけた単語（Phase 3）', () => {
  it('おはなしの段階は storyDone で進み、見た記録を付ける。ほかの操作では進まない', () => {
    let s = reducer(titleWithoutSave(), { type: 'startNew', now: T0 })
    const first = eventById(ALL_EVENTS[0] ?? '').steps[0]
    expect(first?.type).toBe('story')
    expect(reducer(s, { type: 'stepDone', now: T1 })).toBe(s)
    s = reducer(s, { type: 'storyDone', now: T1 })
    expect(s.run?.step).toBe(1)
    if (first?.type === 'story') expect(s.save?.progress.storiesSeen[first.id]).toEqual({ seenAt: T1 })
  })

  it('アルバムは見たおはなしだけを開ける。閉じると開いた画面に戻る', () => {
    const watched = finishRun(reducer(titleWithoutSave(), { type: 'startNew', now: T0 }))
    const seen = Object.keys(watched.save?.progress.storiesSeen ?? {})
    expect(seen.length).toBeGreaterThan(0)
    const album = run(watched, { type: 'openAlbum' })
    expect(album.scene).toEqual({ name: 'album', back: home })
    const replay = run(album, { type: 'openStoryReplay', storyId: seen[0] ?? '' })
    expect(replay.scene).toMatchObject({ name: 'storyReplay', storyId: seen[0] })
    expect(run(replay, { type: 'back', now: T1 }).scene.name).toBe('album')
    const unseen = content.stories.find((st) => !seen.includes(st.id))
    if (unseen !== undefined) expect(run(album, { type: 'openStoryReplay', storyId: unseen.id })).toBe(album)
  })

  it('「覚える」で見かけた単語に入れ、翌日から復習に出す。覚えた単語・2回目は変えない', () => {
    const s = atHome()
    const remembered = run(s, { type: 'rememberWord', vocabId: 'vocab_010', chapter: 1, now: T1 })
    expect(remembered.save?.learning.seen['vocab_010']).toEqual({ seenAt: T1, chapter: 1 })
    expect(remembered.save?.learning.review['word:vocab_010']).toMatchObject({ stage: 0, due: '2026-11-19' })
    expect(remembered.save?.stats.xp).toBe(0)
    expect(run(remembered, { type: 'rememberWord', vocabId: 'vocab_010', chapter: 1, now: T1 })).toBe(remembered)
    const learned = playWholeEvent(s, 'event_001')
    const id = Object.keys(learned.save?.learning.words ?? {})[0] ?? ''
    expect(run(learned, { type: 'rememberWord', vocabId: id, chapter: 1, now: T1 })).toBe(learned)
  })

  it('一度だけのお知らせを閉じる', () => {
    const s = atHome()
    if (s.save === null) throw new Error('セーブがない')
    const noticed: GameState = { ...s, save: { ...s.save, progress: { ...s.save.progress, notices: ['storyRestructured'] } } }
    const closed = run(noticed, { type: 'dismissNotice', notice: 'storyRestructured', now: T1 })
    expect(closed.save?.progress.notices).toEqual([])
    expect(run(closed, { type: 'dismissNotice', notice: 'storyRestructured', now: T1 })).toBe(closed)
  })
})

describe('途中で閉じて再開する', () => {
  it('イベントの途中で再読み込みしても、つづきから同じ段階で再開する', () => {
    let s = run(atHome(), { type: 'startEvent', eventId: 'event_001', now: T1 })
    s = completeCurrentStep(completeCurrentStep(s)) // message、（background は飛ばす）、learn
    expect(s.run).toEqual({ eventId: 'event_001', step: 3, replay: false })

    // 再読み込み：保存されているセーブデータから起動し直す
    const storage = new MemoryStorage()
    storage.setItem(SAVE_KEY, JSON.stringify(s.save))
    const b = boot(storage, new Date(T1))
    const resumed = reducer(createInitialState(b.load, b.backupKey, DEFAULT_SETTINGS), { type: 'continue', now: T1 })
    expect(resumed.scene).toEqual({ name: 'event', locationId: 'home' })
    expect(resumed.run).toEqual({ eventId: 'event_001', step: 3, replay: false })
  })

  it('イベントを途中でやめても、施設で同じイベントの続きから始まる', () => {
    let s = run(atHome(), { type: 'startEvent', eventId: 'event_001', now: T1 })
    s = completeCurrentStep(s)
    s = reducer(s, { type: 'leaveEvent' })
    expect(s.scene).toEqual({ name: 'location', locationId: 'home' })
    s = reducer(s, { type: 'startEvent', eventId: 'event_001', now: T1 })
    expect(s.run?.step).toBe(2) // 段階1は background なので飛ばす
  })

  it('教材が差し替わる前のセーブデータ（古い会話の記録・ずれた段階の番号）でも、読み込んで続きから最後まで遊べる', () => {
    const old = {
      ...createNewSave(T0),
      progress: { ...createNewSave(T0).progress, currentLocationId: 'cafe', completedEvents: ALL_EVENTS.slice(0, ALL_EVENTS.indexOf('event_002')), activeEvent: { id: 'event_002', step: 99 } },
      learning: {
        ...createNewSave(T0).learning,
        words: { vocab_001: { learnedAt: T0, chapter: 1 } },
        conversations: { 'home_001#0': { choice: true, write: false }, 'cafe_001#0': { choice: true, write: true } },
      },
      stats: { xp: 50, coins: 0, levelShown: 1 },
    }
    const storage = new MemoryStorage()
    storage.setItem(SAVE_KEY, JSON.stringify(old))
    const b = boot(storage, new Date(T1))
    expect(b.load.kind).toBe('ok')
    let s = reducer(createInitialState(b.load, b.backupKey, DEFAULT_SETTINGS), { type: 'continue', now: T1 })
    const last = eventById('event_002').steps.length - 1
    expect(s.run).toEqual({ eventId: 'event_002', step: last, replay: false })
    expect(s.save?.progress.activeEvent).toEqual({ id: 'event_002', step: last })
    s = completeCurrentStep(s)
    expect(s.save?.progress.completedEvents).toEqual(ALL_EVENTS.slice(0, ALL_EVENTS.indexOf('event_002') + 1))
    // 古い会話の記録は消さずに残す（今の教材からは参照されない）
    expect(s.save?.learning.conversations['home_001#0']).toEqual({ choice: true, write: false })
    expect(loadSave(storage).kind).toBe('ok')
  })

  it('施設やマップで終えていたら、その場所から再開する。まだ行けない施設なら自宅から', () => {
    const load = (save: ReturnType<typeof createNewSave>) => createInitialState({ kind: 'ok', data: save, raw: '', migratedFrom: null }, null, DEFAULT_SETTINGS)
    const cafeOpen = stateBefore('event_002').save
    if (cafeOpen === null) throw new Error('セーブがない')
    expect(reducer(load(cafeOpen), { type: 'continue', now: T1 }).scene).toEqual({ name: 'location', locationId: 'cafe' })
    expect(reducer(load({ ...cafeOpen, progress: { ...cafeOpen.progress, currentLocationId: null } }), { type: 'continue', now: T1 }).scene).toEqual({ name: 'main' })
    const locked = stateBefore('event_001').save
    if (locked === null) throw new Error('セーブがない')
    expect(reducer(load({ ...locked, progress: { ...locked.progress, currentLocationId: 'cafe' } }), { type: 'continue', now: T1 }).scene).toEqual(home)
  })

  it('自動で始まるイベントが残っていれば、つづきからでそこから始まる（物語が新しくなったセーブデータなど）', () => {
    const s = createInitialState({ kind: 'ok', data: createNewSave(T0), raw: '', migratedFrom: null }, null, DEFAULT_SETTINGS)
    const resumed = reducer(s, { type: 'continue', now: T1 })
    expect(resumed.scene).toEqual({ name: 'event', locationId: 'home' })
    expect(resumed.run?.eventId).toBe(ALL_EVENTS[0])
  })

  it('セーブデータがなければ、つづきからは何もしない', () => {
    const s = titleWithoutSave()
    expect(reducer(s, { type: 'continue', now: T1 })).toBe(s)
  })
})

describe('遊び直しと経験値', () => {
  it('終えたイベントは遊び直せるが、経験値も記録も増えない', () => {
    let s = playWholeEvent(atHome(), 'event_001')
    const before = s.save
    s = playWholeEvent(s, 'event_001')
    expect(s.save).toBe(before)
  })

  it('書いて正解すると、選ぶより多い経験値が付き、知らせが出る', () => {
    let s = run(atHome(), { type: 'startEvent', eventId: 'event_001', now: T1 })
    s = completeCurrentStep(completeCurrentStep(s)) // message, learn
    const xpBefore = s.save?.stats.xp ?? 0
    s = completeCurrentStep(s, 'write') // 最初の会話の往復を、すべて書いて正解
    const turns = content.conversations.find((c) => c.id === 'home_005')?.turns.filter((t) => t.choices !== undefined && t.kind !== 'decision').length ?? 0
    expect(turns).toBeGreaterThan(0)
    expect((s.save?.stats.xp ?? 0) - xpBefore).toBe(turns * content.balance.xp.conversationWrite)
    expect(s.reward).toMatchObject({ xp: content.balance.xp.conversationWrite })
    expect(reducer(s, { type: 'dismissReward' }).reward).toBeNull()
  })

  it('「答えを見る」で進んでも、先へは進めるが経験値は付かない', () => {
    let s = run(atHome(), { type: 'startEvent', eventId: 'event_001', now: T1 })
    s = completeCurrentStep(completeCurrentStep(s))
    const xpBefore = s.save?.stats.xp
    const stepBefore = s.run?.step ?? 0
    s = reducer(s, { type: 'conversationAnswered', turn: 0, method: 'revealed', now: T1 })
    expect(s.save?.stats.xp).toBe(xpBefore)
    s = reducer(s, { type: 'conversationDone', now: T1 })
    expect(s.save?.stats.xp).toBe(xpBefore)
    expect(s.run?.step).toBe(stepBefore + 1)
  })
})

describe('設定・図鑑・戻る', () => {
  it('設定と図鑑は、開いた画面に戻る', () => {
    let s = atHome()
    s = reducer(s, { type: 'openSettings' })
    expect(s.scene).toMatchObject({ name: 'settings', back: { name: 'location', locationId: 'home' } })
    s = reducer(s, { type: 'closeSettings' })
    expect(s.scene).toEqual({ name: 'location', locationId: 'home' })
    s = run(s, { type: 'openDictionary' }, { type: 'closeDictionary' })
    expect(s.scene).toEqual({ name: 'location', locationId: 'home' })
  })

  it('設定を変えると状態に反映する', () => {
    const s = reducer(titleWithoutSave(), { type: 'changeSettings', settings: { ...DEFAULT_SETTINGS, furigana: 'off' } })
    expect(s.settings.furigana).toBe('off')
  })

  it('ブラウザの「戻る」は画面内の戻るボタンと同じ動きをする', () => {
    let s = reducer(atHome(), { type: 'startEvent', eventId: 'event_001', now: T1 })
    s = reducer(s, { type: 'back', now: T1 }) // イベント → 施設
    expect(s.scene).toEqual({ name: 'location', locationId: 'home' })
    s = reducer(s, { type: 'back', now: T1 }) // 施設 → マップ
    expect(s.scene).toEqual({ name: 'main' })
    s = reducer(s, { type: 'back', now: T1 }) // マップ → タイトル
    expect(s.scene).toEqual({ name: 'title' })
    expect(reducer(s, { type: 'back', now: T1 })).toBe(s) // タイトルでは何もしない
  })
})

describe('保存の失敗の表示', () => {
  it('失敗したら記録し、成功したら消す', () => {
    let s = reducer(titleWithoutSave(), { type: 'saveFailed', message: '保存容量がいっぱいです' })
    expect(s.saveFailure).toBe('保存容量がいっぱいです')
    s = reducer(s, { type: 'saveSucceeded' })
    expect(s.saveFailure).toBeNull()
  })
})

describe('起動（boot と createInitialState）', () => {
  it('セーブデータがなければタイトルから', () => {
    const b = boot(new MemoryStorage(), new Date(T0))
    const s = createInitialState(b.load, b.backupKey, DEFAULT_SETTINGS)
    expect(s.scene).toEqual({ name: 'title' })
    expect(s.save).toBeNull()
    expect(s.storageAvailable).toBe(true)
  })

  it('保存できない環境では storageAvailable が false', () => {
    const b = boot(null, new Date(T0))
    expect(createInitialState(b.load, b.backupKey, DEFAULT_SETTINGS).storageAvailable).toBe(false)
  })

  it('壊れたデータは退避してからエラー画面を出し、元のキーも残す', () => {
    const storage = new MemoryStorage()
    storage.setItem(SAVE_KEY, '{broken')
    const b = boot(storage, new Date(T0))
    expect(b.backupKey).not.toBeNull()
    expect(storage.getItem(b.backupKey ?? '')).toBe('{broken')
    expect(storage.getItem(SAVE_KEY)).toBe('{broken')

    const s = createInitialState(b.load, b.backupKey, DEFAULT_SETTINGS)
    expect(s.scene).toMatchObject({ name: 'saveError', reason: 'parse_error', backupKey: b.backupKey })
    const started = reducer(s, { type: 'startNew', now: T1 })
    expect(started.save?.version).toBe(CURRENT_SAVE_VERSION)
  })

  it('v1 のデータは移行前の形を退避してから読み込む', () => {
    const storage = new MemoryStorage()
    const v1 = JSON.stringify({ version: 1, createdAt: T0, updatedAt: T0, progress: { currentLocationId: 'cafe' } })
    storage.setItem(SAVE_KEY, v1)
    const b = boot(storage, new Date(T1))
    expect(b.backupKey).toMatch(/pre-migration$/)
    expect(storage.getItem(b.backupKey ?? '')).toBe(v1)
    // v6 で物語の進み具合を最初からにするので、いた場所は残らない（物語を始めていなかったのでお知らせもない）
    expect(createInitialState(b.load, b.backupKey, DEFAULT_SETTINGS).save?.progress).toMatchObject({ currentLocationId: null, notices: [] })
  })

  it('正常なデータは読み込まれ、退避はしない', () => {
    const storage = new MemoryStorage()
    storage.setItem(SAVE_KEY, JSON.stringify(createNewSave(T0)))
    const b = boot(storage, new Date(T1))
    expect(b.backupKey).toBeNull()
    expect(createInitialState(b.load, b.backupKey, DEFAULT_SETTINGS).save).toEqual(createNewSave(T0))
    expect(loadSave(storage).kind).toBe('ok')
  })
})

describe('ハングルは読めますか？（hangulIntro）と学習画面', () => {
  const withHangul = createGameReducer({
    events: content.events,
    balance: content.balance,
    locationIds: new Set(content.locations.map((l) => l.id)),
    firstHangulLessonId: 'hangul_001',
  })
  const go = (state: GameState, ...actions: GameAction[]) => actions.reduce(withHangul, state)
  const introEvent = content.events.find((e) => e.steps.some((st) => st.type === 'hangulIntro'))
  if (introEvent === undefined) throw new Error('hangulIntro のイベントがない')
  /** hangulIntro の段階まで進めた状態 */
  const atIntro = () => {
    let s = go(stateBefore(introEvent.id), { type: 'startEvent', eventId: introEvent.id, now: T1 })
    for (let i = 0; i < 20 && s.run !== null && introEvent.steps[s.run.step]?.type !== 'hangulIntro'; i++) {
      const step = introEvent.steps[s.run.step]
      s = go(s, step?.type === 'story' ? { type: 'storyDone', now: T1 } : step?.type === 'learn' ? { type: 'learnDone', now: T1 } : { type: 'stepDone', now: T1 })
    }
    return s
  }

  it('はじめからでは、もう最初に聞かない（物語が自動で始まる）', () => {
    expect(go(titleWithoutSave(), { type: 'startNew', now: T0 }).scene).toEqual({ name: 'event', locationId: 'home' })
  })

  it('「このまま進める」で、物語の次の段階へ', () => {
    const s = atIntro()
    expect(s.run === null ? undefined : introEvent.steps[s.run.step]?.type).toBe('hangulIntro')
    expect(go(s, { type: 'stepDone', now: T1 })).toBe(s)
    const next = go(s, { type: 'answerHangulIntro', learnHangul: false, now: T1 })
    expect(next.scene.name).not.toBe('hangulLesson')
    expect(next.run === null || next.run.step > (s.run?.step ?? 0)).toBe(true)
  })

  it('「ハングルから学ぶ」でレッスン1を始め、閉じると物語（その後の画面）に戻る', () => {
    const s = go(atIntro(), { type: 'answerHangulIntro', learnHangul: true, now: T1 })
    expect(s.scene).toMatchObject({ name: 'hangulLesson', lessonId: 'hangul_001', onboarding: true })
    const back = go(s, { type: 'closeStudyScene' })
    expect(back.scene.name === 'event' || back.scene.name === 'location').toBe(true)
    expect(go(s, { type: 'back', now: T1 }).scene).toEqual(back.scene)
  })

  it('ハングルのレッスンがなければ、「学ぶ」でも物語を進める', () => {
    let s = run(stateBefore(introEvent.id), { type: 'startEvent', eventId: introEvent.id, now: T1 })
    for (let i = 0; i < 20 && s.run !== null && introEvent.steps[s.run.step]?.type !== 'hangulIntro'; i++) s = completeCurrentStep(s)
    expect(run(s, { type: 'answerHangulIntro', learnHangul: true, now: T1 }).scene.name).not.toBe('hangulLesson')
  })

  it('自宅から学習画面 → ハングル → レッスンと開き、戻るで1つずつ戻る', () => {
    const lesson = go(atHome(), { type: 'openStudy' }, { type: 'openHangul' }, { type: 'openHangulLesson', lessonId: 'hangul_002' })
    expect(lesson.scene).toMatchObject({ name: 'hangulLesson', lessonId: 'hangul_002', onboarding: false, back: { name: 'hangul', back: { name: 'study', back: home } } })
    const back1 = go(lesson, { type: 'back', now: T1 })
    expect(back1.scene.name).toBe('hangul')
    expect(go(back1, { type: 'closeStudyScene' }, { type: 'closeStudyScene' }).scene).toEqual(home)
    expect(go(atHome(), { type: 'openStudy' }, { type: 'openListening' }).scene).toMatchObject({ name: 'listening', back: { name: 'study' } })
  })

  it('決まった順でしか開けない（学習画面を経ずにレッスンは開けない）', () => {
    const s = atHome()
    expect(go(s, { type: 'openHangulLesson', lessonId: 'hangul_001' })).toBe(s)
    expect(go(s, { type: 'openListening' })).toBe(s)
    expect(go(titleWithoutSave(), { type: 'openStudy' }).scene).toEqual({ name: 'title' })
  })

  it('小テストの合格とリスニングの正解で経験値が付き、知らせを出す', () => {
    const s = atHome()
    const passed = go(s, { type: 'hangulLessonPassed', lessonId: 'hangul_001', score: 88, now: T1 })
    expect(passed.save?.learning.hangul['hangul_001']).toEqual({ passedAt: T1, bestScore: 88 })
    expect(passed.reward).toMatchObject({ xp: content.balance.xp.hangulLesson })
    expect(go(passed, { type: 'hangulLessonPassed', lessonId: 'hangul_001', score: 50, now: T1 })).toBe(passed)
    const heard = go(s, { type: 'listeningCorrect', key: 'word:vocab_001', now: T1 })
    expect(heard.save?.stats.xp).toBe(content.balance.xp.listening)
    expect(go(heard, { type: 'listeningCorrect', key: 'word:vocab_001', now: T1 })).toBe(heard)
  })
})

describe('復習・練習・ドリル・テスト・スタンプ（Phase 2.5）', () => {

  it('学習画面から復習・練習・ドリルの一覧を開き、ドリル・テストは一覧から開く。戻るで1つずつ戻る', () => {
    const study = run(atHome(), { type: 'openStudy' })
    expect(run(study, { type: 'openReview' }).scene).toMatchObject({ name: 'review', back: { name: 'study' } })
    expect(run(study, { type: 'openPractice' }).scene).toMatchObject({ name: 'practice', back: { name: 'study' } })
    const drill = run(study, { type: 'openDrills' }, { type: 'openDrill', drillId: 'drill_001' })
    expect(drill.scene).toMatchObject({ name: 'drill', drillId: 'drill_001', back: { name: 'drills', back: { name: 'study', back: home } } })
    expect(run(drill, { type: 'back', now: T1 }).scene.name).toBe('drills')
    expect(run(study, { type: 'openDrill', drillId: 'drill_001' })).toBe(study)
    expect(run(study, { type: 'openDrills' }, { type: 'openChapterTest', testId: 'test_001' }).scene).toMatchObject({ name: 'chapterTest', testId: 'test_001' })
  })

  it('自宅からスタンプカードを開き、閉じると自宅に戻る', () => {
    const stamps = run(atHome(), { type: 'openStamps' })
    expect(stamps.scene).toEqual({ name: 'stamps', back: home })
    expect(run(stamps, { type: 'closeStudyScene' }).scene).toEqual(home)
  })

  it('学習を終えたらスタンプを押して知らせる（1日1つ）', () => {
    const done = run(atHome(), { type: 'activityCompleted', activity: 'drill', now: T1 })
    expect(done.save?.daily.stamps).toHaveLength(1)
    expect(done.reward).toMatchObject({ stamp: true })
    expect(run(done, { type: 'activityCompleted', activity: 'listening', now: T1 })).toBe(done)
  })

  it('ハングルのレッスンに合格・章末テストを終える・イベントを完了しても、スタンプを押す', () => {
    expect(run(atHome(), { type: 'hangulLessonPassed', lessonId: 'hangul_001', score: 100, now: T1 }).save?.daily.stamps).toHaveLength(1)
    const tested = run(atHome(), { type: 'testFinished', testId: 'test_001', score: 40, passed: false, now: T1 })
    expect(tested.save?.daily.stamps).toHaveLength(1)
    expect(tested.save?.learning.tests['test_001']).toEqual({ passedAt: null, bestScore: 40 })
    // はじめから自動で始まるイベントを終える
    const played = finishRun(reducer(titleWithoutSave(), { type: 'startNew', now: T0 }))
    expect(played.save?.daily.stamps).toHaveLength(1)
    expect(played.reward).toMatchObject({ stamp: true })
  })

  it('復習・ドリルの答えを記録する', () => {
    const answered = run(atHome(), { type: 'reviewAnswered', key: 'word:vocab_001', correct: false, source: 'practice', now: T1 }, { type: 'drillAnswered', itemId: 'dq_001', correct: true, now: T1 })
    expect(answered.save?.learning.review['word:vocab_001']).toMatchObject({ wrong: 1 })
    expect(answered.save?.learning.drills['dq_001']).toEqual({ correctAt: T1 })
    expect(answered.save?.stats.xp).toBe(content.balance.xp.drillItem)
  })
})

describe('選択の往復（Phase 2.5）', () => {
  it('選択の往復への答えは、経験値・記録・復習を付けない', () => {
    const event = content.events.find((e) => e.steps.some((st) => st.type === 'conversation' && content.conversations.find((c) => c.id === st.id)?.turns.some((t) => t.kind === 'decision')))
    if (event === undefined) throw new Error('選択の往復のある会話がない')
    let s = run(stateBefore(event.id), { type: 'startEvent', eventId: event.id, now: T1 })
    for (let i = 0; i < 20 && s.run !== null && event.steps[s.run.step]?.type !== 'conversation'; i++) s = completeCurrentStep(s)
    const step = s.run === null ? undefined : event.steps[s.run.step]
    if (step?.type !== 'conversation') throw new Error('会話の段階がない')
    const conversation = content.conversations.find((c) => c.id === step.id)
    // 今の教材では、そのイベントの最初の会話に選択の往復がある
    const decisionTurn = conversation?.turns.findIndex((t) => t.kind === 'decision') ?? -1
    expect(decisionTurn).toBeGreaterThanOrEqual(0)
    expect(reducer(s, { type: 'conversationAnswered', turn: decisionTurn, method: 'choice', now: T1 })).toBe(s)
  })
})

describe('会話をもう一度（BUG-007）', () => {
  const home = content.events.find((e) => e.id === 'event_001')
  const firstConversation = home?.steps.find((s) => s.type === 'conversation')
  const conversationId = firstConversation?.type === 'conversation' ? firstConversation.id : ''
  const conversation = content.conversations.find((c) => c.id === conversationId)
  const questionTurn = conversation?.turns.findIndex((t) => t.choices !== undefined && t.kind !== 'decision') ?? -1
  const decisionTurn = conversation?.turns.findIndex((t) => t.kind === 'decision') ?? -1
  /** すべてのイベントを終えた形（会話の記録はない） */
  const finished = (): GameState => {
    const s = atHome()
    if (s.save === null) throw new Error('セーブがない')
    return { ...s, save: { ...s.save, progress: { ...s.save.progress, completedEvents: ALL_EVENTS } } }
  }

  it('学習画面の一覧から、終えたイベントの会話を遊べる。終えていないイベントの会話は遊べない', () => {
    const list = run(finished(), { type: 'openStudy' }, { type: 'openConversations' })
    expect(list.scene).toMatchObject({ name: 'conversations', back: { name: 'study' } })
    const replay = run(list, { type: 'openConversationReplay', conversationId })
    expect(replay.scene).toMatchObject({ name: 'conversationReplay', conversationId, locationId: conversation?.location })
    const notYet = run(atHome(), { type: 'openStudy' }, { type: 'openConversations' })
    expect(run(notYet, { type: 'openConversationReplay', conversationId })).toBe(notYet)
    expect(run(replay, { type: 'back', now: T1 }).scene.name).toBe('conversations')
  })

  it('遊び直しで答えた問題の往復は、記録・復習に入れ、初めての正解だけ経験値を付ける。選択の往復は記録しない', () => {
    const replay = run(finished(), { type: 'openStudy' }, { type: 'openConversations' }, { type: 'openConversationReplay', conversationId })
    const xp0 = replay.save?.stats.xp ?? 0
    const answered = run(replay, { type: 'replayTurnAnswered', turn: questionTurn, method: 'choice', now: T1 })
    expect(answered.save?.learning.conversations[`${conversationId}#${questionTurn}`]).toEqual({ choice: true, write: false })
    expect(answered.save?.learning.review[`turn:${conversationId}#${questionTurn}`]).toBeDefined()
    expect((answered.save?.stats.xp ?? 0) - xp0).toBe(content.balance.xp.conversationChoice)
    expect(run(answered, { type: 'replayTurnAnswered', turn: questionTurn, method: 'choice', now: T1 })).toBe(answered)
    expect(decisionTurn).toBeGreaterThanOrEqual(0)
    expect(run(answered, { type: 'replayTurnAnswered', turn: decisionTurn, method: 'choice', now: T1 })).toBe(answered)
  })

  it('施設の「もう一度遊ぶ」（イベントの遊び直し）でも、答えた問題の往復を記録する', () => {
    let s = run(finished(), { type: 'startEvent', eventId: 'event_001', now: T1 })
    expect(s.run?.replay).toBe(true)
    for (let i = 0; i < 20 && s.run !== null && home?.steps[s.run.step]?.type !== 'conversation'; i++) s = completeCurrentStep(s)
    s = run(s, { type: 'conversationAnswered', turn: questionTurn, method: 'write', now: T1 })
    expect(s.save?.learning.conversations[`${conversationId}#${questionTurn}`]).toEqual({ choice: false, write: true })
    expect(s.save?.progress.completedEvents).toEqual(ALL_EVENTS)
  })
})

describe('読み物・注文・形が変わる言葉（Phase 3 区切り3）', () => {
  it('読み物の問題は、初めて正解したときだけ経験値。2回目は変えない', () => {
    const s = atHome()
    const first = run(s, { type: 'readingCorrect', key: 'reading_901#0', now: T1 })
    expect(first.save?.learning.readings['reading_901#0']).toEqual({ correctAt: T1 })
    expect(first.save?.stats.xp).toBe(content.balance.xp.readingQuestion)
    expect(run(first, { type: 'readingCorrect', key: 'reading_901#0', now: T1 })).toBe(first)
  })

  it('注文は、初めて注文できたときだけ経験値。品物は記録に足していく', () => {
    const s = atHome()
    const first = run(s, { type: 'orderPlaced', orderId: 'order_901', itemKey: 'americano', now: T1 })
    expect(first.save?.learning.orders['order_901']).toEqual({ firstAt: T1, items: ['americano'] })
    expect(first.save?.stats.xp).toBe(content.balance.xp.order)
    const second = run(first, { type: 'orderPlaced', orderId: 'order_901', itemKey: 'cheesecake', now: T1 })
    expect(second.save?.learning.orders['order_901']?.items).toEqual(['americano', 'cheesecake'])
    expect(second.save?.stats.xp).toBe(content.balance.xp.order)
    expect(run(second, { type: 'orderPlaced', orderId: 'order_901', itemKey: 'americano', now: T1 })).toBe(second)
  })

  it('注文の段階のあるイベントを終えたら、その施設の画面から何度でも注文し直せる', () => {
    const event = content.events.find((e) => e.steps.some((st) => st.type === 'order'))
    const step = event?.steps.find((st) => st.type === 'order')
    if (event === undefined || step?.type !== 'order') throw new Error('注文の段階がない')
    const before = stateBefore(event.id)
    expect(run(before, { type: 'openOrder', orderId: step.id })).toBe(before)
    const done = playWholeEvent(before, event.id)
    const opened = run(done, { type: 'openOrder', orderId: step.id })
    expect(opened.scene).toMatchObject({ name: 'order', orderId: step.id, locationId: event.location })
    expect(run(opened, { type: 'back', now: T1 }).scene).toEqual(done.scene)
  })

  it('形が変わる言葉のある単語を覚えたら、形の問題も翌日の復習に入る', () => {
    const v = content.vocabulary.find((x) => (x.forms?.length ?? 0) > 0)
    const event = content.events.find((e) => e.steps.some((st) => st.type === 'learn' && st.vocabulary.includes(v?.id ?? '')))
    if (v === undefined || event === undefined) throw new Error('形が変わる言葉の単語がない')
    const done = playWholeEvent(stateBefore(event.id), event.id)
    for (const key of formKeysOf(v)) expect(done.save?.learning.review[key]).toMatchObject({ stage: 0 })
  })
})

describe('ファイルから読み込む（GAME_SPEC 10-2）', () => {
  it('セーブデータと設定を置き換え、進めていたイベントをやめて、タイトルに「読み込みました」を出す', () => {
    const playing = run(titleWithoutSave(), { type: 'startNew', now: T0 })
    expect(playing.run).not.toBeNull()
    const imported = { ...createNewSave(T1), stats: { xp: 300, coins: 0, levelShown: 3 } }
    const settings = { ...DEFAULT_SETTINGS, furigana: 'off' as const }
    const s = run(playing, { type: 'openSettings' }, { type: 'importSave', save: imported, settings, exportedAt: T1 })
    expect(s.save).toBe(imported)
    expect(s.settings).toBe(settings)
    expect(s.run).toBeNull()
    expect(s.scene).toEqual({ name: 'title', imported: T1 })
  })

  it('セーブデータがない（壊れていた）ときも、読み込んで始められる', () => {
    const imported = createNewSave(T1)
    const s = run(titleWithoutSave(), { type: 'importSave', save: imported, settings: DEFAULT_SETTINGS, exportedAt: T1 })
    expect(s.save).toBe(imported)
    expect(run(s, { type: 'continue', now: T1 }).scene.name).not.toBe('title')
  })
})

describe('成長（レベル・コイン・実績。Phase 4）', () => {
  it('イベントを初めて終えるとコインが付き、知らせに出る。章を終えると、さらに足す', () => {
    let s = reducer(titleWithoutSave(), { type: 'startNew', now: T0 })
    s = finishRun(s)
    expect(s.save?.progress.completedEvents).toEqual([ALL_EVENTS[0]])
    const first = s.save?.stats.coins ?? 0
    expect(first).toBeGreaterThanOrEqual(content.balance.coins.eventComplete)
    expect(s.reward?.coins).toBeGreaterThanOrEqual(content.balance.coins.eventComplete)
    // 第1章の最後（章の終わりの段階がある）まで遊ぶ
    for (const id of ALL_EVENTS.slice(1, ALL_EVENTS.indexOf('event_006') + 1)) {
      if (s.run === null) s = playWholeEvent(s, id)
      else s = finishRun(s)
    }
    expect(s.save?.achievements['achievement_005']).toBeDefined()
    expect(s.save?.stats.coins).toBeGreaterThan(first + content.balance.coins.chapterClear)
  })

  it('経験値でレベルが上がると、知らせ（levelUp）に出し、知らせ済みのレベルを残す', () => {
    const save = { ...createNewSave(T0), stats: { xp: 95, coins: 0, levelShown: 1 } }
    let s: GameState = { ...titleWithoutSave(), save }
    s = reducer(s, { type: 'continue', now: T1 })
    s = finishRun(s)
    expect(s.save?.stats.xp).toBeGreaterThanOrEqual(100)
    expect(s.save?.stats.levelShown).toBeGreaterThanOrEqual(2)
    expect(s.reward?.levelUp).toBeGreaterThanOrEqual(2)
  })

  it('v6 から移したデータ（levelShown 0）は、最初の操作でこれまでの分のコインを付け、知らせは出さない', () => {
    const migrated = {
      ...createNewSave(T0),
      progress: { ...createNewSave(T0).progress, completedEvents: ALL_EVENTS.slice(0, 4), notices: ['progressionIntroduced' as const] },
      stats: { xp: 400, coins: 0, levelShown: 0 },
    }
    const s = reducer({ ...titleWithoutSave(), save: migrated }, { type: 'openSettings' })
    expect(s.save?.stats.levelShown).toBe(3)
    expect(s.save?.stats.coins).toBeGreaterThanOrEqual(4 * content.balance.coins.eventComplete + content.balance.coins.chapterClear)
    expect(s.reward).toBeNull()
    expect(s.save?.progress.notices).toEqual(['progressionIntroduced'])
  })
})

describe('部屋を飾る（家具。Phase 4 区切り3）', () => {
  /** 引っ越しを終え（event_001 まで）、自宅にいて、コインと経験値がある状態 */
  function movedIn(coins: number, xp = 0): GameState {
    const state = stateBefore('event_006')
    const save = state.save ?? createNewSave(T0)
    return { ...state, save: { ...save, stats: { xp, coins, levelShown: 1 }, achievements: Object.fromEntries(content.achievements.map((a) => [a.id, { at: T0 }])) } }
  }

  it('引っ越しを終えるまでは開けない。終えたら自宅から開け、戻ると自宅に戻る', () => {
    expect(reducer(atHome(), { type: 'openRoom' }).scene).toEqual(home)
    const opened = reducer(movedIn(0), { type: 'openRoom' })
    expect(opened.scene).toEqual({ name: 'room', back: home })
    expect(reducer(opened, { type: 'closeStudyScene' }).scene).toEqual(home)
  })

  it('カタログで買うと、コインが減り、空いた場所に置かれる。足りなければ買えない', () => {
    let s = run(movedIn(100), { type: 'openRoom' }, { type: 'buyFurniture', furnitureId: 'furniture_001', now: T1 })
    expect(s.save?.stats.coins).toBe(20)
    expect(s.save?.home.owned['furniture_001']).toEqual({ at: T1 })
    expect(s.save?.home.placement['wall_left']).toBe('furniture_001')
    const before = s
    s = reducer(s, { type: 'buyFurniture', furnitureId: 'furniture_007', now: T1 })
    expect(s).toBe(before)
    expect(reducer(s, { type: 'buyFurniture', furnitureId: 'furniture_999', now: T1 })).toBe(s)
  })

  it('置き換える・外す。持っていない家具・場所に合わない家具は置けない', () => {
    let s = run(movedIn(1000, 300), { type: 'buyFurniture', furnitureId: 'furniture_001', now: T1 }, { type: 'buyFurniture', furnitureId: 'furniture_002', now: T1 })
    expect(s.save?.home.placement['wall_left']).toBe('furniture_001')
    s = reducer(s, { type: 'placeFurniture', slot: 'wall_left', furnitureId: 'furniture_002', now: T1 })
    expect(s.save?.home.placement['wall_left']).toBe('furniture_002')
    expect(reducer(s, { type: 'placeFurniture', slot: 'rug', furnitureId: 'furniture_002', now: T1 })).toBe(s)
    expect(reducer(s, { type: 'placeFurniture', slot: 'wall_left', furnitureId: 'furniture_003', now: T1 })).toBe(s)
    s = reducer(s, { type: 'placeFurniture', slot: 'wall_left', furnitureId: null, now: T1 })
    expect(s.save?.home.placement['wall_left']).toBeUndefined()
  })

  it('スタンプ7個の節目で、節目専用の家具をもらい、知らせに出る', () => {
    const state = movedIn(0)
    const save = state.save ?? createNewSave(T0)
    const stamps = Array.from({ length: 7 }, (_, i) => `2026-11-${String(i + 1).padStart(2, '0')}`)
    const s = reducer({ ...state, save: { ...save, daily: { stamps, rewards: {} } } }, { type: 'continue', now: T1 })
    expect(s.save?.home.owned['furniture_018']).toBeDefined()
    expect(s.reward?.furniture).toEqual(['furniture_018'])
    expect(s.reward?.milestones).toEqual([3, 7])
  })
})
