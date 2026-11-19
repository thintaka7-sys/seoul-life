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
  xp: { learnWord: 2, conversationChoice: 10, conversationWrite: 15, eventComplete: 20 },
  furiganaAlwaysUntilChapter: 3,
  initialLocations: ['home', 'cafe'],
  startLocation: 'home',
  writeAttemptsBeforeReveal: 2,
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
