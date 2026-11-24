// Phase 4 区切り1：セーブデータの書き出し・読み込み（GAME_SPEC 10-2）と PWA（10-6）を、スマホ幅とPC幅で確かめる。
// - 書き出し：ダウンロードのリンクを横取りして中身を読む（ヘッドレスは指の端末ではないので、共有シートではなくダウンロードになる）
// - 読み込み：書き出したファイルを e2e-output に置き、ファイルの選択に入れる（DOM.setFileInputFiles）
// - PWA：manifest・Service Worker の登録、オフラインで開き直してもタイトルが出ること、iPhone の案内
// 新しい版の知らせ（「更新する」）は、新しい版を公開しないと出ないので、ここでは確かめない（単体テストと実機）

import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { FAST_SETTINGS, SAVE_VERSION, openBrowser, saveAtHome, sleep } from './browser.mjs'

const b = await openBrowser('phase4')
const { send, evaluate, check, click, freshStart, viewport, load, reload, url, outDir, shot, layoutCheck, mainText } = b

const DAY = 24 * 60 * 60 * 1000
const old = new Date(Date.now() - 30 * DAY).toISOString()
/** 第1章を終えたデータ（30日前に遊び始めた。まだ書き出していない） */
const PLAYED = saveAtHome({
  createdAt: old,
  progress: { completedEvents: ['event_004', 'event_005', 'event_001', 'event_006'] },
  learning: { words: { vocab_001: { learnedAt: old, chapter: 1 }, vocab_002: { learnedAt: old, chapter: 1 } } },
  stats: { xp: 345 },
  daily: { stamps: ['2026-11-20', '2026-11-21', '2026-11-22'] },
})
/** この端末の設定（端末ごとの値も入れておく。書き出しに入らないことを確かめる） */
const DEVICE_SETTINGS = { ...FAST_SETTINGS, furigana: 'tap', bgmVolume: 35, slowSpeech: { rate: 0.35, measuredAt: old }, quietAfterVoiceInput: true }

// ダウンロードのリンクを押したら、開かずに記録する（中身はあとで fetch で読む）
await send('Page.addScriptToEvaluateOnNewDocument', {
  source: `(() => {
    window.__downloads = []
    const click = HTMLAnchorElement.prototype.click
    HTMLAnchorElement.prototype.click = function () {
      if (this.download) { window.__downloads.push({ name: this.download, href: this.href }); return }
      return click.call(this)
    }
  })()`,
})

const settingsText = () => evaluate(`document.querySelector('fieldset[aria-label="セーブデータ"]')?.innerText ?? ''`)
const savedSettings = () => evaluate(`JSON.parse(localStorage.getItem('seoul-life:settings') ?? 'null')`)

/** 書き出しファイルを、ファイルの選択に入れる */
async function chooseFile(path) {
  const { result } = await send('Runtime.evaluate', { expression: `document.querySelector('[data-testid="import-file"]')` })
  await send('DOM.setFileInputFiles', { files: [path], objectId: result.objectId })
  await sleep(500)
}

