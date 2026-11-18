import { describe, expect, it } from 'vitest'
import { createNewSave } from '../storage/saveData'
import { SAVE_KEY, loadSave } from '../storage/saveStore'
import { MemoryStorage } from '../storage/testing'
import { boot } from './boot'
import { createGameReducer, createInitialState, type GameState } from './gameState'

const T0 = '2026-11-18T10:00:00.000Z'
const T1 = '2026-11-18T10:05:00.000Z'
const reducer = createGameReducer(new Set(['home', 'cafe']))

function titleWithoutSave(): GameState {
  return createInitialState({ kind: 'empty' }, null)
}

describe('画面遷移', () => {
  it('タイトル → はじめから → マップ → 施設 → 会話 → 施設 → マップ → タイトル', () => {
    let s = titleWithoutSave()
    expect(s.scene).toEqual({ name: 'title' })

    s = reducer(s, { type: 'startNew', now: T0 })
    expect(s.scene).toEqual({ name: 'main' })
    expect(s.save).toEqual(createNewSave(T0))

    s = reducer(s, { type: 'goToLocation', locationId: 'cafe', now: T1 })
    expect(s.scene).toEqual({ name: 'location', locationId: 'cafe' })
    expect(s.save?.progress.currentLocationId).toBe('cafe')
    expect(s.save?.updatedAt).toBe(T1)

    s = reducer(s, { type: 'talk', conversationId: 'cafe_901' })
    expect(s.scene).toEqual({ name: 'conversation', locationId: 'cafe', conversationId: 'cafe_901' })

    s = reducer(s, { type: 'endConversation' })
    expect(s.scene).toEqual({ name: 'location', locationId: 'cafe' })

    s = reducer(s, { type: 'backToMap', now: T1 })
    expect(s.scene).toEqual({ name: 'main' })
    expect(s.save?.progress.currentLocationId).toBeNull()

    s = reducer(s, { type: 'backToTitle' })
    expect(s.scene).toEqual({ name: 'title' })
  })

  it('タイトル ⇄ 設定', () => {
    let s = reducer(titleWithoutSave(), { type: 'openSettings' })
    expect(s.scene).toEqual({ name: 'settings' })
    s = reducer(s, { type: 'closeSettings' })
    expect(s.scene).toEqual({ name: 'title' })
  })

  it('存在しない施設には移動しない', () => {
    const s = reducer(titleWithoutSave(), { type: 'startNew', now: T0 })
    expect(reducer(s, { type: 'goToLocation', locationId: 'school', now: T1 })).toBe(s)
  })

  it('施設の外からは会話を始めない', () => {
    const s = reducer(titleWithoutSave(), { type: 'startNew', now: T0 })
    expect(reducer(s, { type: 'talk', conversationId: 'cafe_901' })).toBe(s)
  })

  it('画面遷移だけではセーブデータを作り直さない（保存回数を増やさない）', () => {
    let s = reducer(titleWithoutSave(), { type: 'startNew', now: T0 })
    s = reducer(s, { type: 'goToLocation', locationId: 'cafe', now: T1 })
    const save = s.save
    s = reducer(s, { type: 'talk', conversationId: 'cafe_901' })
    s = reducer(s, { type: 'endConversation' })
    s = reducer(s, { type: 'backToTitle' })
    expect(s.save).toBe(save)
  })
})

describe('つづきから', () => {
  it('セーブデータがなければ何もしない', () => {
    const s = titleWithoutSave()
    expect(reducer(s, { type: 'continue' })).toBe(s)
  })

  it('施設の中で終えていたら、その施設から再開する', () => {
    const save = { ...createNewSave(T0), progress: { ...createNewSave(T0).progress, currentLocationId: 'cafe' } }
    const s = createInitialState({ kind: 'ok', data: save, raw: '', migratedFrom: null }, null)
    expect(reducer(s, { type: 'continue' }).scene).toEqual({ name: 'location', locationId: 'cafe' })
  })

  it('マップで終えていた、または施設がなくなっていたら、マップから再開する', () => {
    const onMap = createInitialState({ kind: 'ok', data: createNewSave(T0), raw: '', migratedFrom: null }, null)
    expect(reducer(onMap, { type: 'continue' }).scene).toEqual({ name: 'main' })
    const removed = { ...createNewSave(T0), progress: { ...createNewSave(T0).progress, currentLocationId: 'old_shop' } }
    const s = createInitialState({ kind: 'ok', data: removed, raw: '', migratedFrom: null }, null)
    expect(reducer(s, { type: 'continue' }).scene).toEqual({ name: 'main' })
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
  it('セーブデータがなければタイトルから、つづきからは選べない', () => {
    const b = boot(new MemoryStorage(), new Date(T0))
    const s = createInitialState(b.load, b.backupKey)
    expect(s.scene).toEqual({ name: 'title' })
    expect(s.save).toBeNull()
    expect(s.storageAvailable).toBe(true)
  })

  it('保存できない環境では storageAvailable が false', () => {
    const b = boot(null, new Date(T0))
    expect(createInitialState(b.load, b.backupKey).storageAvailable).toBe(false)
  })

  it('壊れたデータは退避してからエラー画面を出し、元のキーも残す', () => {
    const storage = new MemoryStorage()
    storage.setItem(SAVE_KEY, '{broken')
    const b = boot(storage, new Date(T0))
    expect(b.backupKey).not.toBeNull()
    expect(storage.getItem(b.backupKey ?? '')).toBe('{broken')
    expect(storage.getItem(SAVE_KEY)).toBe('{broken')

    const s = createInitialState(b.load, b.backupKey)
    expect(s.scene).toMatchObject({ name: 'saveError', reason: 'parse_error', backupKey: b.backupKey })
    expect(s.save).toBeNull()

    // 新しく始めると、新しいデータで遊べる（退避したデータは残っている）
    const started = reducer(s, { type: 'startNew', now: T1 })
    expect(started.save).toEqual(createNewSave(T1))
  })

  it('正常なデータは読み込まれ、退避はしない', () => {
    const storage = new MemoryStorage()
    storage.setItem(SAVE_KEY, JSON.stringify(createNewSave(T0)))
    const b = boot(storage, new Date(T1))
    expect(b.backupKey).toBeNull()
    expect(createInitialState(b.load, b.backupKey).save).toEqual(createNewSave(T0))
    expect(loadSave(storage).kind).toBe('ok')
  })
})
