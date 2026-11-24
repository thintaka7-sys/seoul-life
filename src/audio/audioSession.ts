// iPhone のマナーモード（消音スイッチ）への対応（Phase 3 区切り2 のスマホ確認）。
// - ふだんは音の扱いを「ambient」にする：BGM・効果音は、マナーモードでは鳴らない（ほかのアプリの音とも混ざる）
// - マイクで聞く（話して答える）と、iPhone は音の扱いを play-and-record にし、マナーモードが効かなくなる（スマホ確認 2026-11-24）。
//   ページが指定した値は 'ambient' のまま残るので、同じ値を入れ直してもブラウザは何もしない。音が流れ続けていると play-and-record のまま戻らず、
//   ページを開き直しても（同じ値なので）戻らなかった。そこで：
//   ・マイクで聞いている間は、BGM・効果音を止める（流し続けない）
//   ・マイクを閉じたら、音を止めたまま、扱いを 'auto' → 'ambient' と入れ直して（かけ直し）、少し待ってから音を戻す
//   ・起動時も、最初の音の前に同じかけ直しをする
//   それでも実機では、マイクの後にマナーモードが効かず、マイク使用中の表示（オレンジの点）も残った（スマホ確認 2026-11-25）。
//   Safari がマイクを開いたままにしていると考えられ、ページからは閉じきれない。そこで設定「話して答えたあと、BGM・効果音を止める」
//   （quietAfterVoiceInput。iPhone では最初からオン）がオンなら、一度マイクを使った後は、ページを開き直すまで BGM・効果音を止めておく
//   （読み上げの間と同じ止め方。BGM を止め、音の出口も止める）。読み上げ（ボタンを押して聞く）は鳴らす
// - 読み上げ（すべてプレイヤーがボタンを押して始める）の間だけ「playback」にする：学習に必要なので、マナーモードでも鳴らす
//   「playback」の間に流し始めた音は、「ambient」に戻した後もマナーモードで鳴ってしまう（スマホ確認：おはなしの早送りの後の BGM）。
//   そのため「playback」の間は、BGM を止め（bgm.ts）、音の出口（効果音）も止めて（engine.ts）、どの道筋でも流し始めない。
//   「ambient」に戻してから少し待って（RESUME_AFTER_SPEECH_MS）、止めた BGM を続きから流し、音の出口を動かす
// navigator.audioSession（Safari 16.4 以降）がないブラウザでは何もしない（マナーモードの区別がないため）。

import { logAudio } from './audioDebug'
import { isListening, subscribeListening } from './recognition'

export type AudioSessionType = 'auto' | 'playback' | 'transient' | 'transient-solo' | 'ambient' | 'play-and-record'

export interface AudioSessionLike {
  type: AudioSessionType
}

/** 読み上げが終わった知らせが来ないときに、ふだんの扱いに戻すまでの時間（読み上げが止まってから） */
export const SPEECH_HOLD_TIMEOUT_MS = 5000
/** 「読み上げ中」のまま知らせが変わらない端末（iPhone で speaking が true のまま残ることがある）でも、ここまで経ったら戻す */
export const SPEECH_HOLD_MAX_MS = 60000
/** ふだんの扱い（ambient）に戻してから、BGM・効果音を流し直すまでの間（切り替えが端末に届くのを待つ） */
export const RESUME_AFTER_SPEECH_MS = 200
/** マイクを閉じてから、扱いをかけ直して音を戻すまでの間（マイクの扱いが解けるのを待つ） */
export const AFTER_CAPTURE_MS = 300

