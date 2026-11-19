// data/ 以下の JSON をすべて読み込み、検証してから渡す。
// 新しい教材ファイルは、各フォルダに .json を置くだけで読み込まれる（docs/CONTENT_FORMAT.md）。

import { parseAssetManifest } from './assets'
import type { Expression } from './types'
import { formatIssue, loadContent, type LoadedContent } from './validate'

// import.meta.glob のオプションは Vite がビルド時に読むため、変数にせずその場に書く必要がある
export const content: LoadedContent = loadContent({
  vocabulary: import.meta.glob<unknown>('./vocabulary/*.json', { eager: true, import: 'default' }),
  grammar: import.meta.glob<unknown>('./grammar/*.json', { eager: true, import: 'default' }),
  conversations: import.meta.glob<unknown>('./scenarios/*.json', { eager: true, import: 'default' }),
  columns: import.meta.glob<unknown>('./columns/*.json', { eager: true, import: 'default' }),
  events: import.meta.glob<unknown>('./events/*.json', { eager: true, import: 'default' }),
  locations: import.meta.glob<unknown>('./locations/*.json', { eager: true, import: 'default' }),
  characters: import.meta.glob<unknown>('./characters/*.json', { eager: true, import: 'default' }),
  balance: import.meta.glob<unknown>('./game/balance.json', { eager: true, import: 'default' }),
})

if (content.issues.length > 0) {
  console.error(`[教材データ] ${content.issues.length}件の問題があり、該当するデータを除外しました。`)
  for (const issue of content.issues) console.error(`[教材データ] ${formatIssue(issue)}`)
}

export function findLocation(id: string | null) {
  return id === null ? undefined : content.locations.find((l) => l.id === id)
}

export function findCharacter(id: string) {
  return content.characters.find((c) => c.id === id)
}

export function conversationsAt(locationId: string) {
  return content.conversations.filter((c) => c.location === locationId)
}

export function findConversation(id: string) {
  return content.conversations.find((c) => c.id === id)
}

export function findVocab(id: string) {
  return content.vocabulary.find((v) => v.id === id)
}

export function findGrammar(id: string) {
  return content.grammar.find((g) => g.id === id)
}

export function findGameEvent(id: string) {
  return content.events.find((e) => e.id === id)
}

export function findColumn(id: string) {
  return content.columns.find((c) => c.id === id)
}

// ---------- 加工済みの画像 ----------

const assetResult = parseAssetManifest(import.meta.glob<unknown>('./assets/manifest.json', { eager: true, import: 'default' })['./assets/manifest.json'], {
  characterIds: new Set(content.characters.map((c) => c.id)),
  locationIds: new Set(content.locations.map((l) => l.id)),
})
for (const issue of assetResult.issues) console.error(`[画像] ${formatIssue(issue)}`)

/** 画像の一覧（画像がないものは載らない） */
export const assets = assetResult.manifest
export const assetIssues = assetResult.issues

/** 立ち絵。指定の表情の画像がなければ通常（normal）、それもなければ undefined（仮の絵を出す） */
export function characterImage(characterId: string, expression: Expression) {
  const images = assets.characters[characterId]
  return images?.[expression] ?? images?.normal
}

/** 施設の背景。なければ undefined（仮の絵を出す） */
export function backgroundImage(locationId: string) {
  return assets.backgrounds[locationId]
}
