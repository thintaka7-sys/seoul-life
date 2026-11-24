// ゲーム全体の状態と、画面遷移の reducer。
// reducer は純粋な関数にする（日時は action で受け取る）ので、画面なしでテストできる。

import type { Achievement, Balance, Chapter, Conversation, GameEvent, StampActivity } from '../data/types'
import type { AnswerMode } from '../learning/conversation/session'
import { isReplayable } from '../game/conversations/replayList'
import { autoStartEvent, findEvent, newlyUnlocked, nextEvent, playableStep, resumeStep, unlockedLocations } from '../game/events/events'
import { settleGrowth } from '../game/progression/growth'
import {
  advanceEvent,
  answerDrillItem,
  answerReview,
  clearConversationTurn,
  finishChapterTest,
  learnItems,
  passHangulLesson,
  recordListeningCorrect,
  recordOrder,
  recordReadingCorrect,
  rememberWord,
  seeStory,
  stampToday,
  startEvent,
  type ClearMethod,
  type ReviewSource,
  type Reward,
} from '../game/progression/progression'
import { createNewSave, type SaveData, type SaveNotice } from '../storage/saveData'
import type { CorruptReason, LoadResult } from '../storage/saveStore'
import type { Settings } from '../storage/settings'

export type Scene =
  /** imported：ファイルから読み込んだ直後（書き出した日時。タイトルに「読み込みました」と出す） */
  | { name: 'title'; imported?: string }
  | { name: 'settings'; back: Scene }
  | { name: 'main' }
  | { name: 'location'; locationId: string }
  /** イベントの段階を進めている画面（中身は run で決まる） */
  | { name: 'event'; locationId: string }
  | { name: 'dictionary'; back: Scene }
  /** 学習画面（GAME_SPEC 3-1 E）。自宅の「勉強する」から開く */
  | { name: 'study'; back: Scene }
  /** ハングルのレッスンの一覧 */
  | { name: 'hangul'; back: Scene }
  /** ハングルのレッスン。onboarding は物語の中の「ハングルは読めますか？」から来たか（閉じると物語に戻る） */
  | { name: 'hangulLesson'; lessonId: string; back: Scene; onboarding: boolean }
  /** リスニング */
  | { name: 'listening'; back: Scene }
  /** 今日の復習（GAME_SPEC 7-5） */
  | { name: 'review'; back: Scene }
  /** 練習（学んだものから自由に出題する。計画 Q13） */
  | { name: 'practice'; back: Scene }
  /** 基礎ドリル・章末テストの一覧（GAME_SPEC 4-9） */
  | { name: 'drills'; back: Scene }
  /** 基礎ドリル */
  | { name: 'drill'; drillId: string; back: Scene }
  /** 章末テスト */
  | { name: 'chapterTest'; testId: string; back: Scene }
  /** スタンプカード（GAME_SPEC 7-6）。自宅から開く */
  | { name: 'stamps'; back: Scene }
  /** 実績の一覧（GAME_SPEC 7-2。Phase 4）。自宅から開く */
  | { name: 'achievements'; back: Scene }
  /** 聞き分け練習：組の一覧（GAME_SPEC 4-10） */
  | { name: 'ear'; back: Scene }
  /** 聞き分け練習：1つの組（試しに聞く・練習）。setId が null なら全部の組からまぜて練習 */
  | { name: 'earSet'; setId: string | null; back: Scene }
  /** 会話をもう一度：終えたイベントの会話の一覧（BUG-007） */
  | { name: 'conversations'; back: Scene }
  /** 会話をもう一度：1つの会話を遊ぶ（locationId は背景のため） */
  | { name: 'conversationReplay'; conversationId: string; locationId: string; back: Scene }
  /** おはなしのアルバム（GAME_SPEC 3-2）。自宅から開く */
  | { name: 'album'; back: Scene }
  /** アルバムから、見たおはなしをもう一度見る（記録しない） */
  | { name: 'storyReplay'; storyId: string; back: Scene }
  /** 施設の画面から、もう一度注文する（GAME_SPEC 4-4。locationId は背景のため） */
  | { name: 'order'; orderId: string; locationId: string; back: Scene }
  | { name: 'saveError'; reason: CorruptReason; detail: string; backupKey: string | null }

