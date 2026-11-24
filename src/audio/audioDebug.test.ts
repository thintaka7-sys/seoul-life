import { describe, expect, it } from 'vitest'
import { createAudioDebugLog, formatEntry, isAudioDebugSearch, isSuspicious, logAudio, audioDebugEntries, type AudioDebugEntry } from './audioDebug'

describe('音の記録（?debug=audio）', () => {
  it('URL に debug=audio があるときだけ有効にする', () => {
    expect(isAudioDebugSearch('?debug=audio')).toBe(true)
    expect(isAudioDebugSearch('?x=1&debug=audio')).toBe(true)
    expect(isAudioDebugSearch('')).toBe(false)
    expect(isAudioDebugSearch('?debug=')).toBe(false)
    expect(isAudioDebugSearch('?debug=other')).toBe(false)
    expect(isAudioDebugSearch('?audio=debug')).toBe(false)
  })

  it('ふだん（無効）は何も記録しない', () => {
    const log = createAudioDebugLog(false, () => 0, () => ({ type: 'ambient', state: '-' }))
    log.log('BGM：流す', true)
    expect(log.entries()).toEqual([])
    // ブラウザの外（テスト）では、モジュールの記録も無効
    logAudio('効果音：button', true)
    expect(audioDebugEntries()).toEqual([])
  })

  it('有効なときは、時刻・その時点の扱い・出来事を記録し、記録のたびに知らせる', () => {
    let t = 10.4
    let type = 'auto'
    const log = createAudioDebugLog(true, () => t, () => ({ type, state: 'inactive' }))
    let calls = 0
    const off = log.subscribe(() => calls++)
    log.log('ページを開いた')
    type = 'ambient'
    t = 250.6
    log.log('BGM：流す（home）', true)
    expect(log.entries()).toEqual([
      { at: 10, event: 'ページを開いた', sound: false, type: 'auto', state: 'inactive' },
      { at: 251, event: 'BGM：流す（home）', sound: true, type: 'ambient', state: 'inactive' },
    ])
    expect(calls).toBe(2)
    off()
    log.log('効果音：button', true)
    expect(calls).toBe(2)
  })

  it('記録は新しいものを残し、数を超えたら古いものから消す。記録が増えるたびに別の配列になる', () => {
    const log = createAudioDebugLog(true, () => 0, () => ({ type: 'ambient', state: '-' }), 3)
    const before = log.entries()
    for (const e of ['a', 'b', 'c', 'd']) log.log(e)
    expect(log.entries().map((e) => e.event)).toEqual(['b', 'c', 'd'])
    expect(log.entries()).not.toBe(before)
  })

  it('音を流し始めたのに ambient でない記録を、要注意にする（audioSession がない端末は対象外）', () => {
    const e = (type: string, sound: boolean): AudioDebugEntry => ({ at: 5, event: 'BGM：流す（home）', sound, type, state: '-' })
    expect(isSuspicious(e('ambient', true))).toBe(false)
    expect(isSuspicious(e('playback', true))).toBe(true)
    expect(isSuspicious(e('play-and-record', true))).toBe(true)
    expect(isSuspicious(e('auto', true))).toBe(true)
    expect(isSuspicious(e('playback', false))).toBe(false)
    expect(isSuspicious(e('なし', true))).toBe(false)
    expect(formatEntry(e('ambient', true))).toBe('+5ms type=ambient state=- BGM：流す（home）')
    expect(formatEntry(e('playback', true))).toBe('!! +5ms type=playback state=- BGM：流す（home）')
  })
})
