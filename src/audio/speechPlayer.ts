// 読み上げの再生（BUG-010）。ブラウザの読み上げ（speechSynthesis）を、テストできる形にまとめる。
// 端末によっては、速さの指定が効かない・弱くしか効かない（iPhone など）。そのため（GAME_SPEC 10-4）：
// - 設定の「読み上げの確認」で、長めの文を速さを変えて読み比べ、十分に遅くなる速さを選ぶ（設定に保存する）
// - どの速さでも十分に遅くならない端末では、「ゆっくり」のボタンを、間を空けて2回くり返して読む形にする
// - 1〜2音節の短い単語は、遅くしても差が出にくいので、「ゆっくり」で読んだうえでもう1回読む
// - まだ確かめていない端末では、4音節以上の言葉を「ふつう」と「ゆっくり」で読んだときに自動で判断する（ゲームを開いている間だけ）
// 読み上げを止めた直後に次を読ませると指定が落ちる端末があるため、少し間を置いてから読む。

/** 十分に遅くなった、とする長さの倍率 */
export const SLOW_ENOUGH_RATIO = 1.5
/** 少しは遅くなった、とする長さの倍率（これより小さければ、速さが変わらない端末） */
export const SLOW_WEAK_RATIO = 1.3
/** 「ゆっくり」の速さの候補（速い順）。十分に遅くなる最初の速さを使う */
export const SLOW_RATE_CANDIDATES = [0.5, 0.35, 0.2] as const
/** まだ確かめていない端末の「ゆっくり」の速さ */
export const DEFAULT_SLOW_RATE = 0.5
/** これより短い読み上げは、長さを比べない（測り方の誤差が大きいため） */
export const MIN_MEASURE_MS = 150
/** 自動で判断に使う言葉の長さ（音節）。短い言葉は、読み始めの待ち時間などの割合が大きく、差が出にくい */
export const MIN_JUDGE_SYLLABLES = 4
/** これ以下の音節の言葉は、「ゆっくり」で読んだうえでもう1回読む */
export const SHORT_WORD_SYLLABLES = 2
/** 読み上げを止めてから、次を読むまでの間 */
export const CANCEL_GAP_MS = 80
/** くり返して読むときの間 */
export const REPEAT_GAP_MS = 1000
/** 読み上げの確認で、1つ読み終えてから次を読むまでの間 */
const CHECK_GAP_MS = 300

/**
 * 速さの指定の効き方。
 * - unknown：まだ分からない、works：十分に遅くなる、weak：少ししか遅くならない、ignored：遅くならない（2回くり返す）
 */
export type RateSupport = 'unknown' | 'works' | 'weak' | 'ignored'

/** 長さの倍率から、効き方を判断する */
export function judgeRatio(ratio: number): Exclude<RateSupport, 'unknown'> {
  if (ratio >= SLOW_ENOUGH_RATIO) return 'works'
  if (ratio >= SLOW_WEAK_RATIO) return 'weak'
  return 'ignored'
}

/** ふつうとゆっくりの長さ（ミリ秒）から、効き方を判断する。どちらかがなければ（短すぎれば）unknown */
export function judgeRateSupport(normalMs: number | undefined, slowMs: number | undefined): RateSupport {
  if (normalMs === undefined || slowMs === undefined || normalMs < MIN_MEASURE_MS || slowMs < MIN_MEASURE_MS) return 'unknown'
  return judgeRatio(slowMs / normalMs)
}

/** ハングルの音節の数（空白・句読点は数えない） */
export function syllableCount(text: string): number {
  return [...text].filter((c) => /[가-힣]/.test(c)).length
}

export interface SlowTrial {
  rate: number
  ms: number
  ratio: number
}

/**
 * 読み上げの確認で試した結果から、「ゆっくり」の速さを選ぶ。
 * 十分に遅くなる最初の速さ。なければ、少しは遅くなる中でいちばん遅くなった速さ。それもなければ null（2回くり返す）
 */
export function chooseSlowRate(trials: readonly SlowTrial[]): number | null {
  const enough = trials.find((t) => t.ratio >= SLOW_ENOUGH_RATIO)
  if (enough !== undefined) return enough.rate
  const best = [...trials].sort((a, b) => b.ratio - a.ratio)[0]
  return best !== undefined && best.ratio >= SLOW_WEAK_RATIO ? best.rate : null
}