/**
 * 進めているイベント。replay は終えたイベントの遊び直し（進行は変えない）。
 * 遊び直しでも、問題の往復の答えは記録・復習に入れ、初めて正解した往復だけ経験値を付ける（BUG-007）
 */
export interface EventRun {
  eventId: string
  step: number
  replay: boolean
}

/** 画面に一時的に出す「経験値 +n」の知らせ。seq は同じ値が続いても出し直すための番号 */
export interface RewardNotice extends Reward {
  seq: number
}

export interface GameState {
  scene: Scene
  /** 遊んでいるセーブデータ。タイトル画面で「はじめから」を選ぶまでは null のこともある */
  save: SaveData | null
  settings: Settings
  /** このブラウザで保存できるか */
  storageAvailable: boolean
  /** 直近の保存の失敗（成功したら null に戻る） */
  saveFailure: string | null
  run: EventRun | null
  reward: RewardNotice | null
  /** 会話で選んでいた答え方。次の会話もこの方法で始める（ゲームを開いている間だけ。保存しない。計画 Q9） */
  answerPreference: AnswerMode
}

export type GameAction =
  | { type: 'startNew'; now: string }
  | { type: 'continue'; now: string }
  | { type: 'goToLocation'; locationId: string; now: string }
  | { type: 'backToMap'; now: string }
  | { type: 'backToTitle' }
  | { type: 'openSettings' }
  | { type: 'closeSettings' }
  | { type: 'changeSettings'; settings: Settings }
  | { type: 'openDictionary' }
  | { type: 'closeDictionary' }
  | { type: 'startEvent'; eventId: string; now: string }
  /** message・dictionary・dayEnd の段階を終えた */
  | { type: 'stepDone'; now: string }
  /** learn の段階（単語カード）を見終えた */
  | { type: 'learnDone'; now: string }
  /** 会話の1往復に答えた（往復ごとに経験値を付ける） */
  | { type: 'conversationAnswered'; turn: number; method: ClearMethod; now: string }
  /** 会話を最後まで見た */
  | { type: 'conversationDone'; now: string }
  /** イベントを途中でやめる（続きから再開できる） */
  | { type: 'leaveEvent' }
  /** ブラウザの「戻る」。画面内の「戻る」ボタンと同じ動きにする */
  | { type: 'back'; now: string }
  /** 物語の「ハングルは読めますか？」（hangulIntro の段階）に答える */
  | { type: 'answerHangulIntro'; learnHangul: boolean; now: string }
  /** おはなしを最後まで見た（飛ばした場合も） */
  | { type: 'storyDone'; now: string }
  /** タップした単語の「覚える」を押した（見かけた単語に入れ、復習に加える） */
  | { type: 'rememberWord'; vocabId: string; chapter: number; now: string }
  /** 一度だけのお知らせを閉じる */
  | { type: 'dismissNotice'; notice: SaveNotice; now: string }
  /** 読み物の問題に正解した（key は reading_001#0） */
  | { type: 'readingCorrect'; key: string; now: string }
  /** 注文できた（itemKey はメニューの品物の key） */
  | { type: 'orderPlaced'; orderId: string; itemKey: string; now: string }
  /** 施設の画面から、もう一度注文する（注文の段階のあるイベントを終えた後） */
  | { type: 'openOrder'; orderId: string }
  | { type: 'openAlbum' }
  | { type: 'openStoryReplay'; storyId: string }
  | { type: 'openStudy' }
  | { type: 'openHangul' }
  | { type: 'openHangulLesson'; lessonId: string }
  | { type: 'openListening' }
  | { type: 'openReview' }
  | { type: 'openPractice' }
  | { type: 'openDrills' }
  | { type: 'openDrill'; drillId: string }
  | { type: 'openChapterTest'; testId: string }
  | { type: 'openStamps' }
  | { type: 'openAchievements' }
  | { type: 'openConversations' }
  | { type: 'openEar' }
  /** 聞き分けの組を開く（null なら全部の組からまぜて練習） */
  | { type: 'openEarSet'; setId: string | null }
  /** 会話をもう一度遊ぶ（会話の一覧・章末テストから。終えたイベントの会話だけ） */
  | { type: 'openConversationReplay'; conversationId: string }
  /** 会話をもう一度で、1往復に答えた */
  | { type: 'replayTurnAnswered'; turn: number; method: ClearMethod; now: string }
  /** 学習画面・レッスン一覧・レッスン・リスニング・復習・練習を閉じて、開く前の画面に戻る */
  | { type: 'closeStudyScene' }
  /** ハングルのレッスンの小テストに合格した（score は 0〜100） */
  | { type: 'hangulLessonPassed'; lessonId: string; score: number; now: string }
  /** リスニングの問題に正解した（key は listeningKey） */
  | { type: 'listeningCorrect'; key: string; now: string }
  /** 復習の問題に答えた（key は reviewKey。もう一度出した問題の答えは送らない） */
  | { type: 'reviewAnswered'; key: string; correct: boolean; source: ReviewSource; now: string }
  /** 基礎ドリル・章末テストの追加の問題（dq_001 など）に答えた */
  | { type: 'drillAnswered'; itemId: string; correct: boolean; now: string }
  /** 章末テストを終えた（score は 0〜100） */
  | { type: 'testFinished'; testId: string; score: number; passed: boolean; now: string }
  /** スタンプを押す学習を終えた（今日の復習・ドリル・リスニング。テスト・レッスン・イベントは、それぞれの記録のときに押す） */
  | { type: 'activityCompleted'; activity: StampActivity; now: string }
  /** 会話で答え方を選んだ */
  | { type: 'setAnswerPreference'; mode: AnswerMode }
  | { type: 'dismissReward' }
  | { type: 'saveSucceeded' }
  /** 書き出したファイルを読み込んだ（セーブデータと設定を置き換えて、タイトルに戻る。GAME_SPEC 10-2） */
  | { type: 'importSave'; save: SaveData; settings: Settings; exportedAt: string }
  | { type: 'saveFailed'; message: string }

