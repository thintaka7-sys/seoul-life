import { describe, expect, it } from 'vitest'
import { loadContent, validateFile, type ContentInput, type ReferenceContext } from './validate'

const ctx: ReferenceContext = {
  locationIds: new Set(['cafe', 'home']),
  characterIds: new Set(['cafe_staff']),
}

const validVocab = {
  id: 'vocab_001',
  korean: '커피',
  pronunciation: 'コピ',
  japanese: 'コーヒー',
  partOfSpeech: 'noun',
  category: 'drink',
  level: 1,
  reviewed: false,
}

const validGrammar = {
  id: 'grammar_001',
  title: '이에요 / 예요',
  level: 1,
  explanation: '～です',
  examples: [{ korean: '저는 학생이에요.', japanese: '私は学生です。' }],
  reviewed: false,
}

const validConversation = {
  id: 'cafe_001',
  chapter: 3,
  location: 'cafe',
  character: 'cafe_staff',
  lines: [
    { speaker: 'cafe_staff', korean: '뭐 드릴까요?', japanese: '何になさいますか？' },
    { speaker: 'player', korean: '커피 주세요.', japanese: 'コーヒーをください。' },
  ],
  choices: [
    { korean: '커피 주세요.', japanese: 'コーヒーをください。', correct: true },
    { korean: '집에 가요.', japanese: '家に帰ります。', correct: false },
  ],
  freeAnswer: { prompt: 'コーヒーをください', answers: ['커피 주세요.', '커피 한 잔 주세요.'] },
  reviewed: true,
}

function issuesOf(kind: 'vocabulary' | 'grammar' | 'conversations', item: unknown) {
  return validateFile(kind, 'test.json', [item], ctx).issues
}

describe('単語の検証', () => {
  it('正しいデータは通る', () => {
    const result = validateFile('vocabulary', 'test.json', [validVocab], ctx)
    expect(result.issues).toEqual([])
    expect(result.items).toEqual([validVocab])
  })

  it('任意項目（alternatives・example・notes）があっても通る', () => {
    const item = { ...validVocab, alternatives: ['코오피'], example: '커피 주세요.', exampleJapanese: 'コーヒーをください。', notes: 'メモ' }
    expect(issuesOf('vocabulary', item)).toEqual([])
  })

  it.each(['id', 'korean', 'pronunciation', 'japanese', 'partOfSpeech', 'category', 'level', 'reviewed'])('必須項目 %s が欠けていると除外される', (key) => {
    const item: Record<string, unknown> = { ...validVocab }
    delete item[key]
    const result = validateFile('vocabulary', 'test.json', [item], ctx)
    expect(result.items).toEqual([])
    expect(result.issues.map((i) => i.path)).toContain(key)
  })

  it('型が違うと除外される', () => {
    expect(issuesOf('vocabulary', { ...validVocab, level: '1' })[0]?.path).toBe('level')
    expect(issuesOf('vocabulary', { ...validVocab, level: 1.5 })[0]?.path).toBe('level')
    expect(issuesOf('vocabulary', { ...validVocab, reviewed: 'false' })[0]?.path).toBe('reviewed')
    expect(issuesOf('vocabulary', { ...validVocab, korean: '' })[0]?.path).toBe('korean')
    expect(issuesOf('vocabulary', { ...validVocab, alternatives: '코오피' })[0]?.path).toBe('alternatives')
    expect(issuesOf('vocabulary', { ...validVocab, alternatives: [] })[0]?.path).toBe('alternatives')
  })

  it('IDの形式が違うと除外される', () => {
    expect(issuesOf('vocabulary', { ...validVocab, id: 'vocab_1' })[0]?.path).toBe('id')
    expect(issuesOf('vocabulary', { ...validVocab, id: 'word_001' })[0]?.path).toBe('id')
  })

  it('決められたキー以外の品詞・カテゴリは除外される', () => {
    expect(issuesOf('vocabulary', { ...validVocab, partOfSpeech: '名詞' })[0]?.path).toBe('partOfSpeech')
    expect(issuesOf('vocabulary', { ...validVocab, category: 'drinks' })[0]?.path).toBe('category')
  })

  it('知らない項目（綴りの間違い）は除外される', () => {
    expect(issuesOf('vocabulary', { ...validVocab, pronounciation: 'コピ' })[0]?.path).toBe('pronounciation')
  })

  it('example と exampleJapanese の片方だけは除外される', () => {
    expect(issuesOf('vocabulary', { ...validVocab, example: '커피 주세요.' })[0]?.path).toBe('example')
  })

  it('NFC正規化されていないハングルは除外される', () => {
    const decomposed = '커피'.normalize('NFD')
    expect(issuesOf('vocabulary', { ...validVocab, korean: decomposed })[0]?.path).toBe('korean')
  })

  it('korean と同じ文字列を alternatives に入れると除外される', () => {
    expect(issuesOf('vocabulary', { ...validVocab, alternatives: ['커피'] })[0]?.path).toBe('alternatives')
  })
})

