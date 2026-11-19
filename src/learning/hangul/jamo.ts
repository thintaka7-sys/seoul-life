// ハングルの音節を、初声・中声・終声（パッチム）の字母に分ける処理と、字母の一覧。
// 字母は互換字母（ㄱ U+3131 〜）で表す。教材の検証（data/validate.ts）と、ハングル学習の問題作りで使う。
// es-hangul の disassemble は複合母音（ㅘ → ㅗ ㅏ）まで分けてしまうため、ここでは Unicode の並びから直接求める。

/** 初声になる子音（19個。Unicode の並び順） */
export const INITIAL_CONSONANTS = ['ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'] as const

/** 母音（21個。Unicode の並び順） */
export const VOWELS = ['ㅏ', 'ㅐ', 'ㅑ', 'ㅒ', 'ㅓ', 'ㅔ', 'ㅕ', 'ㅖ', 'ㅗ', 'ㅘ', 'ㅙ', 'ㅚ', 'ㅛ', 'ㅜ', 'ㅝ', 'ㅞ', 'ㅟ', 'ㅠ', 'ㅡ', 'ㅢ', 'ㅣ'] as const

/** パッチムになる字母（27個。Unicode の並び順。二重パッチムを含む） */
export const FINAL_CONSONANTS = [
  'ㄱ', 'ㄲ', 'ㄳ', 'ㄴ', 'ㄵ', 'ㄶ', 'ㄷ', 'ㄹ', 'ㄺ', 'ㄻ', 'ㄼ', 'ㄽ', 'ㄾ', 'ㄿ', 'ㅀ',
  'ㅁ', 'ㅂ', 'ㅄ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ',
] as const

/** パッチムの7つの代表音 */
export const REPRESENTATIVE_FINALS = ['ㄱ', 'ㄴ', 'ㄷ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅇ'] as const

/** 文字として教える字母（子音19＋母音21） */
export const LETTER_JAMO: readonly string[] = [...INITIAL_CONSONANTS, ...VOWELS]

/** 文頭で音のない子音。母音のレッスンから使えるため、習った文字の範囲のチェックでは数えない */
export const SILENT_INITIAL = 'ㅇ'

const SYLLABLE_FIRST = 0xac00
const SYLLABLE_LAST = 0xd7a3

export interface Syllable {
  initial: string
  medial: string
  /** パッチム。なければ null */
  final: string | null
}

/** 1文字の音節を字母に分ける。完成した音節（가〜힣）でなければ null */
export function splitSyllable(ch: string): Syllable | null {
  if (ch.length !== 1) return null
  const code = ch.charCodeAt(0)
  if (code < SYLLABLE_FIRST || code > SYLLABLE_LAST) return null
  const offset = code - SYLLABLE_FIRST
  const initial = INITIAL_CONSONANTS[Math.floor(offset / (21 * 28))]
  const medial = VOWELS[Math.floor(offset / 28) % 21]
  const finalIndex = offset % 28
  if (initial === undefined || medial === undefined) return null
  return { initial, medial, final: finalIndex === 0 ? null : (FINAL_CONSONANTS[finalIndex - 1] ?? null) }
}

/** 字母から1文字の音節を組み立てる。組み立てられない字母なら null */
export function composeSyllable(initial: string, medial: string, final: string | null = null): string | null {
  const i = (INITIAL_CONSONANTS as readonly string[]).indexOf(initial)
  const m = (VOWELS as readonly string[]).indexOf(medial)
  const finalIndex = final === null ? -1 : (FINAL_CONSONANTS as readonly string[]).indexOf(final)
  if (i < 0 || m < 0 || (final !== null && finalIndex < 0)) return null
  const f = finalIndex + 1
  return String.fromCharCode(SYLLABLE_FIRST + (i * 21 + m) * 28 + f)
}

/** 文の中の音節（空白・句読点など、音節でない文字は飛ばす） */
export function syllablesOf(text: string): Syllable[] {
  return [...text].flatMap((ch) => {
    const s = splitSyllable(ch)
    return s === null ? [] : [s]
  })
}

/** 字母が単体で書かれているか（ㄱ ㅏ のような形。音節に組み立てていない） */
export function containsIsolatedJamo(text: string): boolean {
  return /[ᄀ-ᇿ㄰-㆏ꥠ-꥿ힰ-퟿]/.test(text)
}

export function isVowel(jamo: string): boolean {
  return (VOWELS as readonly string[]).includes(jamo)
}

export function isConsonant(jamo: string): boolean {
  return (INITIAL_CONSONANTS as readonly string[]).includes(jamo)
}

/** 習った字母（文字のレッスンで習ったもの）と、習ったパッチム（パッチムのレッスンで習ったもの） */
export interface KnownJamo {
  letters: ReadonlySet<string>
  finals: ReadonlySet<string>
}

export interface UnlearnedJamo {
  /** まだ習っていない字母（初声・中声） */
  letters: string[]
  /** まだ習っていないパッチム */
  finals: string[]
}

/** 文の中で、まだ習っていない字母とパッチムを、出てきた順に（重複なしで）返す */
export function unlearnedJamo(text: string, known: KnownJamo): UnlearnedJamo {
  const letters = new Set<string>()
  const finals = new Set<string>()
  for (const s of syllablesOf(text)) {
    if (s.initial !== SILENT_INITIAL && !known.letters.has(s.initial)) letters.add(s.initial)
    if (!known.letters.has(s.medial)) letters.add(s.medial)
    if (s.final !== null && !known.finals.has(s.final)) finals.add(s.final)
  }
  return { letters: [...letters], finals: [...finals] }
}
