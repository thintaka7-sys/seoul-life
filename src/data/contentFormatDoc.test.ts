// docs/CONTENT_FORMAT.md が、プログラムの検証ルールと食い違っていないことを確かめる。
// - 見本の JSON がそのまま検証を通ること
// - 10章のキー一覧が、プログラムで使えるキーと一致すること

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { content } from './index'
import {
  ACHIEVEMENT_CONDITIONS,
  BGM_IDS,
  EAR_THEME_LABELS,
  EAR_THEMES,
  EVENT_STEP_TYPES,
  EXPRESSIONS,
  FIGURE_TYPES,
  FORM_KIND_LABELS,
  FORM_KINDS,
  HANGUL_LESSON_KINDS,
  GENRE_LABELS,
  FIGURE_IMAGES,
  MENU_IMAGES,
  PARTS_OF_SPEECH,
  PART_OF_SPEECH_LABELS,
  PLAYER_SPEAKER_ID,
  READING_QUESTION_TYPES,
  READING_STYLES,
  SCENE_BACKGROUNDS,
  SCENE_SOUNDS,
  STORY_BEAT_TYPES,
  VOCAB_GENRES,
  type Figure,
} from './types'
import { formatIssue, loadContent } from './validate'

const docPath = fileURLToPath(new URL('../../docs/CONTENT_FORMAT.md', import.meta.url))
const doc = readFileSync(docPath, 'utf8').replace(/\r\n/g, '\n')
const stumblingPath = fileURLToPath(new URL('../../docs/STUMBLING_POINTS.md', import.meta.url))
const stumblingDoc = readFileSync(stumblingPath, 'utf8').replace(/\r\n/g, '\n')

/** `<!-- sample: 種類 -->` の直後にある ```json ブロックを取り出す */
function extractSamples(markdown: string): Map<string, unknown> {
  const samples = new Map<string, unknown>()
  const pattern = /<!-- sample: (\w+) -->\n```json\n([\s\S]*?)\n```/g
  for (const match of markdown.matchAll(pattern)) {
    const [, kind, body] = match
    if (kind === undefined || body === undefined) continue
    samples.set(kind, JSON.parse(body))
  }
  return samples
}

/** 見出し（例：### 10-1.）の下にある表の、1列目の `キー` を取り出す */
function keysInSection(markdown: string, headingPrefix: string): string[] {
  const lines = markdown.split('\n')
  const start = lines.findIndex((l) => l.startsWith(headingPrefix))
  if (start < 0) throw new Error(`見出しが見つかりません：${headingPrefix}`)
  const keys: string[] = []
  for (const line of lines.slice(start + 1)) {
    if (line.startsWith('#')) break
    const m = /^\| `([^`]+)` \|/.exec(line)
    if (m?.[1] !== undefined) keys.push(m[1])
  }
  return keys
}

const sorted = (xs: Iterable<string>) => [...xs].sort()

/** 見出しの下にある表の、1列目の `キー` → 2列目 */
function labelsInSection(markdown: string, headingPrefix: string): Record<string, string> {
  const lines = markdown.split('\n')
  const start = lines.findIndex((l) => l.startsWith(headingPrefix))
  const labels: Record<string, string> = {}
  for (const line of lines.slice(start + 1)) {
    if (line.startsWith('#')) break
    const m = /^\| `([^`]+)` \| ([^|]+) \|/.exec(line)
    if (m?.[1] !== undefined && m[2] !== undefined) labels[m[1]] = m[2].trim()
  }
  return labels
}

