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

/** 単語のジャンル（GAME_SPEC 7-4。図鑑のタブ） */
export const VOCAB_GENRES = [
  'greeting',
  'people',
  'food_drink',
  'number_money',
  'time',
  'place',
  'transport',
  'shopping',
  'body_health',
  'feelings',
  'daily_life',
] as const
export type VocabGenre = (typeof VOCAB_GENRES)[number]

/** 図鑑のタブの名前（docs/CONTENT_FORMAT.md 10-2） */
export const GENRE_LABELS: Record<VocabGenre, string> = {
  greeting: 'あいさつ・決まり文句',
  people: '人・家族',
  food_drink: '食べ物・飲み物',
  number_money: '数・お金',
  time: '時間・曜日・月',
  place: '場所・街',
  transport: '交通',
  shopping: '買い物',
  body_health: '体・健康',
  feelings: '気持ち',
  daily_life: '毎日の生活',
}

/** 品詞の名前（docs/CONTENT_FORMAT.md 10-1） */
export const PART_OF_SPEECH_LABELS: Record<PartOfSpeech, string> = {
  noun: '名詞',
  pronoun: '代名詞',
  numeral: '数詞',
  verb: '動詞',
  adjective: '形容詞',
  adverb: '副詞',
  particle: '助詞',
  determiner: '冠形詞（連体詞）',
  interjection: '感嘆詞・返事',
  greeting: 'あいさつ・お礼・お詫びの決まった表現',
  expression: 'その他の決まった言い回し',
}

/**
 * 毎日のスタンプを押す学習（GAME_SPEC 7-6。balance.json の stampActivities で選ぶ）。
 * - review：今日の復習を最後まで（今日の復習がない日は、練習1回で代わりにする）
 * - drill：基礎ドリル1回、chapterTest：章末テスト1回、hangulLesson：ハングルのレッスンに合格、listening：リスニング1回、event：イベントを1つ完了
 */
export const STAMP_ACTIVITIES = ['review', 'drill', 'chapterTest', 'hangulLesson', 'listening', 'event'] as const
export type StampActivity = (typeof STAMP_ACTIVITIES)[number]

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
  hangulLesson: /^hangul_\d{3,}$/,
  hangulWord: /^hword_\d{3,}$/,
  listening: /^listen_\d{3,}$/,
  drill: /^drill_\d{3,}$/,
  drillItem: /^dq_\d{3,}$/,
  chapterTest: /^test_\d{3,}$/,
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
  /** ジャンル（図鑑のタブ） */
  genre: VocabGenre
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
  /** 穴埋め問題で隠す部分（korean の中にそのまま含まれる文字列） */
  blank?: string
  /** 穴埋め問題のまぎらわしい選択肢（blank を書いたときは必須） */
  blankWrong?: string[]
}

