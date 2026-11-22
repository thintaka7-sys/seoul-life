// Phase 3 で足した教材の形（おはなし・読み物・メニュー・注文・glosses・figures・forms・章・イベントの新しい項目）の検証。
// 書き方は docs/CONTENT_FORMAT.md 19〜27章。

import { describe, expect, it } from 'vitest'
import { loadContent, type ContentInput } from './validate'

const line = (korean: string, pronunciation: string, extra: Record<string, unknown> = {}) => ({ speaker: 'cafe_staff', korean, pronunciation, japanese: '訳', ...extra })

const vocab = (id: string, korean: string, pronunciation: string, extra: Record<string, unknown> = {}) => ({
  id,
  korean,
  pronunciation,
  japanese: '意味',
  partOfSpeech: 'noun',
  genre: 'food_drink',
  level: 1,
  reviewed: false,
  ...extra,
})

const validMenu = {
  id: 'menu_001',
  location: 'cafe',
  titleJa: 'メニュー',
  currency: { korean: '원', pronunciation: 'ウォン' },
  items: [
    { key: 'americano', vocab: 'vocab_002', price: 4500, pricePronunciation: 'サチョノベグォン', image: 'americano', counter: '잔', reply: [line('좋아요.', 'チョアヨ')] },
    { key: 'cheesecake', vocab: 'vocab_003', price: 5500, pricePronunciation: 'オチョノベグォン', counter: '개', reply: [line('맛있어요.', 'マシッソヨ')] },
  ],
  reviewed: false,
}

const validOrder = {
  id: 'order_001',
  chapter: 3,
  location: 'cafe',
  character: 'cafe_staff',
  menu: 'menu_001',
  task: '好きなものを注文しよう',
  lines: [line('주문하시겠어요?', 'チュムナシゲッソヨ')],
  counts: [{ korean: '한 잔', pronunciation: 'ハン ジャン', number: 1, counter: '잔', confirm: [line('한 잔이요.', 'ハン ジャニヨ')] }],
  endings: [{ korean: '주세요', pronunciation: 'ジュセヨ' }, { korean: '요', attached: true }],
  closing: [line('네.', 'ネ')],
  notOnMenu: [line('없어요.', 'オプソヨ')],
  unclear: [line('네?', 'ネ')],
  reviewed: false,
}

const validStory = {
  id: 'story_001',
  chapter: 1,
  titleJa: '到着',
  bgm: 'story',
  beats: [
    { type: 'scene', background: 'airport', image: 'arrival' },
    { type: 'narration', textJa: '空港に着いた。' },
    { type: 'line', speaker: 'cafe_staff', korean: '커피 주세요.', pronunciation: 'コピ ジュセヨ', japanese: 'コーヒーをください。' },
    { type: 'sign', korean: '입국', pronunciation: 'イプクク', japanese: '入国' },
    {
      type: 'choice',
      choices: [
        { korean: '네.', pronunciation: 'ネ', japanese: 'はい。', reply: [line('네.', 'ネ')] },
        { korean: '아니요.', pronunciation: 'アニヨ', japanese: 'いいえ。', reply: [line('네?', 'ネ')] },
      ],
    },
    { type: 'sfx', id: 'airplane' },
    { type: 'bgm', id: 'none' },
    { type: 'scene', call: 'teacher', image: null },
  ],
  reviewed: false,
}

const validReading = {
  id: 'reading_001',
  chapter: 1,
  titleJa: 'メモ',
  style: 'memo',
  lines: [{ korean: '커피 좋아요.', pronunciation: 'コピ ジョアヨ', japanese: 'コーヒーが好きです。' }],
  questions: [
    { type: 'choice', questionJa: '何が好き？', choices: [{ textJa: 'コーヒー', correct: true }, { korean: '케이크', pronunciation: 'ケイク', japanese: 'ケーキ', correct: false }] },
    { type: 'number', questionJa: 'いくら？', digits: '4500' },
    { type: 'write', questionJa: '韓国語で書こう', answers: ['커피'] },
    { type: 'find', questionJa: '探して押そう', answer: '좋아요' },
  ],
  reviewed: false,
}