describe('docs/CONTENT_FORMAT.md の見本', () => {
  const samples = extractSamples(doc)
  const kinds = ['vocabulary', 'grammar', 'conversations', 'columns', 'events', 'hangulLessons', 'listening', 'drills', 'chapterTests', 'earSets', 'stories', 'readings', 'menus', 'orders', 'achievements'] as const

  it('単語・文法・会話・コラム・イベント・ハングルのレッスン・リスニングの文・基礎ドリル・章末テスト・聞き分けの組・おはなし・読み物・メニュー・注文・実績の見本がそろっている', () => {
    expect(sorted(samples.keys())).toEqual(sorted(kinds))
  })

  it('見本がすべて検証を通る（IDの重複・参照の誤りもない）', () => {
    const result = loadContent({
      vocabulary: { 'sample-vocabulary': samples.get('vocabulary') },
      grammar: { 'sample-grammar': samples.get('grammar') },
      conversations: { 'sample-conversations': samples.get('conversations') },
      columns: { 'sample-columns': samples.get('columns') },
      events: { 'sample-events': samples.get('events') },
      hangulLessons: { 'sample-hangulLessons': samples.get('hangulLessons') },
      listening: { 'sample-listening': samples.get('listening') },
      drills: { 'sample-drills': samples.get('drills') },
      chapterTests: { 'sample-chapterTests': samples.get('chapterTests') },
      earSets: { 'sample-earSets': samples.get('earSets') },
      stories: { 'sample-stories': samples.get('stories') },
      readings: { 'sample-readings': samples.get('readings') },
      menus: { 'sample-menus': samples.get('menus') },
      orders: { 'sample-orders': samples.get('orders') },
      // 施設・キャラクター・章・調整値は実際のデータを使う
      locations: { 'locations.json': content.locations },
      characters: { 'characters.json': content.characters },
      chapters: { 'chapters.json': content.chapters },
      achievements: { 'sample-achievements': samples.get('achievements') },
      balance: { 'balance.json': content.balance },
    })
    expect(result.issues.map(formatIssue)).toEqual([])
    expect(result.vocabulary.length).toBeGreaterThan(0)
    expect(result.grammar.length).toBeGreaterThan(0)
    expect(result.conversations.length).toBeGreaterThan(0)
    expect(result.columns.length).toBeGreaterThan(0)
    expect(result.events.length).toBeGreaterThan(0)
    // 見本のレッスンは、すべての種類（10-8）を含む
    expect(sorted(new Set(result.hangulLessons.map((l) => l.kind)))).toEqual(sorted(HANGUL_LESSON_KINDS))
    expect(result.listening.length).toBeGreaterThan(0)
    // 見本の会話は、問題の往復（task あり）と選択の往復を含む
    const turns = result.conversations.flatMap((c) => c.turns)
    expect(turns.some((t) => t.task !== undefined && t.kind === undefined)).toBe(true)
    expect(turns.some((t) => t.kind === 'decision')).toBe(true)
    // 見本の文法は、穴埋め（blank）と接続ルール（connectionJa）を含む
    expect(result.grammar.some((g) => g.connectionJa !== undefined && g.examples.some((e) => e.blank !== undefined))).toBe(true)
    // 見本のドリルは、数字の問題（digits）とそうでない問題を含む
    const items = result.drills.flatMap((d) => d.items)
    expect(items.some((i) => i.digits !== undefined)).toBe(true)
    expect(items.some((i) => i.digits === undefined)).toBe(true)
    expect(result.chapterTests.length).toBeGreaterThan(0)
    expect(result.achievements.length).toBe(2)
    // 見本の聞き分けの組は、3つの音の組と2つの音の組を含む
    expect([...new Set(result.earSets.map((e) => e.items.length))].sort((a, b) => a - b)).toEqual([2, 3])
    // Phase 3 の見本：おはなしの段階・読み物の問題・図の種類をすべて含み、注文・メニュー・形が変わる言葉・glosses がある
    expect(sorted(new Set(result.stories.flatMap((st) => st.beats.map((b) => b.type))))).toEqual(sorted(STORY_BEAT_TYPES))
    expect(sorted(new Set(result.readings.flatMap((r) => r.questions.map((q) => q.type))))).toEqual(sorted(READING_QUESTION_TYPES))
    const figures: Figure[] = [
      ...result.grammar.flatMap((g) => g.figures ?? []),
      ...result.hangulLessons.flatMap((l) => [...(l.figures ?? []), ...l.letters.flatMap((x) => x.figures ?? [])]),
      ...result.earSets.flatMap((e) => e.figures ?? []),
    ]
    expect(sorted(new Set(figures.map((f) => f.type)))).toEqual(sorted(FIGURE_TYPES))
    expect(result.menus.length).toBeGreaterThan(0)
    expect(result.orders.length).toBeGreaterThan(0)
    expect(result.vocabulary.some((v) => v.base !== undefined && (v.forms?.length ?? 0) > 0)).toBe(true)
    expect(result.conversations.some((c) => c.turns.some((t) => t.lines.some((l) => l.glosses !== undefined)))).toBe(true)
    // 見本のイベントは、新しい段階と start・unlocks を使う
    const stepTypes = new Set(result.events.flatMap((e) => e.steps.map((st) => st.type)))
    for (const t of ['story', 'reading', 'order', 'listening', 'chapterEnd', 'hangulIntro'] as const) expect(stepTypes.has(t), t).toBe(true)
    expect(result.events.some((e) => e.start === 'auto' && e.unlocks !== undefined)).toBe(true)
  })

  it('見本のIDは仮データ用の900番台を使っていない', () => {
    for (const kind of kinds) {
      const raw = samples.get(kind)
      expect(Array.isArray(raw)).toBe(true)
      for (const item of Array.isArray(raw) ? raw : []) {
        expect(JSON.stringify(item)).not.toMatch(/"id":"[a-z_]+_9\d\d"/)
      }
    }
  })
})

