// BGM（GAME_SPEC 10-4）。場面に合わせた曲を、くり返して流す。
// - 曲は2つの audio 要素（デッキ）を交互に使い、Web Audio の音量のつまみ（GainNode）を通して鳴らす。
//   iPhone の Safari は audio.volume が効かないため、音量はつまみで変える。
// - 曲の終わり（フェードアウトの手前で切ってある。npm run audio）が近づいたら、同じ曲の始めをもう一方のデッキで重ねて始める。
// - 場面が変わったら、新しい曲を重ねながら切り替える。読み上げの間は小さくする。
//   iPhone など、マナーモードを区別できるブラウザでは、読み上げの間は止めて、どの道筋（場面の切り替え・流し直し・操作）でも流し始めない。
//   マナーモードでも鳴る扱いの間に流し始めた曲は、ふだんの扱いに戻した後もマナーモードで鳴ってしまうため（audioSession.ts）。
//   読み上げが終わって、ふだんの扱いに戻ってから、止めた曲を続きから流す。
// - マイクで聞いている間（話して答える）は消す（声を聞き取りやすく、話しやすくするため。recognition.ts）。
// - 画面が見えなくなったら止め、戻ったら続きから流す（pageVisibility.ts）。
// - 流しているはずの曲が、こちらの操作なしに止まっていたら（iPhone で、ほかの音・マイクに止められたなど）、続きから流し直す。
// - ブラウザは操作の前に音を出させないので、最初の操作で AudioContext ができてから鳴らし始める。
//   iPhone は、操作の中で一度 play() した audio 要素でないと後から鳴らせないことがあるため、最初の操作で両方のデッキを一度鳴らして止める。

import { audioAssets } from '../data'
import type { BgmId } from '../data/types'
import { RESUME_AFTER_SPEECH_MS, isSilentModeUnsafe, subscribeAudioSession } from './audioSession'
import { canStartAudio, currentAudioEngine, onAudioEngineReady, resumeAudioEngineIfAllowed } from './engine'
import { isListening, subscribeListening } from './recognition'
import { DUCK_VOLUME, LOOP_CROSSFADE_SEC, SWITCH_FADE_SEC, loopDue } from './bgmTiming'
import { UNLOCK_EVENTS } from './sfx'

interface Deck {
  el: HTMLAudioElement
  gain: GainNode
  track: BgmId | null
  /** フェードアウトの後に止めるタイマー */
  stopTimer: number | null
  /** 再生を断られた（操作の前など）か、画面が見えない間・読み上げの間に始めようとした（止めた）。次の操作・画面に戻ったとき・読み上げの後に再び試す */
  pending: boolean
  /** play() の返事を待っている */
  starting: boolean
}

interface Desired {
  track: BgmId | null
  /** 曲の大きさ（学習画面では小さめ） */
  level: number
}

let ctx: AudioContext | null = null
let mix: GainNode | null = null
let decks: [Deck, Deck] | null = null
let active: 0 | 1 = 0

function flip(i: 0 | 1): 0 | 1 {
  return i === 0 ? 1 : 0
}
let desired: Desired = { track: null, level: 1 }
let enabled = true
/** いまの全体の大きさ（1：ふつう、DUCK_VOLUME：読み上げ中、0：マイクで聞いている間） */
let mixLevel = 1
let primed = false
/** 画面が見えない間（止めている） */
let hidden = false

function urlOf(track: BgmId): string | null {
  const entry = audioAssets.bgm[track]
  return entry === undefined ? null : `${import.meta.env.BASE_URL}${entry.src}`
}

function ramp(gain: GainNode, to: number, sec: number): void {
  if (ctx === null) return
  const now = ctx.currentTime
  gain.gain.cancelScheduledValues(now)
  gain.gain.setValueAtTime(gain.gain.value, now)
  gain.gain.linearRampToValueAtTime(to, now + Math.max(0.01, sec))
}