const msg = { type: 'message', textJa: 'a' }
const event = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  chapter: 1,
  location: 'home',
  requires: [],
  objectiveJa: '目標',
  actionJa: '始める',
  steps: [msg],
  ...extra,
})

const balance = {
  xp: { learnWord: 2, conversationChoice: 10, conversationWrite: 15, eventComplete: 20, hangulLesson: 20, listening: 3, review: 3, drillItem: 2, chapterTest: 30 },
  furiganaAlwaysUntilChapter: 3,
  initialLocations: ['home'],
  startLocation: 'home',
  writeAttemptsBeforeReveal: 2,
  hangulQuizQuestions: 8,
  hangulPassPercent: 80,
  listeningQuestionsPerRound: 5,
  review: { intervalsDays: [1, 3, 7, 14, 30], masteredDays: 14, dailyLimit: 20 },
  practiceQuestions: 10,
  drillQuestions: 10,
  testQuestions: 10,
  testPassPercent: 80,
  earQuestions: 10,
  stampActivities: ['review'],
}

const base: ContentInput = {
  locations: { 'l.json': [{ id: 'cafe', nameJa: 'カフェ', bgm: 'cafe' }, { id: 'home', nameJa: '自宅' }] },
  characters: { 'c.json': [{ id: 'cafe_staff', roleJa: '店員' }, { id: 'teacher', roleJa: '先生' }] },
  chapters: { 'ch.json': [1, 2, 3].map((chapter) => ({ chapter, titleJa: `第${chapter}章`, goalJa: 'できること' })) },
  vocabulary: { 'v.json': [vocab('vocab_001', '커피', 'コピ'), vocab('vocab_002', '아메리카노', 'アメリカノ'), vocab('vocab_003', '치즈케이크', 'チジュケイク')] },
  grammar: {},
  conversations: {},
  columns: {},
  events: {},
  hangulLessons: {},
  listening: {},
  drills: {},
  chapterTests: {},
  earSets: {},
  stories: {},
  readings: {},
  menus: {},
  orders: {},
  balance: { 'balance.json': balance },
}

const with_ = (patch: Partial<ContentInput>) => loadContent({ ...base, ...patch })
const messages = (r: ReturnType<typeof loadContent>) => r.issues.map((i) => `${i.path}: ${i.message}`)

describe('章の一覧（19-1）', () => {
  it('正しければ章の順に読み込む', () => {
    const r = with_({ chapters: { 'ch.json': [{ chapter: 2, titleJa: '自己紹介', goalJa: 'a' }, { chapter: 1, titleJa: '到着', goalJa: 'b' }] } })
    expect(r.issues).toEqual([])
    expect(r.chapters.map((c) => c.chapter)).toEqual([1, 2])
  })

  it('同じ章が2回あれば後の方を除外する。題にハングルは入れられない', () => {
    const dup = with_({ chapters: { 'ch.json': [{ chapter: 1, titleJa: 'a', goalJa: 'b' }, { chapter: 1, titleJa: 'c', goalJa: 'd' }] } })
    expect(dup.chapters.map((c) => c.titleJa)).toEqual(['a'])
    expect(with_({ chapters: { 'ch.json': [{ chapter: 1, titleJa: '카페', goalJa: 'b' }] } }).chapters).toEqual([])
  })
})

describe('施設の BGM', () => {
  it('BGM のID以外は書けない', () => {
    expect(with_({}).locations.find((l) => l.id === 'cafe')?.bgm).toBe('cafe')
    expect(with_({ locations: { 'l.json': [{ id: 'home', nameJa: '自宅', bgm: 'jazz' }] } }).locations).toEqual([])
  })
})

