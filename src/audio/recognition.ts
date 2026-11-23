// 韓国語の音声認識（ブラウザの音声認識機能、Web Speech API。GAME_SPEC 4-5）。
// 使えるかどうかは実行時に確かめる。Firefox など機能のないブラウザでは「使えない」とし、画面はマイクボタンを出さない。
// マイクを許可されなかったときなど、続けて使えないと分かったときも「使えない」にして、マイクボタンを隠す（再読み込みまで）。
// TypeScript の標準の型に音声認識がないため、使う部分だけの型をここで定義する（パッケージは追加しない）。

interface RecognitionAlternativeLike {
  transcript: string
}

interface RecognitionResultLike {
  readonly length: number
  /** 確定した結果か（途中の結果は false） */
  readonly isFinal?: boolean
  [index: number]: RecognitionAlternativeLike | undefined
}

export interface RecognitionEventLike {
  results: { readonly length: number; [index: number]: RecognitionResultLike | undefined }
}

interface RecognitionErrorEventLike {
  error: string
}

export interface RecognitionLike {
  lang: string
  interimResults: boolean
  continuous: boolean
  maxAlternatives: number
  onresult: ((e: RecognitionEventLike) => void) | null
  onerror: ((e: RecognitionErrorEventLike) => void) | null
  onend: (() => void) | null
  onstart: (() => void) | null
  onaudiostart: (() => void) | null
  start(): void
  stop(): void
  abort(): void
}

type RecognitionConstructor = new () => RecognitionLike

/** 認識結果の候補をいくつ受け取るか */
const MAX_ALTERNATIVES = 5

