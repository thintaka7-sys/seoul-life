// おはなし（GAME_SPEC 3-2）の進行。画面なしでテストできる純粋な関数にする。
// 場面（scene）・効果音（sfx）・BGM（bgm）の段階は画面に出さず、次に画面に出す段階まで進むときにまとめて反映する。

import { DEFAULT_EXPRESSION, PLAYER_SPEAKER_ID, type BgmId, type Expression, type Gloss, type SceneSound, type Story, type StoryBeat, type StoryLine } from '../../data/types'

/** 舞台（背景・一枚絵・立ち絵・ビデオ通話の枠） */
export interface StoryStage {
  /** 背景のID（場面の背景か施設ID） */
  background: string
  /** 一枚絵のキー。なければ null */
  image: string | null
  /** 立ち絵を出している人。いなければ null */
  character: string | null
  expression: Expression
  /** ビデオ通話の枠に出している人。いなければ null */
  call: string | null
  callExpression: Expression
}

/** 画面に出しているもの */
export type StoryShown =
  | { kind: 'narration'; textJa: string }
  | { kind: 'line'; line: StoryLine }
  | { kind: 'sign'; korean: string; pronunciation: string; japanese: string; glosses?: Gloss[] }
  | { kind: 'choice'; promptJa?: string; choices: { korean: string; pronunciation: string; japanese: string }[] }

/** ログ（これまでに見せたもの）の1つ */
export type StoryLogEntry =
  | { kind: 'narration'; textJa: string }
  | { kind: 'line'; speaker: string; korean: string; pronunciation: string; japanese: string }
  | { kind: 'sign'; korean: string; pronunciation: string; japanese: string }

export interface StoryState {
  /** いま見せている段階の番号（beats の番号）。終わったら beats の数 */
  beat: number
  /** 選択の反応を見せている間：選んだ選択肢の番号と、反応の何番目か */
  reply: { choice: number; index: number } | null
  stage: StoryStage
  /** BGM の指定（null なら場所の曲のまま、none なら止める） */
  bgm: BgmId | 'none' | null
  /** 最後に鳴らす効果音（seq が変わったら鳴らす） */
  sfx: { id: SceneSound; seq: number } | null
  log: StoryLogEntry[]
  done: boolean
}

const VISIBLE: readonly StoryBeat['type'][] = ['narration', 'line', 'sign', 'choice']

function applyHidden(state: StoryState, beat: StoryBeat): StoryState {
  switch (beat.type) {
    case 'scene': {
      const stage = { ...state.stage }
      if (beat.background !== undefined) stage.background = beat.background
      if (beat.image !== undefined) stage.image = beat.image
      if (beat.character !== undefined) {
        stage.character = beat.character
        stage.expression = DEFAULT_EXPRESSION
      }
      if (beat.call !== undefined) {
        stage.call = beat.call
        stage.callExpression = DEFAULT_EXPRESSION
      }
      return { ...state, stage }
    }
    case 'sfx':
      return { ...state, sfx: { id: beat.id, seq: (state.sfx?.seq ?? 0) + 1 } }
    case 'bgm':
      return { ...state, bgm: beat.id }
    default:
      return state
  }
}

/** 台詞を話す人に合わせて、舞台の立ち絵・通話の表情を変える。主人公は立ち絵がないので変えない */
function withSpeaker(stage: StoryStage, line: StoryLine): StoryStage {
  if (line.speaker === PLAYER_SPEAKER_ID) return stage
  const expression = line.expression ?? DEFAULT_EXPRESSION
  if (line.speaker === stage.call) return { ...stage, callExpression: expression }
  return { ...stage, character: line.speaker, expression }
}

function logOf(shown: StoryShown): StoryLogEntry | null {
  switch (shown.kind) {
    case 'narration':
      return { kind: 'narration', textJa: shown.textJa }
    case 'line':
      return { kind: 'line', speaker: shown.line.speaker, korean: shown.line.korean, pronunciation: shown.line.pronunciation, japanese: shown.line.japanese }
    case 'sign':
      return { kind: 'sign', korean: shown.korean, pronunciation: shown.pronunciation, japanese: shown.japanese }
    case 'choice':
      return null
  }
}

