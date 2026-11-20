import { describe, expect, it } from 'vitest'
import { DEFAULT_BALANCE, emptyReferenceContext, koreanChunkCount, loadContent, validateFile, type ContentInput, type ContentKind, type ReferenceContext } from './validate'

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
  genre: 'food_drink',
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
  turns: [
    {
      lines: [
        { speaker: 'cafe_staff', korean: '뭐 드릴까요?', pronunciation: 'ムォ ドゥリルッカヨ', japanese: '何になさいますか？' },
        { speaker: 'player', korean: '커피 주세요.', pronunciation: 'コピ ジュセヨ', japanese: 'コーヒーをください。' },
      ],
      choices: [
        { korean: '커피 주세요.', pronunciation: 'コピ ジュセヨ', japanese: 'コーヒーをください。', correct: true },
        { korean: '집에 가요.', pronunciation: 'チベ ガヨ', japanese: '家に帰ります。', correct: false },
      ],
      freeAnswer: { prompt: 'コーヒーをください', answers: ['커피 주세요.', '커피 한 잔 주세요.'] },
    },
  ],
  reviewed: true,
}

const staffLine = (korean: string, pronunciation: string, extra: Record<string, unknown> = {}) => ({
  speaker: 'cafe_staff',
  korean,
  pronunciation,
  japanese: '訳',
  ...extra,
})
const correctChoice = { korean: '네.', pronunciation: 'ネ', japanese: 'はい。', correct: true }
const wrongChoice = { korean: '아니요.', pronunciation: 'アニヨ', japanese: 'いいえ。', correct: false }

/** 1往復目の中身を差し替えた会話 */
const withTurn0 = (turn: Record<string, unknown>) => ({ ...validConversation, turns: [turn] })
// 配列の要素は undefined の可能性があると型付けされるため、要素の型として扱う
const turn0 = validConversation.turns[0] as (typeof validConversation.turns)[number]

const validColumn = {
  id: 'column_001',
  chapter: 3,
  titleJa: '韓国のカフェは注文が先',
  blocks: [
    { type: 'text', textJa: '席に着く前に、カウンターで注文することが多いです。' },
    { type: 'korean', korean: '아이스 아메리카노', pronunciation: 'アイス アメリカノ', japanese: 'アイスアメリカーノ' },
  ],
  reviewed: false,
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
  xp: { learnWord: 2, conversationChoice: 10, conversationWrite: 15, eventComplete: 20, hangulLesson: 20, listening: 3 },
  furiganaAlwaysUntilChapter: 3,
  initialLocations: ['home', 'cafe'],
  startLocation: 'home',
  writeAttemptsBeforeReveal: 2,
  hangulQuizQuestions: 8,
  hangulPassPercent: 80,
  listeningQuestionsPerRound: 5,
}

function issuesOf(kind: ContentKind, item: unknown) {
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

  it.each(['id', 'korean', 'pronunciation', 'japanese', 'partOfSpeech', 'genre', 'level', 'reviewed'])('必須項目 %s が欠けていると除外される', (key) => {
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
    expect(issuesOf('vocabulary', { ...validVocab, genre: 'drinks' })[0]?.path).toBe('genre')
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
    expect(issuesOf('conversations', withTurn0({ ...turn0, lines }))[0]?.path).toBe('turns[0].lines[0].pronunciation')

    const choices = [{ korean: '커피 주세요.', pronunciation: 'コピ', japanese: 'コーヒーをください。', correct: true }]
    expect(issuesOf('conversations', withTurn0({ ...turn0, choices }))[0]?.path).toBe('turns[0].choices[0].pronunciation')
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
    const { freeAnswer: _omit, ...withoutFree } = turn0
    expect(issuesOf('conversations', withTurn0(withoutFree))).toEqual([])
  })

  it('存在しない施設・キャラクター・話者は除外される', () => {
    expect(issuesOf('conversations', { ...validConversation, location: 'school' })[0]?.path).toBe('location')
    expect(issuesOf('conversations', { ...validConversation, character: 'staff' })[0]?.path).toBe('character')
    const lines = [{ speaker: 'staff', korean: '어서 오세요!', pronunciation: 'オソ オセヨ', japanese: 'いらっしゃいませ！' }]
    expect(issuesOf('conversations', withTurn0({ ...turn0, lines }))[0]?.path).toBe('turns[0].lines[0].speaker')
  })

  it('正解の選択肢がないと除外される', () => {
    const choices = [{ korean: '집에 가요.', pronunciation: 'チベ ガヨ', japanese: '家に帰ります。', correct: false }]
    expect(issuesOf('conversations', withTurn0({ ...turn0, choices }))[0]?.path).toBe('turns[0].choices')
  })

  it('章が範囲外だと除外される', () => {
    expect(issuesOf('conversations', { ...validConversation, chapter: 0 })[0]?.path).toBe('chapter')
    expect(issuesOf('conversations', { ...validConversation, chapter: 11 })[0]?.path).toBe('chapter')
  })

  it('freeAnswer.answers が空だと除外される', () => {
    expect(issuesOf('conversations', withTurn0({ ...turn0, freeAnswer: { prompt: 'x', answers: [] } }))[0]?.path).toBe('turns[0].freeAnswer.answers')
  })

  it('旧い書き方（turns を使わない）は、書き方が変わったことを知らせて除外する', () => {
    const { turns: _omit, ...rest } = validConversation
    const issues = issuesOf('conversations', { ...rest, lines: turn0.lines, choices: turn0.choices })
    expect(issues).toHaveLength(1)
    expect(issues[0]?.path).toBe('turns')
    expect(issues[0]?.message).toContain('turns')
  })
})

