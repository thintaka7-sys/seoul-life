// docs/CONTENT_FORMAT.md が、プログラムの検証ルールと食い違っていないことを確かめる。
// - 見本の JSON がそのまま検証を通ること
// - 10章のキー一覧が、プログラムで使えるキーと一致すること

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { content } from './index'
import { EVENT_STEP_TYPES, EXPRESSIONS, HANGUL_LESSON_KINDS, PARTS_OF_SPEECH, PLAYER_SPEAKER_ID, SCENE_BACKGROUNDS, VOCAB_CATEGORIES } from './types'
import { formatIssue, loadContent } from './validate'

const docPath = fileURLToPath(new URL('../../docs/CONTENT_FORMAT.md', import.meta.url))
const doc = readFileSync(docPath, 'utf8').replace(/\r\n/g, '\n')

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

describe('docs/CONTENT_FORMAT.md の見本', () => {
  const samples = extractSamples(doc)
  const kinds = ['vocabulary', 'grammar', 'conversations', 'columns', 'events', 'hangulLessons', 'listening'] as const

  it('単語・文法・会話・コラム・イベント・ハングルのレッスン・リスニングの文の見本がそろっている', () => {
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
      // 施設・キャラクター・調整値は実際のデータを使う
      locations: { 'locations.json': content.locations },
      characters: { 'characters.json': content.characters },
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

  it('カテゴリ（10-2）がプログラムと一致する', () => {
    expect(sorted(keysInSection(doc, '### 10-2.'))).toEqual(sorted(VOCAB_CATEGORIES))
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
