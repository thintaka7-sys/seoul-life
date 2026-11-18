import { describe, expect, it } from 'vitest'
import { DEFAULT_BALANCE, emptyReferenceContext, koreanChunkCount, loadContent, validateFile, type ContentInput, type ReferenceContext } from './validate'

const ctx: ReferenceContext = {
  ...emptyReferenceContext(),
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
  examples: [{ korean: '저는 학생이에요.', pronunciation: 'チョヌン ハクセンイエヨ', japanese: '私は学生です。' }],
  reviewed: false,
}

const validConversation = {
  id: 'cafe_001',
  chapter: 3,
  location: 'cafe',
  character: 'cafe_staff',
  lines: [
    { speaker: 'cafe_staff', korean: '뭐 드릴까요?', pronunciation: 'ムォ ドゥリルッカヨ', japanese: '何になさいますか？' },
    { speaker: 'player', korean: '커피 주세요.', pronunciation: 'コピ ジュセヨ', japanese: 'コーヒーをください。' },
  ],
  choices: [
    { korean: '커피 주세요.', pronunciation: 'コピ ジュセヨ', japanese: 'コーヒーをください。', correct: true },
    { korean: '집에 가요.', pronunciation: 'チベ ガヨ', japanese: '家に帰ります。', correct: false },
  ],
  freeAnswer: { prompt: 'コーヒーをください', answers: ['커피 주세요.', '커피 한 잔 주세요.'] },
  reviewed: true,
}

const validEvent = {
  id: 'event_001',
  chapter: 3,
  location: 'cafe',
  requires: [],
  objectiveJa: 'カフェで注文してみよう',
  actionJa: 'カウンターへ行く',
  steps: [
    { type: 'message', textJa: 'カフェに入りました。' },
    { type: 'learn', vocabulary: ['vocab_001'] },
    { type: 'conversation', id: 'cafe_001' },
  ],
}

const validBalance = {
  xp: { learnWord: 2, conversationChoice: 10, conversationWrite: 15, eventComplete: 20 },
  furiganaAlwaysUntilChapter: 3,
  initialLocations: ['home', 'cafe'],
  startLocation: 'home',
  writeAttemptsBeforeReveal: 2,
}

function issuesOf(kind: 'vocabulary' | 'grammar' | 'conversations', item: unknown) {
  return validateFile(kind, 'test.json', [item], ctx).issues
}

describe('koreanChunkCount', () => {
  it('空白で区切った数を数え、句読点だけの区切りは数えない', () => {
    expect(koreanChunkCount('아메리카노 한 잔 주세요.')).toBe(4)
    expect(koreanChunkCount('  안녕하세요.  ')).toBe(1)
    expect(koreanChunkCount('커피 주세요 !')).toBe(2)
    expect(koreanChunkCount('네, 감사합니다.')).toBe(2)
  })
})

