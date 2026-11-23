import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CANCEL_GAP_MS, REPEAT_GAP_MS, chooseSlowRate, createSpeechPlayer, engineMs, judgeRateSupport, judgeRatio, syllableCount, type UtteranceLike } from './speechPlayer'

describe('判断の決まり', () => {
  it('倍率：1.5倍以上は十分に遅い、1.3倍以上は少しだけ、それより小さければ遅くならない', () => {
    expect(judgeRatio(1.6)).toBe('works')
    expect(judgeRatio(1.5)).toBe('works')
    expect(judgeRatio(1.3)).toBe('weak')
    expect(judgeRatio(1.29)).toBe('ignored')
    expect(judgeRatio(1)).toBe('ignored')
  })

  it('長さがない・短すぎて測れないときは、まだ分からない', () => {
    expect(judgeRateSupport(undefined, 1000)).toBe('unknown')
    expect(judgeRateSupport(100, 100)).toBe('unknown')
    expect(judgeRateSupport(1000, 1600)).toBe('works')
  })

  it('音節の数（空白・句読点は数えない）', () => {
    expect(syllableCount('불')).toBe(1)
    expect(syllableCount('아메리카노 한 잔 주세요.')).toBe(10)
  })

  it('速さの選び方：十分に遅くなる最初の速さ → なければ少しは遅くなった中でいちばん遅い速さ → なければ null（2回くり返す）', () => {
    expect(chooseSlowRate([{ rate: 0.5, ms: 1600, ratio: 1.6 }])).toBe(0.5)
    expect(chooseSlowRate([{ rate: 0.5, ms: 1300, ratio: 1.3 }, { rate: 0.35, ms: 1500, ratio: 1.5 }])).toBe(0.35)
    expect(chooseSlowRate([{ rate: 0.5, ms: 1300, ratio: 1.3 }, { rate: 0.35, ms: 1400, ratio: 1.4 }, { rate: 0.2, ms: 1350, ratio: 1.35 }])).toBe(0.35)
    expect(chooseSlowRate([{ rate: 0.5, ms: 1050, ratio: 1.05 }, { rate: 0.35, ms: 1100, ratio: 1.1 }, { rate: 0.2, ms: 1100, ratio: 1.1 }])).toBeNull()
  })

  it('端末が知らせる「話していた時間」：秒で知らせる端末もある。おかしな値は使わない', () => {
    expect(engineMs(1.2, 1500)).toBe(1200)
    expect(engineMs(1200, 1500)).toBe(1200)
    expect(engineMs(0, 1500)).toBeNull()
    expect(engineMs(undefined, 1500)).toBeNull()
    expect(engineMs(5000, 1500)).toBeNull()
  })
})

/**
 * 偽の端末。1音節200ミリ秒（速さ1）。
 * - strength：速さの指定の効き方（1＝そのまま効く、0.3＝弱く効く、0＝効かない）
 * - latency：読み始めの知らせ（onstart）から、実際に声が出るまでの待ち時間（時刻で測ると長さに入る）
 * - reportsElapsed：読み終わりに「話していた時間」（待ち時間を含まない）を知らせるか
 */
function fakeDevice({ strength = 1, latency = 0, reportsElapsed = false } = {}) {
  const log: { text: string; rate: number; startAt: number; endAt: number }[] = []
  const cancels: number[] = []
  const player = createSpeechPlayer({
    cancel: () => cancels.push(Date.now()),
    speak: (u: UtteranceLike) => {
      const audio = 200 * syllableCount(u.text) * (1 + (1 / u.rate - 1) * strength)
      setTimeout(() => {
        const startAt = Date.now()
        u.onstart?.()
        setTimeout(() => {
          log.push({ text: u.text, rate: u.rate, startAt, endAt: Date.now() })
          u.onend?.(reportsElapsed ? { elapsedTime: audio / 1000 } : {})
        }, latency + audio)
      }, 10)
    },
    now: () => Date.now(),
    later: (fn, ms) => setTimeout(fn, ms),
  })
  return { player, log, cancels }
}

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

async function run<T>(p: Promise<T>): Promise<T> {
  await vi.runAllTimersAsync()
  return p
}

const LONG = '안녕하세요'

