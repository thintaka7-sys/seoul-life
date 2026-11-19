import { describe, expect, it } from 'vitest'
import { assets, backgroundImage, content } from '../data'
import { backdropFor, eventBackdrop } from './backdrop'

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

  it('event_001：最初の案内文は部屋、玄関に切り替えてから home_004 までは玄関、コラムは部屋', () => {
    const run = (step: number) => ({ eventId: 'event_001', step, replay: false })
    expect(eventBackdrop('home', run(0))).toBe(home)
    expect(eventBackdrop('home', run(at('learn')))).toBe(entrance)
    expect(eventBackdrop('home', run(at('conversation', 'home_003')))).toBe(entrance)
    expect(eventBackdrop('home', run(at('conversation', 'home_004')))).toBe(entrance)
    expect(eventBackdrop('home', run(at('column', 'column_001')))).toBe(home)
  })

  it('玄関の画像がある', () => {
    expect(backgroundImage('entrance')).toBeDefined()
  })

  it('設定を開いても、イベント中の背景のまま', () => {
    const run = { eventId: 'event_001', step: at('conversation', 'home_003'), replay: false }
    expect(backdropFor({ name: 'settings', back: { name: 'event', locationId: 'home' } }, run)).toBe(entrance)
  })
})
