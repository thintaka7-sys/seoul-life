// 音の出口（Web Audio の AudioContext）を1つにまとめる。効果音と BGM は、それぞれの音量のつまみ（GainNode）を通して出す。
// iPhone の Safari は音の大きさの指定（audio.volume）が効かないため、音量はここのつまみで変える（Phase 3 計画）。
// ブラウザは、利用者が画面を操作する前に音を出させないので、AudioContext は操作の最中に作る（sfx.ts の UNLOCK_EVENTS）。
// 読み上げの間、マナーモードでも鳴る扱い（audioSession.ts）にしているときは、BGM・効果音の音量を 0 にし、音の出口も止める。
// その間は、操作があっても音の出口を動かさない（動かした音は、ふだんの扱いに戻した後もマナーモードで鳴ってしまうため）。
// 音の出口を動かすのは、すべて resumeAudioEngineIfAllowed を通す（効果音の sfx.ts は canStartAudio を確かめる）。

import { isAudioDebugEnabled, logAudio } from './audioDebug'
import { RESUME_AFTER_SPEECH_MS, isSilentModeUnsafe, subscribeAudioSession } from './audioSession'

interface Engine {
  ctx: AudioContext
  sfx: GainNode
  bgm: GainNode
}

let engine: Engine | null = null
/** 画面が見えない間（pageVisibility.ts） */
let pageHidden = false
let sfxVolume = 0.8
let bgmVolume = 0.6
const listeners = new Set<(ctx: AudioContext) => void>()

function audioContextClass(): typeof AudioContext | undefined {
  if (typeof window === 'undefined') return undefined
  return window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
}

/** AudioContext を作る（まだなければ）。作れない環境では null。操作の最中に呼ぶ */
export function ensureAudioEngine(): Engine | null {
  if (engine !== null) return engine
  const Ctor = audioContextClass()
  if (Ctor === undefined) return null
  try {
    const ctx = new Ctor()
    const sfx = ctx.createGain()
    const bgm = ctx.createGain()
    sfx.gain.value = isSilentModeUnsafe() ? 0 : sfxVolume
    bgm.gain.value = isSilentModeUnsafe() ? 0 : bgmVolume
    sfx.connect(ctx.destination)
    bgm.connect(ctx.destination)
    engine = { ctx, sfx, bgm }
    logAudio(`音の出口（AudioContext）を作った：${ctx.state}`, ctx.state === 'running')
    if (isAudioDebugEnabled()) ctx.addEventListener('statechange', () => logAudio(`音の出口（AudioContext）：${ctx.state}`, ctx.state === 'running'))
    // 読み上げのための扱いの最中に作ったときは、戻るまで止めておく
    if (!canStartAudio()) suspendContext()
    for (const l of listeners) l(ctx)
    return engine
  } catch {
    return null
  }
}

/** 作ってあれば、その AudioContext の部品。まだなら null（操作の外では作らない） */
export function currentAudioEngine(): Engine | null {
  return engine
}

/** AudioContext ができたときに呼ぶ（BGM が、最初の操作で鳴り始めるため） */
export function onAudioEngineReady(listener: (ctx: AudioContext) => void): void {
  listeners.add(listener)
  if (engine !== null) listener(engine.ctx)
}

/** BGM・効果音を流し始めてよいか：画面が見えていて、読み上げのためにマナーモードでも鳴る扱いにしていない */
export function canStartAudio(): boolean {
  return !pageHidden && !isSilentModeUnsafe()
}

function suspendContext(): void {
  if (engine !== null && engine.ctx.state === 'running') void engine.ctx.suspend().catch(() => undefined)
}

/** 音の出口を動かす（止まっていれば）。流し始めてよくないときは動かさない。断られても（iPhone の操作の外など）、次の操作で試す */
export function resumeAudioEngineIfAllowed(): Promise<void> {
  if (engine === null || engine.ctx.state === 'running' || !canStartAudio()) return Promise.resolve()
  return engine.ctx.resume().catch(() => undefined)
}

/** 音の出口を止める（画面が見えなくなったとき）。効果音は、鳴っている途中でも止まる */
export function suspendAudioEngine(): void {
  pageHidden = true
  suspendContext()
}

/** 音の出口を再び動かす（画面に戻ったとき）。iPhone などで断られたら、次の操作のときに動かす（sfx.ts・bgm.ts） */
export function resumeAudioEngine(): void {
  pageHidden = false
  void resumeAudioEngineIfAllowed()
}

/** いまの音量を、つまみに伝える。読み上げのためにマナーモードでも鳴る扱いの間は 0 */
function applyGains(): void {
  if (engine === null) return
  const mute = isSilentModeUnsafe()
  const now = engine.ctx.currentTime
  engine.sfx.gain.setTargetAtTime(mute ? 0 : sfxVolume, now, 0.02)
  engine.bgm.gain.setTargetAtTime(mute ? 0 : bgmVolume, now, mute ? 0.02 : 0.2)
}

/** 読み上げのための扱いになったら音の出口を止め、ふだんの扱いに戻ったら少し待って動かす */
function onAudioSessionChange(): void {
  applyGains()
  if (isSilentModeUnsafe()) suspendContext()
  else if (typeof window !== 'undefined') window.setTimeout(() => void resumeAudioEngineIfAllowed(), RESUME_AFTER_SPEECH_MS)
}
subscribeAudioSession(onAudioSessionChange)

/** 効果音の音量（0〜1） */
export function setSfxVolume(v: number): void {
  sfxVolume = v
  applyGains()
}

/** BGM 全体の音量（0〜1）。曲ごと・場面ごとの大きさは bgm.ts で掛ける */
export function setBgmMasterVolume(v: number): void {
  bgmVolume = v
  applyGains()
}