/** 流し始めてよいか：画面が見えていて、読み上げのためにマナーモードでも鳴る扱いにしていない */
function mayPlay(): boolean {
  return !hidden && canStartAudio()
}

function play(deck: Deck): void {
  if (!mayPlay()) {
    deck.pending = true
    return
  }
  deck.starting = true
  deck.el
    .play()
    .then(() => {
      deck.starting = false
      deck.pending = false
      // 返事を待つ間に、見えなくなった・読み上げが始まったときは止める（後で続きから流す）
      if (!mayPlay()) {
        deck.el.pause()
        deck.pending = deck.track !== null
      }
    })
    .catch(() => {
      deck.starting = false
      deck.pending = true
    })
}

function fadeOut(deck: Deck, sec: number): void {
  ramp(deck.gain, 0, sec)
  if (deck.stopTimer !== null) window.clearTimeout(deck.stopTimer)
  deck.stopTimer = window.setTimeout(() => {
    deck.stopTimer = null
    deck.el.pause()
    deck.pending = false
  }, sec * 1000 + 100)
}

/** deck で track を始めから流し、sec 秒かけて大きくする */
function start(deck: Deck, track: BgmId, sec: number): void {
  const url = urlOf(track)
  if (url === null) return
  if (deck.stopTimer !== null) {
    window.clearTimeout(deck.stopTimer)
    deck.stopTimer = null
  }
  if (!deck.el.src.endsWith(url)) deck.el.src = url
  try {
    deck.el.currentTime = 0
  } catch {
    // 読み込み前は位置を変えられない（始めから流れる）
  }
  deck.track = track
  deck.gain.gain.value = 0
  play(deck)
  ramp(deck.gain, desired.level, sec)
}

/** 望む曲・オン/オフに合わせて、いまの再生を変える */
function apply(): void {
  if (decks === null) return
  const current = decks[active]
  const other = decks[flip(active)]
  const target = enabled ? desired.track : null
  if (target === null || urlOf(target) === null) {
    if (!current.el.paused) fadeOut(current, SWITCH_FADE_SEC)
    if (!other.el.paused) fadeOut(other, SWITCH_FADE_SEC)
    current.track = null
    return
  }
  if (current.track === target && (!current.el.paused || current.pending || current.starting)) {
    ramp(current.gain, desired.level, SWITCH_FADE_SEC)
    if (current.pending) play(current)
    return
  }
  if (!current.el.paused) fadeOut(current, SWITCH_FADE_SEC)
  current.track = null
  active = flip(active)
  start(other, target, current.el.paused ? 0.3 : SWITCH_FADE_SEC)
}

/** 全体の大きさを合わせる：マイクで聞いている間は 0、読み上げの間は小さく、それ以外はふつう */
function updateMix(): void {
  if (mix === null) return
  const speaking = typeof speechSynthesis !== 'undefined' && speechSynthesis.speaking
  const level = isListening() ? 0 : speaking ? DUCK_VOLUME : 1
  if (level === mixLevel) return
  ramp(mix, level, level < mixLevel ? 0.15 : 0.6)
  mixLevel = level
}

/** 定期的に：曲の終わりが近ければ重ねて始め直す。止められていた曲は流し直す。読み上げ・マイクの間は小さくする */
function tick(): void {
  if (decks === null || mix === null || !mayPlay()) return
  const current = decks[active]
  const track = current.track
  const entry = track === null ? undefined : audioAssets.bgm[track]
  // 曲の終わりまで流れてしまった（ended）ときも、始めから流し直す
  if (track !== null && entry !== undefined && (current.el.ended || (!current.el.paused && loopDue(current.el.currentTime, entry.duration)))) {
    const other = decks[flip(active)]
    fadeOut(current, LOOP_CROSSFADE_SEC)
    current.track = null
    active = flip(active)
    start(other, track, LOOP_CROSSFADE_SEC)
  } else if (track !== null && current.el.paused && !current.pending && !current.starting && ctx !== null && ctx.state === 'running') {
    // こちらが止めたときは track を外すか（曲の切り替え・オフ）、hidden にしている。それ以外で止まっていたら流し直す（断られたら次の操作で）
    play(current)
  }
  updateMix()
}