describe('会話の往復（turns）の検証', () => {
  const twoTurns = (second: Record<string, unknown>) => ({
    ...validConversation,
    turns: [{ lines: [staffLine('네?', 'ネ')], choices: [correctChoice, wrongChoice] }, second],
  })

  it('数往復の会話と、選択肢の反応（reply）、締めの台詞だけの最後の往復を書ける', () => {
    const conv = {
      ...validConversation,
      turns: [
        {
          lines: [staffLine('네?', 'ネ', { expression: 'smile' })],
          choices: [{ ...correctChoice, reply: [staffLine('네.', 'ネ')] }, { ...wrongChoice, reply: [staffLine('네?', 'ネ', { expression: 'troubled' })] }],
          freeAnswer: { prompt: 'はい', answers: ['네.'], reply: [staffLine('네.', 'ネ')] },
        },
        { choices: [correctChoice] },
        { lines: [staffLine('네.', 'ネ')] },
      ],
    }
    expect(issuesOf('conversations', conv)).toEqual([])
  })

  it('2つ目以降の返事のある往復は lines を省略できるが、最初の往復は lines が必要', () => {
    expect(issuesOf('conversations', twoTurns({ choices: [correctChoice] }))).toEqual([])
    expect(issuesOf('conversations', withTurn0({ choices: [correctChoice] }))[0]?.path).toBe('turns[0].lines')
  })

  it('返事のない往復は最後だけ。台詞が1つ以上必要', () => {
    const conv = { ...validConversation, turns: [turn0, { lines: [staffLine('네.', 'ネ')] }, turn0] }
    expect(issuesOf('conversations', conv).map((i) => i.path)).toEqual(['turns[1].choices'])
    expect(issuesOf('conversations', twoTurns({ lines: [] }))[0]?.path).toBe('turns[1].lines')
  })

  it('返事のない往復に freeAnswer は書けない', () => {
    expect(issuesOf('conversations', twoTurns({ lines: [staffLine('네.', 'ネ')], freeAnswer: { prompt: 'x', answers: ['네.'] } }))[0]?.path).toBe('turns[1].freeAnswer')
  })

  it('返事のある往復が1つもなければ除外される', () => {
    expect(issuesOf('conversations', withTurn0({ lines: [staffLine('네.', 'ネ')] }))[0]?.path).toBe('turns')
  })

  it('turns が空だと除外される', () => {
    expect(issuesOf('conversations', { ...validConversation, turns: [] })[0]?.path).toBe('turns')
  })

  it('表情は決められたキーだけ。主人公の台詞には付けられない', () => {
    expect(issuesOf('conversations', withTurn0({ ...turn0, lines: [staffLine('네.', 'ネ', { expression: 'angry' })] }))[0]?.path).toBe('turns[0].lines[0].expression')
    const playerLine = { speaker: 'player', korean: '네.', pronunciation: 'ネ', japanese: 'はい。', expression: 'smile' }
    expect(issuesOf('conversations', withTurn0({ ...turn0, lines: [staffLine('네.', 'ネ'), playerLine] }))[0]?.path).toBe('turns[0].lines[1].expression')
  })

  it('reply の台詞も検証する（空の reply は不可、読みの区切りの数）', () => {
    expect(issuesOf('conversations', withTurn0({ ...turn0, choices: [{ ...correctChoice, reply: [] }] }))[0]?.path).toBe('turns[0].choices[0].reply')
    expect(issuesOf('conversations', withTurn0({ ...turn0, choices: [{ ...correctChoice, reply: [staffLine('네 네', 'ネ')] }] }))[0]?.path).toBe(
      'turns[0].choices[0].reply[0].pronunciation',
    )
  })

  it('知らない項目は除外される', () => {
    expect(issuesOf('conversations', withTurn0({ ...turn0, answer: 'x' }))[0]?.path).toBe('turns[0].answer')
  })
})

describe('コラムの検証', () => {
  it('正しいデータは通る', () => {
    expect(issuesOf('columns', validColumn)).toEqual([])
  })

  it('見出しと本文（text）にハングルは入れられない', () => {
    expect(issuesOf('columns', { ...validColumn, titleJa: '카페 の話' })[0]?.path).toBe('titleJa')
    expect(issuesOf('columns', { ...validColumn, blocks: [{ type: 'text', textJa: '「커피」です' }] })[0]?.path).toBe('blocks[0].textJa')
  })

  it('韓国語のブロックは読みの決まりを確かめる', () => {
    const blocks = [{ type: 'korean', korean: '아이스 아메리카노', pronunciation: 'アイスアメリカノ', japanese: 'x' }]
    expect(issuesOf('columns', { ...validColumn, blocks })[0]?.path).toBe('blocks[0].pronunciation')
  })

  it('ブロックの種類と項目を確かめる', () => {
    expect(issuesOf('columns', { ...validColumn, blocks: [{ type: 'image', src: 'x' }] })[0]?.path).toBe('blocks[0].type')
    expect(issuesOf('columns', { ...validColumn, blocks: [{ type: 'text', textJa: 'a', korean: 'b' }] })[0]?.path).toBe('blocks[0].korean')
    expect(issuesOf('columns', { ...validColumn, blocks: [] })[0]?.path).toBe('blocks')
  })

  it('IDは column_番号', () => {
    expect(issuesOf('columns', { ...validColumn, id: 'tip_001' })[0]?.path).toBe('id')
  })
})