/** いま画面に出しているもの。終わっていれば null */
export function currentShown(story: Story, state: StoryState): StoryShown | null {
  if (state.done) return null
  const beat = story.beats[state.beat]
  if (beat === undefined) return null
  if (state.reply !== null && beat.type === 'choice') {
    const line = beat.choices[state.reply.choice]?.reply[state.reply.index]
    return line === undefined ? null : { kind: 'line', line }
  }
  switch (beat.type) {
    case 'narration':
      return { kind: 'narration', textJa: beat.textJa }
    case 'line': {
      const { type: _type, ...line } = beat
      return { kind: 'line', line }
    }
    case 'sign': {
      const shown: StoryShown = { kind: 'sign', korean: beat.korean, pronunciation: beat.pronunciation, japanese: beat.japanese }
      if (beat.glosses !== undefined) shown.glosses = beat.glosses
      return shown
    }
    case 'choice': {
      const shown: StoryShown = { kind: 'choice', choices: beat.choices.map((c) => ({ korean: c.korean, pronunciation: c.pronunciation, japanese: c.japanese })) }
      if (beat.promptJa !== undefined) shown.promptJa = beat.promptJa
      return shown
    }
    default:
      return null
  }
}

/** 新しく見せたものを、舞台とログに反映する */
function show(story: Story, state: StoryState): StoryState {
  const shown = currentShown(story, state)
  if (shown === null) return state
  const stage = shown.kind === 'line' ? withSpeaker(state.stage, shown.line) : state.stage
  const entry = logOf(shown)
  return { ...state, stage, log: entry === null ? state.log : [...state.log, entry] }
}

/** from の段階から、画面に出す次の段階まで進む（途中の場面・効果音・BGM を反映する） */
function moveTo(story: Story, state: StoryState, from: number): StoryState {
  let s: StoryState = { ...state, reply: null }
  for (let i = from; i < story.beats.length; i++) {
    const beat = story.beats[i]
    if (beat === undefined) break
    if (VISIBLE.includes(beat.type)) return show(story, { ...s, beat: i })
    s = applyHidden(s, beat)
  }
  return { ...s, beat: story.beats.length, done: true }
}

/** おはなしを始める。background は始めの背景（イベントのそのときの背景） */
export function startStory(story: Story, background: string): StoryState {
  const initial: StoryState = {
    beat: 0,
    reply: null,
    stage: { background, image: null, character: null, expression: DEFAULT_EXPRESSION, call: null, callExpression: DEFAULT_EXPRESSION },
    bgm: story.bgm ?? null,
    sfx: null,
    log: [],
    done: false,
  }
  return moveTo(story, initial, 0)
}

/** 次へ進む。選択を見せている間は進まない（選んでから進む） */
export function advanceStory(story: Story, state: StoryState): StoryState {
  if (state.done) return state
  const beat = story.beats[state.beat]
  if (beat?.type === 'choice') {
    if (state.reply === null) return state
    const replies = beat.choices[state.reply.choice]?.reply ?? []
    const next = state.reply.index + 1
    if (next < replies.length) return show(story, { ...state, reply: { choice: state.reply.choice, index: next } })
  }
  return moveTo(story, state, state.beat + 1)
}

/** 選択の返事を選ぶ。選んだ返事（主人公の台詞）をログに入れ、相手の反応を見せる */
export function chooseInStory(story: Story, state: StoryState, choice: number): StoryState {
  const beat = story.beats[state.beat]
  if (state.done || beat?.type !== 'choice' || state.reply !== null) return state
  const picked = beat.choices[choice]
  if (picked === undefined) return state
  const said: StoryLogEntry = { kind: 'line', speaker: PLAYER_SPEAKER_ID, korean: picked.korean, pronunciation: picked.pronunciation, japanese: picked.japanese }
  return show(story, { ...state, log: [...state.log, said], reply: { choice, index: 0 } })
}

/** 最後まで飛ばす */
export function skipStory(story: Story, state: StoryState): StoryState {
  return { ...state, beat: story.beats.length, reply: null, done: true }
}
