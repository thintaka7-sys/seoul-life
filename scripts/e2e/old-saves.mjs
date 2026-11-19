// 教材が差し替わる前のセーブデータ（古い会話IDの記録・ずれた段階の番号・旧形式 v2）で、
// 「つづきから」再開でき、そのイベントを最後まで進められることを確かめる。
// 選択肢はランダムに選ぶ（正解するまで選び直す）。
// 使い方: node scripts/e2e/old-saves.mjs <URL>

import { openBrowser, sleep } from './browser.mjs'

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
  const inEvent = await evaluate(`!!document.querySelector('.event-progress')`)
  check(`${label}：つづきからイベント画面で再開（段階 ${s.progress.activeEvent?.step}）`, inEvent && s.version === 3, JSON.stringify(s.progress))
  for (let i = 0; i < 80 && (await evaluate(`!!document.querySelector('.event-progress')`)); i++) {
    await evaluate(`(() => {
      const start = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === '会話をはじめる'); if (start) { start.click(); return }
      const n = document.querySelector('.dialogue__next'); if (n) { n.click(); return }
      const ch = [...document.querySelectorAll('.choice__button:not([disabled])')]; if (ch.length) { ch[Math.floor(Math.random() * ch.length)].click(); return }
      const tab = [...document.querySelectorAll('.mode-tab')].find(b => b.textContent.includes('選んで')); if (tab) { tab.click(); return }
      const b = [...document.querySelectorAll('main button')].find(b => ['次へ', '覚えた！', '閉じる'].includes(b.textContent.trim()) && !b.disabled); if (b) b.click() })()`)
    await sleep(150)
  }
  const after = await saved()
  check(
    `${label}：そのイベントを最後まで進められる・古い会話の記録は残る`,
    after.progress.activeEvent === null && Object.keys(after.learning.conversations).some((k) => k.startsWith('home_001')),
    JSON.stringify(after.progress),
  )
}

b.finish()
