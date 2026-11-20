// 効果音。素材ファイルは使わず、Web Audio API で短い音を作って鳴らす（GAME_SPEC 10-4）。
// ブラウザは、利用者が画面を操作する前に音を出させないため、最初のタップ（またはキー操作）で準備する。
// iPhone はマナーモード（消音スイッチ）のとき、この音は鳴らない（端末の仕様）。

export const SFX_NAMES = ['button', 'correct', 'wrong', 'xp', 'fanfare'] as const
export type SfxName = (typeof SFX_NAMES)[number]

/** 1つの音（音の高さ・始まる時刻・長さ・波形・大きさ） */
export interface Note {
  freq: number
  /** 鳴らし始めるまでの時間（秒） */
  at: number
  /** 長さ（秒） */
  dur: number
  wave: OscillatorType
  gain: number
  /** 終わりの音の高さ（指定すると、高さをなめらかに変える） */
  toFreq?: number
}

/** 効果音の作り方。どれも短く、小さめの音にする（学習の邪魔にならないように） */
export const SFX_RECIPES: Readonly<Record<SfxName, readonly Note[]>> = {
  // 軽い「ポッ」
  button: [{ freq: 880, toFreq: 660, at: 0, dur: 0.05, wave: 'sine', gain: 0.06 }],
  // 上がる2音「ピンポン」
  correct: [
    { freq: 784, at: 0, dur: 0.12, wave: 'triangle', gain: 0.16 },
    { freq: 1047, at: 0.1, dur: 0.22, wave: 'triangle', gain: 0.16 },
  ],
  // 下がるやわらかい音（責める感じにしない）
  wrong: [
    { freq: 330, toFreq: 247, at: 0, dur: 0.16, wave: 'triangle', gain: 0.12 },
    { freq: 262, toFreq: 196, at: 0.14, dur: 0.2, wave: 'triangle', gain: 0.1 },
  ],
  // きらきらした3音
  xp: [
    { freq: 1319, at: 0, dur: 0.07, wave: 'sine', gain: 0.07 },
    { freq: 1568, at: 0.06, dur: 0.07, wave: 'sine', gain: 0.07 },
    { freq: 2093, at: 0.12, dur: 0.14, wave: 'sine', gain: 0.06 },
  ],
  // 1日の終わりのファンファーレ（ド・ミ・ソ・ド）
  fanfare: [
    { freq: 523, at: 0, dur: 0.14, wave: 'triangle', gain: 0.14 },
    { freq: 659, at: 0.14, dur: 0.14, wave: 'triangle', gain: 0.14 },
    { freq: 784, at: 0.28, dur: 0.14, wave: 'triangle', gain: 0.14 },
    { freq: 1047, at: 0.42, dur: 0.5, wave: 'triangle', gain: 0.16 },
  ],
}

/** 効果音全体の長さ（秒） */
export function recipeLength(notes: readonly Note[]): number {
  return Math.max(0, ...notes.map((n) => n.at + n.dur))
}

/** 音を鳴らす部品（Web Audio の AudioContext を、使う部分だけに絞ったもの。テストでは偽物に差し替える） */
export interface SfxContext {
  /** 'running' のときだけ音が出る（'suspended'・iPhone の 'interrupted' などでは出ない） */
  readonly state: string
  resume(): Promise<void>
  /** 音の並びを、今から鳴らす */
  play(notes: readonly Note[]): void
  /** 無音を一瞬鳴らす（古い iPhone は、最初の操作の中で一度鳴らさないと音が出ないため） */
  warmUp(): void
}

interface EventTargetLike {
  addEventListener(type: string, listener: () => void, options?: { passive?: boolean; capture?: boolean }): void
}

export interface SfxEnvironment {
  /** 操作を待つ相手（ふつうは window） */
  target: EventTargetLike | null
  createContext: () => SfxContext | null
  /** 今が「音を出してよい操作」の最中か。分からない環境では true を返す */
  isUserActive: () => boolean
}

/**
 * 音の準備のきっかけにする操作。
 * スマホでは、指が触れた瞬間（pointerdown・touchstart）はブラウザが「音を出してよい操作」と認めない。
 * 指を離したとき（pointerup・touchend）とタップ（click）なら認められるので、それも待つ（BUG-002）。
 */
