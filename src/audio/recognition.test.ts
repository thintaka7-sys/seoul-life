import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  CLOSE_WAIT_MS,
  FINAL_GRACE_MS,
  collectAlternatives,
  createListeningTracker,
  describeRecognitionError,
  getRecognitionStatus,
  recognizeKorean,
  runRecognition,
  type RecognitionEventLike,
  type RecognitionLike,
} from './recognition'

describe('音声認識', () => {
  it('機能のない環境（テストの環境）では使えないとし、聞き取りはすぐにエラーを返す', async () => {
    expect(getRecognitionStatus()).toEqual({ state: 'unavailable', reason: 'このブラウザは音声認識に対応していません' })
    const outcome = await recognizeKorean().result
    expect(outcome).toMatchObject({ kind: 'error', error: { fatal: true } })
  })

  it('マイクを許可されなかった・韓国語が使えないときは、続けて使えない（マイクを隠す）', () => {
    expect(describeRecognitionError('not-allowed')).toMatchObject({ kind: 'blocked', fatal: true })
    expect(describeRecognitionError('service-not-allowed')).toMatchObject({ kind: 'blocked', fatal: true })
    expect(describeRecognitionError('language-not-supported')).toMatchObject({ kind: 'unsupported', fatal: true })
  })

  it('声が聞き取れない・通信できないときは、もう一度試せる', () => {
    expect(describeRecognitionError('no-speech')).toMatchObject({ kind: 'no-speech', fatal: false })
    expect(describeRecognitionError('network')).toMatchObject({ kind: 'network', fatal: false })
    expect(describeRecognitionError('something-new')).toMatchObject({ kind: 'other', fatal: false })
    expect(describeRecognitionError('something-new').message).toContain('something-new')
  })
})

/** 区切りごとの候補から、認識結果を作る（final: 確定したか） */
function results(...segments: { alts: string[]; final: boolean }[]): RecognitionEventLike['results'] {
  return segments.map((s) => Object.assign(s.alts.map((transcript) => ({ transcript })), { isFinal: s.final }))
}

function fakeRecognition() {
  const rec: RecognitionLike & { started: boolean; stopped: boolean } = {
    lang: '',
    interimResults: false,
    continuous: true,
    maxAlternatives: 1,
    onresult: null,
    onerror: null,
    onend: null,
    onstart: null,
    onaudiostart: null,
    started: false,
    stopped: false,
    start() {
      rec.started = true
    },
    stop() {
      rec.stopped = true
      rec.onend?.()
    },
    abort() {
      rec.onerror?.({ error: 'aborted' })
      rec.onend?.()
    },
  }
  return rec
}

