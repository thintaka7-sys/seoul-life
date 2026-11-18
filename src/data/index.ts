// data/ 以下の JSON をすべて読み込み、検証してから渡す。
// 新しい教材ファイルは、各フォルダに .json を置くだけで読み込まれる（docs/CONTENT_FORMAT.md）。

import { formatIssue, loadContent, type LoadedContent } from './validate'

// import.meta.glob のオプションは Vite がビルド時に読むため、変数にせずその場に書く必要がある
export const content: LoadedContent = loadContent({
  vocabulary: import.meta.glob<unknown>('./vocabulary/*.json', { eager: true, import: 'default' }),
  grammar: import.meta.glob<unknown>('./grammar/*.json', { eager: true, import: 'default' }),
  conversations: import.meta.glob<unknown>('./scenarios/*.json', { eager: true, import: 'default' }),
  locations: import.meta.glob<unknown>('./locations/*.json', { eager: true, import: 'default' }),
  characters: import.meta.glob<unknown>('./characters/*.json', { eager: true, import: 'default' }),
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