/** 文法（GAME_SPEC 11-2） */
export interface Grammar extends ContentBase {
  title: string
  level: number
  explanation: string
  /** 接続ルールの説明（日本語。説明のためにハングルを入れてよい） */
  connectionJa?: string
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
  /** 正解か（選択の往復では使わず、false として読み込む） */
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

/**
 * 会話の1往復：台詞 → プレイヤーの返事 → 相手の反応。返事がない往復は、会話の最後の締めの台詞だけに使う。
 * - 問題の往復（kind を省略）：正解が1つの選択肢と、「言うこと」（task）。GAME_SPEC 4-4
 * - 選択の往復（kind: "decision"）：話が変わるだけの場面。正解・不正解を付けず、選んだものに合わせて相手が反応する
 */
export interface ConversationTurn {
  /** "decision" なら選択の往復。省略したら問題の往復 */
  kind?: 'decision'
  /**
   * 何を言えばよいか（日本語。例：コーヒーを注文しよう）。問題の往復では必須。
   * ※ 1日目の会話が新しい形で届くまでの間だけ、task のない問題の往復を「古い形」（正解が複数あってよい）として読み込む
   */
  task?: string
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

// ---------- ハングル学習（GAME_SPEC 4-1） ----------

/**
 * ハングルのレッスンの種類。
 * - letters：文字（母音・子音・複合母音など）を覚える
 * - batchim：パッチム（代表音ごとのグループ）を覚える
 * - soundChange：音の変化（連音化など）を覚える
 * - reading：習った文字で、教材の単語を読む
 */
export const HANGUL_LESSON_KINDS = ['letters', 'batchim', 'soundChange', 'reading'] as const
export type HangulLessonKind = (typeof HANGUL_LESSON_KINDS)[number]

/** 聞かせる音節（字母を単体で読み上げると字母の名前で読まれるため、音節で聞かせる） */
export interface HangulSound {
  /** 1音節（例：가） */
  korean: string
  /** 読み（カタカナ） */
  pronunciation: string
}

/** 文字のレッスンで覚える1文字 */
export interface HangulLetter {
  /** 字母（例：ㄱ、ㅏ） */
  jamo: string
  /** 聞かせる音節（1つ目がいちばん大事な音）。子音は母音を付けて、母音は ㅇ を付けて書く */
  sounds: HangulSound[]
  /** 発音のこつ（日本語。説明のために字母・ハングルを入れてよい） */
  tipJa: string
  /** まぎらわしい字母（聞いて選ぶ問題で、選択肢に混ぜる） */
  confusableWith?: string[]
}

/** パッチムの代表音ごとのグループ */
export interface HangulFinal {
  /** 代表音（ㄱ ㄴ ㄷ ㄹ ㅁ ㅂ ㅇ のどれか） */
  sound: string
  /** この音になるパッチムの字母（二重パッチムを含めてよい） */
  letters: string[]
  /** 聞かせる音節（パッチムのある1音節。例：악） */
  sounds: HangulSound[]
  tipJa: string
}

/** 音の変化の例 */
export interface SoundChangeExample {
  /** 書いた形（例：음악） */
  korean: string
  /** 発音どおりにハングルで書いた形（例：으막） */
  spoken: string
  /** 読み（カタカナ。korean と同じ位置で空白を入れる） */
  pronunciation: string
  japanese: string
}

/** 音の変化のルール */
export interface SoundChangeRule {
  /** ルールの名前（例：連音化） */
  titleJa: string
  explanationJa: string
  examples: SoundChangeExample[]
}

/** 読む練習の単語（図鑑には入れない） */
export interface HangulWord {
  id: string
  korean: string
  pronunciation: string
  japanese: string
}

/**
 * ハングルのレッスン。種類（kind）に合わせて letters・finals・rules のどれかを書く。
 * 読み込んだ後は、書かなかった配列は空（[]）にそろえる。
 */
export interface HangulLesson extends ContentBase {
  /** 並び順（1から。おすすめの順番で、習った文字の範囲の判定にも使う） */
  order: number
  kind: HangulLessonKind
  /** レッスンの名前（日本語。ハングルは入れない） */
  titleJa: string
  /** 導入の説明（日本語。段落ごと。説明のために字母・ハングルを入れてよい） */
  introJa: string[]
  letters: HangulLetter[]
  finals: HangulFinal[]
  rules: SoundChangeRule[]
  words: HangulWord[]
  /** 読む練習に使う、教材の単語のID（reading のレッスンだけ） */
  vocabulary: string[]
}

// ---------- リスニング（GAME_SPEC 4-5） ----------

/** 聞いて選ぶ文（正解の文と、まぎらわしい文） */
export interface ListeningOption {
  korean: string
  pronunciation: string
  japanese: string
}

/** 「聞いて正しい文を選ぶ」問題 */
export interface ListeningSentence extends ContentBase, ListeningOption {
  /** このイベントを終えたら出題する */
  afterEvent: string
  /** まぎらわしい文（選択肢に混ぜる） */
  distractors: ListeningOption[]
}

// ---------- 基礎ドリルと章末テスト（GAME_SPEC 4-9） ----------

/**
 * ドリル・章末テストの1問。プログラムが問題の形（選ぶ・聞く・書く）を決める。
 * digits があれば数字の問題（選択肢を出さず、入力で答える）
 */
export interface DrillItem {
  /** 一意のID（dq_001 の形。ドリルとテストをまたいで一意） */
  id: string
  korean: string
  /** 正解として認める別の言い方 */
  alternatives?: string[]
  pronunciation: string
  /** 日本語（数字の問題では、画面に出す数の書き方。例：3,500ウォン） */
  japanese: string
  /** 数字の問題の答え（半角数字。時刻・日付は 3:30・5/15 のように : と / で区切る） */
  digits?: string
  /** 問題に添えるひとこと（例：固有数詞で） */
  hintJa?: string
}

/** 基礎ドリル（テーマごとの練習） */
export interface Drill extends ContentBase {
  titleJa: string
  /** 始める前の説明（日本語。説明のためにハングルを入れてよい） */
  introJa?: string
  /** 1回の問題数（省略したら balance.json の値） */
  questionCount?: number
  items: DrillItem[]
}

/** 章末テスト。問題は章の単語・文法・会話から作り、items があれば混ぜる */
export interface ChapterTest extends ContentBase {
  chapter: number
  titleJa: string
  /** 問題数（省略したら balance.json の値） */
  questionCount?: number
  /** 合格の基準（正解の割合、0〜100。省略したら balance.json の値） */
  passPercent?: number
  /** 自動で作る問題に足す問題（読み込んだ後は、書かなかったら []） */
  items: DrillItem[]
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
  /**
   * 背景を切り替える（画面には何も出さず、すぐ次の段階へ進む）。
   * 切り替えた背景は、次の background の段階か、イベントの終わりまで続く。
   * id は場面の背景（SCENE_BACKGROUNDS）か施設ID（その施設のふだんの背景に戻す）
   */
  | { type: 'background'; id: string }

export const EVENT_STEP_TYPES = ['message', 'learn', 'conversation', 'column', 'dictionary', 'dayEnd', 'background'] as const

/** 施設のほかに使える、場面の背景のID（画像は docs/ART_GUIDE.md の手順で作る。画像がなければ施設の背景のまま） */
export const SCENE_BACKGROUNDS = ['entrance'] as const

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
    /** ハングルのレッスンの小テストに初めて合格したとき */
    hangulLesson: number
    /** リスニングの問題に初めて正解したとき（問題ごと） */
    listening: number
    /** 今日の復習で、期限の来た問題に正解したとき */
    review: number
    /** 基礎ドリルの問題に初めて正解したとき（問題ごと） */
    drillItem: number
    /** 章末テストに初めて合格したとき */
    chapterTest: number
  }
  /** フリガナを「おすすめ」設定でいつも表示する最後の章 */
  furiganaAlwaysUntilChapter: number
  /** 最初から行ける施設 */
  initialLocations: string[]
  /** 「はじめから」で最初にいる施設 */
  startLocation: string
  /** 書く問題で、何回間違えたら「答えを見る」を出すか */
  writeAttemptsBeforeReveal: number
  /** ハングルのレッスンの小テストの問題数 */
  hangulQuizQuestions: number
  /** 小テストの合格の基準（正解の割合、0〜100） */
  hangulPassPercent: number
  /** リスニングの1回の問題数 */
  listeningQuestionsPerRound: number
  /** 復習（GAME_SPEC 7-5） */
  review: {
    /** 次の出題までの間隔（日）。学んだ日・間違えた日から1つ目の間隔で出し、正解するたびに次の間隔へ延ばす（最後の間隔はくり返す） */
    intervalsDays: number[]
    /** この日数の間隔で出た問題に正解したら「覚えた」にする */
    masteredDays: number
    /** 今日の復習の、1日の問題数の上限 */
    dailyLimit: number
  }
  /** 「練習」の1回の問題数 */
  practiceQuestions: number
  /** 基礎ドリルの1回の問題数（ドリルの questionCount を省略したとき） */
  drillQuestions: number
  /** 章末テストの問題数・合格の基準（テストの questionCount・passPercent を省略したとき） */
  testQuestions: number
  testPassPercent: number
  /** どの学習を終えたらスタンプを押すか */
  stampActivities: StampActivity[]
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
