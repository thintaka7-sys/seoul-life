// data/ 以下の JSON をすべて読み込み、検証してから渡す。
// 新しい教材ファイルは、各フォルダに .json を置くだけで読み込まれる（docs/CONTENT_FORMAT.md）。

import { parseAssetManifest } from './assets'
import { SCENE_BACKGROUNDS, type Expression } from './types'
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
  hangulLessons: import.meta.glob<unknown>('./hangul/*.json', { eager: true, import: 'default' }),
  listening: import.meta.glob<unknown>('./listening/*.json', { eager: true, import: 'default' }),
  drills: import.meta.glob<unknown>('./drills/*.json', { eager: true, import: 'default' }),
  chapterTests: import.meta.glob<unknown>('./tests/*.json', { eager: true, import: 'default' }),
  earSets: import.meta.glob<unknown>('./ear/*.json', { eager: true, import: 'default' }),
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

export function findHangulLesson(id: string) {
  return content.hangulLessons.find((l) => l.id === id)
}

// ---------- 加工済みの画像 ----------

const assetResult = parseAssetManifest(import.meta.glob<unknown>('./assets/manifest.json', { eager: true, import: 'default' })['./assets/manifest.json'], {
  characterIds: new Set(content.characters.map((c) => c.id)),
  backgroundIds: new Set([...content.locations.map((l) => l.id), ...SCENE_BACKGROUNDS]),
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

/** 背景（施設ID か場面の背景のID）。なければ undefined（仮の絵を出す） */
export function backgroundImage(backgroundId: string) {
  return assets.backgrounds[backgroundId]
}

/** そのキャラクターと最初に話す会話のID（イベントの順。初めて会ったときの紹介を出すのに使う） */
export function firstConversationWith(characterId: string): string | undefined {
  for (const event of content.events) {
    for (const step of event.steps) {
      if (step.type === 'conversation' && findConversation(step.id)?.character === characterId) return step.id
    }
  }
  return undefined
}