describe('文法の検証', () => {
  it('正しいデータは通る', () => {
    expect(issuesOf('grammar', validGrammar)).toEqual([])
  })

  it('例文が0個だと除外される', () => {
    expect(issuesOf('grammar', { ...validGrammar, examples: [] })[0]?.path).toBe('examples')
  })

  it('例文の必須項目が欠けると除外される', () => {
    expect(issuesOf('grammar', { ...validGrammar, examples: [{ korean: '저는 학생이에요.' }] })[0]?.path).toBe('examples[0].japanese')
  })
})

describe('会話の検証', () => {
  it('正しいデータは通る', () => {
    expect(issuesOf('conversations', validConversation)).toEqual([])
  })

  it('freeAnswer は省略できる', () => {
    const item: Record<string, unknown> = { ...validConversation }
    delete item['freeAnswer']
    expect(issuesOf('conversations', item)).toEqual([])
  })

  it('存在しない施設・キャラクター・話者は除外される', () => {
    expect(issuesOf('conversations', { ...validConversation, location: 'school' })[0]?.path).toBe('location')
    expect(issuesOf('conversations', { ...validConversation, character: 'staff' })[0]?.path).toBe('character')
    const lines = [{ speaker: 'staff', korean: '어서 오세요!', japanese: 'いらっしゃいませ！' }]
    expect(issuesOf('conversations', { ...validConversation, lines })[0]?.path).toBe('lines[0].speaker')
  })

  it('正解の選択肢がないと除外される', () => {
    const choices = [{ korean: '집에 가요.', japanese: '家に帰ります。', correct: false }]
    expect(issuesOf('conversations', { ...validConversation, choices })[0]?.path).toBe('choices')
  })

  it('章が範囲外だと除外される', () => {
    expect(issuesOf('conversations', { ...validConversation, chapter: 0 })[0]?.path).toBe('chapter')
    expect(issuesOf('conversations', { ...validConversation, chapter: 11 })[0]?.path).toBe('chapter')
  })

  it('freeAnswer.answers が空だと除外される', () => {
    expect(issuesOf('conversations', { ...validConversation, freeAnswer: { prompt: 'x', answers: [] } })[0]?.path).toBe('freeAnswer.answers')
  })
})

describe('ファイル単位の検証', () => {
  it('ファイルが配列でなければ問題として報告する', () => {
    const result = validateFile('vocabulary', 'bad.json', validVocab, ctx)
    expect(result.items).toEqual([])
    expect(result.issues[0]?.index).toBeNull()
  })

  it('問題のある項目だけを除外し、ほかは残す', () => {
    const result = validateFile('vocabulary', 'mixed.json', [validVocab, { ...validVocab, id: 'vocab_002', level: 0 }], ctx)
    expect(result.items.map((v) => v.id)).toEqual(['vocab_001'])
    expect(result.issues).toHaveLength(1)
    expect(result.issues[0]).toMatchObject({ file: 'mixed.json', index: 1, id: 'vocab_002', path: 'level' })
  })
})

describe('loadContent', () => {
  const base: ContentInput = {
    locations: { 'l.json': [{ id: 'cafe', nameJa: 'カフェ' }] },
    characters: { 'c.json': [{ id: 'cafe_staff', roleJa: 'カフェの店員' }] },
    vocabulary: { 'v.json': [validVocab] },
    grammar: { 'g.json': [validGrammar] },
    conversations: { 's.json': [validConversation] },
  }

  it('すべて正しければ問題なしで読み込む', () => {
    const result = loadContent(base)
    expect(result.issues).toEqual([])
    expect(result.vocabulary).toHaveLength(1)
    expect(result.grammar).toHaveLength(1)
    expect(result.conversations).toHaveLength(1)
  })

  it('ファイルをまたいだIDの重複を検出し、後の方を除外する', () => {
    const result = loadContent({
      ...base,
      vocabulary: { 'a.json': [validVocab], 'b.json': [{ ...validVocab, korean: '차' }] },
    })
    expect(result.vocabulary).toHaveLength(1)
    expect(result.vocabulary[0]?.korean).toBe('커피')
    expect(result.issues).toHaveLength(1)
    expect(result.issues[0]).toMatchObject({ file: 'b.json', id: 'vocab_001' })
  })

  it('同じファイル内のIDの重複も検出する', () => {
    const result = loadContent({ ...base, grammar: { 'g.json': [validGrammar, validGrammar] } })
    expect(result.grammar).toHaveLength(1)
    expect(result.issues).toHaveLength(1)
  })

  it('施設データが壊れていれば、その施設を参照する会話も除外される', () => {
    const result = loadContent({ ...base, locations: { 'l.json': [{ id: 'cafe' }] } })
    expect(result.locations).toEqual([])
    expect(result.conversations).toEqual([])
    expect(result.issues.map((i) => i.path)).toEqual(['nameJa', 'location'])
  })

  it('キャラクターIDに player は使えない', () => {
    const result = loadContent({ ...base, characters: { 'c.json': [{ id: 'player', roleJa: '主人公' }] } })
    expect(result.characters).toEqual([])
  })
})
