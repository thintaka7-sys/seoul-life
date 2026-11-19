import { describe, expect, it } from 'vitest'
import { describeRecognitionError, getRecognitionStatus, recognizeKorean } from './recognition'

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