export interface GameDeps {
  events: readonly GameEvent[]
  balance: Balance
  locationIds: ReadonlySet<string>
  /** 最初のハングルのレッスンのID。物語の「ハングルは読めますか？」で「学ぶ」を選んだら開く */
  firstHangulLessonId?: string | null
  /** おはなしのID（アルバムから開けるかの確認。省略したら確かめない） */
  storyIds?: ReadonlySet<string>
  /** 会話（選択の往復への答えを記録しないために使う。省略したら確かめない） */
  conversations?: readonly Conversation[]
  /** 単語の、形が変わる言葉の問題のキー（覚えたら復習に入れる。省略したら入れない） */
  formKeysOf?: (vocabId: string) => string[]
  /**
   * 成長の精算（実績・スタンプの節目・レベルアップ。Phase 4）に使う。省略したら精算しない（テストで、ほかの動きだけを確かめるため）
   */
  growth?: { achievements: readonly Achievement[]; chapters: readonly Chapter[] }
}

export function createInitialState(load: LoadResult, backupKey: string | null, settings: Settings): GameState {
  const base = { settings, saveFailure: null, run: null, reward: null, answerPreference: 'choice' as const }
  switch (load.kind) {
    case 'ok':
      return { ...base, scene: { name: 'title' }, save: load.data, storageAvailable: true }
    case 'empty':
      return { ...base, scene: { name: 'title' }, save: null, storageAvailable: true }
    case 'unavailable':
      return { ...base, scene: { name: 'title' }, save: null, storageAvailable: false }
    case 'corrupt':
      return { ...base, scene: { name: 'saveError', reason: load.reason, detail: load.detail, backupKey }, save: null, storageAvailable: true }
  }
}

function withLocation(save: SaveData, locationId: string | null, now: string): SaveData {
  return { ...save, updatedAt: now, progress: { ...save.progress, currentLocationId: locationId } }
}

/** 知らせることがあるか */
function hasNews(r: Reward): boolean {
  return (
    r.xp > 0 ||
    r.newWords > 0 ||
    r.stamp === true ||
    (r.unlocked?.length ?? 0) > 0 ||
    (r.coins ?? 0) > 0 ||
    r.levelUp !== undefined ||
    (r.achievements?.length ?? 0) > 0 ||
    (r.milestones?.length ?? 0) > 0
  )
}

function addReward(state: GameState, reward: Reward): RewardNotice | null {
  if (!hasNews(reward)) return state.reward
  return { ...reward, seq: (state.reward?.seq ?? 0) + 1 }
}