describe('createSpeechPlayer（読み上げの再生）', () => {
  it('止めてから、少し間を置いて読む', async () => {
    const { player, log, cancels } = fakeDevice()
    const t0 = Date.now()
    await run(player.speak('불', 'normal'))
    expect(cancels).toEqual([t0])
    expect((log[0]?.startAt ?? 0) - t0).toBeGreaterThanOrEqual(CANCEL_GAP_MS)
  })

  it('まだ確かめていない端末では、「ゆっくり」は 0.5。長い言葉は1回、短い単語（2音節まで）は同じ速さでもう1回', async () => {
    const { player, log } = fakeDevice()
    await run(player.speak(LONG, 'slow', { slowButton: true }))
    await run(player.speak('커피', 'slow', { slowButton: true }))
    expect(log.map((l) => [l.text, l.rate])).toEqual([
      [LONG, 0.5],
      ['커피', 0.5],
      ['커피', 0.5],
    ])
    expect((log[2]?.startAt ?? 0) - (log[1]?.endAt ?? 0)).toBeGreaterThanOrEqual(REPEAT_GAP_MS)
  })

  it('止める（画面が見えなくなったとき）：読み上げ中のものを止め、くり返しの2回目も読まない', async () => {
    const { player, log, cancels } = fakeDevice()
    const p = player.speak('커피', 'slow', { slowButton: true })
    await vi.advanceTimersByTimeAsync(CANCEL_GAP_MS + 50)
    player.stop()
    await run(p)
    expect(cancels).toHaveLength(2)
    expect(log).toHaveLength(1)
  })

  it('止めた読み上げの終わりの知らせが来ない端末でも、前の読み上げは終わったことにする（BGM を戻すため）', async () => {
    // 読み始めるが、終わりの知らせ（onend）を出さない端末
    const player = createSpeechPlayer({ cancel: () => {}, speak: (u) => u.onstart?.(), now: () => Date.now(), later: (fn, ms) => setTimeout(fn, ms) })
    let firstDone = false
    const first = player.speak(LONG, 'normal').then(() => (firstDone = true))
    await vi.advanceTimersByTimeAsync(CANCEL_GAP_MS + 50)
    expect(firstDone).toBe(false)
    void player.speak('불', 'normal')
    await vi.advanceTimersByTimeAsync(0)
    await first
    expect(firstDone).toBe(true)
    player.stop()
  })

  it('設定の「ゆっくり」（ボタンでない読み上げ）は、短い単語でもくり返さない', async () => {
    const { player, log } = fakeDevice()
    await run(player.speak('불', 'slow'))
    expect(log).toHaveLength(1)
  })

  it('自動の判断：十分に遅くなる端末では、そのまま（知らせなし）', async () => {
    const { player } = fakeDevice({ strength: 1 })
    await run(player.speak(LONG, 'normal'))
    await run(player.speak(LONG, 'slow', { slowButton: true }))
    expect(player.getState()).toEqual({ support: 'works', rate: 0.5, checked: false, noticePending: false })
  })

  it('自動の判断：少ししか遅くならない端末では、次の候補（0.35）にし、知らせる', async () => {
    const { player } = fakeDevice({ strength: 0.35 })
    await run(player.speak(LONG, 'normal'))
    await run(player.speak(LONG, 'slow', { slowButton: true }))
    expect(player.getState()).toEqual({ support: 'weak', rate: 0.35, checked: false, noticePending: true })
  })

  it('自動の判断：遅くならない端末では、その場でもう1回読み、次からは間を空けて2回くり返す', async () => {
    const { player, log } = fakeDevice({ strength: 0 })
    await run(player.speak(LONG, 'normal'))
    await run(player.speak(LONG, 'slow', { slowButton: true }))
    expect(log.map((l) => l.rate)).toEqual([1, 0.5, 1])
    expect(player.getState()).toMatchObject({ support: 'ignored', rate: null, noticePending: true })
    player.clearNotice()
    expect(player.getState().noticePending).toBe(false)
    log.length = 0
    await run(player.speak('불', 'slow', { slowButton: true }))
    expect(log.map((l) => [l.text, l.rate])).toEqual([
      ['불', 1],
      ['불', 1],
    ])
  })

  it('自動の判断は、4音節以上の言葉でだけ行う（短い言葉では判断しない）', async () => {
    const { player } = fakeDevice({ strength: 0 })
    await run(player.speak('커피', 'normal'))
    await run(player.speak('커피', 'slow', { slowButton: true }))
    expect(player.getState().support).toBe('unknown')
  })

  it('読み始めの待ち時間が長くても、端末が「話していた時間」を知らせれば、正しく判断できる', async () => {
    const clockOnly = fakeDevice({ strength: 0.6, latency: 800 })
    await run(clockOnly.player.speak(LONG, 'normal'))
    await run(clockOnly.player.speak(LONG, 'slow', { slowButton: true }))
    // 待ち時間が長さに入ると、差が小さく見える（1.6倍のはずが 1.3倍台）
    expect(clockOnly.player.getState().support).toBe('weak')

    const engine = fakeDevice({ strength: 0.6, latency: 800, reportsElapsed: true })
    await run(engine.player.speak(LONG, 'normal'))
    await run(engine.player.speak(LONG, 'slow', { slowButton: true }))
    expect(engine.player.getState().support).toBe('works')
  })

  it('くり返しの途中で別の言葉を読んだら、残りのくり返しはやめる', async () => {
    const { player, log } = fakeDevice()
    const first = player.speak('불', 'slow', { slowButton: true })
    await vi.advanceTimersByTimeAsync(CANCEL_GAP_MS + 10 + 400 + 100)
    const second = player.speak('풀', 'normal')
    await run(Promise.all([first, second]))
    expect(log.map((l) => l.text)).toEqual(['불', '풀'])
  })
})