describe('docs/CONTENT_FORMAT.md のキー一覧', () => {
  it('品詞（10-1）がプログラムと一致する', () => {
    expect(sorted(keysInSection(doc, '### 10-1.'))).toEqual(sorted(PARTS_OF_SPEECH))
  })

  it('ジャンル（10-2）がプログラムと一致する', () => {
    expect(sorted(keysInSection(doc, '### 10-2.'))).toEqual(sorted(VOCAB_GENRES))
    // 図鑑のタブ・品詞の名前も、表と同じ
    expect(labelsInSection(doc, '### 10-2.')).toEqual(GENRE_LABELS)
    expect(labelsInSection(doc, '### 10-1.')).toEqual(PART_OF_SPEECH_LABELS)
  })

  it('施設ID（10-3）が src/data/locations と一致する', () => {
    expect(sorted(keysInSection(doc, '### 10-3.'))).toEqual(sorted(content.locations.map((l) => l.id)))
  })

  it('キャラクターID・話者ID（10-4）が src/data/characters ＋ player と一致する', () => {
    expect(sorted(keysInSection(doc, '### 10-4.'))).toEqual(sorted([...content.characters.map((c) => c.id), PLAYER_SPEAKER_ID]))
  })

  it('イベントの段階の種類（10-5）がプログラムと一致する', () => {
    expect(sorted(keysInSection(doc, '### 10-5.'))).toEqual(sorted(EVENT_STEP_TYPES))
  })

  it('場面の背景のID（10-7）がプログラムと一致する', () => {
    expect(sorted(keysInSection(doc, '### 10-7.'))).toEqual(sorted(SCENE_BACKGROUNDS))
  })

  it('ハングルのレッスンの種類（10-8）がプログラムと一致する', () => {
    expect(sorted(keysInSection(doc, '### 10-8.'))).toEqual(sorted(HANGUL_LESSON_KINDS))
  })

  it('聞き分けの組のテーマ（10-9）がプログラムと一致する', () => {
    expect(keysInSection(doc, '### 10-9.')).toEqual([...EAR_THEMES])
    expect(labelsInSection(doc, '### 10-9.')).toEqual(EAR_THEME_LABELS)
  })

  it('聞き分けの組の stumbling は、つまずきリスト（docs/STUMBLING_POINTS.md）にあるID', () => {
    const ids = new Set([...stumblingDoc.matchAll(/^\| ([SGVWH]\d{2}) \|/gm)].map((m) => m[1]))
    expect(ids.size).toBeGreaterThan(0)
    for (const set of content.earSets) for (const s of set.stumbling) expect(ids.has(s), `${set.id}: ${s}`).toBe(true)
  })

  it('BGM（10-10）・場面の効果音（10-11）・読み物の見た目（10-13）・メニューの絵（10-14）がプログラムと一致する', () => {
    expect(keysInSection(doc, '### 10-10.')).toEqual([...BGM_IDS])
    expect(keysInSection(doc, '### 10-11.')).toEqual([...SCENE_SOUNDS])
    expect(keysInSection(doc, '### 10-13.')).toEqual([...READING_STYLES])
    expect(keysInSection(doc, '### 10-14.')).toEqual([...MENU_IMAGES])
    expect(keysInSection(doc, '### 10-15.')).toEqual([...FIGURE_IMAGES])
  })

  it('形の種類（10-12）がプログラムと一致し、名前も同じ', () => {
    expect(keysInSection(doc, '### 10-12.')).toEqual([...FORM_KINDS])
    expect(labelsInSection(doc, '### 10-12.')).toEqual(FORM_KIND_LABELS)
  })

  it('おはなしの段階（20-1）・図の種類（23-1）・読み物の問題（25-2）・新しいイベントの段階（19-3）がプログラムと一致する', () => {
    expect(sorted(keysInSection(doc, '### 20-1.'))).toEqual(sorted(STORY_BEAT_TYPES))
    expect(sorted(keysInSection(doc, '### 23-1.'))).toEqual(sorted(FIGURE_TYPES))
    expect(sorted(keysInSection(doc, '### 25-2.'))).toEqual(sorted(READING_QUESTION_TYPES))
    const added = keysInSection(doc, '### 19-3.')
    expect(added.every((k) => (EVENT_STEP_TYPES as readonly string[]).includes(k))).toBe(true)
  })

  it('表情（10-6）がプログラムと一致する', () => {
    expect(sorted(keysInSection(doc, '### 10-6.'))).toEqual(sorted(EXPRESSIONS))
  })

  it('キャラクターの名前（10-4）が src/data/characters と一致する', () => {
    const named = content.characters.filter((c) => c.name !== undefined)
    expect(named.length).toBeGreaterThan(0)
    for (const c of named) {
      const row = doc.split('\n').find((l) => l.startsWith('| `' + c.id + '` |'))
      expect(row, c.id).toContain(`${c.name?.korean}（${c.name?.pronunciation}）`)
    }
  })
})

describe('docs/CONTENT_FORMAT.md 28章（実績）', () => {
  it('条件の種類の表が、プログラムの条件の種類と一致する', () => {
    expect(sorted(keysInSection(doc, '### 28-1.').filter((k) => k !== 'type'))).toEqual(sorted(ACHIEVEMENT_CONDITIONS))
  })
  it('項目の表が、使える項目と一致する', () => {
    expect(sorted(keysInSection(doc, '## 28.'))).toEqual(sorted(['id', 'titleJa', 'descriptionJa', 'condition', 'coins', 'reviewed', 'notes']))
  })
})