export const UNLOCK_EVENTS = ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown'] as const

export interface SfxPlayer {
  setEnabled(value: boolean): void
  /** 操作を待ち始める（何度呼んでも1回だけ） */
  init(): void
  play(name: SfxName): void
}

export function createSfxPlayer(env: SfxEnvironment): SfxPlayer {
  let context: SfxContext | null = null
  let enabled = true
  let started = false

  /** 「音を出してよい操作」の最中なら、音を出せる状態にする。止まっていたら再開する */
  function prepare(): SfxContext | null {
    if (!env.isUserActive()) return context
    if (context === null) {
      context = env.createContext()
      context?.warmUp()
    }
    if (context !== null && context.state !== 'running') void context.resume().catch(() => undefined)
    return context
  }

  return {
    setEnabled(value) {
      enabled = value
    },
    init() {
      if (started || env.target === null) return
      started = true
      // 準備が終わってもやめない（iPhone は読み上げのあとやアプリを切り替えたあとに音が止まることがあり、次の操作で再開するため）
      for (const type of UNLOCK_EVENTS) env.target.addEventListener(type, prepare, { passive: true, capture: true })
    },
    play(name) {
      if (!enabled) return
      const ctx = prepare()
      if (ctx === null) return
      if (ctx.state === 'running') {
        ctx.play(SFX_RECIPES[name])
        return
      }
      // 止まっているときは、再開できたら鳴らす（ボタンを押したときなど、操作の最中に呼ばれた場合）
      if (!env.isUserActive()) return
      ctx
        .resume()
        .then(() => {
          if (ctx.state === 'running') ctx.play(SFX_RECIPES[name])
        })
        .catch(() => undefined)
    },
  }
}

/** ブラウザの AudioContext を SfxContext の形で包む */
function wrapAudioContext(ctx: AudioContext): SfxContext {
  return {
    get state() {
      return ctx.state
    },
    resume: () => ctx.resume(),
    warmUp() {
      try {
        const source = ctx.createBufferSource()
        source.buffer = ctx.createBuffer(1, 1, 22050)
        source.connect(ctx.destination)
        source.start(0)
      } catch {
        // 無音を鳴らせなくても、ふつうの音は試す
      }
    },
    play(notes) {
      const start = ctx.currentTime + 0.01
      for (const n of notes) {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = n.wave
        osc.frequency.setValueAtTime(n.freq, start + n.at)
        if (n.toFreq !== undefined) osc.frequency.exponentialRampToValueAtTime(n.toFreq, start + n.at + n.dur)
        // 立ち上がりと消え際をなめらかにして、「プツッ」という音が出ないようにする
        gain.gain.setValueAtTime(0.0001, start + n.at)
        gain.gain.exponentialRampToValueAtTime(n.gain, start + n.at + 0.012)
        gain.gain.exponentialRampToValueAtTime(0.0001, start + n.at + n.dur)
        osc.connect(gain).connect(ctx.destination)
        osc.start(start + n.at)
        osc.stop(start + n.at + n.dur + 0.02)
      }
    },
  }
}

function browserEnvironment(): SfxEnvironment {
  if (typeof window === 'undefined') return { target: null, createContext: () => null, isUserActive: () => false }
  return {
    target: window,
    createContext() {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (Ctor === undefined) return null
      try {
        return wrapAudioContext(new Ctor())
      } catch {
        return null
      }
    },
    // 操作の外で音の準備をすると、ブラウザが警告を出すうえに失敗するので、操作の最中かを確かめる
    isUserActive: () => (navigator as Navigator & { userActivation?: { isActive: boolean } }).userActivation?.isActive ?? true,
  }
}

const player = createSfxPlayer(browserEnvironment())

/** 設定の「効果音」を反映する */
export function setSfxEnabled(value: boolean): void {
  player.setEnabled(value)
}

/** 起動時に1回呼ぶ。最初の操作で音の準備をする（それより前には音を出さない） */
export function initSfx(): void {
  player.init()
}

/** 効果音を鳴らす。オフのとき・準備前・音を出せない環境では何もしない */
export function playSfx(name: SfxName): void {
  player.play(name)
}
