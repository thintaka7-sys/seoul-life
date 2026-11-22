// 画面ごとの背景と見た目を確かめる（スマホ幅とPC幅）。
// - タイトル：マップの絵を背景に敷く／マップ画面とそこから開いた設定：敷かない（GAME_SPEC 6-1）
// - 施設とそこから開いた設定：施設の背景
// - 図鑑の「学んだ単語：n / n 語」が板に載っている（QA_REPORT BUG-001）。イベントの中では板を重ねない
// - 検索サイトに載せない指定（robots の noindex）がある
// 使い方: node scripts/e2e/screens.mjs <URL>

import { readFileSync, readdirSync } from 'node:fs'
import { openBrowser, saveAtHome, sleep } from './browser.mjs'

const b = await openBrowser('screens')
const { evaluate, click, heading, viewport, view, freshStart, check, layoutCheck } = b

const T = '2026-11-19T10:00:00.000Z'
const dataDir = new URL('../../src/data/', import.meta.url)
const readDir = (d) => readdirSync(new URL(`${d}/`, dataDir)).filter((f) => f.endsWith('.json')).sort().flatMap((f) => JSON.parse(readFileSync(new URL(`${d}/${f}`, dataDir), 'utf8')))
const eventIds = readDir('events').map((e) => e.id)
const vocabIds = readDir('vocabulary').map((v) => v.id)
// カフェが開いたところ（カフェを開くイベントまで終えた）
const opener = readDir('events').find((e) => (e.unlocks ?? []).includes('cafe')).id
const newSave = saveAtHome({ progress: { completedEvents: eventIds.slice(0, eventIds.indexOf(opener) + 1) } })
const words = Object.fromEntries(vocabIds.map((id) => [id, { learnedAt: T, chapter: 1 }]))
// event_003 の段階2（図鑑の段階）の途中
const dictSave = saveAtHome({ progress: { completedEvents: eventIds.filter((id) => id !== 'event_003'), activeEvent: { id: 'event_003', step: 2 } }, learning: { words }, stats: { xp: 100 } })

const backdrop = () => evaluate(`(() => { const a = document.querySelector('.app'); const img = document.querySelector('.backdrop__sharp'); return { cls: a.classList.contains('app--backdrop'), src: img ? img.getAttribute('src') : null } })()`)
const dictCount = () => evaluate(`(() => { const p = document.querySelector('.dict-count'); const cs = getComputedStyle(p); return { bg: cs.backgroundColor, pad: cs.paddingLeft, text: p.textContent.trim() } })()`)

for (const [w, h, m] of [
  [375, 760, true],
  [1280, 800, false],
]) {
  await viewport(w, h, m)

  // --- 背景 ---
  await freshStart({ save: newSave })
  let bd = await backdrop()
  check(`${w} タイトル：マップの絵を背景に敷く`, bd.cls && (bd.src ?? '').includes('map/town'), JSON.stringify(bd))
  await click('つづきから')
  await sleep(300)
  bd = await backdrop()
  check(`${w} 自宅：自宅の背景`, bd.cls && (bd.src ?? '').includes('bg/home'), JSON.stringify(bd))
  await click('外に出る（マップへ）')
  await sleep(300)
  bd = await backdrop()
  check(`${w} マップ画面：背景を敷かない`, (await heading()) === '街のマップ' && !bd.cls && bd.src === null, JSON.stringify(bd))
  check(`${w} マップ画面：画面の中のマップの絵は表示`, await evaluate(`!!document.querySelector('.town-map img')`))
  await view(`${w}-main`)
  await click('設定')
  await sleep(300)
  bd = await backdrop()
  check(`${w} マップから開いた設定：背景を敷かない`, (await heading()) === '設定' && !bd.cls && bd.src === null, JSON.stringify(bd))
  await layoutCheck(`${w} 設定`)
  await click('戻る')
  await sleep(300)
  check(`${w} 設定から戻るとマップ`, (await heading()) === '街のマップ')
  await click('カフェ', { exact: false, within: '.town-map' })
  await sleep(300)
  bd = await backdrop()
  check(`${w} カフェ：カフェの背景`, bd.cls && (bd.src ?? '').includes('bg/cafe'), JSON.stringify(bd))
  await click('設定')
  await sleep(300)
  bd = await backdrop()
  check(`${w} カフェから開いた設定：カフェの背景のまま`, bd.cls && (bd.src ?? '').includes('bg/cafe'), JSON.stringify(bd))

  // --- 図鑑 ---
  await freshStart({ save: dictSave })
  await click('つづきから')
  await sleep(300)
  let dc = await dictCount()
  check(`${w} イベント中の図鑑：「学んだ単語」に板を重ねない`, dc.bg === 'rgba(0, 0, 0, 0)' && dc.pad === '0px', JSON.stringify(dc))
  await click('やめる')
  await click('図鑑を見る')
  await sleep(300)
  dc = await dictCount()
  check(`${w} 図鑑画面：「学んだ単語」を板に載せる（BUG-001）`, dc.bg !== 'rgba(0, 0, 0, 0)' && dc.pad === '14px' && dc.text.includes(`${vocabIds.length} / ${vocabIds.length}`), JSON.stringify(dc))
  await layoutCheck(`${w} 図鑑`)
  await view(`${w}-dictionary`)
}

const robots = await evaluate(`document.querySelector('meta[name="robots"]')?.getAttribute('content') ?? ''`)
check('検索サイトに載せない（robots: noindex, nofollow）', robots.includes('noindex') && robots.includes('nofollow'), robots)

b.finish()
