import { describe, expect, it } from 'vitest'
import { assets, backgroundImage, content } from '../data'
import { backdropFor, eventBackdrop, isRoomBackdrop, sceneBackground } from './backdrop'

describe('画面の後ろに敷く絵', () => {
  it('マップ画面では敷かない（マップの絵が二重に見えないように）', () => {
    expect(backdropFor({ name: 'main' })).toBeUndefined()
  })

  it('マップ画面から開いた設定・図鑑でも敷かない', () => {
    expect(backdropFor({ name: 'settings', back: { name: 'main' } })).toBeUndefined()
    expect(backdropFor({ name: 'dictionary', back: { name: 'main' } })).toBeUndefined()
  })

  it('タイトル画面は街のマップを敷く', () => {
    expect(backdropFor({ name: 'title' })).toBe(assets.map ?? undefined)
    expect(backdropFor({ name: 'settings', back: { name: 'title' } })).toBe(assets.map ?? undefined)
  })

  it('施設・イベントと、そこから開いた設定・図鑑は、その施設の背景を敷く', () => {
    const home = backgroundImage('home')
    expect(backdropFor({ name: 'location', locationId: 'home' })).toBe(home)
    expect(backdropFor({ name: 'event', locationId: 'home' })).toBe(home)
    expect(backdropFor({ name: 'dictionary', back: { name: 'location', locationId: 'home' } })).toBe(home)
  })
})

describe('イベント中の背景（background の段階）', () => {
  const home = backgroundImage('home')
  const entrance = backgroundImage('entrance') ?? home
  const event = content.events.find((e) => e.id === 'event_001')
  const at = (type: string, id?: string) => event?.steps.findIndex((s) => s.type === type && (id === undefined || ('id' in s && s.id === id))) ?? -1

  it('event_001：最初の案内文は部屋、玄関に切り替えてから home_006 までは玄関、コラムは部屋', () => {
    const run = (step: number) => ({ eventId: 'event_001', step, replay: false })
    expect(eventBackdrop('home', run(0))).toBe(home)
    expect(eventBackdrop('home', run(at('learn')))).toBe(entrance)
    expect(eventBackdrop('home', run(at('conversation', 'home_005')))).toBe(entrance)
    expect(eventBackdrop('home', run(at('conversation', 'home_006')))).toBe(entrance)
    expect(eventBackdrop('home', run(at('column', 'column_001')))).toBe(home)
  })

  it('玄関の画像がある', () => {
    expect(backgroundImage('entrance')).toBeDefined()
  })

  it('設定を開いても、イベント中の背景のまま', () => {
    const run = { eventId: 'event_001', step: at('conversation', 'home_005'), replay: false }
    expect(backdropFor({ name: 'settings', back: { name: 'event', locationId: 'home' } }, run)).toBe(entrance)
  })
})

describe('引っ越したばかりの自宅（Phase 4 計画 Q1）', () => {
  const home = backgroundImage('home')
  const moving = backgroundImage('home_moving')

  it('引っ越しを終えるまでは、自宅を home_moving の絵にする（施設の画面・イベント・おはなしの home）', () => {
    expect(moving).toBeDefined()
    expect(sceneBackground('home', false)).toBe(moving)
    expect(sceneBackground('home', true)).toBe(home)
    expect(sceneBackground('home_moving', true)).toBe(moving)
    expect(backdropFor({ name: 'location', locationId: 'home' }, null, false)).toBe(moving)
    expect(eventBackdrop('home', { eventId: 'event_001', step: 0, replay: false }, false)).toBe(moving)
    expect(eventBackdrop('home', { eventId: 'event_001', step: 2, replay: false }, false)).toBe(backgroundImage('entrance'))
  })

  it('家具を重ねるのは、自宅のふだんの絵だけ（引っ越したばかりの部屋・ほかの施設には重ねない）', () => {
    expect(isRoomBackdrop(home)).toBe(true)
    expect(isRoomBackdrop(moving)).toBe(false)
    expect(isRoomBackdrop(backgroundImage('cafe'))).toBe(false)
    expect(isRoomBackdrop(undefined)).toBe(false)
  })
})
