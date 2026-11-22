// 教材が差し替わる前のセーブデータ（古い会話IDの記録・ずれた段階の番号・旧形式 v2）を読み込めることを確かめる。
// Phase 3（セーブデータ v6）で物語を章立てに組み直したので、物語の進み具合は最初から（第1章の空港）になり、
// 覚えた単語・会話の記録・経験値は残り、「物語が新しくなりました」を一度だけ知らせる（計画 Q5）。
// 使い方: node scripts/e2e/old-saves.mjs <URL>

import { SAVE_VERSION, openBrowser, sleep } from './browser.mjs'

const b = await openBrowser('old-saves')
const { evaluate, click, saved, viewport, freshStart, check } = b

const T = '2026-11-19T10:00:00.000Z'
const base = { createdAt: T, updatedAt: T }
const cases = [
  [
    'v3・event_001 の段階4（旧 home_002）',
    { version: 3, ...base, progress: { currentLocationId: 'home', completedEvents: [], activeEvent: { id: 'event_001', step: 4 } }, learning: { words: { vocab_001: { learnedAt: T, chapter: 1 } }, grammar: {}, conversations: { 'home_001#0': { choice: true, write: false } } }, stats: { xp: 12 } },
  ],
  [
    'v3・event_002 の段階7（旧 cafe_004）',
    { version: 3, ...base, progress: { currentLocationId: 'cafe', completedEvents: ['event_001'], activeEvent: { id: 'event_002', step: 7 } }, learning: { words: {}, grammar: {}, conversations: { 'home_001#0': { choice: true, write: false }, 'cafe_003#0': { choice: false, write: true } } }, stats: { xp: 80 } },
  ],
  [
    'v4（Phase 2）・event_002 の段階8（旧 cafe_006）',
    {
      version: 4,
      ...base,
      progress: { currentLocationId: 'cafe', completedEvents: ['event_001'], activeEvent: { id: 'event_002', step: 8 } },
      learning: { words: { vocab_001: { learnedAt: T, chapter: 1 } }, grammar: {}, conversations: { 'home_001#0': { choice: true, write: false }, 'home_003#0': { choice: true, write: false }, 'cafe_005#0': { choice: true, write: true } }, hangul: {}, listening: {} },
      stats: { xp: 120 },
    },
  ],
  [
    'v2（Phase 1 の形式）・event_001 の段階2（旧 home_001）',
    { version: 2, ...base, progress: { currentLocationId: 'home', completedEvents: [], activeEvent: { id: 'event_001', step: 2 } }, learning: { words: {}, grammar: {}, conversations: { home_001: { choice: true, write: false } } }, stats: { xp: 10 } },
  ],
]

await viewport(375, 760, true)
for (const [label, save] of cases) {
  await freshStart({ save })
  await click('つづきから')
  await sleep(300)
  const s = await saved()
  const inStory = await evaluate(`!!document.querySelector('.story')`)
  check(
    `${label}：v${SAVE_VERSION} に移行し、物語は第1章の最初（空港のおはなし）から。経験値・会話の記録は残る`,
    inStory && s.version === SAVE_VERSION && s.progress.activeEvent?.id === 'event_004' && s.stats.xp === save.stats.xp && Object.keys(s.learning.conversations).some((k) => k.startsWith('home_001')),
    `v${s.version} ${JSON.stringify(s.progress)} xp ${s.stats.xp}`,
  )
  await click('やめる')
  check(`${label}：施設の画面で「物語が新しくなりました」を知らせる`, (await evaluate(`document.querySelector('main').textContent`)).includes('物語が新しくなりました'))
  await click('わかりました')
  check(`${label}：お知らせは一度だけ（閉じたら消える）`, (await saved()).progress.notices.length === 0 && !(await evaluate(`document.querySelector('main').textContent`)).includes('物語が新しくなりました'))
}

// 古い会話（教材から消えた home_001・home_003・cafe_005）の往復も復習の記録に移すが、今日の復習には出さない
await freshStart({ save: cases[2][1] })
await click('つづきから')
await sleep(200)
const migrated = await saved()
check(
  'v4 → v5 → v6：覚えた単語と正解した往復（消えた会話のものも）を復習の記録に移す',
  ['word:vocab_001', 'turn:home_001#0', 'turn:home_003#0', 'turn:cafe_005#0'].every((k) => migrated.learning.review[k] !== undefined),
  JSON.stringify(Object.keys(migrated.learning.review)),
)
// 期限を過ぎたことにして、自宅から学習画面を開く
await evaluate(`(() => { const s = JSON.parse(localStorage.getItem('seoul-life:save')); for (const r of Object.values(s.learning.review)) r.due = '2000-01-01'; s.progress.activeEvent = null; s.progress.completedEvents = ['event_004', 'event_005']; s.progress.currentLocationId = 'home'; localStorage.setItem('seoul-life:save', JSON.stringify(s)) })()`)
await b.reload()
await click('つづきから')
await click('勉強する（復習・練習・ハングル）')
const reviewLabel = await evaluate(`[...document.querySelectorAll('main button')].map((x) => x.textContent.trim()).find((t) => t.startsWith('今日の復習')) ?? ''`)
check('教材から消えた会話の往復は、今日の復習に出さない（単語1問だけ）', reviewLabel === '今日の復習（1問）', reviewLabel)

b.finish()