/** 操作のたびに：断られた再生をもう一度試す。最初の操作では、両方のデッキを一度鳴らして止める（iPhone） */
function onGesture(): void {
  if (decks === null || !mayPlay()) return
  void resumeAudioEngineIfAllowed()
  for (const deck of decks) if (deck.pending) play(deck)
  if (!primed) {
    primed = true
    const idle = decks[flip(active)]
    const url = desired.track === null ? null : urlOf(desired.track)
    if (idle.el.paused && url !== null) {
      idle.el.src = url
      idle.gain.gain.value = 0
      idle.el
        .play()
        .then(() => {
          if (idle.track === null) idle.el.pause()
        })
        .catch(() => undefined)
    }
  }
}

function setup(audio: AudioContext, output: AudioNode): void {
  if (decks !== null || typeof Audio === 'undefined') return
  ctx = audio
  mix = audio.createGain()
  mix.connect(output)
  const make = (): Deck => {
    const el = new Audio()
    el.preload = 'auto'
    const gain = audio.createGain()
    gain.gain.value = 0
    audio.createMediaElementSource(el).connect(gain).connect(mix as GainNode)
    return { el, gain, track: null, stopTimer: null, pending: false, starting: false }
  }
  decks = [make(), make()]
  window.setInterval(tick, 250)
  subscribeListening(updateMix)
  subscribeAudioSession(onAudioSessionChange)
  for (const type of UNLOCK_EVENTS) window.addEventListener(type, onGesture, { passive: true, capture: true })
  onGesture()
  apply()
}

/** 流している曲を、いまの位置で止める。重ねて消している途中の曲は、そのまま止める */
function pauseDecks(): void {
  if (decks === null) return
  for (const deck of decks) {
    if (deck.stopTimer !== null) {
      window.clearTimeout(deck.stopTimer)
      deck.stopTimer = null
    }
    if (!deck.el.paused) {
      deck.el.pause()
      // 流していた曲は、後で続きから流す（消している途中の曲は track が null）
      deck.pending = deck.track !== null
    }
  }
}

/** 止めた曲を続きから流し、望む曲に合わせる（流し始めてよくなったとき） */
function resumeDecks(): void {
  if (decks === null || !mayPlay()) return
  for (const deck of decks) {
    if (deck.pending && deck.track !== null) play(deck)
    else deck.pending = false
  }
  apply()
}

/** 読み上げのためにマナーモードでも鳴る扱いになったら止め、ふだんの扱いに戻ったら少し待って続きから流す */
function onAudioSessionChange(): void {
  if (isSilentModeUnsafe()) pauseDecks()
  else window.setTimeout(resumeDecks, RESUME_AFTER_SPEECH_MS)
}

/** 画面が見えなくなったとき：流している曲を、いまの位置で止める */
export function suspendBgm(): void {
  hidden = true
  pauseDecks()
}

/** 画面に戻ったとき：止めた曲を続きから流す（断られたら、次の操作のときに流す） */
export function resumeBgm(): void {
  if (!hidden) return
  hidden = false
  resumeDecks()
}

/** 起動時に1回呼ぶ。最初の操作で AudioContext ができたら準備する */
export function initBgm(): void {
  onAudioEngineReady((audio) => {
    const engine = currentAudioEngine()
    if (engine !== null) setup(audio, engine.bgm)
  })
}

/** 流す曲（null なら止める）と、その大きさ（0〜1） */
export function setBgm(track: BgmId | null, level: number): void {
  if (desired.track === track && desired.level === level) return
  desired = { track, level }
  apply()
}

/** 設定の「BGM」のオン・オフ */
export function setBgmEnabled(value: boolean): void {
  if (enabled === value) return
  enabled = value
  apply()
}