/** 2つの知らせをまとめる（コイン・実績・節目・開いた施設も足し合わせる。レベルは高いほう） */
function sumRewards(a: Reward, b: Reward): Reward {
  const sum: Reward = { xp: a.xp + b.xp, newWords: a.newWords + b.newWords, stamp: a.stamp === true || b.stamp === true }
  const coins = (a.coins ?? 0) + (b.coins ?? 0)
  if (coins > 0) sum.coins = coins
  const unlocked = [...(a.unlocked ?? []), ...(b.unlocked ?? [])]
  if (unlocked.length > 0) sum.unlocked = unlocked
  const achievements = [...(a.achievements ?? []), ...(b.achievements ?? [])]
  if (achievements.length > 0) sum.achievements = achievements
  const milestones = [...(a.milestones ?? []), ...(b.milestones ?? [])]
  if (milestones.length > 0) sum.milestones = milestones
  const levelUp = Math.max(a.levelUp ?? 0, b.levelUp ?? 0)
  if (levelUp > 0) sum.levelUp = levelUp
  return sum
}

/** 学習を終えたらスタンプを押し、知らせ（reward）に足す */
function withStampFor(save: SaveData, reward: Reward, activity: StampActivity, balance: Balance, now: string): { save: SaveData; reward: Reward } {
  const stamped = stampToday(save, activity, balance, now)
  return { save: stamped.save, reward: stamped.stamped ? { ...reward, stamp: true } : reward }
}

/** 画面内で「戻る」を押したときの行き先。戻れない画面では null */
export function backTarget(state: GameState): GameAction['type'] | null {
  switch (state.scene.name) {
    case 'settings':
      return 'closeSettings'
    case 'dictionary':
      return 'closeDictionary'
    case 'event':
      return 'leaveEvent'
    case 'study':
    case 'hangul':
    case 'hangulLesson':
    case 'listening':
    case 'review':
    case 'practice':
    case 'drills':
    case 'drill':
    case 'chapterTest':
    case 'stamps':
    case 'achievements':
    case 'conversations':
    case 'conversationReplay':
    case 'ear':
    case 'earSet':
    case 'album':
    case 'storyReplay':
    case 'order':
      return 'closeStudyScene'
    case 'location':
    case 'main':
      return state.scene.name === 'main' ? 'backToTitle' : 'backToMap'
    case 'title':
    case 'saveError':
      return null
  }
}

/** 学習画面のなかまの画面（閉じると back に戻る） */
type StudyScene = Extract<
  Scene,
  {
    name:
      | 'study'
      | 'hangul'
      | 'hangulLesson'
      | 'listening'
      | 'review'
      | 'practice'
      | 'drills'
      | 'drill'
      | 'chapterTest'
      | 'stamps'
      | 'achievements'
      | 'conversations'
      | 'conversationReplay'
      | 'ear'
      | 'earSet'
      | 'album'
      | 'storyReplay'
      | 'order'
  }
>

const STUDY_SCENES: readonly Scene['name'][] = [
  'study',
  'hangul',
  'hangulLesson',
  'listening',
  'review',
  'practice',
  'drills',
  'drill',
  'chapterTest',
  'stamps',
  'achievements',
  'conversations',
  'conversationReplay',
  'ear',
  'earSet',
  'album',
  'storyReplay',
  'order',
]

function isStudyScene(scene: Scene): scene is StudyScene {
  return STUDY_SCENES.includes(scene.name)
}

