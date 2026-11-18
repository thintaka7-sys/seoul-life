// 書いた答え（話した答え）の判定。CLAUDE.md「回答判定のルール」に従う。
// 判定の前に整える：前後と連続する空白、句読点、全角と半角、Unicode正規化（NFC）。
// 分かち書き（空白の位置）だけが違う場合は「正解。ただし分かち書きに注意」とする。

/** 取り除く句読点（半角に直した後の . , ? ! と、和文の 。、） */
const PUNCTUATION = /[.,?!。、]/g

/** 全角の英数字・記号（！〜～）を半角に、全角スペースを半角スペースにする */
function toHalfWidth(s: string): string {
  return s.replace(/[！-～]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).replace(/　/g, ' ')
}

/**
 * 判定用に答えを整える。
 * NFKC は使わない（ハングルの字母 ㄱ などが別の文字に変わってしまうため）。全角・半角は自前で直す。
 */
export function normalizeAnswer(s: string): string {
  return toHalfWidth(s).normalize('NFC').replace(PUNCTUATION, ' ').replace(/\s+/g, ' ').trim()
}

function withoutSpaces(s: string): string {
  return s.replace(/ /g, '')
}

export type JudgeResult =
  /** 正解。matched は一致した正解（データに書かれたままの形） */
  | { kind: 'correct'; matched: string }
  /** 正解。ただし分かち書きが違う。matched は正しい分かち書きの正解 */
  | { kind: 'spacing'; matched: string }
  | { kind: 'incorrect' }

/**
 * 入力を正解の一覧と比べる。正解が複数あるときは、完全に一致するものを優先し、
 * なければ分かち書きだけが違うものを探す。
 */
export function judgeAnswer(input: string, answers: readonly string[]): JudgeResult {
  const given = normalizeAnswer(input)
  if (given === '') return { kind: 'incorrect' }

  const exact = answers.find((a) => normalizeAnswer(a) === given)
  if (exact !== undefined) return { kind: 'correct', matched: exact }

  const compact = withoutSpaces(given)
  const spacing = answers.find((a) => withoutSpaces(normalizeAnswer(a)) === compact)
  if (spacing !== undefined) return { kind: 'spacing', matched: spacing }

  return { kind: 'incorrect' }
}