describe('glosses（21章）', () => {
  const conv = (glosses: unknown) =>
    with_({
      conversations: {
        's.json': [
          {
            id: 'cafe_001',
            chapter: 3,
            location: 'cafe',
            character: 'cafe_staff',
            turns: [{ task: '返事しよう', lines: [line('이름이 뭐예요?', 'イルミ ムォエヨ', { glosses })], choices: [{ korean: '네.', pronunciation: 'ネ', japanese: 'はい。', correct: true }] }],
            reviewed: false,
          },
        ],
      },
    })

  it('単語につなぐ語句と、読み・意味を直接書く語句を書ける', () => {
    const r = conv([
      { text: '이름이', vocab: 'vocab_001', noteJa: '이름＋이' },
      { text: '뭐예요', pronunciation: 'ムォエヨ', japanese: '何ですか' },
    ])
    expect(r.issues).toEqual([])
    expect(r.conversations[0]?.turns[0]?.lines[0]?.glosses).toHaveLength(2)
  })

  it('文の中にない語句・まとまりの一部・句読点つきは書けない', () => {
    expect(messages(conv([{ text: '커피', vocab: 'vocab_001' }]))[0]).toContain('glosses[0].text')
    expect(conv([{ text: '이름', vocab: 'vocab_001' }]).conversations).toEqual([])
    expect(conv([{ text: '뭐예요?', pronunciation: 'ムォエヨ', japanese: '何' }]).conversations).toEqual([])
  })

  it('vocab を書いたら読み・意味は書かない。vocab がなければ読み・意味が必須。存在しない単語は使えない', () => {
    expect(conv([{ text: '이름이', vocab: 'vocab_001', japanese: '名前が' }]).conversations).toEqual([])
    expect(conv([{ text: '뭐예요', japanese: '何ですか' }]).conversations).toEqual([])
    expect(conv([{ text: '이름이', vocab: 'vocab_999' }]).conversations).toEqual([])
  })

  it('読みの区切りは語句と合わせる。同じ語句は2回書けない', () => {
    expect(conv([{ text: '이름이 뭐예요', pronunciation: 'イルミムォエヨ', japanese: '名前は何ですか' }]).conversations).toEqual([])
    expect(conv([{ text: '이름이 뭐예요', pronunciation: 'イルミ ムォエヨ', japanese: '名前は何ですか' }]).issues).toEqual([])
    expect(conv([{ text: '이름이', vocab: 'vocab_001' }, { text: '이름이', vocab: 'vocab_002' }]).conversations).toEqual([])
  })
})

