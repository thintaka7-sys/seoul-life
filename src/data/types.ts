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
 * - ear：聞き分け練習1回
 */
export const STAMP_ACTIVITIES = ['review', 'drill', 'chapterTest', 'hangulLesson', 'listening', 'event', 'ear'] as const
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
  earSet: /^ear_\d{3,}$/,
  story: /^story_\d{3,}$/,
  reading: /^reading_\d{3,}$/,
  menu: /^menu_\d{3,}$/,
  order: /^order_\d{3,}$/,
  /** つまずきリスト（docs/STUMBLING_POINTS.md）のID */
  stumbling: /^[SGVWH]\d{2}$/,
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
  /** 元の形（辞書の形）。見出し語が元の形でないとき（例：주세요 → 주다）に書く（GAME_SPEC 4-3） */
  base?: VocabBase
  /** 形が変わった言葉（해요の形・過去の形・縮んだ形など。GAME_SPEC 4-3） */
  forms?: VocabForm[]
}

/** 単語の元の形（辞書の形） */
export interface VocabBase {
  korean: string
  pronunciation: string
  /** 元の形の意味（見出し語の意味と違うときに書く。例：주다＝あげる・くれる） */
  japanese?: string
}

/** 形が変わる言葉の種類（GAME_SPEC 4-3。単語カード・図鑑に出す名前は FORM_KIND_LABELS） */
export const FORM_KINDS = ['present', 'past', 'seyo', 'contraction', 'other'] as const
export type FormKind = (typeof FORM_KINDS)[number]

/** 形の種類の表示名（docs/CONTENT_FORMAT.md の 10-12 と同じ。テストで照合する） */
export const FORM_KIND_LABELS: Record<FormKind, string> = {
  present: 'です・ます形（해요の形）',
  past: '過去の形',
  seyo: '세요の形（丁寧なお願い・尊敬）',
  contraction: '縮んだ形',
  other: 'そのほかの形',
}

/** 形が変わった言葉の1つ：「部品（元の形＋語尾など）→ くっついた形」 */
export interface VocabForm {
  kind: FormKind
  /** くっついた形（例：가요） */
  korean: string
  pronunciation: string
  /** 部品（例：["가", "아요"]）。2個以上 */
  parts: string[]
  /** 初心者が作りがちな誤った形（例：가아요）。問題の不正解の選択肢に使う */
  wrong?: string[]
  /** 説明（日本語。説明のためにハングルを入れてよい） */
  noteJa?: string
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
  /** 図や絵（GAME_SPEC 4-11） */
  figures?: Figure[]
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
  /** タップで意味を見る語句（字が単語の教材と一致しない語句だけ書く。GAME_SPEC 4-8） */
  glosses?: Gloss[]
}

/**
 * タップで意味を見る語句（GAME_SPEC 4-8）。
 * 単語の教材とつなぐ（vocab）か、読み・意味を直接書く（pronunciation・japanese）。
 */
