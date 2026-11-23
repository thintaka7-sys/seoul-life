// iPhone のマナーモード（消音スイッチ）への対応（Phase 3 区切り2 のスマホ確認）。
// - ふだんは音の扱いを「ambient」にする：BGM・効果音は、マナーモードでは鳴らない（ほかのアプリの音とも混ざる）
// - 読み上げ（すべてプレイヤーがボタンを押して始める）の間だけ「playback」にする：学習に必要なので、マナーモードでも鳴らす
//   「playback」の間は BGM・効果音もマナーモードで鳴ってしまうため、その間は BGM・効果音の音量を 0 にする（engine.ts）
// navigator.audioSession（Safari 16.4 以降）がないブラウザでは何もしない（マナーモードの区別がないため）。

export type AudioSessionType = 'auto' | 'playback' | 'transient' | 'transient-solo' | 'ambient' | 'play-and-record'

export interface AudioSessionLike {
  type: AudioSessionType
}

/** 読み上げが終わった知らせが来ないときに、ふだんの扱いに戻すまでの時間（読み上げが止まってから） */
export const SPEECH_HOLD_TIMEOUT_MS = 5000

/** 音の扱いを切り替える部品（テストできるように、audioSession と時計を外から渡す） */
export function createAudioSessionController(session: AudioSessionLike | undefined, now: () => number) {
  let holds = 0
  let lastHold = 0
  const listeners = new Set<() => void>()

  function set(type: AudioSessionType) {
    if (session === undefined || session.type === type) return
    try {
      session.type = type
    } catch {
      // 切り替えられない環境では、そのまま（音は鳴る）
    }
  }
  function changed() {
    for (const l of listeners) l()
  }
  function releaseAll() {
    holds = 0
    set('ambient')
    changed()
  }

  return {
    /** マナーモードを区別できるブラウザか */
    supported: session !== undefined,
    /** 起動時：ふだんの扱い（マナーモードでは鳴らさない）にする */
    start() {
      set('ambient')
    },
    /** 読み上げの前に呼ぶ。読み上げが終わったら、返した関数を呼ぶ */
    hold(): () => void {
      holds += 1
      lastHold = now()
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
    /** 読み上げのための扱いにしている間 */
    held: () => holds > 0,
    /** 定期的に：読み上げが止まって長く経つのに戻っていなければ（終わりの知らせが来なかった）、戻す */
    check(speaking: boolean) {
      if (holds > 0 && !speaking && now() - lastHold > SPEECH_HOLD_TIMEOUT_MS) releaseAll()
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

/** 起動時に1回呼ぶ */
export function initAudioSession(): void {
  controller.start()
}

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

/** BGM・効果音を消しておくべきか（マナーモードを区別できるブラウザで、読み上げのための扱いにしている間） */
export function isSilentModeUnsafe(): boolean {
  return controller.supported && controller.held()
}

export function subscribeAudioSession(listener: () => void): () => void {
  return controller.subscribe(listener)
}