describe('figures（23章）', () => {
  const grammar = (figures: unknown) =>
    with_({
      grammar: { 'g.json': [{ id: 'grammar_001', title: 't', level: 1, explanation: 'e', examples: [{ korean: '커피예요.', pronunciation: 'コピエヨ', japanese: 'コーヒーです。' }], figures, reviewed: false }] },
    })

  it('4つの種類を書ける', () => {
    const r = grammar([
      { type: 'image', image: 'mouth_eo', captionJa: 'ㅓ の口', labels: [{ x: 10, y: 90, textJa: '縦に開ける', arrow: 'up' }] },
      { type: 'formation', parts: ['가', '아요'], result: '가요', resultPronunciation: 'カヨ', noteJa: '아 が1つになる' },
      { type: 'syllable', korean: '한' },
      { type: 'compare', items: [{ korean: '어', pronunciation: 'オ', image: 'mouth_eo' }, { korean: '오', pronunciation: 'オ' }] },
    ])
    expect(r.issues).toEqual([])
    expect(r.grammar[0]?.figures?.map((f) => f.type)).toEqual(['image', 'formation', 'syllable', 'compare'])
  })

  it('形の誤りを見つける', () => {
    expect(grammar([{ type: 'image', image: 'Mouth-EO' }]).grammar).toEqual([])
    expect(grammar([{ type: 'image', image: 'a', labels: [{ x: 120, y: 0, textJa: 't' }] }]).grammar).toEqual([])
    expect(grammar([{ type: 'image', image: 'a', labels: [{ x: 1, y: 1, textJa: 't', arrow: 'up-left' }] }]).grammar).toEqual([])
    expect(grammar([{ type: 'formation', parts: ['가아요'], result: '가요' }]).grammar).toEqual([])
    expect(grammar([{ type: 'syllable', korean: '한국' }]).grammar).toEqual([])
    const four = Array.from({ length: 4 }, (_, i) => ({ korean: ['가', '나', '다', '라'][i], pronunciation: 'カ' }))
    expect(grammar([{ type: 'compare', items: four }]).grammar).toEqual([])
    expect(grammar([{ type: 'chart' }]).grammar).toEqual([])
    expect(grammar([{ type: 'syllable', korean: '한', caption: 'x' }]).grammar).toEqual([])
  })

  it('ハングルのレッスン・文字・ドリル・聞き分けの組にも付けられる', () => {
    const fig = [{ type: 'syllable', korean: '아' }]
    const r = with_({
      hangulLessons: {
        'h.json': [
          {
            id: 'hangul_001',
            order: 1,
            kind: 'letters',
            titleJa: '母音',
            introJa: ['説明'],
            figures: fig,
            letters: [{ jamo: 'ㅏ', sounds: [{ korean: '아', pronunciation: 'ア' }], tipJa: 'こつ', figures: fig }],
            words: [{ id: 'hword_001', korean: '아아', pronunciation: 'アア', japanese: 'ああ' }],
            reviewed: false,
          },
        ],
      },
      drills: { 'd.json': [{ id: 'drill_001', titleJa: '数', figures: fig, items: ['일', '이', '삼', '사'].map((k, i) => ({ id: `dq_00${i + 1}`, korean: k, pronunciation: 'イル', japanese: String(i + 1) })), reviewed: false }] },
      earSets: { 'e.json': [{ id: 'ear_001', theme: 'vowel_eo_o', titleJa: 'ㅓ・ㅗ', focusJa: '母音', tipJa: 'こつ', figures: fig, items: [{ korean: '커피', pronunciation: 'コピ', japanese: 'コーヒー' }, { korean: '코피', pronunciation: 'コピ', japanese: '鼻血' }], reviewed: false }] },
    })
    expect(r.issues).toEqual([])
    expect(r.hangulLessons[0]?.figures).toHaveLength(1)
    expect(r.hangulLessons[0]?.letters[0]?.figures).toHaveLength(1)
    expect(r.drills[0]?.figures).toHaveLength(1)
    expect(r.earSets[0]?.figures).toHaveLength(1)
  })
})

describe('形が変わる言葉（24章）', () => {
  const load = (extra: Record<string, unknown>) => with_({ vocabulary: { 'v.json': [vocab('vocab_001', '주세요', 'チュセヨ', extra)] } })
  const form = { kind: 'seyo', korean: '주세요', pronunciation: 'チュセヨ', parts: ['주', '세요'], wrong: ['주어세요'] }

  it('元の形と形が変わった言葉を書ける', () => {
    const r = load({ base: { korean: '주다', pronunciation: 'チュダ', japanese: 'くれる' }, forms: [form, { kind: 'present', korean: '줘요', pronunciation: 'チュォヨ', parts: ['주', '어요'] }] })
    expect(r.issues).toEqual([])
    expect(r.vocabulary[0]?.base?.korean).toBe('주다')
    expect(r.vocabulary[0]?.forms).toHaveLength(2)
  })

  it('誤りを見つける', () => {
    expect(load({ base: { korean: '주세요', pronunciation: 'チュセヨ' } }).vocabulary).toEqual([])
    expect(load({ forms: [{ ...form, wrong: ['주세요'] }] }).vocabulary).toEqual([])
    expect(load({ forms: [{ ...form, parts: ['주세요'] }] }).vocabulary).toEqual([])
    expect(load({ forms: [{ ...form, kind: 'future' }] }).vocabulary).toEqual([])
    expect(load({ forms: [form, form] }).vocabulary).toEqual([])
    expect(load({ forms: [] }).vocabulary).toEqual([])
  })
})