export function createGameReducer(deps: GameDeps) {
  const { events, balance, locationIds } = deps
  const growth = deps.growth

  /**
   * 成長を精算する（セーブデータが変わったとき、「つづきから」のとき、または v6 から移したばかりのデータのとき）。
   * 実績・節目のコイン、レベルアップを、この操作の知らせにまとめる。v6 から移したデータは知らせず、お知らせ（progressionIntroduced）に任せる
   */
  function settle(prev: GameState, next: GameState, always: boolean): GameState {
    const save = next.save
    if (growth === undefined || save === null) return next
    if (save === prev.save && save.stats.levelShown !== 0 && !always) return next
    const g = settleGrowth(save, { balance, events, achievements: growth.achievements, chapters: growth.chapters })
    if (g.save === save) return next
    if (g.retroactive) return { ...next, save: g.save }
    const gained: Reward = { xp: 0, newWords: 0 }
    if (g.coins > 0) gained.coins = g.coins
    if (g.achievements.length > 0) gained.achievements = g.achievements
    if (g.milestones.length > 0) gained.milestones = g.milestones
    if (g.levelUp !== null) gained.levelUp = g.levelUp
    // この操作で出した知らせがあれば、そこに足す（なければ新しく出す）
    const own = next.reward !== prev.reward ? next.reward : null
    const reward = own === null ? addReward(next, gained) : { ...sumRewards(own, gained), seq: own.seq }
    return { ...next, save: g.save, reward }
  }
  const firstHangulLessonId = deps.firstHangulLessonId ?? null

  /** いま行ける施設 */
  function unlockedFor(save: SaveData): Set<string> {
    return unlockedLocations(events, balance.initialLocations, save.progress.completedEvents)
  }

  /** イベントを始める（途中なら続きから）。scene はイベントの画面 */
  function beginEvent(state: GameState, save: SaveData, event: GameEvent, now: string): GameState {
    const started = startEvent(save, event, now)
    const step = started.progress.activeEvent?.step ?? 0
    return { ...state, save: started, run: { eventId: event.id, step, replay: false }, scene: { name: 'event', locationId: event.location } }
  }

  /** 自動で始まるイベント（start: "auto"）があれば始める。なければ state のまま */
  function withAutoStart(state: GameState, now: string): GameState {
    if (state.save === null || state.run !== null) return state
    const auto = autoStartEvent(events, state.save.progress)
    return auto === undefined ? state : beginEvent(state, state.save, auto, now)
  }

  /** 段階を1つ進める。イベントの最後なら、その施設の画面に戻る */
  function finishStep(state: GameState, extra: Reward, now: string): GameState {
    const run = state.run
    if (run === null || state.save === null) return state
    const event = findEvent(events, run.eventId)
    if (event === undefined) return { ...state, run: null, scene: { name: 'main' } }

    if (run.replay) {
      const step = playableStep(event, run.step + 1)
      if (step >= event.steps.length) return { ...state, run: null, scene: { name: 'location', locationId: event.location } }
      return { ...state, run: { ...run, step } }
    }

    const advanced = advanceEvent(state.save, event, balance, now)
    if (advanced.finished) {
      // イベントを1つ完了したら、今日のスタンプ。新しく開いた施設を知らせ、次が自動で始まるイベントなら続けて始める
      const unlocked = newlyUnlocked(event, events, balance.initialLocations, state.save.progress.completedEvents)
      const stamped = withStampFor(advanced.save, sumRewards(extra, advanced.reward), 'event', balance, now)
      const reward = unlocked.length > 0 ? { ...stamped.reward, unlocked } : stamped.reward
      const done: GameState = { ...state, save: stamped.save, run: null, reward: addReward(state, reward), scene: { name: 'location', locationId: event.location } }
      return withAutoStart(done, now)
    }
    const reward = addReward(state, sumRewards(extra, advanced.reward))
    const step = advanced.save.progress.activeEvent?.step ?? run.step + 1
    return { ...state, save: advanced.save, run: { ...run, step }, reward }
  }

  /** 会話の1往復の答えを記録する。選択の往復には、経験値・記録・復習を付けない（計画 Q3） */
  function recordTurn(state: GameState, conversationId: string, turn: number, method: ClearMethod, now: string): GameState {
    if (state.save === null) return state
    if (deps.conversations?.find((c) => c.id === conversationId)?.turns[turn]?.kind === 'decision') return state
    const cleared = clearConversationTurn(state.save, conversationId, turn, method, balance, now)
    if (cleared.save === state.save) return state
    return { ...state, save: cleared.save, reward: addReward(state, cleared.reward) }
  }

  function currentStep(state: GameState) {
    if (state.run === null) return undefined
    return findEvent(events, state.run.eventId)?.steps[state.run.step]
  }

  return function reducer(state: GameState, action: GameAction): GameState {
    return settle(state, gameReducer(state, action), action.type === 'continue')
  }

  function gameReducer(state: GameState, action: GameAction): GameState {
    switch (action.type) {
      case 'startNew': {
        // 「ハングルは読めますか？」は、第1章の先生の授業の中で聞く（hangulIntro の段階。計画 Q3）
        const save = withLocation(createNewSave(action.now), balance.startLocation, action.now)
        return withAutoStart({ ...state, save, run: null, reward: null, scene: { name: 'location', locationId: balance.startLocation } }, action.now)
      }

      case 'answerHangulIntro': {
        if (currentStep(state)?.type !== 'hangulIntro') return state
        const next = finishStep(state, { xp: 0, newWords: 0 }, action.now)
        if (!action.learnHangul || firstHangulLessonId === null) return next
        // レッスンを閉じると、物語（イベントの続き、またはイベントを終えた後の画面）に戻る
        return { ...next, scene: { name: 'hangulLesson', lessonId: firstHangulLessonId, back: next.scene, onboarding: true } }
      }

      case 'storyDone': {
        const step = currentStep(state)
        if (step?.type !== 'story' || state.save === null) return state
        return finishStep({ ...state, save: seeStory(state.save, step.id, action.now) }, { xp: 0, newWords: 0 }, action.now)
      }

      case 'rememberWord': {
        if (state.save === null) return state
        const remembered = rememberWord(state.save, action.vocabId, action.chapter, balance, action.now)
        return remembered === state.save ? state : { ...state, save: remembered }
      }

      case 'dismissNotice': {
        const save = state.save
        if (save === null || !save.progress.notices.includes(action.notice)) return state
        return { ...state, save: { ...save, updatedAt: action.now, progress: { ...save.progress, notices: save.progress.notices.filter((n) => n !== action.notice) } } }
      }

      case 'openAlbum':
        if (state.save === null || isStudyScene(state.scene)) return state
        return { ...state, scene: { name: 'album', back: state.scene } }

      case 'openStoryReplay': {
        const save = state.save
        if (save === null || state.scene.name !== 'album' || save.progress.storiesSeen[action.storyId] === undefined) return state
        if (deps.storyIds !== undefined && !deps.storyIds.has(action.storyId)) return state
        return { ...state, scene: { name: 'storyReplay', storyId: action.storyId, back: state.scene } }
      }

      case 'readingCorrect': {
        if (state.save === null) return state
        const recorded = recordReadingCorrect(state.save, action.key, balance, action.now)
        return recorded.save === state.save ? state : { ...state, save: recorded.save, reward: addReward(state, recorded.reward) }
      }

      case 'orderPlaced': {
        if (state.save === null) return state
        const recorded = recordOrder(state.save, action.orderId, action.itemKey, balance, action.now)
        return recorded.save === state.save ? state : { ...state, save: recorded.save, reward: addReward(state, recorded.reward) }
      }

      case 'openOrder': {
        // 注文の段階のあるイベントを終えたか、一度注文できたら、施設の画面から何度でも注文し直せる
        const save = state.save
        if (save === null || state.scene.name !== 'location') return state
        const event = events.find((e) => e.steps.some((s) => s.type === 'order' && s.id === action.orderId))
        const opened = save.learning.orders[action.orderId] !== undefined || (event !== undefined && save.progress.completedEvents.includes(event.id))
        if (!opened || event?.location !== state.scene.locationId) return state
        return { ...state, scene: { name: 'order', orderId: action.orderId, locationId: state.scene.locationId, back: state.scene } }
      }

      case 'openStudy':
        if (state.save === null || isStudyScene(state.scene)) return state
        return { ...state, scene: { name: 'study', back: state.scene } }

      case 'openHangul':
        if (state.scene.name !== 'study') return state
        return { ...state, scene: { name: 'hangul', back: state.scene } }

      case 'openHangulLesson':
        if (state.scene.name !== 'hangul') return state
        return { ...state, scene: { name: 'hangulLesson', lessonId: action.lessonId, back: state.scene, onboarding: false } }

      case 'openListening':
        if (state.scene.name !== 'study') return state
        return { ...state, scene: { name: 'listening', back: state.scene } }

      case 'openReview':
        if (state.scene.name !== 'study') return state
        return { ...state, scene: { name: 'review', back: state.scene } }

      case 'openPractice':
        if (state.scene.name !== 'study') return state
        return { ...state, scene: { name: 'practice', back: state.scene } }

      case 'openDrills':
        if (state.scene.name !== 'study') return state
        return { ...state, scene: { name: 'drills', back: state.scene } }

      case 'openDrill':
        if (state.scene.name !== 'drills') return state
        return { ...state, scene: { name: 'drill', drillId: action.drillId, back: state.scene } }

      case 'openChapterTest':
        if (state.scene.name !== 'drills') return state
        return { ...state, scene: { name: 'chapterTest', testId: action.testId, back: state.scene } }

      case 'openEar':
        if (state.scene.name !== 'study') return state
        return { ...state, scene: { name: 'ear', back: state.scene } }

      case 'openEarSet':
        if (state.scene.name !== 'ear') return state
        return { ...state, scene: { name: 'earSet', setId: action.setId, back: state.scene } }

      case 'openConversations':
        if (state.scene.name !== 'study') return state
        return { ...state, scene: { name: 'conversations', back: state.scene } }

      case 'openConversationReplay': {
        const save = state.save
        const conversation = deps.conversations?.find((c) => c.id === action.conversationId)
        if (save === null || conversation === undefined || (state.scene.name !== 'conversations' && state.scene.name !== 'chapterTest')) return state
        if (!isReplayable(conversation.id, events, save.progress.completedEvents)) return state
        return { ...state, scene: { name: 'conversationReplay', conversationId: conversation.id, locationId: conversation.location, back: state.scene } }
      }

      case 'replayTurnAnswered': {
        const scene = state.scene
        if (scene.name !== 'conversationReplay' || state.save === null) return state
        return recordTurn(state, scene.conversationId, action.turn, action.method, action.now)
      }

      case 'openStamps':
        if (state.save === null || isStudyScene(state.scene)) return state
        return { ...state, scene: { name: 'stamps', back: state.scene } }

      case 'openAchievements':
        if (state.save === null || isStudyScene(state.scene)) return state
        return { ...state, scene: { name: 'achievements', back: state.scene } }

      case 'drillAnswered': {
        if (state.save === null) return state
        const answered = answerDrillItem(state.save, action.itemId, action.correct, balance, action.now)
        if (answered.save === state.save) return state
        return { ...state, save: answered.save, reward: addReward(state, answered.reward) }
      }

      case 'testFinished': {
        if (state.save === null) return state
        const finished = finishChapterTest(state.save, action.testId, action.score, action.passed, balance, action.now)
        const stamped = withStampFor(finished.save, finished.reward, 'chapterTest', balance, action.now)
        if (stamped.save === state.save) return state
        return { ...state, save: stamped.save, reward: addReward(state, stamped.reward) }
      }

      case 'activityCompleted': {
        if (state.save === null) return state
        const stamped = withStampFor(state.save, { xp: 0, newWords: 0 }, action.activity, balance, action.now)
        if (stamped.save === state.save) return state
        return { ...state, save: stamped.save, reward: addReward(state, stamped.reward) }
      }

      case 'reviewAnswered': {
        if (state.save === null) return state
        const answered = answerReview(state.save, action.key, action.correct, action.source, balance, action.now)
        if (answered.save === state.save) return state
        return { ...state, save: answered.save, reward: addReward(state, answered.reward) }
      }

      case 'closeStudyScene':
        return isStudyScene(state.scene) ? { ...state, scene: state.scene.back } : state

      case 'hangulLessonPassed': {
        if (state.save === null) return state
        const passed = passHangulLesson(state.save, action.lessonId, action.score, balance, action.now)
        // レッスンに合格したら、今日のスタンプ（点が上がらなかった2回目以降の合格でも押す）
        const stamped = withStampFor(passed.save, passed.reward, 'hangulLesson', balance, action.now)
        if (stamped.save === state.save) return state
        return { ...state, save: stamped.save, reward: addReward(state, stamped.reward) }
      }

      case 'listeningCorrect': {
        if (state.save === null) return state
        const recorded = recordListeningCorrect(state.save, action.key, balance, action.now)
        if (recorded.save === state.save) return state
        return { ...state, save: recorded.save, reward: addReward(state, recorded.reward) }
      }

      case 'continue': {
        const save = state.save
        if (save === null) return state
        // 途中のイベントがあれば、その続きから再開する
        const active = save.progress.activeEvent
        const event = active === null ? undefined : findEvent(events, active.id)
        if (active !== null && event !== undefined) return beginEvent(state, save, event, action.now)
        // 自動で始まるイベント（物語が新しくなったセーブデータの第1章の最初など）があれば、そこから
        const auto = withAutoStart(state, action.now)
        if (auto !== state) return auto
        const loc = save.progress.currentLocationId
        if (loc !== null && locationIds.has(loc) && unlockedFor(save).has(loc)) return { ...state, scene: { name: 'location', locationId: loc } }
        return { ...state, scene: loc === null ? { name: 'main' } : { name: 'location', locationId: balance.startLocation } }
      }

      case 'goToLocation':
        if (state.save === null || !locationIds.has(action.locationId) || !unlockedFor(state.save).has(action.locationId)) return state
        return { ...state, save: withLocation(state.save, action.locationId, action.now), scene: { name: 'location', locationId: action.locationId } }

      case 'backToMap':
        if (state.save === null) return state
        return { ...state, save: withLocation(state.save, null, action.now), run: null, scene: { name: 'main' } }

      case 'backToTitle':
        return { ...state, run: null, scene: { name: 'title' } }

      case 'openSettings':
        if (state.scene.name === 'settings') return state
        return { ...state, scene: { name: 'settings', back: state.scene } }

      case 'closeSettings':
        return state.scene.name === 'settings' ? { ...state, scene: state.scene.back } : state

      case 'changeSettings':
        return { ...state, settings: action.settings }

      case 'openDictionary':
        if (state.save === null || state.scene.name === 'dictionary') return state
        return { ...state, scene: { name: 'dictionary', back: state.scene } }

      case 'closeDictionary':
        return state.scene.name === 'dictionary' ? { ...state, scene: state.scene.back } : state

      case 'startEvent': {
        const save = state.save
        const event = findEvent(events, action.eventId)
        if (save === null || event === undefined) return state
        const isActive = save.progress.activeEvent?.id === event.id
        const done = save.progress.completedEvents.includes(event.id)
        // 終えたイベントは遊び直し（記録しない）。未完了のものは、いま進められるイベントだけ始められる
        if (done && !isActive) {
          return { ...state, run: { eventId: event.id, step: resumeStep(event, 0), replay: true }, scene: { name: 'event', locationId: event.location } }
        }
        if (nextEvent(events, save.progress)?.id !== event.id) return state
        return beginEvent(state, save, event, action.now)
      }

      case 'stepDone': {
        const step = currentStep(state)
        if (step === undefined || step.type === 'learn' || step.type === 'conversation' || step.type === 'story' || step.type === 'hangulIntro') return state
        // message・column・dictionary・dayEnd・chapterEnd などは見終えたら次へ（経験値なし）
        return finishStep(state, { xp: 0, newWords: 0 }, action.now)
      }

      case 'learnDone': {
        const step = currentStep(state)
        const run = state.run
        if (step?.type !== 'learn' || run === null || state.save === null) return state
        if (run.replay) return finishStep(state, { xp: 0, newWords: 0 }, action.now)
        const chapter = findEvent(events, run.eventId)?.chapter ?? 1
        const forms = deps.formKeysOf === undefined ? [] : step.vocabulary.flatMap(deps.formKeysOf)
        const learned = learnItems(state.save, { ...step, forms }, chapter, balance, action.now)
        return finishStep({ ...state, save: learned.save }, learned.reward, action.now)
      }

      case 'conversationAnswered': {
        // 遊び直し（run.replay）でも記録する（BUG-007）
        const step = currentStep(state)
        if (step?.type !== 'conversation' || state.run === null || state.save === null) return state
        return recordTurn(state, step.id, action.turn, action.method, action.now)
      }

      case 'conversationDone': {
        if (currentStep(state)?.type !== 'conversation') return state
        return finishStep(state, { xp: 0, newWords: 0 }, action.now)
      }

      case 'leaveEvent': {
        if (state.run === null) return state
        const event = findEvent(events, state.run.eventId)
        return { ...state, run: null, scene: event === undefined ? { name: 'main' } : { name: 'location', locationId: event.location } }
      }

      case 'back': {
        const target = backTarget(state)
        if (target === null) return state
        if (target === 'backToMap') return gameReducer(state, { type: 'backToMap', now: action.now })
        if (target === 'closeSettings' || target === 'closeDictionary' || target === 'leaveEvent' || target === 'backToTitle' || target === 'closeStudyScene') {
          return gameReducer(state, { type: target })
        }
        return state
      }

      case 'setAnswerPreference':
        return state.answerPreference === action.mode ? state : { ...state, answerPreference: action.mode }

      case 'dismissReward':
        return state.reward === null ? state : { ...state, reward: null }

      case 'saveSucceeded':
        return state.saveFailure === null ? state : { ...state, saveFailure: null }

      case 'importSave':
        return { ...state, save: action.save, settings: action.settings, run: null, reward: null, scene: { name: 'title', imported: action.exportedAt } }

      case 'saveFailed':
        return { ...state, saveFailure: action.message }
    }
  }
}