/** 読み上げが終わったときの知らせ。elapsedTime は端末が知らせる「話していた時間」（ない・0 の端末もある） */
export interface SpeechEndLike {
  elapsedTime?: number
}

export interface UtteranceLike {
  text: string
  rate: number
  onstart: (() => void) | null
  onend: ((ev: SpeechEndLike) => void) | null
  onerror: (() => void) | null
}

export interface SpeechPlayerDeps {
  cancel: () => void
  speak: (u: UtteranceLike) => void
  now: () => number
  later: (fn: () => void, ms: number) => void
}

export type Speed = 'normal' | 'slow'

/** 長さの測り方。engine：端末が知らせる「話していた時間」、clock：読み始め → 読み終わりの時刻 */
export type MeasureMethod = 'engine' | 'clock'

export interface SlowState {
  support: RateSupport
  /** 「ゆっくり」で使う速さ。null なら2回くり返す */
  rate: number | null
  /** 設定の「読み上げの確認」で決めたか（保存した値を含む） */
  checked: boolean
  /** 自動で判断した結果の知らせを、まだ出していない */
  noticePending: boolean
}

export const INITIAL_SLOW_STATE: SlowState = { support: 'unknown', rate: DEFAULT_SLOW_RATE, checked: false, noticePending: false }

export interface SpeakOptions {
  /** 「ゆっくり」のボタンから（くり返しの対象） */
  slowButton?: boolean
}

export interface SpeechCheckResult {
  normal: number | null
  trials: SlowTrial[]
  /** 選んだ「ゆっくり」の速さ（null なら2回くり返す）。測れなければ undefined */
  rate: number | null | undefined
  support: RateSupport
  method: MeasureMethod
}

/**
 * 端末が知らせる「話していた時間」をミリ秒にする。秒で知らせる端末もあるので、小さい値は秒とみなす。
 * 時刻で測った長さより長いなど、おかしな値なら使わない（null）
 */
export function engineMs(elapsed: number | undefined, clockMs: number): number | null {
  if (elapsed === undefined || !Number.isFinite(elapsed) || elapsed <= 0) return null
  const ms = elapsed < 60 ? elapsed * 1000 : elapsed
  return ms > clockMs + 50 ? null : ms
}