describe('読み上げの確認（check）', () => {
  const TEXT = '아메리카노 한 잔 주세요.'

  it('十分に遅くなる端末：0.5 だけ試して決める', async () => {
    const { player } = fakeDevice({ strength: 1 })
    const r = await run(player.check(TEXT))
    expect(r.trials.map((t) => [t.rate, Number(t.ratio.toFixed(2))])).toEqual([[0.5, 2]])
    expect(r).toMatchObject({ rate: 0.5, support: 'works', method: 'clock' })
    expect(player.getState()).toEqual({ support: 'works', rate: 0.5, checked: true, noticePending: false })
  })

  it('弱くしか効かない端末（iPhone の 1.3倍など）：もっと遅い速さを試し、十分に遅くなる速さを選ぶ', async () => {
    const { player } = fakeDevice({ strength: 0.3 })
    const r = await run(player.check(TEXT))
    // 0.5 → 1.3倍、0.35 → 1.56倍
    expect(r.trials.map((t) => t.rate)).toEqual([0.5, 0.35])
    expect(r).toMatchObject({ rate: 0.35, support: 'works' })
  })

  it('どの速さでも十分には遅くならないが少しは遅くなる端末：いちばん遅くなった速さ（weak）', async () => {
    const { player } = fakeDevice({ strength: 0.1 })
    const r = await run(player.check(TEXT))
    expect(r.trials.map((t) => t.rate)).toEqual([0.5, 0.35, 0.2])
    expect(r).toMatchObject({ rate: 0.2, support: 'weak' })
  })

  it('速さが変わらない端末：null（2回くり返す）', async () => {
    const { player } = fakeDevice({ strength: 0 })
    const r = await run(player.check(TEXT))
    expect(r).toMatchObject({ rate: null, support: 'ignored' })
    expect(player.getState()).toMatchObject({ rate: null, checked: true, noticePending: false })
  })

  it('端末が「話していた時間」を知らせれば、それで測る', async () => {
    const { player } = fakeDevice({ strength: 1, latency: 500, reportsElapsed: true })
    const r = await run(player.check(TEXT))
    expect(r).toMatchObject({ normal: 2000, method: 'engine', rate: 0.5 })
  })

  it('保存してある速さを使う（確かめた端末では自動の判断をしない）', async () => {
    const { player, log } = fakeDevice({ strength: 0 })
    player.applySaved(0.35)
    expect(player.getState()).toEqual({ support: 'works', rate: 0.35, checked: true, noticePending: false })
    await run(player.speak(LONG, 'normal'))
    await run(player.speak(LONG, 'slow', { slowButton: true }))
    expect(log.map((l) => l.rate)).toEqual([1, 0.35])
    expect(player.getState().rate).toBe(0.35)
    player.applySaved(null)
    expect(player.getState()).toMatchObject({ support: 'ignored', rate: null })
    player.applySaved(undefined)
    expect(player.getState()).toMatchObject({ support: 'unknown', rate: 0.5, checked: false })
  })
})
