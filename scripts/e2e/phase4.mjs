// Phase 4 区切り1：セーブデータの書き出し・読み込み（GAME_SPEC 10-2）と PWA（10-6）を、スマホ幅とPC幅で確かめる。
// - 書き出し：ダウンロードのリンクを横取りして中身を読む（ヘッドレスは指の端末ではないので、共有シートではなくダウンロードになる）
// - 読み込み：書き出したファイルを e2e-output に置き、ファイルの選択に入れる（DOM.setFileInputFiles）
// - PWA：manifest・Service Worker の登録、オフラインで開き直してもタイトルが出ること、iPhone の案内
// 新しい版の知らせ（「更新する」）は、新しい版を公開しないと出ないので、ここでは確かめない（単体テストと実機）

import { readFileSync, writeFileSync } from 'node:fs'
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

// ---------- 区切り2：レベル・コイン・実績・スタンプの節目 ----------
const balance = JSON.parse(readFileSync('src/data/game/balance.json', 'utf8'))
const achievementData = JSON.parse(readFileSync('src/data/achievements/achievements.json', 'utf8'))
for (const [W, H] of [
  [375, 800],
  [1280, 900],
]) {
  const P = `[${W}px]`
  await viewport(W, H, W < 600)

  // v6 のセーブデータ（第1章を終えた・スタンプ3個）：これまでの分をさかのぼって付け、お知らせを一度だけ出す
  const { achievements: _a, home: _h, ...rest } = PLAYED
  const v6 = { ...rest, version: 6, stats: { xp: 345 }, daily: { stamps: ['2026-11-20', '2026-11-21', '2026-11-22'] } }
  await freshStart({ settings: { ...FAST_SETTINGS, lastExportAt: new Date().toISOString() }, save: v6 })
  await b.continueToHome()
  await sleep(300)
  const s7 = await b.saved()
  check(`${P} v6 → v7：これまでの分のコイン（イベント・章・実績・節目）を付ける`, s7?.version === 7 && s7.stats.coins > 0 && s7.stats.levelShown === 3 && s7.achievements.achievement_005 !== undefined && s7.daily.rewards['3'] !== undefined, JSON.stringify(s7?.stats))
  const intro = await evaluate(`[...document.querySelectorAll('.notice')].map((n) => n.textContent).find((t) => t.includes('レベル・コイン・実績が加わりました')) ?? ''`)
  check(`${P} v6 → v7：自宅に「レベル・コイン・実績が加わりました」と、達成した実績の数・コインを出す`, intro.includes(`実績を${Object.keys(s7?.achievements ?? {}).length}個`) && intro.includes(`コインを${s7?.stats.coins}枚`), intro)
  check(`${P} v6 → v7：さかのぼった分は、レベルアップ・実績の知らせ（トースト）を出さない`, !(await evaluate(`!!document.querySelector('.toast')`)))
  const hud = await evaluate(`document.querySelector('.hud__xp')?.textContent ?? ''`)
  check(`${P} 上部：Lv.3・経験値 345 / 次のレベル・コイン`, hud.includes('Lv.3') && hud.includes('345') && hud.includes(`/ ${balance.levels.thresholds[3]}`) && hud.includes(`コイン ${s7?.stats.coins}`), hud)
  check(`${P} 上部：次のレベルまでの棒`, await evaluate(`(() => { const b = document.querySelector('.hud__bar'); return !!b && Number(b.getAttribute('aria-valuenow')) === 345 - ${balance.levels.thresholds[2]} })()`))
  if (W === 375) await shot('375-06-home-progression')
  await click('わかりました', { within: '.notice' })
  await sleep(200)
  check(`${P} お知らせは「わかりました」で消え、保存する`, (await b.saved())?.progress.notices.includes('progressionIntroduced') === false)

  // 実績の画面
  await click('実績')
  await sleep(300)
  const list = await evaluate(`[...document.querySelectorAll('.achievement')].map((li) => ({ id: li.dataset.id, done: li.classList.contains('achievement--done'), text: li.innerText }))`)
  const done = list.filter((x) => x.done).length
  check(`${P} 実績：${achievementData.length}個を並べ、達成した数を出す`, list.length === achievementData.length && (await mainText()).includes(`達成した実績：${done} / ${achievementData.length}`), `${list.length} ${done}`)
  check(`${P} 実績：第1章のクリアは達成、まだの実績は進み具合（いま n / m）`, list.find((x) => x.id === 'achievement_005')?.done === true && (list.find((x) => x.id === 'achievement_004')?.text ?? '').includes('いま 2 / 100'), JSON.stringify(list.slice(0, 5)))
  if (W === 375) await shot('375-07-achievements')
  await layoutCheck(`${P} 実績の画面`)
  await click('戻る')
  await sleep(200)

  // スタンプカードの節目
  await click('スタンプカード')
  await sleep(300)
  const ms = await evaluate(`document.querySelector('section[aria-label="節目のごほうび"]')?.innerText ?? ''`)
  check(`${P} スタンプカード：受け取った節目（3個）と、次の節目までの数（7個まであと4個）`, ms.includes('7個）まで、あと4個') && (await evaluate(`document.querySelector('.milestone--done')?.textContent ?? ''`)).includes('3個'), ms)
  if (W === 375) await shot('375-08-stamp-milestones')
  await click('戻る')
  await sleep(200)

  // レベルアップの知らせ：知らせ済みのレベルより経験値が上がっていたら、次の操作で知らせる
  await freshStart({ settings: { ...FAST_SETTINGS, lastExportAt: new Date().toISOString() }, save: saveAtHome({ stats: { xp: 260, coins: 0, levelShown: 1 } }) })
  await click('つづきから')
  await sleep(200)
  const toast = await evaluate(`document.querySelector('.toast')?.textContent ?? ''`)
  check(`${P} レベルが上がったら「レベル3になりました！」と出す`, toast.includes('レベル3になりました！'), toast)
  check(`${P} レベルアップの後は、知らせ済みのレベルを保存する`, (await b.saved())?.stats.levelShown === 3)
}