/** 音の扱いを切り替える部品（テストできるように、audioSession・時計・タイマーを外から渡す） */
export function createAudioSessionController(
  session: AudioSessionLike | undefined,
  now: () => number,
  later: (fn: () => void, ms: number) => void = (fn, ms) => void setTimeout(fn, ms),
) {
  let holds = 0
  let lastHold = 0
  /** マイクで聞いている */
  let capturing = false
  /** マイクを閉じた後、扱いをかけ直している途中（まだ音を戻さない） */
  let settling = false
  /** かけ直しの順番（マイクをまた使い始めたら、前のかけ直しの終わりは無視する） */
  let captureSeq = 0
  /** このページでマイクを使った */
  let micUsed = false
  /** 設定：話して答えたあと、BGM・効果音を止める */
  let quietAfterMic = false
  const listeners = new Set<() => void>()

  function set(type: AudioSessionType) {
    if (session === undefined || session.type === type) return
    try {
      session.type = type
    } catch {
      // 切り替えられない環境では、そのまま（音は鳴る）
    }
    logAudio(`扱いを ${type} にした`)
  }
  function changed() {
    for (const l of listeners) l()
  }
  /**
   * ふだんの扱い（ambient）をかけ直す。同じ値を入れてもブラウザは何もしないので、一度 'auto' にしてから戻す。
   * 読み上げの間（playback）は、読み上げが終わったときに ambient にするので、ここでは変えない
   */
  function reapplyAmbient() {
    if (session === undefined || holds > 0) return
    try {
      session.type = 'auto'
      session.type = 'ambient'
    } catch {
      // 切り替えられない環境では、そのまま
    }
    logAudio('かけ直し（auto → ambient）')
  }
  function releaseAll() {
    holds = 0
    logAudio('読み上げ：終わった')
    set('ambient')
    changed()
  }

  return {
    /** マナーモードを区別できるブラウザか */
    supported: session !== undefined,
    /** 起動時：ふだんの扱い（マナーモードでは鳴らさない）にする。前のページのマイクの扱いが残っていても戻すため、かけ直す */
    start() {
      reapplyAmbient()
    },
    /** マイクで聞き始めた・マイクを閉じた。閉じたら、扱いをかけ直して少し待ってから音を戻す */
    setCapturing(value: boolean) {
      if (value === capturing) return
      capturing = value
      const seq = ++captureSeq
      if (value) {
        micUsed = true
        settling = false
        logAudio('マイク：聞き始めた（BGM・効果音を止める）')
        changed()
        return
      }
      settling = true
      logAudio('マイク：閉じた')
      reapplyAmbient()
      later(() => {
        if (seq !== captureSeq) return
        settling = false
        reapplyAmbient()
        logAudio(quietAfterMic ? 'マイクの後のかけ直しが終わった（設定により、BGM・効果音は止めたまま）' : 'マイクの後のかけ直しが終わった（BGM・効果音を戻す）')
        changed()
      }, AFTER_CAPTURE_MS)
    },
    /** 読み上げの前に呼ぶ。読み上げが終わったら、返した関数を呼ぶ */
    hold(): () => void {
      holds += 1
      lastHold = now()
      logAudio('読み上げ：始める')
      set('playback')
      if (holds === 1) changed()
      let released = false
      return () => {
        if (released || holds === 0) return
        released = true
        holds -= 1
        if (holds === 0) releaseAll()
      }
    },
    /** 設定「話して答えたあと、BGM・効果音を止める」を反映する */
    setQuietAfterMic(value: boolean) {
      if (value === quietAfterMic) return
      quietAfterMic = value
      logAudio(`設定「話して答えたあと、BGM・効果音を止める」：${value ? 'オン' : 'オフ'}`)
      if (micUsed) changed()
    },
    /** マイクを使った後で、設定により BGM・効果音を止めている（ページを開き直すまで） */
    quiet: () => quietAfterMic && micUsed,
    /** 読み上げのための扱いにしている間 */
    held: () => holds > 0,
    /** BGM・効果音を止めておく間：読み上げの間、マイクで聞いている間、マイクを閉じた後のかけ直しの間 */
    unsafe: () => holds > 0 || capturing || settling,
    /** 定期的に：読み上げが止まって長く経つのに戻っていなければ（終わりの知らせが来なかった）、戻す。「読み上げ中」が長く続きすぎても戻す */
    check(speaking: boolean) {
      const since = now() - lastHold
      if (holds > 0 && ((!speaking && since > SPEECH_HOLD_TIMEOUT_MS) || since > SPEECH_HOLD_MAX_MS)) releaseAll()
    },
    subscribe(listener: () => void): () => void {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}

function browserSession(): AudioSessionLike | undefined {
  if (typeof navigator === 'undefined') return undefined
  return (navigator as Navigator & { audioSession?: AudioSessionLike }).audioSession
}

const controller = createAudioSessionController(browserSession(), () => (typeof performance === 'undefined' ? Date.now() : performance.now()))

/** マナーモードを区別できるブラウザか（navigator.audioSession がある。iPhone の Safari など。設定の初期値に使う） */
export function hasAudioSession(): boolean {
  return browserSession() !== undefined
}

/** 設定「話して答えたあと、BGM・効果音を止める」 */
export function setQuietAfterVoiceInput(value: boolean): void {
  controller.setQuietAfterMic(value)
}

/** 起動時に1回呼ぶ */
export function initAudioSession(): void {
  controller.start()
}
subscribeListening(() => controller.setCapturing(isListening()))

let watchdog: number | null = null

/** 読み上げの前に呼び、終わったら返した関数を呼ぶ。終わりの知らせが来ないときのために、読み上げが止まったかを見張る */
export function holdAudioForSpeech(): () => void {
  const release = controller.hold()
  if (controller.supported && watchdog === null && typeof window !== 'undefined') {
    watchdog = window.setInterval(() => {
      controller.check(typeof speechSynthesis !== 'undefined' && (speechSynthesis.speaking || speechSynthesis.pending))
      if (!controller.held() && watchdog !== null) {
        window.clearInterval(watchdog)
        watchdog = null
      }
    }, 1000)
  }
  return release
}

/**
 * BGM・効果音を止めておくべきか。この間は流し始めない。
 * - マナーモードを区別できるブラウザで、読み上げの間・マイクで聞いている間・マイクの後のかけ直しの間
 * - 設定「話して答えたあと、BGM・効果音を止める」がオンで、このページでマイクを使った後（どのブラウザでも）
 */
export function isSilentModeUnsafe(): boolean {
  return controller.quiet() || (controller.supported && controller.unsafe())
}

export function subscribeAudioSession(listener: () => void): () => void {
  return controller.subscribe(listener)
}