describe('おはなし（20章）', () => {
  const load = (story: unknown) => with_({ stories: { 's.json': [story] } })

  it('すべての段階を書ける', () => {
    const r = load(validStory)
    expect(r.issues).toEqual([])
    expect(r.stories[0]?.beats).toHaveLength(8)
    expect(r.stories[0]?.beats.at(-1)).toEqual({ type: 'scene', call: 'teacher', image: null })
  })

  it('画面に出す段階がないと除外する', () => {
    expect(load({ ...validStory, beats: [{ type: 'scene', background: 'home' }, { type: 'bgm', id: 'home' }] }).stories).toEqual([])
  })

  it('場面の誤りを見つける', () => {
    const scene = (beat: Record<string, unknown>) => load({ ...validStory, beats: [{ type: 'scene', ...beat }, msg].map((b) => (b === msg ? { type: 'narration', textJa: 'a' } : b)) })
    expect(scene({}).stories).toEqual([])
    expect(scene({ background: 'moon' }).stories).toEqual([])
    expect(scene({ call: 'friend' }).stories).toEqual([])
    expect(scene({ character: null }).issues).toEqual([])
    expect(scene({ background: 'cafe' }).issues).toEqual([])
  })

  it('地の文にハングルは入れない。選択肢は2つ以上で、反応が必須。効果音・BGM は決まったキーだけ', () => {
    const one = (beat: unknown) => load({ ...validStory, beats: [{ type: 'narration', textJa: 'a' }, beat] }).stories
    expect(one({ type: 'narration', textJa: '「안녕」と言った' })).toEqual([])
    expect(one({ type: 'choice', choices: [{ korean: '네.', pronunciation: 'ネ', japanese: 'はい。', reply: [line('네.', 'ネ')] }] })).toEqual([])
    expect(one({ type: 'choice', choices: [{ korean: '네.', pronunciation: 'ネ', japanese: 'a' }, { korean: '응.', pronunciation: 'ウン', japanese: 'b', reply: [line('네.', 'ネ')] }] })).toEqual([])
    expect(one({ type: 'sfx', id: 'explosion' })).toEqual([])
    expect(one({ type: 'bgm', id: 'rock' })).toEqual([])
    expect(one({ type: 'line', speaker: 'player', korean: '네.', pronunciation: 'ネ', japanese: 'はい。', expression: 'smile' })).toEqual([])
  })
})

describe('メニュー（26章）', () => {
  const load = (menu: unknown) => with_({ menus: { 'm.json': [menu] } })

  it('正しければ読み込む', () => {
    expect(load(validMenu).issues).toEqual([])
  })

  it('品物の誤りを見つける', () => {
    const item0 = validMenu.items[0] as (typeof validMenu.items)[number]
    const withItem = (patch: Record<string, unknown>) => load({ ...validMenu, items: [{ ...item0, ...patch }] }).menus
    expect(withItem({ vocab: 'vocab_999' })).toEqual([])
    expect(withItem({ image: 'pizza' })).toEqual([])
    expect(withItem({ counter: 'cup' })).toEqual([])
    expect(withItem({ pricePronunciation: 'サチョノベ グォン' })).toEqual([])
    expect(withItem({ price: '4500' })).toEqual([])
    expect(load({ ...validMenu, items: [item0, { ...item0, vocab: 'vocab_003', image: 'cheesecake' }] }).menus).toEqual([])
    expect(load({ ...validMenu, items: Array.from({ length: 13 }, (_, i) => ({ ...item0, key: `k${i}`, image: undefined })) }).menus).toEqual([])
  })
})