// ---------- 区切り3：自宅の家具（部屋を飾る・カタログ・持ち物・節目の家具） ----------
const furnitureData = JSON.parse(readFileSync('src/data/furniture/furniture.json', 'utf8'))
const room = balance.room
const name = (id) => furnitureData.find((f) => f.id === id)?.nameJa ?? id
const allAchieved = Object.fromEntries(achievementData.map((a) => [a.id, { at: old }]))
const CH1 = ['event_004', 'event_005', 'event_001', 'event_006']
const settled = (patch = {}) =>
  saveAtHome({
    ...patch,
    progress: { completedEvents: CH1, ...patch.progress },
    stats: { xp: 300, coins: 500, levelShown: 3, ...patch.stats },
    achievements: allAchieved,
  })
/** 部屋の絵（.room）に対する、家具の位置と大きさ（%） */
const furnitureRect = (scope, id) =>
  evaluate(`(() => {
    const r = document.querySelector(${JSON.stringify(scope)} + ' .room')?.getBoundingClientRect()
    const f = document.querySelector(${JSON.stringify(scope)} + ' [data-furniture="${id}"]')?.getBoundingClientRect()
    if (!r || !f) return null
    return { x: (f.left - r.left) / r.width * 100, y: (f.top - r.top) / r.height * 100, w: f.width / r.width * 100, h: f.height / r.height * 100 }
  })()`)
const near = (rect, slot) => rect !== null && Math.abs(rect.x - slot.x) < 0.6 && Math.abs(rect.y - slot.y) < 0.6 && Math.abs(rect.w - slot.w) < 0.6 && Math.abs(rect.h - slot.h) < 0.6
const slotOf = (id) => room.slots.find((s) => s.id === id)

