// docs/CONTENT_FORMAT.md が、プログラムの検証ルールと食い違っていないことを確かめる。
// - 見本の JSON がそのまま検証を通ること
// - 7章のキー一覧が、プログラムで使えるキーと一致すること

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { content } from './index'
import { PARTS_OF_SPEECH, PLAYER_SPEAKER_ID, VOCAB_CATEGORIES } from './types'
import { formatIssue, loadContent, type ContentKind } from './validate'

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

/** 見出し（例：### 7-1.）の下にある表の、1列目の `キー` を取り出す */
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
  const kinds: ContentKind[] = ['vocabulary', 'grammar', 'conversations']

  it('単語・文法・会話の見本がそろっている', () => {
    expect(sorted(samples.keys())).toEqual(sorted(kinds))
  })

  it('見本がすべて検証を通る（IDの重複もない）', () => {
    const result = loadContent({
      vocabulary: { 'sample-vocabulary': samples.get('vocabulary') },
      grammar: { 'sample-grammar': samples.get('grammar') },
      conversations: { 'sample-conversations': samples.get('conversations') },
      // 施設・キャラクターは実際のデータを使う
      locations: { 'locations.json': content.locations },
      characters: { 'characters.json': content.characters },
    })
    expect(result.issues.map(formatIssue)).toEqual([])
    expect(result.vocabulary.length).toBeGreaterThan(0)
    expect(result.grammar.length).toBeGreaterThan(0)
    expect(result.conversations.length).toBeGreaterThan(0)
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
  it('品詞（7-1）がプログラムと一致する', () => {
    expect(sorted(keysInSection(doc, '### 7-1.'))).toEqual(sorted(PARTS_OF_SPEECH))
  })

  it('カテゴリ（7-2）がプログラムと一致する', () => {
    expect(sorted(keysInSection(doc, '### 7-2.'))).toEqual(sorted(VOCAB_CATEGORIES))
  })

  it('施設ID（7-3）が src/data/locations と一致する', () => {
    expect(sorted(keysInSection(doc, '### 7-3.'))).toEqual(sorted(content.locations.map((l) => l.id)))
  })

  it('キャラクターID・話者ID（7-4）が src/data/characters ＋ player と一致する', () => {
    expect(sorted(keysInSection(doc, '### 7-4.'))).toEqual(sorted([...content.characters.map((c) => c.id), PLAYER_SPEAKER_ID]))
  })
})
