import { describe, expect, it } from 'vitest'
import { getSpeechStatus, initSpeech, pickKoreanVoice, speechRateValue } from './speech'

describe('pickKoreanVoice', () => {
  it('韓国語の音声がなければ null', () => {
    expect(pickKoreanVoice([{ lang: 'ja-JP', name: 'Kyoko' }, { lang: 'en-US', name: 'Samantha' }])).toBeNull()
    expect(pickKoreanVoice([])).toBeNull()
  })

  it('ko-KR を優先し、同じなら端末内の音声を優先する', () => {
    const voices = [
      { lang: 'ko', name: 'A' },
      { lang: 'ko-KR', name: 'B', localService: false },
      { lang: 'ko-KR', name: 'C', localService: true },
    ]
    expect(pickKoreanVoice(voices)?.name).toBe('C')
  })

  it('ko_KR のような書き方も韓国語として扱う', () => {
    expect(pickKoreanVoice([{ lang: 'ko_KR', name: 'Android' }])?.name).toBe('Android')
  })
})

describe('speechRateValue', () => {
  it('ゆっくりは 0.5、ふつうは 1（BUG-010 で 0.7 → 0.5）', () => {
    expect(speechRateValue('slow')).toBe(0.5)
    expect(speechRateValue('normal')).toBe(1)
  })
})

describe('initSpeech', () => {
  it('読み上げ機能のない環境では、理由つきで使えない状態になる', () => {
    initSpeech()
    expect(getSpeechStatus()).toMatchObject({ state: 'unavailable' })
  })
})
