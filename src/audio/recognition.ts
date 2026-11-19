// 韓国語の音声認識（ブラウザの音声認識機能、Web Speech API。GAME_SPEC 4-5）。
// 使えるかどうかは実行時に確かめる。Firefox など機能のないブラウザでは「使えない」とし、画面はマイクボタンを出さない。
// マイクを許可されなかったときなど、続けて使えないと分かったときも「使えない」にして、マイクボタンを隠す（再読み込みまで）。
// TypeScript の標準の型に音声認識がないため、使う部分だけの型をここで定義する（パッケージは追加しない）。

interface RecognitionAlternativeLike {
  transcript: string
}

interface RecognitionResultLike {
  readonly length: number
  [index: number]: RecognitionAlternativeLike | undefined
}

interface RecognitionEventLike {
  results: { readonly length: number; [index: number]: RecognitionResultLike | undefined }
}

interface RecognitionErrorEventLike {
  error: string
}

interface RecognitionLike {
  lang: string
  interimResults: boolean
  continuous: boolean
  maxAlternatives: number
  onresult: ((e: RecognitionEventLike) => void) | null
  onerror: ((e: RecognitionErrorEventLike) => void) | null
  onend: (() => void) | null
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

/** 韓国語を1回聞き取る。使えない環境では、すぐに error を返す */
export function recognizeKorean(): RecognitionSession {
  const Ctor = recognitionConstructor()
  if (Ctor === null || getRecognitionStatus().state !== 'available') {
    const error = describeRecognitionError('language-not-supported')
    return { result: Promise.resolve({ kind: 'error', error }), stop: () => {}, abort: () => {} }
  }
  const rec = new Ctor()
  rec.lang = 'ko-KR'
  rec.interimResults = false
  rec.continuous = false
  rec.maxAlternatives = MAX_ALTERNATIVES

  const result = new Promise<RecognitionOutcome>((resolve) => {
    let settled = false
    const finish = (outcome: RecognitionOutcome) => {
      if (settled) return
      settled = true
      if (outcome.kind === 'error' && outcome.error.fatal) markUnavailable(outcome.error.message)
      resolve(outcome)
    }
    rec.onresult = (e) => {
      const first = e.results[0]
      const alternatives: string[] = []
      for (let i = 0; i < (first?.length ?? 0); i++) {
        const t = first?.[i]?.transcript.trim()
        if (t !== undefined && t !== '') alternatives.push(t)
      }
      finish(alternatives.length > 0 ? { kind: 'heard', alternatives } : { kind: 'error', error: describeRecognitionError('no-speech') })
    }
    rec.onerror = (e) => finish({ kind: 'error', error: describeRecognitionError(e.error) })
    // 結果もエラーもなく終わった場合（何も話さなかったなど）
    rec.onend = () => finish({ kind: 'error', error: describeRecognitionError('no-speech') })
    try {
      rec.start()
    } catch (e) {
      finish({ kind: 'error', error: { ...describeRecognitionError('other'), message: `音声認識を始められませんでした（${String(e)}）。` } })
    }
  })
  return { result, stop: () => rec.stop(), abort: () => rec.abort() }
}