describe('キャラクター・施設の検証', () => {
  const character = {
    id: 'cafe_staff',
    roleJa: 'カフェの店員',
    name: { korean: '한지훈', pronunciation: 'ハンジフン', reviewed: true },
    profileJa: '落ち着いている',
    themeColor: '#B9783F',
  }

  it('名前・プロフィール・テーマカラーを持てる（どれも省略できる）', () => {
    expect(issuesOf('characters', character)).toEqual([])
    expect(issuesOf('characters', { id: 'friend', roleJa: '近所の友人' })).toEqual([])
  })

  it('名前は読みと確認済みの印が必要', () => {
    expect(issuesOf('characters', { ...character, name: { korean: '한지훈', reviewed: true } })[0]?.path).toBe('name.pronunciation')
    expect(issuesOf('characters', { ...character, name: { korean: '한지훈', pronunciation: 'ハンジフン' } })[0]?.path).toBe('name.reviewed')
    expect(issuesOf('characters', { ...character, name: { korean: '한지훈', pronunciation: 'ハン ジフン', reviewed: true } })[0]?.path).toBe('name.pronunciation')
  })

  it('テーマカラーは #RRGGBB、プロフィールにハングルは入れない', () => {
    expect(issuesOf('characters', { ...character, themeColor: 'caramel' })[0]?.path).toBe('themeColor')
    expect(issuesOf('characters', { ...character, profileJa: '한지훈 です' })[0]?.path).toBe('profileJa')
  })

  it('施設のマップ上の位置は 0〜100 の割合で、絵からはみ出さない', () => {
    expect(issuesOf('locations', { id: 'cafe', nameJa: 'カフェ', mapArea: { x: 10, y: 20, w: 30, h: 15 } })).toEqual([])
    expect(issuesOf('locations', { id: 'cafe', nameJa: 'カフェ', mapArea: { x: 80, y: 20, w: 30, h: 15 } })[0]?.path).toBe('mapArea')
    expect(issuesOf('locations', { id: 'cafe', nameJa: 'カフェ', mapArea: { x: -1, y: 20, w: 30, h: 15 } })[0]?.path).toBe('mapArea.x')
    expect(issuesOf('locations', { id: 'cafe', nameJa: 'カフェ', mapArea: { x: 1, y: 2, w: 3 } })[0]?.path).toBe('mapArea.h')
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
  columns: { 'k.json': [validColumn] },
  events: { 'e.json': [validEvent] },
  hangulLessons: {},
  listening: {},
  drills: {},
  chapterTests: {},
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

  it('コラムの段階は、存在するコラムだけを使える', () => {
    expect(load([{ ...validEvent, steps: [{ type: 'column', id: 'column_001' }] }]).events).toHaveLength(1)
    expect(load([{ ...validEvent, steps: [{ type: 'column', id: 'column_002' }] }]).events).toEqual([])
  })

  it('コラムのIDの重複は、後の方を除外する', () => {
    const dup = loadContent({ ...base, columns: { 'a.json': [validColumn], 'b.json': [{ ...validColumn, titleJa: '別の話' }] } })
    expect(dup.columns.map((c) => c.titleJa)).toEqual(['韓国のカフェは注文が先'])
    expect(dup.issues[0]).toMatchObject({ file: 'b.json', id: 'column_001', path: 'id' })
  })

  it('背景の段階は、場面の背景のIDか施設IDを使える。最後の段階には置けない', () => {
    const msg = { type: 'message', textJa: 'a' }
    expect(load([{ ...validEvent, steps: [{ type: 'background', id: 'entrance' }, msg, { type: 'background', id: 'cafe' }, msg] }]).events).toHaveLength(1)
    expect(load([{ ...validEvent, steps: [{ type: 'background', id: 'rooftop' }, msg] }]).events).toEqual([])
    expect(load([{ ...validEvent, steps: [{ type: 'background' }, msg] }]).events).toEqual([])
    const last = load([{ ...validEvent, steps: [msg, { type: 'background', id: 'entrance' }] }])
    expect(last.events).toEqual([])
    expect(last.issues[0]?.path).toBe('steps')
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

// ---------- ハングルのレッスン ----------

const vowelLesson = {
  id: 'hangul_001',
  order: 1,
  kind: 'letters',
  titleJa: '基本の母音（1）',
  introJa: ['母音の文字です。ㅇ を付けて書きます。'],
  letters: [
    { jamo: 'ㅏ', sounds: [{ korean: '아', pronunciation: 'ア' }], tipJa: '口を大きく開けて「ア」' },
    { jamo: 'ㅓ', sounds: [{ korean: '어', pronunciation: 'オ' }], tipJa: '口を大きく開けて「オ」', confusableWith: ['ㅗ'] },
    { jamo: 'ㅗ', sounds: [{ korean: '오', pronunciation: 'オ' }], tipJa: '唇を丸めて「オ」', confusableWith: ['ㅓ'] },
    { jamo: 'ㅣ', sounds: [{ korean: '이', pronunciation: 'イ' }], tipJa: '「イ」' },
  ],
  words: [
    { id: 'hword_001', korean: '아이', pronunciation: 'アイ', japanese: '子ども' },
    { id: 'hword_002', korean: '오이', pronunciation: 'オイ', japanese: 'きゅうり' },
  ],
  reviewed: false,
}

const consonantLesson = {
  id: 'hangul_002',
  order: 2,
  kind: 'letters',
  titleJa: '基本の子音（1）',
  introJa: ['子音の文字です。'],
  letters: [
    { jamo: 'ㄱ', sounds: [{ korean: '가', pronunciation: 'カ' }, { korean: '고', pronunciation: 'コ' }], tipJa: '語頭はカ、語中はガ' },
    { jamo: 'ㅋ', sounds: [{ korean: '커', pronunciation: 'コ' }], tipJa: '息を強く出す' },
    { jamo: 'ㅍ', sounds: [{ korean: '피', pronunciation: 'ピ' }], tipJa: '息を強く出す' },
  ],
  words: [{ id: 'hword_003', korean: '고기', pronunciation: 'コギ', japanese: '肉' }],
  reviewed: false,
}

const batchimLesson = {
  id: 'hangul_003',
  order: 3,
  kind: 'batchim',
  titleJa: 'パッチム',
  introJa: ['音節の下に付く子音です。'],
  finals: [{ sound: 'ㄱ', letters: ['ㄱ', 'ㅋ', 'ㄲ'], sounds: [{ korean: '악', pronunciation: 'アク' }], tipJa: '「ク」を飲み込む' }],
  words: [{ id: 'hword_004', korean: '각', pronunciation: 'カク', japanese: '角' }],
  reviewed: false,
}

const soundChangeLesson = {
  id: 'hangul_004',
  order: 4,
  kind: 'soundChange',
  titleJa: '音の変化（1）',
  introJa: ['書いた形と発音が違うことがあります。'],
  rules: [
    {
      titleJa: '連音化',
      explanationJa: 'パッチムの後に ㅇ が来ると、パッチムが次の音節に移ります。',
      examples: [{ korean: '각이', spoken: '가기', pronunciation: 'カギ', japanese: '角が' }],
    },
  ],
  reviewed: false,
}

const readingLesson = {
  id: 'hangul_005',
  order: 5,
  kind: 'reading',
  titleJa: '教材の言葉を読む',
  introJa: ['習った文字で読んでみましょう。'],
  vocabulary: ['vocab_001'],
  reviewed: false,
}

const loadLessons = (lessons: unknown[]) => loadContent({ ...base, hangulLessons: { 'h.json': lessons } })
const messages = (result: { issues: { path: string; message: string }[] }) => result.issues.map((i) => `${i.path}: ${i.message}`)
const firstLetter = { jamo: 'ㅏ', sounds: [{ korean: '아', pronunciation: 'ア' }], tipJa: '口を大きく開けて「ア」' }
const firstFinal = batchimLesson.finals[0] ?? {}
const firstRule = soundChangeLesson.rules[0] ?? {}

describe('ハングルのレッスン', () => {
  it('正しいレッスンは問題なしで読み込み、order の順に並べる', () => {
    const result = loadLessons([readingLesson, vowelLesson, soundChangeLesson, batchimLesson, consonantLesson])
    expect(messages(result)).toEqual([])
    expect(result.hangulLessons.map((l) => l.id)).toEqual(['hangul_001', 'hangul_002', 'hangul_003', 'hangul_004', 'hangul_005'])
    expect(result.hangulLessons[0]).toMatchObject({ finals: [], rules: [], vocabulary: [] })
  })

  it('kind に合わない項目はエラー', () => {
    const result = loadLessons([{ ...vowelLesson, rules: soundChangeLesson.rules }])
    expect(messages(result).some((m) => m.startsWith('rules: kind が "letters"'))).toBe(true)
  })

  it('kind に必要な項目がないとエラー（文字のレッスンの単語は1語以上）', () => {
    const { words: _words, ...noWords } = vowelLesson
    expect(messages(loadLessons([noWords]))).toContain('words: 必須項目がありません')
    expect(messages(loadLessons([{ ...vowelLesson, words: [] }]))).toContain('words: 1個以上入れてください')
  })

  it('単語の数に厳しい下限はない（1語でもよい）', () => {
    const result = loadLessons([{ ...vowelLesson, words: vowelLesson.words.slice(0, 1) }])
    expect(messages(result)).toEqual([])
  })

  it('聞かせる音節は1音節で、その字母を含み、パッチムがないこと', () => {
    const bad = (sounds: unknown[]) => loadLessons([{ ...vowelLesson, letters: [{ jamo: 'ㅏ', sounds, tipJa: 'ア' }] }])
    expect(messages(bad([{ korean: '아이', pronunciation: 'アイ' }]))).toContain('letters[0].sounds[0].korean: 1つの音節（例：가）にしてください')
    expect(messages(bad([{ korean: '오', pronunciation: 'オ' }])).some((m) => m.includes('母音 ㅏ の音節にしてください'))).toBe(true)
    expect(messages(bad([{ korean: '악', pronunciation: 'アク' }]))).toContain('letters[0].sounds[0].korean: パッチムのない音節にしてください')
    expect(messages(bad([{ korean: 'ㅏ', pronunciation: 'ア' }])).some((m) => m.includes('字母（ㄱ・ㅏ など）を単体で書かず'))).toBe(true)
  })

  it('子音の音節は、その子音で始まること', () => {
    const result = loadLessons([vowelLesson, { ...consonantLesson, letters: [{ jamo: 'ㄱ', sounds: [{ korean: '아', pronunciation: 'ア' }], tipJa: 'カ' }] }])
    expect(messages(result).some((m) => m.includes('子音 ㄱ で始まる音節にしてください'))).toBe(true)
  })

  it('聞かせる音節の読みはカタカナ1語', () => {
    const result = loadLessons([{ ...vowelLesson, letters: [{ jamo: 'ㅏ', sounds: [{ korean: '아', pronunciation: 'a' }], tipJa: 'ア' }] }])
    expect(messages(result).some((m) => m.startsWith('letters[0].sounds[0].pronunciation:'))).toBe(true)
  })

  it('字母でないもの・自分自身を confusableWith に入れるとエラー', () => {
    expect(messages(loadLessons([{ ...vowelLesson, letters: [{ ...firstLetter, jamo: 'A' }] }])).some((m) => m.startsWith('letters[0].jamo:'))).toBe(true)
    const self = loadLessons([{ ...vowelLesson, letters: [{ ...firstLetter, confusableWith: ['ㅏ'] }] }])
    expect(messages(self)).toContain('letters[0].confusableWith: 自分自身（jamo と同じ字母）は入れないでください')
  })

  it('習っていない字母を使った単語はエラーになり、そのレッスンを除外する', () => {
    const result = loadLessons([{ ...vowelLesson, words: [{ id: 'hword_001', korean: '우유', pronunciation: 'ウユ', japanese: '牛乳' }] }])
    expect(messages(result)).toEqual(['words[0].korean: 「우유」に、このレッスンまでに習っていない字母があります：ㅜ ㅠ'])
    expect(result.hangulLessons).toEqual([])
  })

  it('前のレッスンで習った文字は使えるが、後のレッスンの文字は使えない', () => {
    const early = loadLessons([{ ...vowelLesson, order: 3 }, { ...consonantLesson, order: 1 }])
    expect(messages(early).filter((m) => m.includes('習っていない字母')).length).toBeGreaterThan(0)
  })

  it('パッチムのレッスンより前のレッスンでは、パッチムのある単語はエラー', () => {
    const result = loadLessons([vowelLesson, { ...consonantLesson, words: [{ id: 'hword_003', korean: '각', pronunciation: 'カク', japanese: '角' }] }])
    expect(messages(result)).toContain('words[0].korean: 「각」はパッチムのある言葉です。パッチムのレッスンより後のレッスンで使ってください')
  })

  it('パッチムのレッスンの後でも、finals に入れていないパッチムはエラー', () => {
    const result = loadLessons([vowelLesson, consonantLesson, { ...batchimLesson, words: [{ id: 'hword_004', korean: '각', pronunciation: 'カク', japanese: '角' }, { id: 'hword_005', korean: '감', pronunciation: 'カム', japanese: '柿' }] }])
    expect(messages(result).some((m) => m.includes('パッチムのレッスンで習っていないパッチムがあります：ㅁ'))).toBe(true)
  })

  it('パッチムの音節は、そのグループの字母をパッチムに持つこと', () => {
    const result = loadLessons([vowelLesson, { ...batchimLesson, finals: [{ ...firstFinal, sounds: [{ korean: '아', pronunciation: 'ア' }] }] }])
    expect(messages(result)).toContain('finals[0].sounds[0].korean: パッチムのある音節にしてください（例：악）')
  })

  it('代表音でない sound、パッチムにならない字母はエラー', () => {
    const result = loadLessons([{ ...batchimLesson, finals: [{ ...firstFinal, sound: 'ㅋ', letters: ['ㄱ', 'ㄸ'] }] }])
    expect(messages(result).some((m) => m.startsWith('finals[0].sound:'))).toBe(true)
    expect(messages(result).some((m) => m.startsWith('finals[0].letters: パッチムになる字母ではありません：ㄸ'))).toBe(true)
  })

  it('音の変化の例は、korean と spoken の区切りの数が同じ', () => {
    const rule = { ...firstRule, examples: [{ korean: '각이', spoken: '가 기', pronunciation: 'カギ', japanese: '角が' }] }
    const result = loadLessons([vowelLesson, consonantLesson, batchimLesson, { ...soundChangeLesson, rules: [rule] }])
    expect(messages(result)).toContain('rules[0].examples[0].spoken: korean と同じ位置で空白を入れてください（区切りの数が違います）')
  })

  it('reading のレッスンの教材の単語も、習った文字の範囲を確かめる', () => {
    // 커피 は ㅓ ㅣ（母音のレッスン）と ㅋ ㅍ（子音のレッスン）で書ける。子音のレッスンがなければエラー
    expect(messages(loadLessons([vowelLesson, consonantLesson, readingLesson]))).toEqual([])
    expect(messages(loadLessons([vowelLesson, readingLesson])).some((m) => m.startsWith('vocabulary（vocab_001）:'))).toBe(true)
  })

  it('reading のレッスンは、存在しない単語IDや、words・vocabulary のどちらもないとエラー', () => {
    expect(messages(loadLessons([{ ...readingLesson, vocabulary: ['vocab_999'] }]))).toContain('vocabulary: 存在しない単語IDです：vocab_999')
    const { vocabulary: _v, ...empty } = readingLesson
    expect(messages(loadLessons([empty]))).toContain('words: reading のレッスンには、words か vocabulary の少なくとも一方を書いてください')
  })

  it('order・字母が重複したレッスンは、後から出てきた方を除外する', () => {
    const dupOrder = loadLessons([vowelLesson, { ...consonantLesson, order: 1 }])
    expect(dupOrder.hangulLessons.map((l) => l.id)).toEqual(['hangul_001'])
    expect(messages(dupOrder)).toContain('order: order 1 は、すでにレッスン hangul_001 で使われています。後から出てきた方を除外しました')
    const dupLetter = loadLessons([vowelLesson, { ...consonantLesson, letters: [firstLetter], words: [{ id: 'hword_003', korean: '아', pronunciation: 'ア', japanese: 'ああ' }] }])
    expect(messages(dupLetter)).toContain(': 字母 ㅏ は、すでにレッスン hangul_001 にあります。後から出てきた方を除外しました')
  })

  it('読む練習の単語のIDは、形式と重複を確かめる', () => {
    expect(messages(loadLessons([{ ...vowelLesson, words: [{ id: 'word_1', korean: '아이', pronunciation: 'アイ', japanese: '子ども' }] }]))).toContain('words[0].id: IDの形式が違います（例：hword_001）')
    const dup = loadLessons([vowelLesson, { ...consonantLesson, words: [{ id: 'hword_001', korean: '고기', pronunciation: 'コギ', japanese: '肉' }] }])
    expect(messages(dup).some((m) => m.startsWith('words[0].id: IDが重複しています'))).toBe(true)
  })

  it('レッスンの名前にハングルは入れられない（説明には入れてよい）', () => {
    expect(messages(loadLessons([{ ...vowelLesson, titleJa: 'ㅏ の文字' }])).some((m) => m.startsWith('titleJa:'))).toBe(true)
  })
})

// ---------- リスニングの文 ----------

const validListening = {
  id: 'listen_001',
  afterEvent: 'event_001',
  korean: '커피 주세요.',
  pronunciation: 'コピ ジュセヨ',
  japanese: 'コーヒーをください。',
  distractors: [
    { korean: '커피 좋아요.', pronunciation: 'コピ ジョアヨ', japanese: 'コーヒーが好きです。' },
    { korean: '커피 있어요?', pronunciation: 'コピ イッソヨ', japanese: 'コーヒーはありますか？' },
  ],
  reviewed: false,
}
const loadListening = (items: unknown[]) => loadContent({ ...base, listening: { 'l.json': items } })

describe('リスニングの文', () => {
  it('正しい文は問題なしで読み込む', () => {
    const result = loadListening([validListening])
    expect(messages(result)).toEqual([])
    expect(result.listening).toHaveLength(1)
  })

  it('存在しないイベントを afterEvent にするとエラー', () => {
    expect(messages(loadListening([{ ...validListening, afterEvent: 'event_002' }])).some((m) => m.startsWith('afterEvent: 存在しないイベントIDです'))).toBe(true)
  })

  it('まぎらわしい文は1つ以上必要', () => {
    expect(messages(loadListening([{ ...validListening, distractors: [] }]))).toContain('distractors: 1個以上入れてください')
  })

  it('空白・句読点だけが違う文は選択肢にできない', () => {
    const same = { ...validListening, distractors: [{ korean: '커피주세요', pronunciation: 'コピジュセヨ', japanese: 'コーヒーをください' }] }
    expect(messages(loadListening([same])).some((m) => m.startsWith('distractors: 正解の文と同じ文'))).toBe(true)
  })

  it('IDは重複できない', () => {
    const result = loadContent({ ...base, listening: { 'a.json': [validListening], 'b.json': [validListening] } })
    expect(result.listening).toHaveLength(1)
    expect(messages(result).some((m) => m.startsWith('id: IDが重複しています'))).toBe(true)
  })
})

// ---------- Phase 2.5：会話の問題・選択の往復、ジャンル、文法の穴埋め、ドリル、章末テスト ----------

describe('単語のジャンル（genre）', () => {
  it('category は genre に変わったことを知らせる', () => {
    const { genre: _genre, ...withoutGenre } = validVocab
    const issues = issuesOf('vocabulary', { ...withoutGenre, category: 'drink' })
    expect(issues).toHaveLength(1)
    expect(issues[0]).toMatchObject({ path: 'category' })
    expect(issues[0]?.message).toContain('genre')
  })
})

describe('文法の接続ルールと穴埋め（connectionJa・blank）', () => {
  const example = { korean: '저는 학생이에요.', pronunciation: 'チョヌン ハクセンイエヨ', japanese: '私は学生です。' }
  const withExample = (extra: Record<string, unknown>) => ({ ...validGrammar, connectionJa: 'パッチムがあれば 이에요', examples: [{ ...example, ...extra }] })

  it('blank と blankWrong を書ける', () => {
    const result = validateFile('grammar', 'g.json', [withExample({ blank: '이에요', blankWrong: ['예요'] })], ctx)
    expect(result.issues).toEqual([])
    expect(result.items[0]?.connectionJa).toBe('パッチムがあれば 이에요')
    expect(result.items[0]?.examples[0]).toMatchObject({ blank: '이에요', blankWrong: ['예요'] })
  })

  it.each([
    [{ blank: '예요입니다', blankWrong: ['예요'] }, 'ありません'],
    [{ blank: '이에요' }, '必須項目'],
    [{ blankWrong: ['예요'] }, 'blank（隠す部分）も'],
    [{ blank: '이에요', blankWrong: ['이에요'] }, '同じ文字列'],
    [{ blank: '저는 학생이에요.', blankWrong: ['예요'] }, '文全体'],
  ])('blank の誤り %#', (extra, message) => {
    expect(
      issuesOf('grammar', withExample(extra))
        .map((i) => i.message)
        .join('\n'),
    ).toContain(message)
  })

  it('blank が korean に2回出てくるとエラー', () => {
    const twice = { korean: '이거 이거 주세요.', pronunciation: 'イゴ イゴ ジュセヨ', japanese: 'これ、これください。', blank: '이거', blankWrong: ['그거'] }
    expect(issuesOf('grammar', { ...validGrammar, examples: [twice] })[0]?.message).toContain('2回')
  })
})

describe('会話の問題の往復（task あり）', () => {
  const wrongWithReply = { ...wrongChoice, reply: [staffLine('네?', 'ネ')] }
  const question = (choices: unknown[], extra: Record<string, unknown> = {}) => withTurn0({ task: '返事をしよう', lines: turn0.lines, choices, ...extra })

  it('正解が1つで、不正解に反応があれば通る', () => {
    const result = validateFile('conversations', 's.json', [question([correctChoice, wrongWithReply])], ctx)
    expect(result.issues).toEqual([])
    expect(result.items[0]?.turns[0]).toMatchObject({ task: '返事をしよう' })
    expect(result.items[0]?.turns[0]?.kind).toBeUndefined()
  })

  it('正解が2つ・0個ならエラー', () => {
    const second = { ...correctChoice, korean: '예.', pronunciation: 'イェ' }
    expect(issuesOf('conversations', question([correctChoice, second, wrongWithReply]))[0]?.message).toContain('ちょうど1つ')
    expect(issuesOf('conversations', question([wrongWithReply]))[0]?.message).toContain('ちょうど1つ')
  })

  it('不正解の選択肢に反応（reply）がなければエラー', () => {
    const issues = issuesOf('conversations', question([correctChoice, wrongChoice]))
    expect(issues).toHaveLength(1)
    expect(issues[0]?.path).toBe('turns[0].choices[1].reply')
  })

  it('task にハングルは入れられない', () => {
    expect(issuesOf('conversations', question([correctChoice, wrongWithReply], { task: '네 と言おう' }))[0]?.path).toBe('turns[0].task')
  })

  it('kind は "decision" だけ', () => {
    expect(issuesOf('conversations', question([correctChoice, wrongWithReply], { kind: 'question' }))[0]?.path).toBe('turns[0].kind')
  })

  it('締めの台詞の往復には task を書けない', () => {
    const conv = { ...validConversation, turns: [turn0, { task: 'あいさつ', lines: [staffLine('또 오세요.', 'ト オセヨ')] }] }
    expect(issuesOf('conversations', conv)[0]?.message).toContain('kind・task')
  })

  it('移行の間：task のない往復は前の形（正解が複数・不正解の反応なし）でも通る', () => {
    const second = { ...correctChoice, korean: '예.', pronunciation: 'イェ' }
    expect(issuesOf('conversations', withTurn0({ lines: turn0.lines, choices: [correctChoice, second, wrongChoice] }))).toEqual([])
  })
})

describe('会話の選択の往復（kind: decision）', () => {
  const yes = { korean: '네, 주세요.', pronunciation: 'ネ ジュセヨ', japanese: 'はい、ください。', reply: [staffLine('네.', 'ネ')] }
  const no = { korean: '아니요, 괜찮아요.', pronunciation: 'アニヨ ケンチャナヨ', japanese: 'いいえ、大丈夫です。', reply: [staffLine('알겠습니다.', 'アルゲッスムニダ')] }
  const decision = (choices: unknown[], extra: Record<string, unknown> = {}) => withTurn0({ kind: 'decision', lines: turn0.lines, choices, ...extra })

  it('correct を書かず、すべてに反応があれば通る（correct は false として読み込む）', () => {
    const result = validateFile('conversations', 's.json', [decision([yes, no])], ctx)
    expect(result.issues).toEqual([])
    expect(result.items[0]?.turns[0]?.kind).toBe('decision')
    expect(result.items[0]?.turns[0]?.choices?.every((c) => !c.correct)).toBe(true)
  })

  it('correct を書くとエラー', () => {
    expect(issuesOf('conversations', decision([{ ...yes, correct: true }, no]))[0]?.path).toBe('turns[0].choices[0].correct')
  })

  it('反応のない選択肢はエラー', () => {
    const { reply: _reply, ...noReply } = no
    expect(issuesOf('conversations', decision([yes, noReply]))[0]?.path).toBe('turns[0].choices[1].reply')
  })

  it('選択肢が1つだけ・freeAnswer があるとエラー', () => {
    expect(issuesOf('conversations', decision([yes]))[0]?.message).toContain('2個以上')
    expect(issuesOf('conversations', decision([yes, no], { freeAnswer: { prompt: 'はい', answers: ['네.'] } }))[0]?.path).toBe('turns[0].freeAnswer')
  })
})

const validDrill = {
  id: 'drill_001',
  titleJa: '数字（漢数詞）',
  items: [
    { id: 'dq_001', korean: '일', pronunciation: 'イル', japanese: '1', digits: '1' },
    { id: 'dq_002', korean: '이', pronunciation: 'イ', japanese: '2', digits: '2' },
    { id: 'dq_003', korean: '삼', pronunciation: 'サム', japanese: '3', digits: '3' },
    { id: 'dq_004', korean: '세 시 삼십 분', pronunciation: 'セ シ サムシプ プン', japanese: '3時30分', digits: '3:30' },
  ],
  reviewed: false,
}
const validTest = { id: 'test_001', chapter: 1, titleJa: '第1章のテスト', reviewed: false }
const withItem = (extra: Record<string, unknown>) => ({ ...validDrill, items: [...validDrill.items.slice(1), { ...validDrill.items[0], ...extra }] })

describe('基礎ドリル', () => {
  it('正しいドリルを読み込む', () => {
    const result = validateFile('drills', 'd.json', [validDrill], ctx)
    expect(result.issues).toEqual([])
    expect(result.items[0]?.items.map((i) => i.digits)).toEqual(['1', '2', '3', '3:30'])
  })

  it('問題は4個以上', () => {
    expect(issuesOf('drills', { ...validDrill, items: validDrill.items.slice(0, 3) })[0]?.message).toContain('4個以上')
  })

  it.each(['3,500', '３', '3時', '3:', '-1'])('digits の形が違えばエラー（%s）', (digits) => {
    expect(issuesOf('drills', withItem({ digits }))[0]?.path).toMatch(/digits$/)
  })

  it('別解（alternatives）を書ける。ただし数字だけの別解は入れられない', () => {
    expect(issuesOf('drills', withItem({ korean: '하나', pronunciation: 'ハナ', alternatives: ['한 개'] }))).toEqual([])
    expect(issuesOf('drills', withItem({ alternatives: ['1'] }))[0]?.message).toContain('数字だけの答え')
  })

  it('問題のIDの形式・重複、日本語のハングルを確かめる', () => {
    expect(issuesOf('drills', withItem({ id: 'drill_q1' }))[0]?.message).toContain('dq_001')
    expect(issuesOf('drills', withItem({ id: 'dq_002' }))[0]?.message).toContain('同じIDの問題')
    expect(issuesOf('drills', withItem({ japanese: '일（1）' }))[0]?.path).toMatch(/japanese$/)
    expect(issuesOf('drills', withItem({ hintJa: '고유어で' }))[0]?.path).toMatch(/hintJa$/)
  })
})

describe('章末テスト', () => {
  const load = (tests: unknown[], drills: unknown[] = []) => loadContent({ ...base, chapterTests: { 't.json': tests }, drills: { 'd.json': drills } })

  it('items を省略できる（[] として読み込む）。章の順に並べる', () => {
    const result = load([{ ...validTest, id: 'test_002', chapter: 3 }, validTest])
    expect(result.issues).toEqual([])
    expect(result.chapterTests.map((t) => t.chapter)).toEqual([1, 3])
    expect(result.chapterTests[0]?.items).toEqual([])
  })

  it('1つの章にテストは1つまで', () => {
    const result = load([validTest, { ...validTest, id: 'test_002' }])
    expect(result.chapterTests.map((t) => t.id)).toEqual(['test_001'])
    expect(result.issues[0]?.message).toContain('第1章のテストは')
  })

  it('問題のIDは、ドリルとテストをまたいで一意', () => {
    const result = load([{ ...validTest, items: [validDrill.items[0]] }], [validDrill])
    expect(result.drills).toHaveLength(1)
    expect(result.chapterTests).toEqual([])
    expect(result.issues[0]?.message).toContain('dq_001')
  })

  it('passPercent は 0〜100', () => {
    expect(issuesOf('chapterTests', { ...validTest, passPercent: 120 })[0]?.path).toBe('passPercent')
  })
})
