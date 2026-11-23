import { describe, expect, it } from 'vitest'
import { SPEECH_HOLD_TIMEOUT_MS, createAudioSessionController, type AudioSessionLike } from './audioSession'

function setup() {
  const session: AudioSessionLike = { type: 'auto' }
  let t = 0
  const c = createAudioSessionController(session, () => t)
  return { session, c, advance: (ms: number) => (t += ms) }
}

describe('マナーモードへの対応（audioSession）', () => {
  it('起動時は ambient（マナーモードでは BGM・効果音を鳴らさない）', () => {
    const { session, c } = setup()
    c.start()
    expect(session.type).toBe('ambient')
    expect(c.held()).toBe(false)
  })

  it('読み上げの間だけ playback にし、終わったら ambient に戻す', () => {
    const { session, c } = setup()
    c.start()
    let changes = 0
    c.subscribe(() => (changes += 1))
    const release = c.hold()
    expect(session.type).toBe('playback')
    expect(c.held()).toBe(true)
    release()
    expect(session.type).toBe('ambient')
    expect(c.held()).toBe(false)
    expect(changes).toBe(2)
    // 2回呼んでも変わらない
    release()
    expect(changes).toBe(2)
  })

  it('読み上げが重なったら、すべて終わるまで playback のまま', () => {
    const { session, c } = setup()
    const a = c.hold()
    const b = c.hold()
    a()
    expect(session.type).toBe('playback')
    b()
    expect(session.type).toBe('ambient')
  })

  it('終わりの知らせが来なくても、読み上げが止まって時間が経てば戻す。読み上げ中は戻さない', () => {
    const { session, c, advance } = setup()
    c.hold()
    advance(SPEECH_HOLD_TIMEOUT_MS + 1)
    c.check(true)
    expect(session.type).toBe('playback')
    c.check(false)
    expect(session.type).toBe('ambient')
    expect(c.held()).toBe(false)
  })

  it('audioSession がないブラウザでは何もしない', () => {
    const c = createAudioSessionController(undefined, () => 0)
    expect(c.supported).toBe(false)
    c.start()
    const release = c.hold()
    release()
    expect(c.held()).toBe(false)
  })
})
