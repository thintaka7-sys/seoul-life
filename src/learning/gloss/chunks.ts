// 台詞・本文を、タップできるまとまり（空白で区切った語）に分ける。GAME_SPEC 4-8。
// 語の前後の句読点（. , ? ! など）は、くらべるときに外す。

const EDGE_PUNCTUATION = /^[\p{P}\p{S}]+|[\p{P}\p{S}]+$/gu

/** 空白で区切り、前後の句読点を外したまとまり（句読点だけのまとまりは除く） */
export function textChunks(text: string): string[] {
  return text
    .trim()
    .split(/\s+/)
    .map((t) => t.replace(EDGE_PUNCTUATION, ''))
    .filter((t) => t !== '')
}

/**
 * phrase のまとまりが、text のまとまりの中に続けて出てくる最初の位置（まとまりの番号）。なければ -1。
 * 例：findChunkSequence('이름이 뭐예요?', '뭐예요') → 1
 */
export function findChunkSequence(text: string, phrase: string): number {
  const hay = textChunks(text)
  const needle = textChunks(phrase)
  if (needle.length === 0) return -1
  for (let i = 0; i + needle.length <= hay.length; i++) {
    if (needle.every((n, j) => hay[i + j] === n)) return i
  }
  return -1
}