export interface Gloss {
  /** 台詞・本文の中の語句（空白で区切った1つ以上のまとまり。句読点は付けない） */
  text: string
  /** 単語の教材のID。図鑑の内容を出し、「覚える」で復習に加えられる */
  vocab?: string
  /** vocab がないときの読み（カタカナ） */
  pronunciation?: string
  /** vocab がないときの意味 */
  japanese?: string
  /** ひとこと（例：이름（名前）＋이（〜が））。説明のためにハングルを入れてよい */
  noteJa?: string
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
  /** 何を言えばよいか（日本語。例：コーヒーを注文しよう）。問題の往復では必須、選択の往復では任意 */
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
  figures?: Figure[]
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
  figures?: Figure[]
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
  figures?: Figure[]
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
  /** 導入の説明の後に出す図や絵 */
  figures?: Figure[]
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
  /** 説明に添える図や絵 */
  figures?: Figure[]
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

// ---------- 聞き分けの組（GAME_SPEC 4-10） ----------

/** 聞き分けの組のテーマ（学習画面で、この順にまとめて出す） */
export const EAR_THEMES = ['plain_aspirated_tense', 'vowel_eo_o', 'vowel_eu_u', 'vowel_o_u', 'final_nasal', 'final_stop', 'liquid'] as const
export type EarTheme = (typeof EAR_THEMES)[number]

/** テーマの表示名（docs/CONTENT_FORMAT.md の 10-9 と同じ。テストで照合する） */
export const EAR_THEME_LABELS: Record<EarTheme, string> = {
  plain_aspirated_tense: '平音・激音・濃音',
  vowel_eo_o: 'ㅓ と ㅗ',
  vowel_eu_u: 'ㅡ と ㅜ',
  vowel_o_u: 'ㅗ と ㅜ',
  final_nasal: 'パッチム ㄴ・ㅁ・ㅇ',
  final_stop: 'パッチム ㄱ・ㄷ・ㅂ',
  liquid: 'ㄹ を含む音',
}

/** 組の1つの音（実在する短い単語） */
export interface EarItem {
  korean: string
  pronunciation: string
  /** 意味（1つに絞る） */
  japanese: string
}

/** 聞き分けの組：似た音の単語2〜4個。1つを読み上げ、どれだったかを同じ組の中から選ぶ */
export interface EarSet extends ContentBase {
  theme: EarTheme
  /** 組の名前（例：ㅂ・ㅍ・ㅃ）。字母を入れてよい */
  titleJa: string
  /** 聞き分けるところ（例：最初の子音の息の出方） */
  focusJa: string
  /** 答えた後に出す、聞き分けのこつ（1〜2文） */
  tipJa: string
  /** つまずきリストのID（例：S01） */
  stumbling: string[]
  items: EarItem[]
  /** 説明に添える図や絵 */
  figures?: Figure[]
}

/** 1つの組の音の数 */
export const EAR_ITEMS_MIN = 2
export const EAR_ITEMS_MAX = 4

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
  /** 1日の終わりの画面を出す（Phase 3 からは chapterEnd を使う） */
  | { type: 'dayEnd'; textJa: string }
  /**
   * 背景を切り替える（画面には何も出さず、すぐ次の段階へ進む）。
   * 切り替えた背景は、次の background の段階か、イベントの終わりまで続く。
   * id は場面の背景（SCENE_BACKGROUNDS）か施設ID（その施設のふだんの背景に戻す）
   */
  | { type: 'background'; id: string }
  /** おはなしを1つ見る（GAME_SPEC 3-2） */
  | { type: 'story'; id: string }
  /** 読み物を1つ読んで、問題に答える（GAME_SPEC 4-7） */
  | { type: 'reading'; id: string }
  /** メニューを見て、書く・話すで注文する（GAME_SPEC 4-4） */
  | { type: 'order'; id: string }
  /** このイベントのリスニングの文（afterEvent がこのイベントのもの）を、その場で聞いて答える */
  | { type: 'listening' }
  /** 章の終わりの画面を出す（その章で覚えたことのまとめと、章末テストの案内） */
  | { type: 'chapterEnd'; textJa: string }
  /** 「ハングルは読めますか？」と聞き、学ぶならハングルのレッスン1へ案内する（ゲーム全体で1回だけ） */
  | { type: 'hangulIntro' }

export const EVENT_STEP_TYPES = ['message', 'learn', 'conversation', 'column', 'dictionary', 'dayEnd', 'background', 'story', 'reading', 'order', 'listening', 'chapterEnd', 'hangulIntro'] as const

/** 施設のほかに使える、場面の背景のID（画像は docs/ART_GUIDE.md の手順で作る。画像がなければ施設の背景のまま） */
export const SCENE_BACKGROUNDS = ['entrance', 'airport', 'taxi', 'street', 'home_moving'] as const

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
  /** "auto" なら、前提を満たしたらボタンを押さなくても始まる（はじめからの直後の空港など） */
  start?: 'auto'
  /** 終えたら行けるようになる施設のID */
  unlocks?: string[]
  steps: EventStep[]
  notes?: string
}

// ---------- 図と絵（GAME_SPEC 4-11） ----------

/** 図の種類。文字・矢印・ハングルは画像に描かず、画面の作りで描く */
export const FIGURE_TYPES = ['image', 'formation', 'syllable', 'compare'] as const
export type FigureType = (typeof FIGURE_TYPES)[number]

