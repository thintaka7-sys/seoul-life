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

/** 立ち絵の表情（台詞の expression）。省略したら normal */
export const EXPRESSIONS = ['normal', 'smile', 'troubled'] as const
export type Expression = (typeof EXPRESSIONS)[number]
export const DEFAULT_EXPRESSION: Expression = 'normal'

/** ID の形式 */
export const ID_PATTERNS = {
  vocabulary: /^vocab_\d{3,}$/,
  grammar: /^grammar_\d{3,}$/,
  conversation: /^[a-z][a-z0-9_]*_\d{3,}$/,
  column: /^column_\d{3,}$/,
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
  /** 話すときの表情（主人公の台詞には付けない）。省略したら自動（ふだんは normal） */
  expression?: Expression
}

export interface ConversationChoice {
  korean: string
  /** 読み（カタカナ。韓国語と同じ位置で空白を入れる） */
  pronunciation: string
  japanese: string
  correct: boolean
  /** この選択肢を選んだときの相手の反応 */
  reply?: ConversationLine[]
}

export interface FreeAnswer {
  /** 日本語で示すお題 */
  prompt: string
  /** 正解。先頭が模範解答、2つ目以降は別解 */
  answers: string[]
  /** 書いて正解したときの相手の反応。省略したら、同じ文の選択肢（なければ最初の正解の選択肢）の reply を使う */
  reply?: ConversationLine[]
}

/** 会話の1往復：台詞 → プレイヤーの返事 → 相手の反応。返事がない往復は、会話の最後の締めの台詞だけに使う */
export interface ConversationTurn {
  /** プレイヤーが答える前の台詞（2つ目以降の往復では省略できる） */
  lines: ConversationLine[]
  /** 選んで答えるときの選択肢。省略した往復は台詞だけ（最後の往復だけ） */
  choices?: ConversationChoice[]
  freeAnswer?: FreeAnswer
}

/** 会話（GAME_SPEC 11-3）。1つの会話は、1つ以上の往復（turns）からなる */
export interface Conversation extends ContentBase {
  chapter: number
  /** 施設ID */
  location: string
  /** 会話の相手のキャラクターID */
  character: string
  turns: ConversationTurn[]
}

/** コラム（韓国生活の小ネタ）の1ブロック */
export type ColumnBlock =
  /** 日本語の文（ハングルは入れない） */
  | { type: 'text'; textJa: string }
  /** 韓国語の語句・文（読みと日本語訳つき） */
  | { type: 'korean'; korean: string; pronunciation: string; japanese: string }

export const COLUMN_BLOCK_TYPES = ['text', 'korean'] as const

/** コラム（韓国生活の小ネタ） */
export interface Column extends ContentBase {
  chapter: number
  /** 見出し（ハングルは入れない） */
  titleJa: string
  blocks: ColumnBlock[]
}

/** イベントの段階 */
export type EventStep =
  /** 日本語の案内文を表示する（韓国語は入れない） */
  | { type: 'message'; textJa: string }
  /** 単語カード・文法カードで覚える */
  | { type: 'learn'; vocabulary: string[]; grammar: string[] }
  /** 会話を1つ行う */
  | { type: 'conversation'; id: string }
  /** コラム（韓国生活の小ネタ）を読む */
  | { type: 'column'; id: string }
  /** 図鑑を開いて見返す */
  | { type: 'dictionary'; textJa: string }
  /** 1日の終わりの画面を出す */
  | { type: 'dayEnd'; textJa: string }

export const EVENT_STEP_TYPES = ['message', 'learn', 'conversation', 'column', 'dictionary', 'dayEnd'] as const

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

/** マップの絵の上での位置（絵の幅・高さに対する割合。0〜100） */
export interface MapArea {
  x: number
  y: number
  w: number
  h: number
}

/** 施設（ゲームデータ。韓国語を含まないので reviewed は持たない） */
export interface Location {
  id: string
  nameJa: string
  /** マップの絵の上で、施設を押せる範囲。省略したらマップの絵の上には出さない */
  mapArea?: MapArea
}

/** キャラクターの名前（韓国語なので、読みと確認済みの印を持つ） */
export interface CharacterName {
  /** 韓国語の名前（例：한지훈） */
  korean: string
  /** 読み（カタカナ） */
  pronunciation: string
  reviewed: boolean
}

/** キャラクター（ゲームデータ） */
export interface Character {
  id: string
  roleJa: string
  /** 名前。まだ決めていないキャラクターでは省略する */
  name?: CharacterName
  /** プロフィール（日本語。ハングルは入れない） */
  profileJa?: string
  /** テーマカラー（#RRGGBB）。名前の札などに使う */
  themeColor?: string
}

/** 加工済みの画像1枚（npm run assets が src/data/assets/manifest.json に書き出す） */
export interface ImageAsset {
  /** public/ からの相対パス（キャッシュを更新するための ?v=… つき） */
  src: string
  width: number
  height: number
}

/** 加工済みの画像の一覧。画像がないものは載らない（画面では仮の絵を出す） */
export interface AssetManifest {
  /** キャラクターID → 表情ごとの立ち絵（どの表情も同じ大きさで、体の位置がそろっている） */
  characters: Record<string, Partial<Record<Expression, ImageAsset>>>
  /** 施設ID → 背景 */
  backgrounds: Record<string, ImageAsset>
  /** 街のマップ */
  map: ImageAsset | null
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
