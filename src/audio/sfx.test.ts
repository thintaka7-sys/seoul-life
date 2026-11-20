import { describe, expect, it } from 'vitest'
import { SFX_NAMES, SFX_RECIPES, createSfxPlayer, playSfx, recipeLength } from './sfx'

describe('効果音の作り方', () => {
  it('どの効果音も短く（1秒まで）、小さめの音（0.2まで）にしている', () => {
    for (const name of SFX_NAMES) {
      const notes = SFX_RECIPES[name]
      expect(notes.length, name).toBeGreaterThan(0)
      expect(recipeLength(notes), name).toBeLessThanOrEqual(1)
      for (const n of notes) {
        expect(n.gain, name).toBeGreaterThan(0)
        expect(n.gain, name).toBeLessThanOrEqual(0.2)
        expect(n.freq, name).toBeGreaterThanOrEqual(100)
        expect(n.freq, name).toBeLessThanOrEqual(4000)
      }
    }
  })

  it('音を出せない環境（準備前）でも、鳴らそうとして止まらない', () => {
    expect(() => playSfx('correct')).not.toThrow()
  })
})

/** 偽の音の部品。resume を呼ぶと、許される状況なら running になる */
function fakeEnv({ allowResume = true }: { allowResume?: boolean } = {}) {
  const listeners = new Map<string, () => void>()
  let active = false
  const played: string[] = []
  let created = 0
  const ctx = {
    state: 'suspended',
    warmedUp: 0,
    resume() {
      if (allowResume && active) ctx.state = 'running'
      return Promise.resolve()
    },
    play(notes: readonly { freq: number }[]) {
      played.push(String(notes[0]?.freq))
    },
    warmUp() {
      ctx.warmedUp++
    },
  }
  const env = {
    target: { addEventListener: (type: string, fn: () => void) => listeners.set(type, fn) },
    createContext: () => {
      created++
      return ctx
    },
    isUserActive: () => active,
  }
  /** 操作を起こす。activates はその操作が「音を出してよい操作」か */
  const fire = (type: string, activates: boolean) => {
    active = activates
    listeners.get(type)?.()
    active = false
  }
  const during = (fn: () => void) => {
    active = true
    fn()
    active = false
  }
  return { env, ctx, fire, during, played, listeners, created: () => created }
}

describe('効果音の準備（BUG-002）', () => {
  it('指を離したとき・タップでも準備を待つ', () => {
    const f = fakeEnv()
    createSfxPlayer(f.env).init()
    for (const type of ['pointerup', 'touchend', 'click']) expect(f.listeners.has(type), type).toBe(true)
  })

  it('スマホで指が触れた瞬間（音を出してよい操作でない）に失敗しても、次のタップで準備できる', async () => {
    const f = fakeEnv()
    const p = createSfxPlayer(f.env)
    p.init()
    f.fire('pointerdown', false)
    expect(f.created()).toBe(0)
    f.fire('click', true)
    await Promise.resolve()
    expect(f.ctx.state).toBe('running')
    expect(f.ctx.warmedUp).toBe(1)
    p.play('correct')
    expect(f.played).toHaveLength(1)
  })

  it('準備の後で止まっても（iPhone の interrupted）、次の操作で再開する', async () => {
    const f = fakeEnv()
    const p = createSfxPlayer(f.env)
    p.init()
    f.fire('touchend', true)
    await Promise.resolve()
    f.ctx.state = 'interrupted'
    p.play('correct')
    expect(f.played).toHaveLength(0)
    f.fire('pointerup', true)
    await Promise.resolve()
    expect(f.ctx.state).toBe('running')
    expect(f.created()).toBe(1)
  })

  it('ボタンを押したときに止まっていたら、再開してから鳴らす', async () => {
    const f = fakeEnv()
    const p = createSfxPlayer(f.env)
    f.during(() => p.play('wrong'))
    await Promise.resolve()
    await Promise.resolve()
    expect(f.played).toEqual([String(SFX_RECIPES.wrong[0]?.freq)])
  })

  it('操作の外では音の部品を作らない・鳴らさない（ブラウザの警告を出さない）', () => {
    const f = fakeEnv()
    const p = createSfxPlayer(f.env)
    p.init()
    p.play('xp')
    f.fire('pointerdown', false)
    expect(f.created()).toBe(0)
    expect(f.played).toHaveLength(0)
  })

  it('設定でオフのときは鳴らさない', async () => {
    const f = fakeEnv()
    const p = createSfxPlayer(f.env)
    p.setEnabled(false)
    f.during(() => p.play('correct'))
    await Promise.resolve()
    expect(f.played).toHaveLength(0)
  })
})