function recognitionConstructor(): RecognitionConstructor | null {
  if (typeof window === 'undefined') return null
  // 標準の名前（SpeechRecognition）と、Chrome・Safari の webkit の名前の両方を確かめる
  const w = window as unknown as { SpeechRecognition?: RecognitionConstructor; webkitSpeechRecognition?: RecognitionConstructor }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

export type RecognitionStatus = { state: 'available' } | { state: 'unavailable'; reason: string }

let status: RecognitionStatus | null = null
const listeners = new Set<() => void>()

/** 音声認識が使えるか。最初に呼んだときに、ブラウザの機能があるかを確かめる */
export function getRecognitionStatus(): RecognitionStatus {
  if (status === null) {
    status = recognitionConstructor() === null ? { state: 'unavailable', reason: 'このブラウザは音声認識に対応していません' } : { state: 'available' }
  }
  return status
}

export function subscribeRecognition(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function markUnavailable(reason: string) {
  status = { state: 'unavailable', reason }
  for (const l of listeners) l()
}

export type RecognitionErrorKind = 'no-speech' | 'network' | 'blocked' | 'unsupported' | 'aborted' | 'other'

export interface RecognitionError {
  kind: RecognitionErrorKind
  /** 画面に出す理由（日本語） */
  message: string
  /** 続けて使えない（マイクを隠す）か */
  fatal: boolean
}

/** ブラウザのエラーの種類を、画面に出す理由にする */
export function describeRecognitionError(code: string): RecognitionError {
  switch (code) {
    case 'no-speech':
      return { kind: 'no-speech', message: '声が聞き取れませんでした。マイクに向かって、もう一度話してみましょう。', fatal: false }
    case 'audio-capture':
      return { kind: 'blocked', message: 'マイクが見つかりません。マイクをつないでから、もう一度試してください。', fatal: false }
    case 'network':
      return { kind: 'network', message: '通信できないため、声を文字にできませんでした（音声認識には通信が必要なことがあります）。', fatal: false }
    case 'not-allowed':
    case 'service-not-allowed':
      return { kind: 'blocked', message: 'マイクの使用が許可されていないため、話して答えることはできません（ブラウザの設定でマイクを許可すると使えます）。', fatal: true }
    case 'language-not-supported':
      return { kind: 'unsupported', message: 'この端末では、韓国語の音声認識が使えません。', fatal: true }
    case 'aborted':
      return { kind: 'aborted', message: '聞き取りを止めました。', fatal: false }
    default:
      return { kind: 'other', message: `うまく聞き取れませんでした（${code}）。もう一度試してください。`, fatal: false }
  }
}

export type RecognitionOutcome = { kind: 'heard'; alternatives: string[] } | { kind: 'error'; error: RecognitionError }

export interface RecognitionSession {
  result: Promise<RecognitionOutcome>
  /** 話し終えたことにして、ここまでの声を文字にする */
  stop: () => void
  /** 聞き取りをやめる（結果は aborted） */
  abort: () => void
}

export interface RecognitionCallbacks {
  /** マイクが声を拾い始めた（ここから話してもらう。押した直後はまだ拾っていない） */
  onReady?: () => void
  /** 聞き取りの途中の文字（確定前） */
  onPartial?: (text: string) => void
}

/** 最後の結果が確定してから、ブラウザが聞き取りを終えるまで待つ時間（終わらないブラウザがあるため） */
export const FINAL_GRACE_MS = 1500

/**
 * 認識結果（区切りごとの候補）を、文全体の候補の一覧にする（確からしい順・重複なし）。
 * 文が2つ以上の区切りに分かれて届くことがあるので、区切りをつなぐ。i 番目の候補がない区切りは、1番目の候補を使う。
 */
export function collectAlternatives(results: RecognitionEventLike['results']): string[] {
  const segments: string[][] = []
  for (let k = 0; k < results.length; k++) {
    const r = results[k]
    if (r === undefined) continue
    const alts: string[] = []
    for (let i = 0; i < r.length; i++) {
      const t = r[i]?.transcript.trim()
      if (t !== undefined && t !== '') alts.push(t)
    }
    if (alts.length > 0) segments.push(alts)
  }
  if (segments.length === 0) return []
  const most = Math.max(...segments.map((s) => s.length))
  const out: string[] = []
  for (let i = 0; i < most; i++) {
    const sentence = segments
      .map((s) => s[i] ?? s[0] ?? '')
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim()
    if (sentence !== '' && !out.includes(sentence)) out.push(sentence)
  }
  return out
}

/**
 * 1回の聞き取りを進める（ブラウザの音声認識の部品を受け取る。テストでは偽物を渡す）。
 * - 最初に届いた結果ではなく、聞き取りが終わったときの結果で判定する（iPhone は文の途中までの結果が先に届くため。BUG-004）。
 * - 途中の結果も受け取っておき、確定した結果がないまま終わったときはそれを使う。
 */
export function runRecognition(rec: RecognitionLike, callbacks: RecognitionCallbacks = {}): RecognitionSession {
  rec.lang = 'ko-KR'
  rec.interimResults = true
  rec.continuous = false
  rec.maxAlternatives = MAX_ALTERNATIVES

  let aborted = false
  const result = new Promise<RecognitionOutcome>((resolve) => {
    let settled = false
    let latest: string[] = []
    let ready = false
    let graceTimer: ReturnType<typeof setTimeout> | undefined
    const finish = (outcome: RecognitionOutcome) => {
      if (settled) return
      settled = true
      if (graceTimer !== undefined) clearTimeout(graceTimer)
      if (outcome.kind === 'error' && outcome.error.fatal) markUnavailable(outcome.error.message)
      resolve(outcome)
    }
    const finishWithLatest = (fallback: RecognitionError) => finish(latest.length > 0 ? { kind: 'heard', alternatives: latest } : { kind: 'error', error: fallback })
    const markReady = () => {
      if (ready) return
      ready = true
      callbacks.onReady?.()
    }
    rec.onstart = markReady
    rec.onaudiostart = markReady
    rec.onresult = (e) => {
      markReady()
      const alternatives = collectAlternatives(e.results)
      if (alternatives.length === 0) return
      latest = alternatives
      callbacks.onPartial?.(alternatives[0] ?? '')
      let allFinal = true
      for (let k = 0; k < e.results.length; k++) if (e.results[k]?.isFinal !== true) allFinal = false
      if (allFinal) {
        if (graceTimer !== undefined) clearTimeout(graceTimer)
        graceTimer = setTimeout(() => finishWithLatest(describeRecognitionError('no-speech')), FINAL_GRACE_MS)
      }
    }
    rec.onerror = (e) => {
      if (aborted || e.error === 'aborted') {
        finish({ kind: 'error', error: describeRecognitionError('aborted') })
        return
      }
      // 途中まで聞き取れていれば、エラーにせずそれで判定する（声が途切れた・通信が切れたなど）
      const error = describeRecognitionError(e.error)
      if (!error.fatal && latest.length > 0) finish({ kind: 'heard', alternatives: latest })
      else finish({ kind: 'error', error })
    }
    // 聞き取りが終わった（話し終えた・ボタンで止めた）。何も聞き取れていなければ「声が聞き取れない」
    rec.onend = () => (aborted ? finish({ kind: 'error', error: describeRecognitionError('aborted') }) : finishWithLatest(describeRecognitionError('no-speech')))
    try {
      rec.start()
    } catch (e) {
      finish({ kind: 'error', error: { ...describeRecognitionError('other'), message: `音声認識を始められませんでした（${String(e)}）。` } })
    }
  })
  return {
    result,
    stop: () => rec.stop(),
    abort: () => {
      aborted = true
      rec.abort()
    },
  }
}

/**
 * 聞き取り中のマイク（スマホ確認：話して答えるとき BGM が鳴ったままで話しにくい）。
 * 聞いている間は BGM を消し（bgm.ts）、画面が見えなくなったら聞き取りをやめる（pageVisibility.ts）。
 */
export function createListeningTracker() {
  const active = new Set<RecognitionSession>()
  const listeners = new Set<() => void>()
  const changed = () => {
    for (const l of listeners) l()
  }
  return {
    /** 聞き取りを始めた。結果が出たら（止めた・やめたを含む）自動で外す */
    track(session: RecognitionSession): RecognitionSession {
      active.add(session)
      if (active.size === 1) changed()
      void session.result.finally(() => {
        if (active.delete(session) && active.size === 0) changed()
      })
      return session
    },
    listening: () => active.size > 0,
    /** 聞き取り中のものを、すべてやめる */
    abortAll() {
      for (const s of [...active]) s.abort()
    },
    subscribe(listener: () => void): () => void {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}

const tracker = createListeningTracker()

/** マイクで聞いている途中か */
export const isListening = tracker.listening
/** 聞いている途中かどうかが変わったら知らせる */
export const subscribeListening = tracker.subscribe
/** 聞き取りをやめる（画面が見えなくなったとき） */
export const abortListening = tracker.abortAll

/** 韓国語を1回聞き取る。使えない環境では、すぐに error を返す */
export function recognizeKorean(callbacks: RecognitionCallbacks = {}): RecognitionSession {
  const Ctor = recognitionConstructor()
  if (Ctor === null || getRecognitionStatus().state !== 'available') {
    const error = describeRecognitionError('language-not-supported')
    return { result: Promise.resolve({ kind: 'error', error }), stop: () => {}, abort: () => {} }
  }
  return tracker.track(runRecognition(new Ctor(), callbacks))
}
