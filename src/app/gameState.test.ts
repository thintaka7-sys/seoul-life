import { describe, expect, it } from 'vitest'
import { content } from '../data'
import type { GameEvent } from '../data/types'
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
  balance: content.balance,
  locationIds: new Set(content.locations.map((l) => l.id)),
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

/** 進めているイベントの段階を、種類に合った操作で1つ終える */
function completeCurrentStep(state: GameState, method: 'choice' | 'write' = 'choice'): GameState {
  if (state.run === null) throw new Error('イベント中ではありません')
  const step = eventById(state.run.eventId).steps[state.run.step]
  switch (step?.type) {
    case 'learn':
      return reducer(state, { type: 'learnDone', now: T1 })
    case 'conversation': {
      // 返事のある往復にすべて答えてから、会話を終える
      const conversation = content.conversations.find((c) => c.id === step.id)
      if (conversation === undefined) throw new Error(step.id)
      let s = state
      conversation.turns.forEach((turn, i) => {
        if (turn.choices !== undefined) s = reducer(s, { type: 'conversationAnswered', turn: i, method, now: T1 })
      })
      return reducer(s, { type: 'conversationDone', now: T1 })
    }
    default:
      return reducer(state, { type: 'stepDone', now: T1 })
  }
}

function playWholeEvent(state: GameState, eventId: string): GameState {
  let s = reducer(state, { type: 'startEvent', eventId, now: T1 })
  expect(s.scene.name).toBe('event')
  for (let i = 0; i < 50 && s.run !== null; i++) s = completeCurrentStep(s)
  expect(s.run).toBeNull()
  return s
}

describe('最初の1日を通して遊ぶ', () => {
  it('はじめから → 自宅のイベント → マップ → カフェのイベント → 自宅で図鑑 → 1日の終わり', () => {
    let s = reducer(titleWithoutSave(), { type: 'startNew', now: T0 })
    expect(s.scene).toEqual({ name: 'location', locationId: 'home' })

    s = playWholeEvent(s, 'event_001')
    expect(s.scene).toEqual({ name: 'location', locationId: 'home' })
    expect(s.save?.progress.completedEvents).toEqual(['event_001'])

    // カフェのイベントは、マップからカフェへ行って始める
    s = run(s, { type: 'backToMap', now: T1 }, { type: 'goToLocation', locationId: 'cafe', now: T1 })
    s = playWholeEvent(s, 'event_002')
    s = run(s, { type: 'backToMap', now: T1 }, { type: 'goToLocation', locationId: 'home', now: T1 })
    s = playWholeEvent(s, 'event_003')

    expect(s.save?.progress.completedEvents).toEqual(['event_001', 'event_002', 'event_003'])
    expect(s.save?.progress.activeEvent).toBeNull()
    // すべての単語・文法が図鑑に入っている
    expect(Object.keys(s.save?.learning.words ?? {}).sort()).toEqual(content.vocabulary.map((v) => v.id).sort())
    expect(Object.keys(s.save?.learning.grammar ?? {}).sort()).toEqual(content.grammar.map((g) => g.id).sort())
    // 経験値：単語 × learnWord ＋ 会話の往復（選ぶ）× conversationChoice ＋ イベント × eventComplete
    const { xp } = content.balance
    const answeredTurns = content.conversations.reduce((n, c) => n + c.turns.filter((t) => t.choices !== undefined).length, 0)
    expect(s.save?.stats.xp).toBe(content.vocabulary.length * xp.learnWord + answeredTurns * xp.conversationChoice + 3 * xp.eventComplete)
  })

  it('まだ行けない施設には移動しない', () => {
    const s = reducer(titleWithoutSave(), { type: 'startNew', now: T0 })
    expect(reducer(s, { type: 'goToLocation', locationId: 'park', now: T1 })).toBe(s)
    expect(reducer(s, { type: 'goToLocation', locationId: 'school', now: T1 })).toBe(s)
  })

  it('前提を終えていないイベントは始められない', () => {
    const s = reducer(titleWithoutSave(), { type: 'startNew', now: T0 })
    expect(reducer(s, { type: 'startEvent', eventId: 'event_002', now: T1 })).toBe(s)
  })

  it('段階の種類と違う操作は無視する', () => {
    const s = run(reducer(titleWithoutSave(), { type: 'startNew', now: T0 }), { type: 'startEvent', eventId: 'event_001', now: T1 })
    // event_001 の最初は message
    expect(reducer(s, { type: 'learnDone', now: T1 })).toBe(s)
    expect(reducer(s, { type: 'conversationDone', now: T1 })).toBe(s)
    expect(reducer(s, { type: 'conversationAnswered', turn: 0, method: 'choice', now: T1 })).toBe(s)
  })
})

