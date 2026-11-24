import { describe, expect, it } from 'vitest'
import { AFTER_CAPTURE_MS, SPEECH_HOLD_MAX_MS, SPEECH_HOLD_TIMEOUT_MS, createAudioSessionController, type AudioSessionLike, type AudioSessionType } from './audioSession'

/** 入れた値をすべて記録する audioSession と、手で進めるタイマー */
function setupWithLog(initial: AudioSessionType = 'auto') {
  const log: AudioSessionType[] = []
  let type = initial
  const session: AudioSessionLike = {
    get type() {
      return type
    },
    set type(v: AudioSessionType) {
      type = v
      log.push(v)
    },
  }
  const timers: { fn: () => void; at: number }[] = []
  let t = 0
  const c = createAudioSessionController(
    session,
    () => t,
    (fn, ms) => void timers.push({ fn, at: t + ms }),
  )
  const advance = (ms: number) => {
    t += ms
    for (const timer of timers.filter((x) => x.at <= t)) {
      timers.splice(timers.indexOf(timer), 1)
      timer.fn()
    }
  }
  return { session, c, log, advance }
}

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

  it('「読み上げ中」のまま変わらない端末でも、長く経ったら戻す', () => {
    const { session, c, advance } = setup()
    c.hold()
    advance(SPEECH_HOLD_MAX_MS - 1)
    c.check(true)
    expect(session.type).toBe('playback')
    advance(2)
    c.check(true)
    expect(session.type).toBe('ambient')
  })

  it('起動時は、すでに ambient でも、一度 auto にしてから ambient にかけ直す（前のページのマイクの扱いを解くため）', () => {
    const { session, c, log } = setupWithLog('ambient')
    c.start()
    expect(log).toEqual(['auto', 'ambient'])
    expect(session.type).toBe('ambient')
  })

  it('マイクで聞いている間は止めておき、閉じたら ambient をかけ直して、少し待ってから音を戻す', () => {
    const { c, log, advance } = setupWithLog('ambient')
    let changes = 0
    c.subscribe(() => (changes += 1))
    c.setCapturing(true)
    expect(c.unsafe()).toBe(true)
    expect(changes).toBe(1)
    c.setCapturing(false)
    // 閉じた直後にかけ直す。まだ音は戻さない
    expect(log).toEqual(['auto', 'ambient'])
    expect(c.unsafe()).toBe(true)
    advance(AFTER_CAPTURE_MS - 1)
    expect(c.unsafe()).toBe(true)
    advance(1)
    // 待った後にもう一度かけ直してから、音を戻す
    expect(log).toEqual(['auto', 'ambient', 'auto', 'ambient'])
    expect(c.unsafe()).toBe(false)
    expect(changes).toBe(2)
  })

  it('かけ直しの途中でまたマイクを使い始めたら、前のかけ直しでは音を戻さない', () => {
    const { c, advance } = setupWithLog('ambient')
    c.setCapturing(true)
    c.setCapturing(false)
    c.setCapturing(true)
    advance(AFTER_CAPTURE_MS)
    expect(c.unsafe()).toBe(true)
    c.setCapturing(false)
    advance(AFTER_CAPTURE_MS)
    expect(c.unsafe()).toBe(false)
  })

  it('読み上げの間にマイクを閉じたら、playback のまま。読み上げが終わったら ambient に戻す', () => {
    const { session, c, advance } = setupWithLog('ambient')
    c.setCapturing(true)
    const release = c.hold()
    c.setCapturing(false)
    advance(AFTER_CAPTURE_MS)
    expect(session.type).toBe('playback')
    expect(c.unsafe()).toBe(true)
    release()
    expect(session.type).toBe('ambient')
    expect(c.unsafe()).toBe(false)
  })

  it('設定「話して答えたあと止める」がオンなら、マイクを使った後はずっと止めておく。オフにしたら戻す', () => {
    const { c, advance } = setupWithLog('ambient')
    let changes = 0
    c.subscribe(() => (changes += 1))
    c.setQuietAfterMic(true)
    // まだマイクを使っていない：止めない
    expect(c.quiet()).toBe(false)
    expect(changes).toBe(0)
    c.setCapturing(true)
    c.setCapturing(false)
    advance(AFTER_CAPTURE_MS)
    expect(c.unsafe()).toBe(false)
    expect(c.quiet()).toBe(true)
    // 読み上げの後も止めたまま
    c.hold()()
    expect(c.quiet()).toBe(true)
    const before = changes
    c.setQuietAfterMic(false)
    expect(c.quiet()).toBe(false)
    expect(changes).toBe(before + 1)
    c.setQuietAfterMic(true)
    expect(c.quiet()).toBe(true)
  })

  it('audioSession がないブラウザでも、設定「話して答えたあと止める」は効く', () => {
    const c = createAudioSessionController(undefined, () => 0, () => {})
    c.setQuietAfterMic(true)
    c.setCapturing(true)
    c.setCapturing(false)
    expect(c.quiet()).toBe(true)
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
