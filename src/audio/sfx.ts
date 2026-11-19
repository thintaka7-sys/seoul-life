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

let context: AudioContext | null = null
let enabled = true
let prepared = false

/** 設定の「効果音」を反映する */
export function setSfxEnabled(value: boolean): void {
  enabled = value
}

function createContext(): AudioContext | null {
  if (typeof window === 'undefined') return null
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (Ctor === undefined) return null
  try {
    return new Ctor()
  } catch {
    return null
  }
}

/** 起動時に1回呼ぶ。最初の操作で音の準備をする（それより前には音を出さない） */
export function initSfx(): void {
  if (prepared || typeof window === 'undefined') return
  prepared = true
  const unlock = () => {
    context ??= createContext()
    void context?.resume().catch(() => undefined)
    window.removeEventListener('pointerdown', unlock)
    window.removeEventListener('keydown', unlock)
  }
  window.addEventListener('pointerdown', unlock)
  window.addEventListener('keydown', unlock)
}

/** 効果音を鳴らす。オフのとき・準備前・音を出せない環境では何もしない */
export function playSfx(name: SfxName): void {
  if (!enabled || context === null || context.state !== 'running') return
  const ctx = context
  const start = ctx.currentTime + 0.01
  for (const n of SFX_RECIPES[name]) {
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
}
