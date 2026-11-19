import { describe, expect, it } from 'vitest'
import { assets, backgroundImage } from '../data'
import { backdropFor } from './backdrop'

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