for (const [W, H] of [
  [375, 800],
  [1280, 900],
]) {
  const P = `[${W}px]`
  await viewport(W, H, W < 600)

  // ---------- セーブデータがないとき ----------
  await freshStart({ settings: FAST_SETTINGS })
  check(`${P} タイトルの表示は「開発版（Phase 4）」`, (await evaluate(`document.querySelector('.build-label')?.textContent`)) === '開発版（Phase 4）')
  await click('設定')
  await sleep(300)
  check(`${P} セーブデータがないときは、書き出せない（理由を出す）`, (await evaluate(`[...document.querySelectorAll('button')].find((b) => b.textContent === 'ファイルに書き出す')?.disabled`)) === true && (await settingsText()).includes('まだセーブデータがありません'), await settingsText())
  check(`${P} 設定に「ホーム画面に追加する」の案内がある`, (await mainText()).includes('ホーム画面に追加する'))
  await layoutCheck(`${P} 設定画面（セーブデータなし）`)

  // ---------- 書き出しの案内（自宅） ----------
  await freshStart({ settings: DEVICE_SETTINGS, save: PLAYED })
  await b.continueToHome()
  await sleep(300)
  const reminder = () => evaluate(`[...document.querySelectorAll('.notice')].map((n) => n.textContent).find((t) => t.includes('書き出しておきませんか')) ?? ''`)
  check(`${P} 自宅：遊び始めて14日以上、まだ書き出していなければ、書き出しを案内する`, (await reminder()).includes('まだファイルに書き出していません'), await reminder())
  if (W === 375) await shot('375-01-home-reminder')
  await click('あとで')
  check(`${P} 自宅：「あとで」で案内を消す`, (await reminder()) === '')
  await click('外に出る（マップへ）')
  await sleep(200)
  await evaluate(`[...document.querySelectorAll('.town-map button')].find((b) => b.textContent.includes('自宅'))?.click()`)
  await sleep(300)
  check(`${P} 自宅：「あとで」の後は、ページを開き直すまで出さない`, (await reminder()) === '')

  // ---------- 書き出す（設定画面） ----------
  await click('設定')
  await sleep(300)
  check(`${P} 設定：まだ書き出していないことを出す`, (await settingsText()).includes('まだ書き出していません'), await settingsText())
  await click('ファイルに書き出す')
  await sleep(500)
  const download = await evaluate(`(async () => { const d = window.__downloads.at(-1); if (!d) return null; return { name: d.name, text: await (await fetch(d.href)).text() } })()`)
  const file = download === null ? null : JSON.parse(download.text)
  check(`${P} 書き出し：seoul-life-日付-時刻.json の名前でファイルを作る`, download !== null && /^seoul-life-\d{8}-\d{4}\.json$/.test(download.name), JSON.stringify(download?.name))
  check(
    `${P} 書き出し：中身はセーブデータ（v${SAVE_VERSION}）と設定。端末ごとの値（ゆっくりの速さ・話した後に止めるか・書き出した日）は入れない`,
    file !== null && file.format === 'seoul-life-export' && file.exportVersion === 1 && file.save.version === SAVE_VERSION && file.save.stats.xp === 345 && file.settings.furigana === 'tap' && file.settings.bgmVolume === 35 && !('slowSpeech' in file.settings) && !('quietAfterVoiceInput' in file.settings) && !('lastExportAt' in file.settings),
    JSON.stringify(file?.settings),
  )
  check(`${P} 書き出し：「書き出しました」と出し、最後に書き出した日時を出す`, (await settingsText()).includes('書き出しました') && (await settingsText()).includes('最後に書き出した日時'), await settingsText())
  check(`${P} 書き出し：書き出した日時を設定（v7）に保存する`, await evaluate(`(() => { const s = JSON.parse(localStorage.getItem('seoul-life:settings')); return s.version === 7 && typeof s.lastExportAt === 'string' })()`))
  if (W === 375) await shot('375-02-settings-exported')
  await layoutCheck(`${P} 設定画面（書き出した後）`)
  await click('戻る')
  await sleep(300)
  check(`${P} 自宅：書き出した後は、案内を出さない`, (await reminder()) === '')

  const exportPath = join(outDir, `export-${W}.json`)
  writeFileSync(exportPath, download?.text ?? '')
  const brokenPath = join(outDir, 'broken.json')
  writeFileSync(brokenPath, JSON.stringify({ hello: 'world' }))

  // ---------- 別のブラウザ（何もない状態）で読み込む ----------
  await freshStart({ settings: { ...FAST_SETTINGS, furigana: 'always', slowSpeech: null, quietAfterVoiceInput: false } })
  check(`${P} 読み込む前：「つづきから」は押せない`, await evaluate(`[...document.querySelectorAll('button')].find((b) => b.textContent === 'つづきから')?.disabled === true`))
  await click('設定')
  await sleep(300)
  await chooseFile(brokenPath)
  check(`${P} 読み込み：ほかのファイルは読み込まず、理由を出す`, (await settingsText()).includes('このゲームで書き出したファイルではないようです'), await settingsText())
  await chooseFile(exportPath)
  const confirmText = await evaluate(`document.querySelector('.import-save__confirm')?.innerText ?? ''`)
  check(`${P} 読み込み：要約（終えた章・覚えた単語・経験値・スタンプ）を出して確かめる`, confirmText.includes('第1章「韓国に到着」まで') && confirmText.includes('2語') && confirmText.includes('345') && confirmText.includes('3個'), confirmText)
  if (W === 375) await shot('375-03-import-confirm')
  await layoutCheck(`${P} 読み込みの確認`)
  await click('このデータで始める')
  await sleep(400)
  check(`${P} 読み込み：タイトルに「読み込みました」を出し、「つづきから」を押せる`, (await mainText()).includes('セーブデータを読み込みました') && (await evaluate(`[...document.querySelectorAll('button')].find((b) => b.textContent === 'つづきから')?.disabled === false`)), await mainText())
  const restored = await b.saved()
  check(`${P} 読み込み：セーブデータを保存する（経験値・終えたイベント・覚えた単語）`, restored?.stats.xp === 345 && restored.progress.completedEvents.includes('event_006') && Object.keys(restored.learning.words).length === 2, JSON.stringify(restored?.stats))
  const s2 = await savedSettings()
  check(`${P} 読み込み：設定は書き出したもの。端末ごとの値は、この端末のまま`, s2?.furigana === 'tap' && s2.bgmVolume === 35 && s2.slowSpeech === null && s2.quietAfterVoiceInput === false && s2.lastExportAt === null, JSON.stringify(s2))
  await b.continueToHome()
  check(`${P} 読み込んだデータで、つづきから遊べる（自宅・経験値 345）`, (await mainText()).includes('345'), (await mainText()).slice(0, 200))

  // ---------- いまのデータがあるときに読み込む：上書きの前に退避する ----------
  await evaluate(`(() => { const s = JSON.parse(localStorage.getItem('seoul-life:save')); s.stats.xp = 999; localStorage.setItem('seoul-life:save', JSON.stringify(s)) })()`)
  await reload()
  await click('設定')
  await sleep(300)
  await chooseFile(exportPath)
  check(`${P} 上書きの確認：いまのデータは残しておくことを伝える`, (await evaluate(`document.querySelector('.import-save__confirm')?.innerText ?? ''`)).includes('いまのデータはこのブラウザの中に残しておきます'))
  await click('このデータで上書きする')
  await sleep(400)
  const backups = await evaluate(`Object.keys(localStorage).filter((k) => k.startsWith('seoul-life:save-backup:') && k.endsWith(':before-import')).map((k) => JSON.parse(localStorage.getItem(k)).stats.xp)`)
  check(`${P} 上書き：前のデータ（経験値 999）を、退避のキー（:before-import）に残す`, backups.includes(999), JSON.stringify(backups))
  check(`${P} 上書き：読み込んだデータ（経験値 345）になる`, (await b.saved())?.stats.xp === 345)

  // ---------- 壊れたセーブデータの画面から読み込む ----------
  await evaluate(`localStorage.setItem('seoul-life:save', '{broken')`)
  await reload()
  check(`${P} 壊れたデータの画面に「ファイルから読み込む」がある`, (await mainText()).includes('ファイルから読み込む'), (await mainText()).slice(0, 200))
  await chooseFile(exportPath)
  await click('このデータで始める')
  await sleep(400)
  check(`${P} 壊れたデータの画面から読み込んで、つづきから遊べる`, (await b.saved())?.stats.xp === 345 && (await mainText()).includes('セーブデータを読み込みました'))
}

