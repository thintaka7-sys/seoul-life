// 読み上げの再生（BUG-010）。ブラウザの読み上げ（speechSynthesis）を、テストできる形にまとめる。
// - 読み上げの長さを測り、「ゆっくり」が本当に遅くなっているかを判断する（端末によっては速さの指定が効かない。iPhone など）
// - 速さが変わらない端末では、「ゆっくり」のボタンを、間を空けて2回くり返して読む形に切り替える（GAME_SPEC 10-4）。判断はゲームを開いている間だけ覚える
// - 読み上げを止めた直後に次を読ませると、指定が落ちる端末があるため、少し間を置いてから読む

/** 「ゆっくり」が、ふつうの何倍以上の長さなら「速さが効いている」とするか */
export const SLOW_RATIO_MIN = 1.15
/** これより短い読み上げは、長さを比べない（測り方の誤差が大きいため） */
export const MIN_MEASURE_MS = 150
/** 読み上げを止めてから、次を読むまでの間 */
export const CANCEL_GAP_MS = 80
/** くり返して読むときの間 */
export const REPEAT_GAP_MS = 1000

/** 速さの指定が効くか。unknown はまだ比べていない */
export type RateSupport = 'unknown' | 'works' | 'ignored'

/** ふつうとゆっくりの長さ（ミリ秒）から、速さの指定が効いているかを判断する。どちらかがなければ（短すぎれば）unknown */
export function judgeRateSupport(normalMs: number | undefined, slowMs: number | undefined): RateSupport {
  if (normalMs === undefined || slowMs === undefined || normalMs < MIN_MEASURE_MS || slowMs < MIN_MEASURE_MS) return 'unknown'
  return slowMs >= normalMs * SLOW_RATIO_MIN ? 'works' : 'ignored'
}

export interface UtteranceLike {
  text: string
  lang: string
  rate: number
  onstart: ((ev: never) => unknown) | null
  onend: ((ev: never) => unknown) | null
  onerror: ((ev: never) => unknown) | null
}

export interface SpeechPlayerDeps {
  cancel: () => void
  speak: (u: UtteranceLike) => void
  /** 読み上げる文を作る（言語・音声はここで付ける） */
  utterance: (text: string) => UtteranceLike
  now: () => number
  later: (fn: () => void, ms: number) => void
}

export type Speed = 'normal' | 'slow'

export interface SlowState {
  support: RateSupport
  /** 「2回くり返して読みます」の知らせを、まだ出していない */
  noticePending: boolean
}

export interface SpeakOptions {
  /** 「ゆっくり」のボタンから（速さが変わらない端末では、2回くり返して読む） */
  slowButton?: boolean
}

export function createSpeechPlayer(deps: SpeechPlayerDeps, rateValue: (speed: Speed) => number) {
  let state: SlowState = { support: 'unknown', noticePending: false }
  const listeners = new Set<() => void>()
  /** 文ごとに、最後に測った長さ */
  const durations = new Map<string, Partial<Record<Speed, number>>>()
  /** 新しく読み始めたら、前の読み上げの続き（くり返し）はやめる */
  let token = 0

  function setState(next: SlowState) {
    state = next
    for (const l of listeners) l()
  }

  function record(text: string, speed: Speed, ms: number) {
    const d = { ...durations.get(text), [speed]: ms }
    durations.set(text, d)
    if (state.support !== 'unknown') return
    const support = judgeRateSupport(d.normal, d.slow)
    if (support === 'ignored') setState({ support, noticePending: true })
    else if (support === 'works') setState({ ...state, support })
  }

  /** 1回読む。終わったら長さ（ミリ秒。測れなければ null）を返す */
  function playOnce(text: string, speed: Speed, mine: number, measure: boolean): Promise<number | null> {
    return new Promise((resolve) => {
      if (mine !== token) {
        resolve(null)
        return
      }
      const u = deps.utterance(text)
      u.rate = rateValue(speed)
      let start = deps.now()
      u.onstart = () => {
        start = deps.now()
      }
      u.onend = () => {
        const ms = deps.now() - start
        if (measure && mine === token) record(text, speed, ms)
        resolve(ms)
      }
      u.onerror = () => resolve(null)
      deps.speak(u)
    })
  }

  const wait = (ms: number) => new Promise<void>((r) => deps.later(r, ms))

  /** 読み上げる。読み上げ中のものは止め、少し間を置いてから読む */
  async function speak(text: string, speed: Speed, options: SpeakOptions = {}): Promise<void> {
    const mine = ++token
    deps.cancel()
    await wait(CANCEL_GAP_MS)
    if (mine !== token) return
    if (speed === 'slow' && options.slowButton === true && state.support === 'ignored') {
      // 速さが変わらない端末：ふつうの速さで、間を空けて2回
      await playOnce(text, 'normal', mine, false)
      await wait(REPEAT_GAP_MS)
      await playOnce(text, 'normal', mine, false)
      return
    }
    const before = state.support
    await playOnce(text, speed, mine, true)
    // いま「速さが変わらない」と分かったら、その場でもう1回読む（2回聞こえるように）
    if (speed === 'slow' && options.slowButton === true && before !== 'ignored' && state.support === 'ignored') {
      await wait(REPEAT_GAP_MS)
      await playOnce(text, 'normal', mine, false)
    }
  }

  /** 読み上げの確認：同じ文を、ふつう → ゆっくりの順に読み、それぞれの長さ（ミリ秒）を返す */
  async function measure(text: string): Promise<{ normal: number | null; slow: number | null; support: RateSupport }> {
    const mine = ++token
    deps.cancel()
    await wait(CANCEL_GAP_MS)
    const normal = await playOnce(text, 'normal', mine, true)
    await wait(300)
    const slow = await playOnce(text, 'slow', mine, true)
    const support = judgeRateSupport(normal ?? undefined, slow ?? undefined)
    // 確認の結果は、それまでの判断より優先する
    if (support !== 'unknown' && support !== state.support) setState({ support, noticePending: support === 'ignored' })
    return { normal, slow, support }
  }

  return {
    speak,
    measure,
    getState: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    /** 「2回くり返して読みます」を知らせた */
    clearNotice() {
      if (state.noticePending) setState({ ...state, noticePending: false })
    },
  }
}

export type SpeechPlayer = ReturnType<typeof createSpeechPlayer>
