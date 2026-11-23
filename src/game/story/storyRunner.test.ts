import { describe, expect, it } from 'vitest'
import type { Story } from '../../data/types'
import { advanceStory, chooseInStory, currentShown, skipStory, startStory, type StoryState } from './storyRunner'

const line = (speaker: string, korean: string, extra: Record<string, unknown> = {}) => ({ type: 'line' as const, speaker, korean, pronunciation: 'ア', japanese: '訳', ...extra })

const story: Story = {
  id: 'story_001',
  chapter: 1,
  titleJa: '到着',
  bgm: 'story',
  reviewed: false,
  beats: [
    { type: 'scene', background: 'airport', image: 'arrival' },
    { type: 'sfx', id: 'door_bell' },
    { type: 'narration', textJa: '空港に着いた。' },
    line('airport_staff', '안녕하세요.', { expression: 'smile' }),
    {
      type: 'choice',
      choices: [
        { korean: '네.', pronunciation: 'ネ', japanese: 'はい。', reply: [{ speaker: 'airport_staff', korean: '감사합니다.', pronunciation: 'カムサハムニダ', japanese: 'ありがとう。' }, { speaker: 'airport_staff', korean: '네.', pronunciation: 'ネ', japanese: 'はい。' }] },
        { korean: '아니요.', pronunciation: 'アニヨ', japanese: 'いいえ。', reply: [{ speaker: 'airport_staff', korean: '네?', pronunciation: 'ネ', japanese: 'はい？', expression: 'troubled' }] },
      ],
    },
    { type: 'scene', background: 'home', image: null, call: 'teacher' },
    { type: 'bgm', id: 'home' },
    line('teacher', '안녕하세요!', { expression: 'smile' }),
    line('player', '안녕하세요.'),
    { type: 'sign', korean: '입국', pronunciation: 'イプクク', japanese: '入国' },
    { type: 'sfx', id: 'call' },
  ],
}

/** 選択でなければ次へ、選択なら index の返事を選ぶ */
function step(s: StoryState, choice = 0): StoryState {
  return currentShown(story, s)?.kind === 'choice' ? chooseInStory(story, s, choice) : advanceStory(story, s)
}

describe('おはなしの進行', () => {
  it('始めると、場面・効果音を反映して最初の画面に出す段階を見せる', () => {
    const s = startStory(story, 'home')
    expect(currentShown(story, s)).toEqual({ kind: 'narration', textJa: '空港に着いた。' })
    expect(s.stage).toMatchObject({ background: 'airport', image: 'arrival', character: null, call: null })
    expect(s.sfx).toEqual({ id: 'door_bell', seq: 1 })
    expect(s.bgm).toBe('story')
    expect(s.log).toEqual([{ kind: 'narration', textJa: '空港に着いた。' }])
  })

  it('台詞を話した人の立ち絵と表情にする', () => {
    const s = advanceStory(story, startStory(story, 'home'))
    expect(s.stage).toMatchObject({ character: 'airport_staff', expression: 'smile' })
  })

  it('選択では選ぶまで進まず、選んだ返事をログに入れて反応を順に見せる', () => {
    let s = advanceStory(story, advanceStory(story, startStory(story, 'home')))
    expect(currentShown(story, s)?.kind).toBe('choice')
    expect(advanceStory(story, s)).toBe(s)
    s = chooseInStory(story, s, 0)
    expect(currentShown(story, s)).toMatchObject({ kind: 'line', line: { korean: '감사합니다.' } })
    expect(s.log.at(-2)).toEqual({ kind: 'line', speaker: 'player', korean: '네.', pronunciation: 'ネ', japanese: 'はい。' })
    s = advanceStory(story, s)
    expect(currentShown(story, s)).toMatchObject({ kind: 'line', line: { korean: '네.' } })
    s = advanceStory(story, s)
    expect(currentShown(story, s)).toMatchObject({ kind: 'line', line: { speaker: 'teacher' } })
  })

  it('別の返事を選ぶと、反応だけが変わる', () => {
    let s = advanceStory(story, advanceStory(story, startStory(story, 'home')))
    s = chooseInStory(story, s, 1)
    expect(currentShown(story, s)).toMatchObject({ kind: 'line', line: { korean: '네?' } })
    expect(s.stage.expression).toBe('troubled')
  })

  it('ビデオ通話の人の台詞は、通話の枠の表情を変え、立ち絵は変えない。主人公の台詞では舞台を変えない', () => {
    let s = startStory(story, 'home')
    for (let i = 0; i < 5; i++) s = step(s)
    expect(currentShown(story, s)).toMatchObject({ kind: 'line', line: { speaker: 'teacher' } })
    expect(s.stage).toMatchObject({ background: 'home', image: null, call: 'teacher', callExpression: 'smile', character: 'airport_staff' })
    expect(s.bgm).toBe('home')
    const before = s.stage
    s = advanceStory(story, s)
    expect(s.stage).toEqual(before)
  })

  it('最後まで進むと終わる。最後の効果音も鳴らす', () => {
    let s = startStory(story, 'home')
    for (let i = 0; i < 20 && !s.done; i++) s = step(s)
    expect(s.done).toBe(true)
    expect(currentShown(story, s)).toBeNull()
    expect(s.sfx).toEqual({ id: 'call', seq: 2 })
    expect(s.log.map((l) => l.kind)).toEqual(['narration', 'line', 'line', 'line', 'line', 'line', 'line', 'sign'])
  })

  it('飛ばすと、すぐ終わる', () => {
    const s = skipStory(story, startStory(story, 'home'))
    expect(s.done).toBe(true)
    expect(advanceStory(story, s)).toBe(s)
  })
})