describe('聞き取った結果のまとめ方（BUG-004）', () => {
  afterEach(() => vi.useRealTimers())

  it('文が区切りに分かれて届いたら、つないで1つの文にする', () => {
    expect(collectAlternatives(results({ alts: ['아메리카노'], final: true }, { alts: ['한 잔 주세요', '한잔 주세요'], final: true }))).toEqual([
      '아메리카노 한 잔 주세요',
      '아메리카노 한잔 주세요',
    ])
  })

  it('同じ候補は1つにし、空の候補は除く', () => {
    expect(collectAlternatives(results({ alts: ['네', ' 네 ', ''], final: true }))).toEqual(['네'])
    expect(collectAlternatives(results())).toEqual([])
  })

  it('韓国語で、途中の結果も受け取る設定で聞く', () => {
    const rec = fakeRecognition()
    runRecognition(rec)
    expect(rec).toMatchObject({ lang: 'ko-KR', interimResults: true, continuous: false, started: true })
  })

  it('マイクが声を拾い始めたら知らせる（1回だけ）', () => {
    const rec = fakeRecognition()
    const onReady = vi.fn()
    runRecognition(rec, { onReady })
    rec.onstart?.()
    rec.onaudiostart?.()
    expect(onReady).toHaveBeenCalledTimes(1)
  })

  it('途中の結果ではまだ判定せず、聞き取りが終わったときの結果を使う', async () => {
    const rec = fakeRecognition()
    const onPartial = vi.fn()
    const s = runRecognition(rec, { onPartial })
    let done = false
    void s.result.then(() => (done = true))
    rec.onresult?.({ results: results({ alts: ['아메리카노'], final: false }) })
    await Promise.resolve()
    expect(done).toBe(false)
    expect(onPartial).toHaveBeenLastCalledWith('아메리카노')
    rec.onresult?.({ results: results({ alts: ['아메리카노 한 잔 주세요'], final: true }) })
    rec.onend?.()
    expect(await s.result).toEqual({ kind: 'heard', alternatives: ['아메리카노 한 잔 주세요'] })
  })

  it('確定した結果がないまま終わったら、途中の結果で判定する（iPhone）', async () => {
    const rec = fakeRecognition()
    const s = runRecognition(rec)
    rec.onresult?.({ results: results({ alts: ['고마워요'], final: false }) })
    rec.onend?.()
    expect(await s.result).toEqual({ kind: 'heard', alternatives: ['고마워요'] })
  })

  it('確定した後にブラウザが終わらなくても、少し待って判定する。そのときはマイクを閉じさせる', async () => {
    vi.useFakeTimers()
    const rec = fakeRecognition()
    let aborts = 0
    rec.abort = () => {
      aborts += 1
    }
    const s = runRecognition(rec)
    let closed = false
    void s.closed.then(() => (closed = true))
    rec.onresult?.({ results: results({ alts: ['네'], final: true }) })
    vi.advanceTimersByTime(FINAL_GRACE_MS)
    expect(await s.result).toEqual({ kind: 'heard', alternatives: ['네'] })
    expect(aborts).toBe(1)
    // ブラウザが終わった知らせを出さなくても、少し待ったら閉じたことにする
    await Promise.resolve()
    expect(closed).toBe(false)
    vi.advanceTimersByTime(CLOSE_WAIT_MS)
    await Promise.resolve()
    expect(closed).toBe(true)
  })

  it('ブラウザが聞き取りを終えたら（onend）閉じたことにし、知らせを外してから念のため abort する（Safari がマイクを開いたままにするため）', async () => {
    const rec = fakeRecognition()
    let aborts = 0
    rec.abort = () => {
      aborts += 1
    }
    const s = runRecognition(rec)
    rec.onresult?.({ results: results({ alts: ['네'], final: false }) })
    rec.onend?.()
    await s.closed
    expect(await s.result).toEqual({ kind: 'heard', alternatives: ['네'] })
    expect(aborts).toBe(1)
    expect([rec.onresult, rec.onerror, rec.onend, rec.onstart, rec.onaudiostart]).toEqual([null, null, null, null, null])
  })

  it('ボタンで止めたら、そこまでの声で判定する', async () => {
    const rec = fakeRecognition()
    const s = runRecognition(rec)
    rec.onresult?.({ results: results({ alts: ['안녕하세요'], final: false }) })
    s.stop()
    expect(await s.result).toEqual({ kind: 'heard', alternatives: ['안녕하세요'] })
  })

  it('何も聞き取れずに終わったら「声が聞き取れない」', async () => {
    const rec = fakeRecognition()
    const s = runRecognition(rec)
    rec.onend?.()
    expect(await s.result).toMatchObject({ kind: 'error', error: { kind: 'no-speech' } })
  })

  it('途中まで聞き取れていれば、声が途切れた・通信が切れたエラーでも、それで判定する', async () => {
    const rec = fakeRecognition()
    const s = runRecognition(rec)
    rec.onresult?.({ results: results({ alts: ['감사합니다'], final: false }) })
    rec.onerror?.({ error: 'network' })
    expect(await s.result).toEqual({ kind: 'heard', alternatives: ['감사합니다'] })
  })

  it('画面を離れて止めたときは、聞き取った途中の結果があっても aborted', async () => {
    const rec = fakeRecognition()
    const s = runRecognition(rec)
    rec.onresult?.({ results: results({ alts: ['네'], final: false }) })
    s.abort()
    expect(await s.result).toMatchObject({ kind: 'error', error: { kind: 'aborted' } })
  })
})

describe('聞き取り中のマイク（BGM を消す・画面が見えなくなったらやめる）', () => {
  it('聞いている間だけ listening。結果が出たら外れ、変わったときだけ知らせる', async () => {
    const tracker = createListeningTracker()
    let changes = 0
    tracker.subscribe(() => (changes += 1))
    const rec = fakeRecognition()
    const s = tracker.track(runRecognition(rec))
    expect(tracker.listening()).toBe(true)
    rec.onresult?.({ results: results({ alts: ['네'], final: false }) })
    s.stop()
    await s.result
    await Promise.resolve()
    expect(tracker.listening()).toBe(false)
    expect(changes).toBe(2)
  })

  it('結果が出ても、ブラウザがマイクを閉じるまでは listening のまま', async () => {
    const tracker = createListeningTracker()
    const rec = fakeRecognition()
    rec.abort = () => {}
    vi.useFakeTimers()
    const s = tracker.track(runRecognition(rec))
    rec.onresult?.({ results: results({ alts: ['네'], final: true }) })
    vi.advanceTimersByTime(FINAL_GRACE_MS)
    await s.result
    await Promise.resolve()
    expect(tracker.listening()).toBe(true)
    rec.onend?.()
    await s.closed
    await Promise.resolve()
    expect(tracker.listening()).toBe(false)
  })

  it('abortAll で、聞き取り中のものをすべてやめる（結果は aborted）', async () => {
    const tracker = createListeningTracker()
    const a = tracker.track(runRecognition(fakeRecognition()))
    const b = tracker.track(runRecognition(fakeRecognition()))
    tracker.abortAll()
    expect(await a.result).toMatchObject({ kind: 'error', error: { kind: 'aborted' } })
    expect(await b.result).toMatchObject({ kind: 'error', error: { kind: 'aborted' } })
    await Promise.resolve()
    expect(tracker.listening()).toBe(false)
  })
})