// ---------- PWA：manifest と Service Worker ----------
await viewport(375, 800, true)
await freshStart({ settings: FAST_SETTINGS, save: PLAYED })
const manifest = await evaluate(`(async () => { const l = document.querySelector('link[rel="manifest"]'); if (!l) return null; return await (await fetch(l.href)).json() })()`)
check(
  'PWA：manifest（名前「서울에서 살기」・standalone・縦向き・/seoul-life/ の範囲・アイコン3つ）',
  manifest !== null && manifest.short_name === '서울에서 살기' && manifest.display === 'standalone' && manifest.orientation === 'portrait' && manifest.scope === '/seoul-life/' && manifest.icons.length === 3,
  JSON.stringify(manifest),
)
const icons = await evaluate(`Promise.all(['icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png'].map(async (p) => (await fetch(p)).status))`)
check('PWA：アイコン（apple-touch-icon を含む）を読める', icons.every((s) => s === 200), JSON.stringify(icons))
check('PWA：iPhone 用の指定（apple-touch-icon・apple-mobile-web-app-title）', await evaluate(`!!document.querySelector('link[rel="apple-touch-icon"]') && document.querySelector('meta[name="apple-mobile-web-app-title"]')?.content === '서울에서 살기'`))
const sw = await evaluate(`(async () => { const r = await Promise.race([navigator.serviceWorker.ready, new Promise((res) => setTimeout(() => res(null), 10000))]); return r === null ? null : { scope: r.scope, active: r.active?.state ?? null } })()`)
check('PWA：Service Worker を登録する（/seoul-life/ の範囲）', sw !== null && sw.scope.endsWith('/seoul-life/') && sw.active === 'activated', JSON.stringify(sw))
await reload()
check('PWA：開き直すと、Service Worker がページを受け持つ', await evaluate(`navigator.serviceWorker.controller !== null`))
const cached = await evaluate(`(async () => { const names = await caches.keys(); const urls = (await Promise.all(names.map(async (n) => (await (await caches.open(n)).keys()).map((r) => new URL(r.url).pathname)))).flat(); return { bg: urls.some((u) => u.endsWith('/assets/bg/home.webp')), sfx: urls.some((u) => u.includes('/audio/sfx/')), bgm: urls.some((u) => u.includes('/audio/bgm_')), n: urls.length } })()`)
check('PWA：絵・効果音を端末に保存し、BGM は保存しない', cached.bg && cached.sfx && !cached.bgm, JSON.stringify(cached))
await send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 })
await load(url)
check('PWA：オフラインで開き直しても、タイトルが出る', (await evaluate(`document.querySelector('.title__ko')?.textContent ?? ''`)) === '서울에서 살기' && (await evaluate(`navigator.onLine`)) === false)
await b.continueToHome()
await sleep(500)
const bgLoaded = await evaluate(`(() => { const img = [...document.images].find((i) => i.src.includes('/bg/home.webp')); return img ? img.complete && img.naturalWidth > 0 : null })()`)
check('PWA：オフラインでも、つづきから自宅に入れて、背景の絵が出る', (await mainText()).includes('勉強する') && bgLoaded !== false, `bg ${bgLoaded}`)
await shot('375-04-offline-home')
await send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 })

// ---------- iPhone のときの「ホーム画面に追加する」の案内 ----------
await send('Emulation.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.1 Mobile/15E148 Safari/604.1', platform: 'iPhone' })
await load(url)
await click('設定')
await sleep(300)
const install = await evaluate(`document.querySelector('fieldset[aria-label="ホーム画面に追加する"]')?.innerText ?? ''`)
check('iPhone：共有ボタン →「ホーム画面に追加」の手順と、Safari とは保存が別なことを出す', install.includes('共有ボタン') && install.includes('ホーム画面に追加') && install.includes('保存場所が別'), install)
await shot('375-05-install-iphone')

b.finish()