/** 絵の上に重ねる札（位置は絵の幅・高さに対する割合。0〜100） */
export interface FigureLabel {
  x: number
  y: number
  /** 札の文字（日本語。説明のためにハングルを入れてよい） */
  textJa: string
  /** 札から出す矢印の向き（省略したら矢印なし） */
  arrow?: 'up' | 'down' | 'left' | 'right'
}

export const FIGURE_ARROWS = ['up', 'down', 'left', 'right'] as const

/**
 * 図の絵のキー（docs/CONTENT_FORMAT.md 10-15）。口の形・息の出方は Gemini の絵（fig_mouth_sheet・fig_breath_sheet のマス）、
 * パッチムで止める位置（final_…）は画面の作りで描く図（components/figures/finalDiagram.ts）
 */
export const FIGURE_IMAGES = ['mouth_eo', 'mouth_o', 'mouth_eu', 'mouth_u', 'breath_weak', 'breath_strong', 'final_back', 'final_tip', 'final_lips'] as const

/** 比べる図の1つ */
export interface CompareItem {
  korean: string
  pronunciation: string
  /** 絵のキー（fig_キー.png） */
  image?: string
  noteJa?: string
}

export type Figure =
  /** 絵（Gemini で作る。文字は入れない）。札を重ねられる */
  | { type: 'image'; image: string; captionJa?: string; labels?: FigureLabel[] }
  /** 部品 → くっついた形（例：가＋아요 → 가요。GAME_SPEC 4-3） */
  | { type: 'formation'; parts: string[]; result: string; resultPronunciation?: string; noteJa?: string }
  /** 1音節を、子音・母音・パッチムのマスに分けて見せる（分け方はプログラムが決める） */
  | { type: 'syllable'; korean: string; noteJa?: string }
  /** 2〜3個を並べて比べる（例：ㅓ と ㅗ の口の形） */
  | { type: 'compare'; items: CompareItem[]; captionJa?: string }

// ---------- おはなし（GAME_SPEC 3-2） ----------

/** BGM のID（曲のファイルとループの位置は src/data/game/audio.json） */
export const BGM_IDS = ['title', 'home', 'map', 'cafe', 'study', 'story'] as const
export type BgmId = (typeof BGM_IDS)[number]

/** おはなしで鳴らす場面の効果音のID */
export const SCENE_SOUNDS = ['door_bell', 'cup', 'buzzer', 'page', 'car_door', 'call'] as const
export type SceneSound = (typeof SCENE_SOUNDS)[number]

/** おはなしの台詞（話者と表情は会話の台詞と同じ） */
export type StoryLine = ConversationLine

export interface StoryChoice {
  korean: string
  pronunciation: string
  japanese: string
  /** 選んだときの反応（1つ以上） */
  reply: StoryLine[]
}

export type StoryBeat =
  /**
   * 場面を変える。書いた項目だけが変わる。
   * - background：背景（場面の背景か施設ID）
   * - image：一枚絵のキー（cg_キー.png）。null で消す
   * - character：立ち絵を出す人（null で誰も出さない）。台詞を話すと、その人に切り替わる
   * - call：ビデオ通話の枠に出す人（null で通話を終える）
   */
  | { type: 'scene'; background?: string; image?: string | null; character?: string | null; call?: string | null }
  /** 地の文（日本語。ハングルは入れない） */
  | { type: 'narration'; textJa: string }
  /** 台詞 */
  | ({ type: 'line' } & StoryLine)
  /** 画面に出る韓国語の文字（案内表示・看板・メモなど）。読み・訳つき */
  | { type: 'sign'; korean: string; pronunciation: string; japanese: string; glosses?: Gloss[] }
  /** 返事を選ぶ（正解・不正解はない。選んだもので反応だけが変わる） */
  | { type: 'choice'; promptJa?: string; choices: StoryChoice[] }
  /** 場面の効果音を鳴らす */
  | { type: 'sfx'; id: SceneSound }
  /** BGM を変える（"none" で止める） */
  | { type: 'bgm'; id: BgmId | 'none' }

export const STORY_BEAT_TYPES = ['scene', 'narration', 'line', 'sign', 'choice', 'sfx', 'bgm'] as const

