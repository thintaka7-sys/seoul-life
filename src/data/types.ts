// 教材データ・ゲームデータの型。書き方の説明は docs/CONTENT_FORMAT.md。
// キーの一覧を変える場合は、docs/CONTENT_FORMAT.md も合わせて直す（テストで照合している）。

/** 品詞（GAME_SPEC 4-2） */
export const PARTS_OF_SPEECH = [
  'noun',
  'pronoun',
  'numeral',
  'verb',
  'adjective',
  'adverb',
  'particle',
  'determiner',
  'interjection',
  'greeting',
  'expression',
] as const
export type PartOfSpeech = (typeof PARTS_OF_SPEECH)[number]

/** 単語のカテゴリ（GAME_SPEC 4-2） */
export const VOCAB_CATEGORIES = [
  'greeting',
  'people',
  'food',
  'drink',
  'number',
  'time',
  'place',
  'shopping',
  'daily_life',
  'emotion',
  'verb',
  'adjective',
] as const
export type VocabCategory = (typeof VOCAB_CATEGORIES)[number]

/** 会話の話者IDのうち、主人公（プレイヤー）を表すもの */
export const PLAYER_SPEAKER_ID = 'player'

/** ID の形式 */
export const ID_PATTERNS = {
  vocabulary: /^vocab_\d{3,}$/,
  grammar: /^grammar_\d{3,}$/,
  conversation: /^[a-z][a-z0-9_]*_\d{3,}$/,
  event: /^event_\d{3,}$/,
  key: /^[a-z][a-z0-9_]*$/,
} as const

/** すべての教材データが持つ項目（GAME_SPEC 11章） */
export interface ContentBase {
  /** 一意のID。後から変えない */
  id: string
  /** 韓国語を確認済みか */
  reviewed: boolean
  /** 確認者のメモ */
  notes?: string
}

/** 単語（GAME_SPEC 11-1） */
export interface Vocab extends ContentBase {
  korean: string
  /** 正解として認める別表記 */
  alternatives?: string[]
  /** 見出し語の読み（カタカナ） */
  pronunciation: string
  japanese: string
  partOfSpeech: PartOfSpeech
  category: VocabCategory
  level: number
  example?: string
  /** 例文の読み（カタカナ。韓国語と同じ位置で空白を入れる） */
  examplePronunciation?: string
  exampleJapanese?: string
}

export interface GrammarExample {
  korean: string
  /** 読み（カタカナ。韓国語と同じ位置で空白を入れる） */
  pronunciation: string
  japanese: string
  /** 正解として認める別表記 */
  alternatives?: string[]
}

/** 文法（GAME_SPEC 11-2） */
export interface Grammar extends ContentBase {
  title: string
  level: number
  explanation: string
  examples: GrammarExample[]
}

export interface ConversationLine {
  /** キャラクターID、または主人公なら "player" */
  speaker: string
  korean: string
  /** 読み（カタカナ。韓国語と同じ位置で空白を入れる） */
  pronunciation: string
  japanese: string
}

export interface ConversationChoice {
  korean: string
  /** 読み（カタカナ。韓国語と同じ位置で空白を入れる） */
  pronunciation: string
  japanese: string
  correct: boolean
}

export interface FreeAnswer {
  /** 日本語で示すお題 */
  prompt: string
  /** 正解。先頭が模範解答、2つ目以降は別解 */
  answers: string[]
}

/** 会話（GAME_SPEC 11-3）。1つの会話は「台詞 → プレイヤーの返事」の1往復 */
export interface Conversation extends ContentBase {
  chapter: number
  /** 施設ID */
  location: string
  /** 会話の相手のキャラクターID */
  character: string
  lines: ConversationLine[]
  choices: ConversationChoice[]
  freeAnswer?: FreeAnswer
}

/** イベントの段階 */
export type EventStep =
  /** 日本語の案内文を表示する（韓国語は入れない） */
  | { type: 'message'; textJa: string }
  /** 単語カード・文法カードで覚える */
  | { type: 'learn'; vocabulary: string[]; grammar: string[] }
  /** 会話を1つ行う */
  | { type: 'conversation'; id: string }
  /** 図鑑を開いて見返す */
  | { type: 'dictionary'; textJa: string }
  /** 1日の終わりの画面を出す */
  | { type: 'dayEnd'; textJa: string }

export const EVENT_STEP_TYPES = ['message', 'learn', 'conversation', 'dictionary', 'dayEnd'] as const

/** イベント：どの施設で、何を、どの順に行うか */
export interface GameEvent {
  id: string
  chapter: number
  /** 施設ID */
  location: string
  /** 先に終えておくイベントのID */
  requires: string[]
  /** 目標として表示する日本語の文（韓国語は入れない） */
  objectiveJa: string
  /** 施設の画面に出すボタンの文字（韓国語は入れない） */
  actionJa: string
  steps: EventStep[]
  notes?: string
}

/** 施設（ゲームデータ。韓国語を含まないので reviewed は持たない） */
export interface Location {
  id: string
  nameJa: string
}

/** キャラクター（ゲームデータ。名前や口調は Phase 3 で追加する） */
export interface Character {
  id: string
  roleJa: string
}

/** ゲームの調整用の数値（src/data/game/balance.json） */
export interface Balance {
  xp: {
    learnWord: number
    conversationChoice: number
    conversationWrite: number
    eventComplete: number
  }
  /** フリガナを「おすすめ」設定でいつも表示する最後の章 */
  furiganaAlwaysUntilChapter: number
  /** 最初から行ける施設 */
  initialLocations: string[]
  /** 「はじめから」で最初にいる施設 */
  startLocation: string
  /** 書く問題で、何回間違えたら「答えを見る」を出すか */
  writeAttemptsBeforeReveal: number
}

/** 検証で見つかった問題 */
export interface ValidationIssue {
  /** どのファイルか */
  file: string
  /** ファイル内の何番目のデータか（0始まり）。ファイル全体の問題なら null */
  index: number | null
  /** データのID（読み取れた場合） */
  id: string | null
  /** 項目の場所（例：examples[0].korean） */
  path: string
  message: string
}
