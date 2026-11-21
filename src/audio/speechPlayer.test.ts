import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CANCEL_GAP_MS, REPEAT_GAP_MS, createSpeechPlayer, judgeRateSupport, type UtteranceLike } from './speechPlayer'

describe('judgeRateSupport（速さの指定が効いているか）', () => {
  it('ゆっくりが、ふつうの1.15倍以上の長さなら効いている', () => {
    expect(judgeRateSupport(1000, 1600)).toBe('works')
    expect(judgeRateSupport(1000, 1150)).toBe('works')
    expect(judgeRateSupport(1000, 1050)).toBe('ignored')
    expect(judgeRateSupport(1000, 1000)).toBe('ignored')
  })

  it('どちらかがない・短すぎて測れないときは、まだ分からない', () => {
    expect(judgeRateSupport(undefined, 1000)).toBe('unknown')
    expect(judgeRateSupport(1000, undefined)).toBe('unknown')
    expect(judgeRateSupport(100, 100)).toBe('unknown')
  })
})

/** 偽の端末。honorsRate が false なら、速さの指定を無視して、いつも同じ長さで読む */
function fakeDevice(honorsRate: boolean) {
  const log: { text: string; rate: number; startAt: number; endAt: number }[] = []
  const cancels: number[] = []
  const player = createSpeechPlayer(
    {
      cancel: () => cancels.push(Date.now()),
      speak: (u: UtteranceLike) => {
        const length = honorsRate ? 1000 / u.rate : 1000
        setTimeout(() => {
          const startAt = Date.now()
          u.onstart?.(undefined as never)
          setTimeout(() => {
            log.push({ text: u.text, rate: u.rate, startAt, endAt: Date.now() })
            u.onend?.(undefined as never)
          }, length)
        }, 10)
      },
      utterance: (text) => ({ text, lang: 'ko-KR', rate: 1, onstart: null, onend: null, onerror: null }),
      now: () => Date.now(),
      later: (fn, ms) => setTimeout(fn, ms),
    },
    (speed) => (speed === 'slow' ? 0.5 : 1),
  )
  return { player, log, cancels }
}

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

async function run(p: Promise<unknown>) {
  await vi.runAllTimersAsync()
  await p
}

describe('createSpeechPlayer（読み上げの再生）', () => {
  it('止めてから、少し間を置いて読む', async () => {
    const { player, log, cancels } = fakeDevice(true)
    const t0 = Date.now()
    await run(player.speak('불', 'normal'))
    expect(cancels).toEqual([t0])
    expect((log[0]?.startAt ?? 0) - t0).toBeGreaterThanOrEqual(CANCEL_GAP_MS)
  })

  it('速さが効く端末：「ゆっくり」は 0.5 で1回だけ読み、「効いている」と判断する', async () => {
    const { player, log } = fakeDevice(true)
    await run(player.speak('안녕하세요', 'normal'))
    await run(player.speak('안녕하세요', 'slow', { slowButton: true }))
    expect(log.map((l) => l.rate)).toEqual([1, 0.5])
    expect(player.getState()).toEqual({ support: 'works', noticePending: false })
  })

  it('速さが効かない端末：分かったその場でもう1回読み、知らせを出す。次からは、間を空けて2回くり返す', async () => {
    const { player, log } = fakeDevice(false)
    await run(player.speak('안녕하세요', 'normal'))
    await run(player.speak('안녕하세요', 'slow', { slowButton: true }))
    // ふつう → ゆっくり（効かない）→ その場でもう1回
    expect(log.map((l) => l.rate)).toEqual([1, 0.5, 1])
    expect(player.getState()).toEqual({ support: 'ignored', noticePending: true })
    player.clearNotice()
    expect(player.getState().noticePending).toBe(false)

    log.length = 0
    await run(player.speak('불', 'slow', { slowButton: true }))
    expect(log.map((l) => [l.text, l.rate])).toEqual([
      ['불', 1],
      ['불', 1],
    ])
    expect((log[1]?.startAt ?? 0) - (log[0]?.endAt ?? 0)).toBeGreaterThanOrEqual(REPEAT_GAP_MS)
  })

  it('速さが効かない端末でも、設定の「ゆっくり」（ボタンでない読み上げ）はくり返さない', async () => {
    const { player, log } = fakeDevice(false)
    await run(player.speak('안녕하세요', 'normal'))
    await run(player.speak('안녕하세요', 'slow'))
    log.length = 0
    await run(player.speak('불', 'slow'))
    expect(log).toHaveLength(1)
  })

  it('くり返しの途中で別の言葉を読んだら、残りのくり返しはやめる', async () => {
    const { player, log } = fakeDevice(false)
    await run(player.speak('안녕하세요', 'normal'))
    await run(player.speak('안녕하세요', 'slow', { slowButton: true }))
    log.length = 0
    const first = player.speak('불', 'slow', { slowButton: true })
    await vi.advanceTimersByTimeAsync(CANCEL_GAP_MS + 10 + 1000 + 100)
    const second = player.speak('풀', 'normal')
    await run(Promise.all([first, second]))
    expect(log.map((l) => l.text)).toEqual(['불', '풀'])
  })

  it('読み上げの確認：ふつう → ゆっくりの長さを返し、判断を更新する', async () => {
    const works = fakeDevice(true)
    const p = works.player.measure('안녕하세요')
    await vi.runAllTimersAsync()
    expect(await p).toEqual({ normal: 1000, slow: 2000, support: 'works' })

    const ignored = fakeDevice(false)
    const q = ignored.player.measure('안녕하세요')
    await vi.runAllTimersAsync()
    expect(await q).toEqual({ normal: 1000, slow: 1000, support: 'ignored' })
    expect(ignored.player.getState()).toEqual({ support: 'ignored', noticePending: true })
  })
})