/** おはなし */
export interface Story extends ContentBase {
  chapter: number
  /** おはなしの題（アルバムに出す。ハングルは入れない） */
  titleJa: string
  /** 始めに流す BGM（省略したら、その場所の曲のまま） */
  bgm?: BgmId
  beats: StoryBeat[]
}

// ---------- 読み物（GAME_SPEC 4-7） ----------

/** 読み物の見た目 */
export const READING_STYLES = ['memo', 'notice', 'message', 'diary', 'menu'] as const
export type ReadingStyle = (typeof READING_STYLES)[number]

/** 本文の1文 */
export interface ReadingLine {
  korean: string
  pronunciation: string
  japanese: string
  glosses?: Gloss[]
}

/** 選ぶ問題の選択肢：日本語（textJa）か韓国語（korean・pronunciation・japanese） */
export type ReadingChoice = ({ textJa: string } | { korean: string; pronunciation: string; japanese: string }) & { correct: boolean }

/** 「探して押す」問題の答えがある場所：メニュー（品名）か本文（lines） */
export const FIND_PLACES = ['menu', 'lines'] as const
export type FindPlace = (typeof FIND_PLACES)[number]

/** どの問題にも書ける項目 */
interface ReadingQuestionBase {
  /** 何をするか（日本語）。本文の語句を示すためにハングルを入れてよい */
  questionJa: string
  /** 問題文の韓国語（読み上げ・単語のタップができる。訳は設定にかかわらず「タップで表示」） */
  questionKorean?: ReadingLine
  explanationJa?: string
}

export type ReadingQuestion =
  /** 選ぶ（正解はちょうど1つ） */
  | (ReadingQuestionBase & { type: 'choice'; choices: ReadingChoice[] })
  /** 数字を入れる（値段など。選択肢は出さない） */
  | (ReadingQuestionBase & { type: 'number'; digits: string })
  /** 韓国語で書く */
  | (ReadingQuestionBase & { type: 'write'; answers: string[] })
  /**
   * 本文の中から探して押す（answer は本文の中の語句）。
   * findIn は答えがある場所で、そこだけを押せるようにする（メニューと本文の両方がある読み物では必須。片方だけなら、その場所）
   */
  | (ReadingQuestionBase & { type: 'find'; answer: string; findIn: FindPlace })

export const READING_QUESTION_TYPES = ['choice', 'number', 'write', 'find'] as const

export interface Reading extends ContentBase {
  chapter: number
  titleJa: string
  style: ReadingStyle
  /** 本文（style が menu のときは省略できる） */
  lines: ReadingLine[]
  /** style が menu のときの、メニューのID */
  menu?: string
  questions: ReadingQuestion[]
}

// ---------- メニューと注文（GAME_SPEC 4-4） ----------

/** メニューの絵のキー（menu_cafe_1.png・menu_cafe_2.png のマス。並びは docs/ART_GUIDE.md 4-2） */
export const MENU_IMAGES = [
  'americano',
  'cafe_latte',
  'vanilla_latte',
  'green_tea_latte',
  'strawberry_latte',
  'yuzu_tea',
  'lemonade',
  'cheesecake',
  'croffle',
  'macaron',
  'croissant',
  'cookie',
] as const

/**
 * 品物をどこに出すか（GAME_SPEC 4-4。実際の店に合わせる）。
 * board：文字だけのメニュー（메뉴판。品名と値段だけで絵は出さない）／showcase：絵つきのショーケース（쇼케이스。絵と、品名・値段の札）
 */
export const MENU_DISPLAYS = ['board', 'showcase'] as const
export type MenuDisplay = (typeof MENU_DISPLAYS)[number]

export interface MenuItem {
  /** 品物のキー（メニューの中で一意。注文の記録に使う） */
  key: string
  /** 文字のメニュー（board）か、ショーケース（showcase）か */
  display: MenuDisplay
  /** 品名の単語のID（品名・読み・意味は単語の教材から出す。注文では別表記も正解） */
  vocab: string
  /** 値段（ウォン。半角の整数） */
  price: number
  /** 値段の読み（例：4,500원 → サチョノベグォン） */
  pricePronunciation: string
  /** 絵のキー（MENU_IMAGES）。showcase の品物だけに書く（必須） */
  image?: string
  /** 数え方の単位（例：잔、개）。注文の counts の counter と合わせる */
  counter: string
  /** この品物を注文したときの店員のひとこと */
  reply: ConversationLine[]
}