for (const [W, H] of [
  [375, 800],
  [1280, 900],
]) {
  const P = `[${W}px]`
  await viewport(W, H, W < 600)

  // 引っ越したばかり（お隣さんへのあいさつの前）：段ボールのある部屋で、飾れない
  await freshStart({ settings: { ...FAST_SETTINGS, lastExportAt: new Date().toISOString() }, save: saveAtHome({ stats: { levelShown: 1 }, achievements: allAchieved }) })
  await b.continueToHome()
  await sleep(300)
  const movingBg = await evaluate(`document.querySelector('.backdrop__sharp')?.getAttribute('src') ?? ''`)
  check(`${P} 引っ越したばかり：自宅は段ボールのある部屋（home_moving）で、家具を重ねない`, movingBg.includes('bg/home_moving') && !(await evaluate(`!!document.querySelector('.backdrop__room')`)), movingBg)
  check(`${P} 引っ越したばかり：「部屋を飾る」は出さない`, !(await mainText()).includes('部屋を飾る'))

  // 引っ越しを終えた（第1章を終えた）：コイン 500・Lv.3
  await freshStart({ settings: { ...FAST_SETTINGS, lastExportAt: new Date().toISOString() }, save: settled() })
  await b.continueToHome()
  await sleep(300)
  check(`${P} 引っ越しの後：自宅の背景は部屋の絵（家具を重ねる入れ物）`, await evaluate(`document.querySelector('.backdrop__room .room')?.dataset.roomItems === '0'`))
  await click('部屋を飾る（家具）')
  await sleep(300)
  check(`${P} 部屋を飾る：部屋の絵と6か所の枠、コイン・レベル`, (await evaluate(`document.querySelectorAll('.room-view .room__slot').length`)) === 6 && (await evaluate(`document.querySelector('.room-status')?.textContent ?? ''`)).includes('コイン 500'), await evaluate(`document.querySelector('.room-status')?.textContent ?? ''`))
  check(`${P} 部屋を飾る：画面の後ろには部屋を敷かない（二重にしない）`, !(await evaluate(`!!document.querySelector('.backdrop')`)))
  check(`${P} 飾る：まだ持っていなければ「カタログを見る」`, (await mainText()).includes('まだ持っていません'))
  if (W === 375) await shot('375-09-room-empty')

  // カタログ
  await click('カタログ')
  await sleep(200)
  const catalog = await evaluate(`[...document.querySelectorAll('.catalog-item')].map((li) => ({ id: li.dataset.id, text: li.innerText, buy: !!li.querySelector('button') }))`)
  const row = (id) => catalog.find((c) => c.id === id)
  check(`${P} カタログ：21点（売る17点と、節目でもらえる4点）`, catalog.length === 21, String(catalog.length))
  check(`${P} カタログ：レベルが足りれば「買う」、足りなければ「Lv.4 で買えます」、節目専用は「スタンプ7個の節目でもらえます」`, row('furniture_001')?.buy === true && (row('furniture_003')?.text ?? '').includes('Lv.4 で買えます') && (row('furniture_018')?.text ?? '').includes('スタンプ7個の節目でもらえます') && row('furniture_018')?.buy === false, JSON.stringify([row('furniture_003'), row('furniture_018')]))
  check(`${P} カタログ：家具18の名前は「${name('furniture_018')}」`, (row('furniture_018')?.text ?? '').includes('チョガクポ（つぎはぎの布）の壁かけ'))
  if (W === 375) await shot('375-10-catalog')
  await layoutCheck(`${P} カタログ`)
  await click('買う', { within: 'li[data-id="furniture_001"]' })
  await sleep(300)
  let saved = await b.saved()
  check(`${P} 買う：コインが減り（500 → 420）、空いた場所（壁（左））に置く`, saved?.stats.coins === 420 && saved?.home.owned.furniture_001 !== undefined && saved?.home.placement.wall_left === 'furniture_001' && (await mainText()).includes('買って、壁（左）に置きました'), JSON.stringify(saved?.home))
  check(`${P} 買う：カタログでは「持っています」`, (await evaluate(`document.querySelector('li[data-id="furniture_001"]')?.innerText ?? ''`)).includes('持っています'))
  await click('買う', { within: 'li[data-id="furniture_002"]' })
  await sleep(300)
  saved = await b.saved()
  check(`${P} 同じ場所に置いてあれば、買っても置き換えない（持ち物に入る）`, saved?.stats.coins === 320 && saved?.home.placement.wall_left === 'furniture_001' && (await mainText()).includes('「飾る」で'), JSON.stringify(saved?.home.placement))

  // 飾る：置き換える・外す
  await click('飾る')
  await sleep(200)
  await click(`✓ ${name('furniture_001')}`)
  await sleep(100)
  await click(name('furniture_002'))
  await sleep(200)
  saved = await b.saved()
  check(`${P} 飾る：壁（左）をポスターに置き換え、部屋の絵に出す`, saved?.home.placement.wall_left === 'furniture_002' && (await evaluate(`!!document.querySelector('.room-view [data-furniture="furniture_002"]') && !document.querySelector('.room-view [data-furniture="furniture_001"]')`)))
  check(`${P} 飾る：家具は場所の枠の位置・大きさに出る`, near(await furnitureRect('.room-view', 'furniture_002'), slotOf('wall_left')), JSON.stringify(await furnitureRect('.room-view', 'furniture_002')))
  await click('何も置かない')
  await sleep(200)
  check(`${P} 飾る：「何も置かない」で外す（持ち物には残る）`, (await b.saved())?.home.placement.wall_left === undefined && (await b.saved())?.home.owned.furniture_002 !== undefined)
  await click(name('furniture_001'))
  await sleep(200)
  if (W === 375) await shot('375-11-room-decorated')
  await layoutCheck(`${P} 部屋を飾る`)

  // 持ち物
  await click('持ち物')
  await sleep(200)
  const items = await evaluate(`document.querySelector('section[aria-label="持ち物"]')?.innerText ?? ''`)
  check(`${P} 持ち物：持っている家具（2 / 21）と、置いているか`, items.includes('持っている家具：2 / 21') && items.includes('壁（左）に置いています') && items.includes('しまってあります'), items)
  await click('戻る')
  await sleep(300)

  // 自宅の背景に、置いた家具が重なる（絵と同じ切り取り方）
  const fit = await evaluate(`(() => {
    const c = document.querySelector('.backdrop__room')?.getBoundingClientRect()
    const r = document.querySelector('.backdrop__room .room')?.getBoundingClientRect()
    if (!c || !r) return null
    return { inside: r.left >= c.left - 1 && r.right <= c.right + 1 && r.bottom <= c.bottom + 1, top: Math.abs(r.top - c.top) < 1, centered: Math.abs((r.left + r.width / 2) - (c.left + c.width / 2)) < 1, fills: Math.abs(r.width - c.width) < 1 || Math.abs(r.height - c.height) < 1 }
  })()`)
  check(`${P} 自宅の背景：部屋の絵は切り取らずに全体を見せる（上にそろえ、左右の中央）`, fit?.inside === true && fit?.top === true && fit?.centered === true && fit?.fills === true, JSON.stringify(fit))
  check(`${P} 自宅の背景：置いた家具（壁かけ時計）が、壁（左）の位置に重なる`, near(await furnitureRect('.backdrop__room', 'furniture_001'), slotOf('wall_left')), JSON.stringify(await furnitureRect('.backdrop__room', 'furniture_001')))
  if (W === 375) await shot('375-12-home-with-furniture')

  // おはなしの自宅の場面にも重ねる（story_004）。引っ越したばかりの場面（story_003）には重ねない
  await freshStart({
    settings: { ...FAST_SETTINGS, lastExportAt: new Date().toISOString() },
    save: settled({ home: { owned: { furniture_016: { at: old } }, placement: { rug: 'furniture_016' } }, progress: { storiesSeen: { story_003: { seenAt: old }, story_004: { seenAt: old } } } }),
  })
  await b.continueToHome()
  await click('おはなしのアルバム')
  await sleep(200)
  const titles = JSON.parse(readFileSync('src/data/stories/ch01.json', 'utf8'))
  await click(titles.find((s) => s.id === 'story_004').titleJa)
  await sleep(500)
  check(`${P} おはなし（story_004）の自宅の場面にも、置いた家具（ラグ）を重ねる`, await evaluate(`!!document.querySelector('.backdrop__room [data-furniture="furniture_016"]')`))
  await load(url)
  await b.continueToHome()
  await click('おはなしのアルバム')
  await sleep(200)
  await click(titles.find((s) => s.id === 'story_003').titleJa)
  await sleep(500)
  const bg3 = await evaluate(`document.querySelector('.backdrop__sharp')?.getAttribute('src') ?? ''`)
  check(`${P} おはなし（story_003）は引っ越したばかりの部屋で、家具を重ねない`, bg3.includes('bg/home_moving') && !(await evaluate(`!!document.querySelector('.backdrop__room')`)), bg3)

  // スタンプ7個の節目：コインと、節目専用の家具（空いていれば置く）
  const stamps = Array.from({ length: 7 }, (_, i) => `2026-11-${String(i + 1).padStart(2, '0')}`)
  await freshStart({ settings: { ...FAST_SETTINGS, lastExportAt: new Date().toISOString() }, save: settled({ daily: { stamps, rewards: { 3: { at: old } } } }) })
  await click('つづきから')
  await sleep(300)
  const gift = await evaluate(`document.querySelector('.toast')?.textContent ?? ''`)
  saved = await b.saved()
  check(`${P} スタンプ7個の節目：「家具「${name('furniture_018')}」をもらいました」と出し、壁（左）に置く`, gift.includes(`家具「${name('furniture_018')}」をもらいました`) && saved?.home.owned.furniture_018 !== undefined && saved?.home.placement.wall_left === 'furniture_018', gift)
  await click('スタンプカード')
  await sleep(300)
  const ms3 = await evaluate(`document.querySelector('section[aria-label="節目のごほうび"]')?.innerText ?? ''`)
  check(`${P} スタンプカード：節目のごほうびに、節目専用の家具を出す`, ms3.includes(`7個：コイン 50 と 家具「${name('furniture_018')}」`) && ms3.includes(`30個：コイン 120 と 家具「${name('furniture_019')}」`), ms3)
  await click('戻る')
  await sleep(200)
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
// 自宅の背景の絵（部屋の絵が届くまでは、引っ越したばかりの部屋の絵を仮に使う）
const homeBg = JSON.parse(readFileSync('src/data/assets/manifest.json', 'utf8')).backgrounds.home.src.split('?')[0]
const cached = await evaluate(`(async () => { const names = await caches.keys(); const urls = (await Promise.all(names.map(async (n) => (await (await caches.open(n)).keys()).map((r) => new URL(r.url).pathname)))).flat(); return { bg: urls.some((u) => u.endsWith('/${homeBg}')), sfx: urls.some((u) => u.includes('/audio/sfx/')), bgm: urls.some((u) => u.includes('/audio/bgm_')), n: urls.length } })()`)
check('PWA：絵・効果音を端末に保存し、BGM は保存しない', cached.bg && cached.sfx && !cached.bgm, JSON.stringify(cached))
await send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 })
await load(url)
check('PWA：オフラインで開き直しても、タイトルが出る', (await evaluate(`document.querySelector('.title__ko')?.textContent ?? ''`)) === '서울에서 살기' && (await evaluate(`navigator.onLine`)) === false)
await b.continueToHome()
await sleep(500)
const bgLoaded = await evaluate(`(() => { const img = [...document.images].find((i) => i.src.includes('/${homeBg}')); return img ? img.complete && img.naturalWidth > 0 : null })()`)
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