describe('注文（27章）', () => {
  const load = (order: unknown, menus: unknown[] = [validMenu]) => with_({ menus: { 'm.json': menus }, orders: { 'o.json': [order] } })

  it('正しければ読み込む', () => {
    const r = load({ ...validOrder, modifiers: [{ korean: '아이스', pronunciation: 'アイス', counter: '잔' }], counterNoteJa: '飲み物は 잔 で数えます' })
    expect(r.issues).toEqual([])
    expect(r.orders[0]?.endings).toEqual([{ korean: '주세요', pronunciation: 'ジュセヨ' }, { korean: '요', attached: true }])
  })

  it('メニューの施設と違う・存在しないメニューは使えない', () => {
    expect(load(validOrder, [{ ...validMenu, location: 'home' }]).orders).toEqual([])
    expect(load({ ...validOrder, menu: 'menu_999' }).orders).toEqual([])
  })

  it('メニューにない数え方は使えない', () => {
    expect(load({ ...validOrder, counts: [{ ...validOrder.counts[0], counter: '병' }] }).orders).toEqual([])
    expect(load({ ...validOrder, modifiers: [{ korean: '큰', pronunciation: 'クン', counter: '병' }] }).orders).toEqual([])
  })

  it('くっつけない言い方が1つは必要。くっつける言い方には読みを書かない', () => {
    expect(load({ ...validOrder, endings: [{ korean: '요', attached: true }] }).orders).toEqual([])
    expect(load({ ...validOrder, endings: [{ korean: '주세요', pronunciation: 'ジュセヨ' }, { korean: '요', pronunciation: 'ヨ', attached: true }] }).orders).toEqual([])
    expect(load({ ...validOrder, endings: [{ korean: '주세요' }] }).orders).toEqual([])
  })

  it('反応の台詞（締め・メニューにない・分からない）が必須。言うことにハングルは入れない', () => {
    const { notOnMenu: _n, ...noNotOnMenu } = validOrder
    expect(load(noNotOnMenu).orders).toEqual([])
    expect(load({ ...validOrder, task: '커피を注文しよう' }).orders).toEqual([])
  })
})

describe('読み物（25章）', () => {
  const load = (reading: unknown) => with_({ menus: { 'm.json': [validMenu] }, readings: { 'r.json': [reading] } })

  it('4つの問題の形を書ける', () => {
    const r = load(validReading)
    expect(r.issues).toEqual([])
    expect(r.readings[0]?.questions.map((q) => q.type)).toEqual(['choice', 'number', 'write', 'find'])
  })

  it('メニューの読み物は menu が必須で、本文を省ける。品名を探す問題にできる', () => {
    const menuReading = { ...validReading, style: 'menu', menu: 'menu_001', lines: undefined, questions: [{ type: 'find', questionJa: '探そう', answer: '아메리카노' }] }
    const r = load(menuReading)
    expect(r.issues).toEqual([])
    expect(r.readings[0]?.lines).toEqual([])
    expect(load({ ...menuReading, menu: undefined }).readings).toEqual([])
    expect(load({ ...menuReading, questions: [{ type: 'find', questionJa: '探そう', answer: '라테' }] }).readings).toEqual([])
  })

  it('メニューでない読み物は本文が必須で、menu は書けない', () => {
    expect(load({ ...validReading, lines: undefined }).readings).toEqual([])
    expect(load({ ...validReading, menu: 'menu_001' }).readings).toEqual([])
  })

  it('問題の誤りを見つける', () => {
    const q = (question: unknown) => load({ ...validReading, questions: [question] }).readings
    expect(q({ type: 'choice', questionJa: 'q', choices: [{ textJa: 'a', correct: true }, { textJa: 'b', correct: true }] })).toEqual([])
    expect(q({ type: 'choice', questionJa: 'q', choices: [{ textJa: 'a', korean: '네', pronunciation: 'ネ', japanese: 'はい', correct: true }, { textJa: 'b', correct: false }] })).toEqual([])
    expect(q({ type: 'number', questionJa: 'q', digits: '4,500' })).toEqual([])
    expect(q({ type: 'write', questionJa: 'q', answers: ['coffee'] })).toEqual([])
    expect(q({ type: 'find', questionJa: 'q', answer: '좋' })).toEqual([])
    expect(q({ type: 'guess', questionJa: 'q' })).toEqual([])
  })
})