export interface Menu extends ContentBase {
  /** どの施設のメニューか */
  location: string
  titleJa: string
  /** 値段の単位（例：원） */
  currency: { korean: string; pronunciation: string }
  items: MenuItem[]
}

/** 注文で言える数（例：한 잔） */
export interface OrderCount {
  korean: string
  pronunciation: string
  /** 数（1以上） */
  number: number
  /** 数え方の単位（省略したら、どの品物にも使える。例：하나） */
  counter?: string
  /** この数で注文されたときの、数を確かめる台詞 */
  confirm: ConversationLine[]
}

/** 注文の終わりの言い方（例：주세요） */
export interface OrderEnding {
  korean: string
  /** 読み（attached でないときは必須） */
  pronunciation?: string
  /** true なら前の語にくっつける言い方（例：아메리카노요 の 요、한 잔이요 の 이요）。答えの例には使わない */
  attached?: boolean
}

/** 品物の前に付けてよい言葉（例：따뜻한、아이스） */
export interface OrderModifier {
  korean: string
  pronunciation: string
  /** この数え方の品物にだけ付けられる（省略したら、どの品物にも） */
  counter?: string
}

export interface Order extends ContentBase {
  chapter: number
  location: string
  /** 注文を受ける人（店員） */
  character: string
  menu: string
  /** 言うこと（日本語。ハングルは入れない） */
  task: string
  /** 注文の前の台詞 */
  lines: ConversationLine[]
  counts: OrderCount[]
  endings: OrderEnding[]
  modifiers?: OrderModifier[]
  /** 注文を受けた後の締めの台詞 */
  closing: ConversationLine[]
  /** メニューにない品物を頼んだとき */
  notOnMenu: ConversationLine[]
  /** 聞き取れない・言い方が分からないとき */
  unclear: ConversationLine[]
  /** 数え方の単位が品物と合わないとき（例：아메리카노 한 개）に出す注意。日本語（ハングルを入れてよい） */
  counterNoteJa?: string
}

// ---------- 章（GAME_SPEC 5章） ----------

/** 章（ゲームデータ。韓国語を含まないので reviewed は持たない） */
export interface Chapter {
  chapter: number
  /** 章の題（例：韓国に到着） */
  titleJa: string
  /** できるようになること */
  goalJa: string
}

// ---------- 実績（GAME_SPEC 7-2・7-3。Phase 4） ----------

/**
 * 実績の条件の種類。どれも「数が target 以上になったら達成」。
 * - wordsLearned：覚えた単語の数（図鑑の「覚えた」）
 * - wordsSeen：見かけた単語（タップして「覚える」を押した語句）の数
 * - chapterCleared：その章のイベントをすべて終えた（target は章の番号）
 * - chapterTestsPassed：合格した章末テストの数
 * - hangulLessonsPassed：合格したハングルのレッスンの数
 * - reviewCorrect：復習で正解した回数（今日の復習で、期限の来た問題）
 * - drillItemsCorrect：正解した基礎ドリルの問題の数
 * - listeningCorrect：正解したリスニングの問題の数
 * - readingsCorrect：正解した読み物の問題の数
 * - itemsOrdered：注文できた品物の種類の数
 * - storiesSeen：見たおはなしの数
 * - level：レベル
 */
export const ACHIEVEMENT_CONDITIONS = [
  'wordsLearned',
  'wordsSeen',
  'chapterCleared',
  'chapterTestsPassed',
  'hangulLessonsPassed',
  'reviewCorrect',
  'drillItemsCorrect',
  'listeningCorrect',
  'readingsCorrect',
  'itemsOrdered',
  'storiesSeen',
  'level',
] as const
export type AchievementConditionType = (typeof ACHIEVEMENT_CONDITIONS)[number]

