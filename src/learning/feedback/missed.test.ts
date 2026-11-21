import { describe, expect, it } from 'vitest'
import type { PracticeQuestion } from '../practice/questions'
import { isAlternative, missedFromPractice, optionState } from './missed'

const model = { korean: '커피', pronunciation: 'コピ', japanese: 'コーヒー' }

function question(over: Partial<PracticeQuestion>): PracticeQuestion {
  return { key: 'word:vocab_001', form: 'jaKo', chapter: 1, heading: '韓国語で何と言いますか', prompt: { kind: 'japanese', text: 'コーヒー', hint: null }, body: { type: 'write', answers: ['커피'], rejectDigits: false }, model, ...over }
}

describe('optionState（選択肢の印）', () => {
  it('答える前は印なし', () => {
    expect(optionState('커피', ['커피'], null)).toBeNull()
  })
  it('選んだ正解・選んだ不正解・選ばなかった正解・それ以外', () => {
    expect(optionState('커피', ['커피'], '커피')).toBe('chosenAnswer')
    expect(optionState('코피', ['커피'], '코피')).toBe('wrong')
    expect(optionState('커피', ['커피'], '코피')).toBe('answer')
    expect(optionState('차', ['커피'], '코피')).toBeNull()
  })
})

describe('missedFromPractice（結果画面で見返す内容）', () => {
  it('書く問題：日本語のお題・自分の答え・正解として認める文', () => {
    const m = missedFromPractice(question({}), '코피', 'q0')
    expect(m).toMatchObject({ style: 'text', given: '코피', answers: ['커피'], question: { text: 'コーヒー', lang: 'ja' }, listen: null, note: null })
  })

  it('聞いて選ぶ問題：選んだ音と正解の音を聞き比べられる', () => {
    const q = question({
      form: 'listen',
      prompt: { kind: 'audio', phrase: model },
      body: { type: 'choose', options: [{ text: '커피', reading: null, lang: 'ko' }, { text: '코피', reading: null, lang: 'ko' }], answers: ['커피'] },
    })
    const m = missedFromPractice(q, '코피', 'q1')
    expect(m).toMatchObject({ style: 'choice', question: null, listen: { given: '코피', answer: '커피' } })
  })

  it('日本語の選択肢を選んだときは、選んだものは聞けない', () => {
    const q = question({ form: 'koJa', prompt: { kind: 'korean', phrase: model }, body: { type: 'choose', options: [{ text: 'コーヒー', reading: null, lang: 'ja' }, { text: '鼻血', reading: null, lang: 'ja' }], answers: ['コーヒー'] } })
    expect(missedFromPractice(q, '鼻血', 'q2')).toMatchObject({ givenLang: 'ja', listen: null, question: { text: '커피', lang: 'ko' } })
  })

  it('数字の問題と、説明（note）', () => {
    const q = question({ form: 'number', body: { type: 'number', digits: '3500' }, note: '漢数詞' })
    expect(missedFromPractice(q, '3600', 'q3')).toMatchObject({ style: 'digits', answers: ['3500'], note: '漢数詞' })
  })
})

describe('isAlternative（別解で正解したか）', () => {
  it('模範解答と、空白・句読点の違いだけなら別解ではない', () => {
    expect(isAlternative('커피 주세요', '커피 주세요.')).toBe(false)
    expect(isAlternative('커피주세요', '커피 주세요.')).toBe(false)
    expect(isAlternative('한 개', '하나')).toBe(true)
  })
})