describe('イベントの新しい項目（19章）', () => {
  const full = (events: unknown[], extra: Partial<ContentInput> = {}) =>
    with_({
      menus: { 'm.json': [validMenu] },
      orders: { 'o.json': [validOrder] },
      stories: { 's.json': [validStory] },
      readings: { 'r.json': [validReading] },
      events: { 'e.json': events },
      ...extra,
    })

  it('start・unlocks と新しい段階を書ける', () => {
    const r = full([
      event('event_001', { start: 'auto', unlocks: ['cafe'], steps: [{ type: 'story', id: 'story_001' }, { type: 'hangulIntro' }, { type: 'reading', id: 'reading_001' }, msg] }),
      event('event_002', { chapter: 3, location: 'cafe', requires: ['event_001'], steps: [{ type: 'order', id: 'order_001' }, { type: 'listening' }, { type: 'chapterEnd', textJa: '終わり' }] }),
    ], { listening: { 'l.json': [{ id: 'listen_001', afterEvent: 'event_002', korean: '커피 주세요.', pronunciation: 'コピ ジュセヨ', japanese: 'a', distractors: [{ korean: '커피 좋아요.', pronunciation: 'コピ ジョアヨ', japanese: 'b' }], reviewed: false }] } })
    expect(r.issues).toEqual([])
    expect(r.events[0]).toMatchObject({ start: 'auto', unlocks: ['cafe'] })
  })

  it('start は "auto" だけ。unlocks は存在する施設を1つ以上', () => {
    expect(full([event('event_001', { start: 'manual' })]).events).toEqual([])
    expect(full([event('event_001', { unlocks: ['moon'] })]).events).toEqual([])
    expect(full([event('event_001', { unlocks: [] })]).events).toEqual([])
  })

  it('存在しないおはなし・読み物・注文、施設の違う注文は使えない', () => {
    expect(full([event('event_001', { steps: [{ type: 'story', id: 'story_002' }] })]).events).toEqual([])
    expect(full([event('event_001', { steps: [{ type: 'reading', id: 'reading_002' }] })]).events).toEqual([])
    expect(full([event('event_001', { steps: [{ type: 'order', id: 'order_001' }] })]).events).toEqual([])
  })

  it('同じおはなしを2つのイベントで使うと、後のイベントと、それを前提にするイベントを除外する', () => {
    const steps = [{ type: 'story', id: 'story_001' }]
    const r = full([event('event_001', { steps }), event('event_002', { steps }), event('event_003', { requires: ['event_002'] })])
    expect(r.events.map((e) => e.id)).toEqual(['event_001'])
  })

  it('hangulIntro はゲーム全体で1つだけ。listening・chapterEnd は1つのイベントに1つまで', () => {
    const intro = [{ type: 'hangulIntro' }]
    expect(full([event('event_001', { steps: intro }), event('event_002', { steps: intro })]).events.map((e) => e.id)).toEqual(['event_001'])
    expect(full([event('event_001', { steps: [{ type: 'chapterEnd', textJa: 'a' }, { type: 'chapterEnd', textJa: 'b' }] })]).events).toEqual([])
  })

  it('listening の段階に出すリスニングの文がなければ知らせる', () => {
    const r = full([event('event_001', { steps: [{ type: 'listening' }] })])
    expect(r.events).toHaveLength(1)
    expect(messages(r)[0]).toContain('afterEvent が event_001')
  })

  it('章の一覧にない章のイベントは除外する', () => {
    const r = full([event('event_001', { chapter: 7 })])
    expect(r.events).toEqual([])
    expect(messages(r)[0]).toContain('第7章')
  })
})

describe('IDは種類をまたいで一意', () => {
  it('おはなしと読み物で同じIDは使えない', () => {
    const r = with_({ stories: { 's.json': [validStory] }, readings: { 'r.json': [{ ...validReading, id: 'story_001' }] } })
    expect(r.readings).toEqual([])
  })
})