export function createSpeechPlayer(deps: SpeechPlayerDeps) {
  let state: SlowState = INITIAL_SLOW_STATE
  const listeners = new Set<() => void>()
  /** 文ごとに、最後に測ったふつうの長さ（自動の判断のため） */
  const normalDurations = new Map<string, number>()
  /** 新しく読み始めたら、前の読み上げの続き（くり返し）はやめる */
  let token = 0
  let lastMethod: MeasureMethod = 'clock'
  /**
   * 読んでいる途中の1回を、終わったことにする。止めた読み上げの終わりの知らせが来ない端末があるため、止めるときに呼ぶ
   * （終わりを待ち続けると、読み上げの間 BGM を消す扱い（audioSession.ts）が戻らなくなる）
   */
  let settleCurrent: (() => void) | null = null

  /** 読み上げ中のものを止める */
  function cancel() {
    settleCurrent?.()
    settleCurrent = null
    deps.cancel()
  }

  function setState(next: SlowState) {
    state = next
    for (const l of listeners) l()
  }

  /** 1回読む。終わったら長さ（ミリ秒。測れなければ null）を返す */
  function playOnce(text: string, rate: number, mine: number): Promise<number | null> {
    return new Promise((resolve) => {
      if (mine !== token) {
        resolve(null)
        return
      }
      let start = deps.now()
      const settle = () => resolve(null)
      settleCurrent = settle
      const done = () => {
        if (settleCurrent === settle) settleCurrent = null
      }
      const u: UtteranceLike = {
        text,
        rate,
        onstart: () => {
          start = deps.now()
        },
        onend: (ev) => {
          done()
          const clock = deps.now() - start
          const engine = engineMs(ev.elapsedTime, clock)
          lastMethod = engine === null ? 'clock' : 'engine'
          resolve(engine ?? clock)
        },
        onerror: () => {
          done()
          resolve(null)
        },
      }
      deps.speak(u)
    })
  }

  const wait = (ms: number) => new Promise<void>((r) => deps.later(r, ms))

  /** まだ確かめていない端末で、ふつうとゆっくりの長さから自動で判断する（4音節以上の言葉だけ） */
  function autoJudge(text: string, slowMs: number | null, rate: number) {
    if (state.checked || state.support !== 'unknown' || slowMs === null || syllableCount(text) < MIN_JUDGE_SYLLABLES) return
    const support = judgeRateSupport(normalDurations.get(text), slowMs)
    if (support === 'unknown') return
    if (support === 'works') {
      setState({ ...state, support })
      return
    }
    // 少ししか遅くならない：次の候補の速さにする。遅くならない：2回くり返す。どちらも「読み上げの確認」を案内する
    const next = SLOW_RATE_CANDIDATES.find((c) => c < rate)
    setState({ support, rate: support === 'weak' ? (next ?? rate) : null, checked: false, noticePending: true })
  }

  /** 読み上げる。読み上げ中のものは止め、少し間を置いてから読む */
  async function speak(text: string, speed: Speed, options: SpeakOptions = {}): Promise<void> {
    const mine = ++token
    cancel()
    await wait(CANCEL_GAP_MS)
    if (mine !== token) return
    if (speed === 'normal') {
      const ms = await playOnce(text, 1, mine)
      if (ms !== null && mine === token) normalDurations.set(text, ms)
      return
    }
    const button = options.slowButton === true
    if (state.rate === null) {
      // 遅くならない端末：ボタンからなら、ふつうの速さで間を空けて2回。設定の「ゆっくり」は1回
      await playOnce(text, 1, mine)
      if (!button) return
      await wait(REPEAT_GAP_MS)
      await playOnce(text, 1, mine)
      return
    }
    const rate = state.rate
    const ms = await playOnce(text, rate, mine)
    if (mine !== token) return
    autoJudge(text, ms, rate)
    if (!button) return
    // いま「遅くならない」と分かったら、その場でもう1回。短い単語も、もう1回（遅くしても差が出にくいため）
    const repeatRate = state.rate === null ? 1 : syllableCount(text) <= SHORT_WORD_SYLLABLES ? state.rate : undefined
    if (repeatRate === undefined) return
    await wait(REPEAT_GAP_MS)
    await playOnce(text, repeatRate, mine)
  }

  /**
   * 読み上げの確認：同じ文を、ふつう → 遅い速さの候補の順に読み、十分に遅くなったところでやめる。
   * 選んだ速さを、この端末の「ゆっくり」にする（保存は呼び出し側）
   */
  async function check(text: string): Promise<SpeechCheckResult> {
    const mine = ++token
    cancel()
    await wait(CANCEL_GAP_MS)
    const normal = await playOnce(text, 1, mine)
    const method = lastMethod
    const trials: SlowTrial[] = []
    if (normal !== null && normal >= MIN_MEASURE_MS) {
      for (const rate of SLOW_RATE_CANDIDATES) {
        if (mine !== token) break
        await wait(CHECK_GAP_MS)
        const ms = await playOnce(text, rate, mine)
        if (ms === null) break
        trials.push({ rate, ms, ratio: ms / normal })
        if (ms / normal >= SLOW_ENOUGH_RATIO) break
      }
    }
    if (trials.length === 0) return { normal, trials, rate: undefined, support: 'unknown', method }
    const rate = chooseSlowRate(trials)
    const chosen = trials.find((t) => t.rate === rate)
    const support: RateSupport = rate === null ? 'ignored' : judgeRatio(chosen?.ratio ?? 0)
    setState({ support, rate, checked: true, noticePending: false })
    return { normal, trials, rate, support, method }
  }

  /** 保存してある「ゆっくり」の速さを使う（設定の slowSpeech）。undefined なら、まだ確かめていない */
  function applySaved(rate: number | null | undefined) {
    if (rate === undefined) {
      if (state.checked) setState(INITIAL_SLOW_STATE)
      return
    }
    if (state.checked && state.rate === rate) return
    setState({ support: rate === null ? 'ignored' : 'works', rate, checked: true, noticePending: false })
  }

  /** 読み上げ中のものと、その続き（くり返し・確認の残り）をやめる（画面が見えなくなったとき） */
  function stop() {
    token++
    cancel()
  }

  return {
    speak,
    check,
    stop,
    applySaved,
    getState: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    /** 自動の判断の知らせを出した */
    clearNotice() {
      if (state.noticePending) setState({ ...state, noticePending: false })
    },
  }
}

export type SpeechPlayer = ReturnType<typeof createSpeechPlayer>