/** 実績（ゲームデータ。韓国語は含めない。reviewed は教材担当が文と数値を確かめたか） */
export interface Achievement {
  id: string
  /** 実績の名前（例：はじめの一歩） */
  titleJa: string
  /** 達成の条件の説明（例：単語を5語覚える） */
  descriptionJa: string
  condition: { type: AchievementConditionType; target: number }
  /** 達成したときにもらえるコイン */
  coins: number
  reviewed: boolean
  notes?: string
}

/** スタンプの節目（集めたスタンプの合計の日数。GAME_SPEC 7-6） */
export interface StampMilestone {
  days: number
  coins: number
}

/**
 * 部屋の、家具を置く場所（GAME_SPEC 6-3。Phase 4。docs/PHASE4_HOME_PLAN.md 2章）。
 * 位置と大きさは、部屋の絵の幅・高さに対する割合（%）。ID はセーブデータ（home.placement）が参照するので、後から変えない
 */
export interface RoomSlot {
  id: string
  /** 場所の名前（例：壁（左）） */
  nameJa: string
  x: number
  y: number
  w: number
  h: number
  /** 家具の絵を枠のどこにそろえるか（bottom：床に置くもの。下の辺にそろえ、左右は中央。center：壁・ラグ。枠の中央） */
  align: 'center' | 'bottom'
  /** 重なりの順（小さいほど奥） */
  layer: number
}

export interface Room {
  /** このイベントを終えるまでは「引っ越したばかり」：自宅の背景を home_moving（段ボールのある部屋）にし、部屋を飾れない */
  movedInAfter: string
  slots: RoomSlot[]
}

/** 家具・小物（ゲームデータ。src/data/furniture/。GAME_SPEC 6-3・7-3） */
export interface Furniture {
  /** furniture_001 の形。セーブデータが参照するので、後から変えない */
  id: string
  nameJa: string
  /** 置く場所（RoomSlot の id） */
  slot: string
  /** 値段（コイン）。節目専用なら null */
  price: number | null
  /** カタログで買えるようになるレベル。節目専用なら null */
  level: number | null
  /** 節目専用：スタンプを集めた合計の日数（balance の stampMilestones の days）。カタログでは売らない */
  milestone: number | null
  /** 絵のキー（元の画像は fur_キー。assets の furniture） */
  image: string
  /** 韓国語の名前（単語ID）。まだなければ null */
  vocab: string | null
  /** 名前・値段・レベルを確かめたか */
  reviewed: boolean
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
  /** この施設で流す BGM（省略したら、街のマップの曲） */
  bgm?: BgmId
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
  /** おはなしの一枚絵（キー → 画像。元の画像は cg_キー） */
  cg: Record<string, ImageAsset>
  /** メニューの品物の絵（MENU_IMAGES のキー → 正方形の画像。元の画像は menu_cafe_1・menu_cafe_2 のマス） */
  menu: Record<string, ImageAsset>
  /** 説明の図の絵（図の image のキー → 画像。元の画像は fig_…_sheet のマス） */
  figures: Record<string, ImageAsset>
  /** 家具の絵（家具の image のキー → 背景を透明にした画像。元の画像は fur_キー） */
  furniture: Record<string, ImageAsset>
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
    /** 読み物の問題に初めて正解したとき（問題ごと） */
    readingQuestion: number
    /** 注文に初めて成功したとき（注文ごと） */
    order: number
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
  /** 聞き分け練習の1回の問題数 */
  earQuestions: number
  /** どの学習を終えたらスタンプを押すか */
  stampActivities: StampActivity[]
  /**
   * レベル（GAME_SPEC 7-2）。thresholds[n] はレベル n+1 になるのに要る経験値の合計（thresholds[0] は 0 ＝レベル1）。
   * 表の最後より先は、stepAfter ずつ増やす
   */
  levels: { thresholds: number[]; stepAfter: number }
  /** コイン（GAME_SPEC 7-3）。どれも初めてのときだけ */
  coins: {
    /** イベントを終えたとき */
    eventComplete: number
    /** 章を終えたとき（章の終わりの段階のあるイベントを終えたとき。eventComplete に足す） */
    chapterClear: number
    /** 章末テストに合格したとき */
    chapterTest: number
  }
  /** スタンプの節目のごほうび（集めた合計の日数の少ない順） */
  stampMilestones: StampMilestone[]
  /** 部屋（家具を置く場所） */
  room: Room
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
