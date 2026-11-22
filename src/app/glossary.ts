// タップで意味を見る語句の索引（単語の教材から1度だけ作る。GAME_SPEC 4-8）

import { content } from '../data'
import type { Gloss } from '../data/types'
import { buildGlossIndex, resolveGlosses, type GlossSpan } from '../learning/gloss/resolve'

const index = buildGlossIndex(content.vocabulary)

/** 文の中のタップできる語句 */
export function glossSpansOf(korean: string, glosses: readonly Gloss[] | undefined): GlossSpan[] {
  return resolveGlosses(korean, glosses, index)
}