describe('単語の検証', () => {
  it('正しいデータは通る', () => {
    const result = validateFile('vocabulary', 'test.json', [validVocab], ctx)
    expect(result.issues).toEqual([])
    expect(result.items).toEqual([validVocab])
  })

  it('任意項目（alternatives・例文・notes）があっても通る', () => {
    const item = {
      ...validVocab,
      alternatives: ['코오피'],
      example: '커피 주세요.',
      examplePronunciation: 'コピ ジュセヨ',
      exampleJapanese: 'コーヒーをください。',
      notes: 'メモ',
    }
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

  it('例文の3項目（example・examplePronunciation・exampleJapanese）がそろっていないと除外される', () => {
    expect(issuesOf('vocabulary', { ...validVocab, example: '커피 주세요.' })[0]?.path).toBe('example')
    expect(issuesOf('vocabulary', { ...validVocab, example: '커피 주세요.', exampleJapanese: 'コーヒーをください。' })[0]?.path).toBe('example')
  })

  it('NFC正規化されていないハングルは除外される', () => {
    const decomposed = '커피'.normalize('NFD')
    expect(issuesOf('vocabulary', { ...validVocab, korean: decomposed })[0]?.path).toBe('korean')
  })

  it('korean と同じ文字列を alternatives に入れると除外される', () => {
    expect(issuesOf('vocabulary', { ...validVocab, alternatives: ['커피'] })[0]?.path).toBe('alternatives')
  })
})

describe('読み（カタカナ）の検証', () => {
  const withExample = (examplePronunciation: string) => ({
    ...validVocab,
    example: '아메리카노 한 잔 주세요.',
    examplePronunciation,
    exampleJapanese: 'アメリカーノを1杯ください。',
  })

  it('区切りの数が一致すれば通る', () => {
    expect(issuesOf('vocabulary', withExample('アメリカノ ハン ジャン ジュセヨ'))).toEqual([])
  })

  it('区切りの数が違うと除外される', () => {
    expect(issuesOf('vocabulary', withExample('アメリカノ ハンジャン ジュセヨ'))[0]).toMatchObject({ path: 'examplePronunciation' })
    expect(issuesOf('vocabulary', { ...validVocab, korean: '안녕히 가세요', pronunciation: 'アンニョンヒガセヨ' })[0]?.path).toBe('pronunciation')
  })

  it.each([
    ['句読点', 'アメリカノ ハン ジャン ジュセヨ。'],
    ['ひらがな', 'アメリカノ はん ジャン ジュセヨ'],
    ['全角スペース', 'アメリカノ　ハン ジャン ジュセヨ'],
    ['続けた空白', 'アメリカノ  ハン ジャン ジュセヨ'],
    ['先頭の空白', ' アメリカノ ハン ジャン ジュセヨ'],
    ['ハングル', '아메리카노 ハン ジャン ジュセヨ'],
  ])('%s が入っていると除外される', (_label, value) => {
    expect(issuesOf('vocabulary', withExample(value))[0]?.path).toBe('examplePronunciation')
  })

  it('文法の例文・台詞・選択肢の読みも確かめる', () => {
    const grammar = { ...validGrammar, examples: [{ korean: '저는 학생이에요.', pronunciation: 'チョヌンハクセンイエヨ', japanese: '私は学生です。' }] }
    expect(issuesOf('grammar', grammar)[0]?.path).toBe('examples[0].pronunciation')

    const lines = [{ speaker: 'cafe_staff', korean: '뭐 드릴까요?', japanese: '何になさいますか？' }]
    expect(issuesOf('conversations', { ...validConversation, lines })[0]?.path).toBe('lines[0].pronunciation')

    const choices = [{ korean: '커피 주세요.', pronunciation: 'コピ', japanese: 'コーヒーをください。', correct: true }]
    expect(issuesOf('conversations', { ...validConversation, choices })[0]?.path).toBe('choices[0].pronunciation')
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
    expect(issuesOf('grammar', { ...validGrammar, examples: [{ korean: '저는 학생이에요.', pronunciation: 'チョヌン ハクセンイエヨ' }] })[0]?.path).toBe(
      'examples[0].japanese',
    )
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
    const lines = [{ speaker: 'staff', korean: '어서 오세요!', pronunciation: 'オソ オセヨ', japanese: 'いらっしゃいませ！' }]
    expect(issuesOf('conversations', { ...validConversation, lines })[0]?.path).toBe('lines[0].speaker')
  })

  it('正解の選択肢がないと除外される', () => {
    const choices = [{ korean: '집에 가요.', pronunciation: 'チベ ガヨ', japanese: '家に帰ります。', correct: false }]
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

const base: ContentInput = {
  locations: { 'l.json': [{ id: 'cafe', nameJa: 'カフェ' }, { id: 'home', nameJa: '自宅' }] },
  characters: { 'c.json': [{ id: 'cafe_staff', roleJa: 'カフェの店員' }] },
  vocabulary: { 'v.json': [validVocab] },
  grammar: { 'g.json': [validGrammar] },
  conversations: { 's.json': [validConversation] },
  events: { 'e.json': [validEvent] },
  balance: { 'balance.json': validBalance },
}

describe('loadContent', () => {
  it('すべて正しければ問題なしで読み込む', () => {
    const result = loadContent(base)
    expect(result.issues).toEqual([])
    expect(result.vocabulary).toHaveLength(1)
    expect(result.grammar).toHaveLength(1)
    expect(result.conversations).toHaveLength(1)
    expect(result.events).toHaveLength(1)
    expect(result.balance).toEqual(validBalance)
  })

  it('ファイルをまたいだIDの重複を検出し、後の方を除外する', () => {
    const result = loadContent({
      ...base,
      vocabulary: { 'a.json': [validVocab], 'b.json': [{ ...validVocab, korean: '차', pronunciation: 'チャ' }] },
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

  it('施設データが壊れていれば、その施設を参照する会話・イベントも除外される', () => {
    const result = loadContent({ ...base, locations: { 'l.json': [{ id: 'cafe' }, { id: 'home', nameJa: '自宅' }] } })
    expect(result.locations.map((l) => l.id)).toEqual(['home'])
    expect(result.conversations).toEqual([])
    expect(result.events).toEqual([])
  })

  it('キャラクターIDに player は使えない', () => {
    const result = loadContent({ ...base, characters: { 'c.json': [{ id: 'player', roleJa: '主人公' }] } })
    expect(result.characters).toEqual([])
  })
})

describe('イベントの検証', () => {
  const load = (events: unknown[]) => loadContent({ ...base, events: { 'e.json': events } })

  it('存在しない単語・文法・会話を参照すると除外される', () => {
    expect(load([{ ...validEvent, steps: [{ type: 'learn', vocabulary: ['vocab_999'] }] }]).events).toEqual([])
    expect(load([{ ...validEvent, steps: [{ type: 'learn', grammar: ['grammar_999'] }] }]).events).toEqual([])
    expect(load([{ ...validEvent, steps: [{ type: 'conversation', id: 'cafe_999' }] }]).events).toEqual([])
  })

  it('learn に単語も文法もなければ除外される', () => {
    expect(load([{ ...validEvent, steps: [{ type: 'learn' }] }]).events).toEqual([])
  })

  it('会話の施設がイベントの施設と違うと除外される', () => {
    const result = load([{ ...validEvent, location: 'home' }])
    expect(result.events).toEqual([])
    expect(result.issues[0]?.path).toBe('steps[2].id')
  })

  it('知らない段階の種類は除外される', () => {
    expect(load([{ ...validEvent, steps: [{ type: 'quiz' }] }]).events).toEqual([])
  })

  it('日本語の文にハングルが入っていると除外される', () => {
    expect(load([{ ...validEvent, objectiveJa: '카페 に行こう' }]).events).toEqual([])
    expect(load([{ ...validEvent, actionJa: '주문する' }]).events).toEqual([])
    expect(load([{ ...validEvent, steps: [{ type: 'message', textJa: '「안녕하세요」と言おう' }] }]).events).toEqual([])
  })

  it('存在しない前提イベントは除外され、それを前提にするイベントも除外される', () => {
    const e2 = { ...validEvent, id: 'event_002', requires: ['event_099'], steps: [{ type: 'message', textJa: 'a' }] }
    const e3 = { ...validEvent, id: 'event_003', requires: ['event_002'], steps: [{ type: 'message', textJa: 'b' }] }
    const result = load([validEvent, e2, e3])
    expect(result.events.map((e) => e.id)).toEqual(['event_001'])
    expect(result.issues.map((i) => i.id)).toEqual(['event_002', 'event_003'])
  })

  it('前提の循環は除外される', () => {
    const msg = [{ type: 'message', textJa: 'a' }]
    const e2 = { ...validEvent, id: 'event_002', requires: ['event_003'], steps: msg }
    const e3 = { ...validEvent, id: 'event_003', requires: ['event_002'], steps: msg }
    const e4 = { ...validEvent, id: 'event_004', requires: ['event_003'], steps: msg }
    const result = load([validEvent, e2, e3, e4])
    expect(result.events.map((e) => e.id)).toEqual(['event_001'])
  })

  it('自分自身を前提にすると除外される', () => {
    expect(load([{ ...validEvent, requires: ['event_001'] }]).events).toEqual([])
  })

  it('同じ会話を2つのイベントで使うと、後のイベントを除外する', () => {
    const result = load([validEvent, { ...validEvent, id: 'event_002' }])
    expect(result.events.map((e) => e.id)).toEqual(['event_001'])
  })
})

describe('balance の検証', () => {
  it('読めなければ既定の値を使い、問題として報告する', () => {
    const result = loadContent({ ...base, balance: { 'balance.json': { ...validBalance, xp: { learnWord: -1 } } } })
    expect(result.balance).toEqual(DEFAULT_BALANCE)
    expect(result.issues.length).toBeGreaterThan(0)
  })

  it('存在しない施設は使えない', () => {
    const result = loadContent({ ...base, balance: { 'balance.json': { ...validBalance, startLocation: 'park', initialLocations: ['park'] } } })
    expect(result.balance).toEqual(DEFAULT_BALANCE)
  })

  it('最初にいる施設は、最初から行ける施設に含める', () => {
    const result = loadContent({ ...base, balance: { 'balance.json': { ...validBalance, initialLocations: ['cafe'] } } })
    expect(result.issues[0]?.path).toBe('startLocation')
  })

  it('ファイルがなければ既定の値を使う', () => {
    const result = loadContent({ ...base, balance: {} })
    expect(result.balance).toEqual(DEFAULT_BALANCE)
  })
})
