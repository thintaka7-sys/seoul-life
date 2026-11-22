import { describe, expect, it } from 'vitest'
import { STUDY_VOLUME } from '../audio/bgmTiming'
import { bgmFor } from './bgmScene'

describe('bgmFor', () => {
  it('タイトル・マップ・施設の曲', () => {
    expect(bgmFor({ name: 'title' })).toEqual({ track: 'title', level: 1 })
    expect(bgmFor({ name: 'main' })).toEqual({ track: 'map', level: 1 })
    expect(bgmFor({ name: 'location', locationId: 'home' })).toEqual({ track: 'home', level: 1 })
    expect(bgmFor({ name: 'location', locationId: 'cafe' })).toEqual({ track: 'cafe', level: 1 })
    expect(bgmFor({ name: 'location', locationId: 'park' })).toEqual({ track: 'map', level: 1 })
  })

  it('イベントは施設の曲。おはなしで指定した曲があればそれ、none なら止める', () => {
    const event = { name: 'event', locationId: 'home' } as const
    expect(bgmFor(event)).toEqual({ track: 'home', level: 1 })
    expect(bgmFor(event, 'story')).toEqual({ track: 'story', level: 1 })
    expect(bgmFor(event, 'none')).toEqual({ track: null, level: 1 })
  })

  it('学習画面は study を小さめに。設定・図鑑は開く前の画面と同じ', () => {
    const home = { name: 'location', locationId: 'home' } as const
    expect(bgmFor({ name: 'study', back: home })).toEqual({ track: 'study', level: STUDY_VOLUME })
    expect(bgmFor({ name: 'hangulLesson', lessonId: 'hangul_001', back: home, onboarding: false })).toEqual({ track: 'study', level: STUDY_VOLUME })
    expect(bgmFor({ name: 'settings', back: { name: 'study', back: home } })).toEqual({ track: 'study', level: STUDY_VOLUME })
    expect(bgmFor({ name: 'dictionary', back: home })).toEqual({ track: 'home', level: 1 })
  })

  it('アルバムから見るおはなしは、おはなしの曲（なければ開く前の画面の曲）', () => {
    const album = { name: 'album', back: { name: 'location', locationId: 'home' } } as const
    expect(bgmFor({ name: 'storyReplay', storyId: 'story_001', back: album })).toEqual({ track: 'home', level: 1 })
    expect(bgmFor({ name: 'storyReplay', storyId: 'story_001', back: album }, 'story')).toEqual({ track: 'story', level: 1 })
  })
})