describe('途中で閉じて再開する', () => {
  it('イベントの途中で再読み込みしても、つづきから同じ段階で再開する', () => {
    let s = run(reducer(titleWithoutSave(), { type: 'startNew', now: T0 }), { type: 'startEvent', eventId: 'event_001', now: T1 })
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
    let s = run(reducer(titleWithoutSave(), { type: 'startNew', now: T0 }), { type: 'startEvent', eventId: 'event_001', now: T1 })
    s = completeCurrentStep(s)
    s = reducer(s, { type: 'leaveEvent' })
    expect(s.scene).toEqual({ name: 'location', locationId: 'home' })
    s = reducer(s, { type: 'startEvent', eventId: 'event_001', now: T1 })
    expect(s.run?.step).toBe(2) // 段階1は background なので飛ばす
  })

  it('教材が差し替わる前のセーブデータ（古い会話の記録・ずれた段階の番号）でも、読み込んで続きから最後まで遊べる', () => {
    const old = {
      ...createNewSave(T0),
      progress: { currentLocationId: 'cafe', completedEvents: ['event_001'], activeEvent: { id: 'event_002', step: 99 } },
      learning: {
        ...createNewSave(T0).learning,
        words: { vocab_001: { learnedAt: T0, chapter: 1 } },
        conversations: { 'home_001#0': { choice: true, write: false }, 'cafe_001#0': { choice: true, write: true } },
      },
      stats: { xp: 50 },
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
    expect(s.save?.progress.completedEvents).toEqual(['event_001', 'event_002'])
    // 古い会話の記録は消さずに残す（今の教材からは参照されない）
    expect(s.save?.learning.conversations['home_001#0']).toEqual({ choice: true, write: false })
    expect(loadSave(storage).kind).toBe('ok')
  })

  it('施設やマップで終えていたら、その場所から再開する', () => {
    const atCafe = { ...createNewSave(T0), progress: { ...createNewSave(T0).progress, currentLocationId: 'cafe' } }
    const s = createInitialState({ kind: 'ok', data: atCafe, raw: '', migratedFrom: null }, null, DEFAULT_SETTINGS)
    expect(reducer(s, { type: 'continue', now: T1 }).scene).toEqual({ name: 'location', locationId: 'cafe' })
    const onMap = createInitialState({ kind: 'ok', data: createNewSave(T0), raw: '', migratedFrom: null }, null, DEFAULT_SETTINGS)
    expect(reducer(onMap, { type: 'continue', now: T1 }).scene).toEqual({ name: 'main' })
  })

  it('セーブデータがなければ、つづきからは何もしない', () => {
    const s = titleWithoutSave()
    expect(reducer(s, { type: 'continue', now: T1 })).toBe(s)
  })
})

describe('遊び直しと経験値', () => {
  it('終えたイベントは遊び直せるが、経験値も記録も増えない', () => {
    let s = playWholeEvent(reducer(titleWithoutSave(), { type: 'startNew', now: T0 }), 'event_001')
    const before = s.save
    s = playWholeEvent(s, 'event_001')
    expect(s.save).toBe(before)
  })

  it('書いて正解すると、選ぶより多い経験値が付き、知らせが出る', () => {
    let s = run(reducer(titleWithoutSave(), { type: 'startNew', now: T0 }), { type: 'startEvent', eventId: 'event_001', now: T1 })
    s = completeCurrentStep(completeCurrentStep(s)) // message, learn
    const xpBefore = s.save?.stats.xp ?? 0
    s = completeCurrentStep(s, 'write') // 最初の会話の往復を、すべて書いて正解
    const turns = content.conversations.find((c) => c.id === 'home_003')?.turns.filter((t) => t.choices !== undefined).length ?? 0
    expect(turns).toBeGreaterThan(0)
    expect((s.save?.stats.xp ?? 0) - xpBefore).toBe(turns * content.balance.xp.conversationWrite)
    expect(s.reward).toMatchObject({ xp: content.balance.xp.conversationWrite })
    expect(reducer(s, { type: 'dismissReward' }).reward).toBeNull()
  })

  it('「答えを見る」で進んでも、先へは進めるが経験値は付かない', () => {
    let s = run(reducer(titleWithoutSave(), { type: 'startNew', now: T0 }), { type: 'startEvent', eventId: 'event_001', now: T1 })
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
    let s = reducer(titleWithoutSave(), { type: 'startNew', now: T0 })
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
    let s = reducer(titleWithoutSave(), { type: 'startNew', now: T0 })
    s = reducer(s, { type: 'startEvent', eventId: 'event_001', now: T1 })
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
    expect(createInitialState(b.load, b.backupKey, DEFAULT_SETTINGS).save?.progress.currentLocationId).toBe('cafe')
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

describe('はじめからの案内と学習画面', () => {
  const withHangul = createGameReducer({
    events: content.events,
    balance: content.balance,
    locationIds: new Set(content.locations.map((l) => l.id)),
    firstHangulLessonId: 'hangul_001',
  })
  const go = (state: GameState, ...actions: GameAction[]) => actions.reduce(withHangul, state)
  const home = { name: 'location', locationId: content.balance.startLocation } as const

  it('ハングルのレッスンがなければ、はじめからで最初の施設に行く', () => {
    expect(run(titleWithoutSave(), { type: 'startNew', now: T0 }).scene).toEqual(home)
  })

  it('レッスンがあれば、はじめからの直後にハングルから学ぶかを聞く。「このまま始める」で最初の施設へ', () => {
    const s = go(titleWithoutSave(), { type: 'startNew', now: T0 })
    expect(s.scene).toEqual({ name: 'onboarding' })
    expect(s.save).not.toBeNull()
    expect(go(s, { type: 'chooseOnboarding', learnHangul: false }).scene).toEqual(home)
  })

  it('「ハングルから学ぶ」でレッスン1を始め、閉じると最初の施設（物語の始まり）に戻る', () => {
    const s = go(titleWithoutSave(), { type: 'startNew', now: T0 }, { type: 'chooseOnboarding', learnHangul: true })
    expect(s.scene).toEqual({ name: 'hangulLesson', lessonId: 'hangul_001', back: home, onboarding: true })
    expect(go(s, { type: 'closeStudyScene' }).scene).toEqual(home)
    expect(go(s, { type: 'back', now: T1 }).scene).toEqual(home)
  })

  it('自宅から学習画面 → ハングル → レッスンと開き、戻るで1つずつ戻る', () => {
    const atHome = go(titleWithoutSave(), { type: 'startNew', now: T0 }, { type: 'chooseOnboarding', learnHangul: false })
    const lesson = go(atHome, { type: 'openStudy' }, { type: 'openHangul' }, { type: 'openHangulLesson', lessonId: 'hangul_002' })
    expect(lesson.scene).toMatchObject({ name: 'hangulLesson', lessonId: 'hangul_002', onboarding: false, back: { name: 'hangul', back: { name: 'study', back: home } } })
    const back1 = go(lesson, { type: 'back', now: T1 })
    expect(back1.scene.name).toBe('hangul')
    expect(go(back1, { type: 'closeStudyScene' }, { type: 'closeStudyScene' }).scene).toEqual(home)
    expect(go(atHome, { type: 'openStudy' }, { type: 'openListening' }).scene).toMatchObject({ name: 'listening', back: { name: 'study' } })
  })

  it('決まった順でしか開けない（学習画面を経ずにレッスンは開けない）', () => {
    const atHome = go(titleWithoutSave(), { type: 'startNew', now: T0 }, { type: 'chooseOnboarding', learnHangul: false })
    expect(go(atHome, { type: 'openHangulLesson', lessonId: 'hangul_001' })).toBe(atHome)
    expect(go(atHome, { type: 'openListening' })).toBe(atHome)
    expect(go(titleWithoutSave(), { type: 'openStudy' }).scene).toEqual({ name: 'title' })
  })

  it('小テストの合格とリスニングの正解で経験値が付き、知らせを出す', () => {
    const atHome = go(titleWithoutSave(), { type: 'startNew', now: T0 }, { type: 'chooseOnboarding', learnHangul: false })
    const passed = go(atHome, { type: 'hangulLessonPassed', lessonId: 'hangul_001', score: 88, now: T1 })
    expect(passed.save?.learning.hangul['hangul_001']).toEqual({ passedAt: T1, bestScore: 88 })
    expect(passed.reward).toMatchObject({ xp: content.balance.xp.hangulLesson })
    expect(go(passed, { type: 'hangulLessonPassed', lessonId: 'hangul_001', score: 50, now: T1 })).toBe(passed)
    const heard = go(atHome, { type: 'listeningCorrect', key: 'word:vocab_001', now: T1 })
    expect(heard.save?.stats.xp).toBe(content.balance.xp.listening)
    expect(go(heard, { type: 'listeningCorrect', key: 'word:vocab_001', now: T1 })).toBe(heard)
  })
})
