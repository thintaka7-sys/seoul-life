// Phase 2.5「復習と練習」の確認：今日の復習と練習、基礎ドリル、章末テスト、図鑑の絞り込み、毎日のスタンプ。
// v4 のセーブデータ（覚えた単語・文法・正解した会話の往復）で始め、v5 への移行で復習に入ることを確かめる。
// ページの日付を進めて（翌日・2日後・4日後）、間違えた問題が翌日に、正解した問題が決めた間隔で出ることを確かめる。
// 問題の正解は、教材の JSON から求める。使い方は scripts/e2e/README.md。

import { readdirSync, readFileSync } from 'node:fs'
import { openBrowser, saveAtHome, sleep } from './browser.mjs'
import { practiceAnswers } from './practice-answers.mjs'

const b = await openBrowser('phase25')
const { evaluate, click, mainText, saved, viewport, shot, freshStart, reload, check, layoutCheck, send } = b

const { conversations, drills, tests, koToDigits, norm, readQuestion, correctAnswer, typeInto } = practiceAnswers(b)
/** すべてのイベントのID（ファイル名の順・ファイル内の順。ゲームと同じ順） */
const allEventIds = readdirSync('src/data/events').filter((n) => n.endsWith('.json')).sort().flatMap((n) => JSON.parse(readFileSync(`src/data/events/${n}`, 'utf8'))).map((e) => e.id)

const formsSeen = new Set()
let digitsRejectedSeen = false

/** いまの問題に答えて「次へ」を押す。正解を求められなかったら null */
/** 問題の枠の中に、入力欄・ボタン・札が収まっているか（ページの横スクロールが出なくても、枠からはみ出すことがある。BUG-008） */
async function fitsCheck(label) {
  const r = await evaluate(`(() => {
    const q = document.querySelector('.practice'); if (!q) return null
    const box = q.getBoundingClientRect(); const right = box.right - parseFloat(getComputedStyle(q).paddingRight) + 0.5
    const out = [...q.querySelectorAll('input, button')].filter((el) => !el.closest('.keyboard') && el.getBoundingClientRect().right > right).map((el) => (el.getAttribute('aria-label') || el.textContent).trim().slice(0, 10))
    return out
  })()`)
  if (r !== null) check(`${label}：入力欄・ボタンが問題の枠の中`, r.length === 0, JSON.stringify(r))
}

async function answer(correct, label) {
  const q = await readQuestion()
  if (q === null) return null
  const form = q.options.length > 0 ? 'choose' : q.tiles.length > 0 ? 'arrange' : q.write ? 'write' : 'number'
  const formName = `${form}${q.audio ? '（聞く）' : ''}`
  const firstOfForm = !formsSeen.has(formName) && label?.startsWith('375') === true
  formsSeen.add(formName)
  if (firstOfForm) await shot(`form-${form}${q.audio ? '-listen' : ''}-375`)
  if (label !== undefined) await fitsCheck(`${label}：${form}の問題`)
  if (label !== undefined) await layoutCheck(`${label}：${form}の問題`)
  const right = await correctAnswer(q)
  if (right === undefined || right === null) {
    check(`${label ?? ''} 正解を求められる`, false, JSON.stringify(q))
    return null
  }
  if (form === 'choose') {
    const choice = correct ? right : q.options.find((o) => o !== right)
    await evaluate(`(() => { const o = [...document.querySelectorAll('.quiz-option')].find((b) => { const c = b.cloneNode(true); c.querySelectorAll('rt').forEach((r) => r.remove()); return c.textContent.replace(/\\s+/g, ' ').trim() === ${JSON.stringify(choice)} }); o.click() })()`)
  } else if (form === 'arrange') {
    const parts = correct ? (q.heading.includes('語を並べて') ? norm(right).split(' ') : [...norm(right)]) : q.tiles
    for (const p of parts) await evaluate(`[...document.querySelectorAll('.arrange__pool .letter-tile')].find((t) => t.textContent === ${JSON.stringify(p)} && !t.disabled).click()`)
    await click('答える')
  } else if (form === 'number') {
    await typeInto('input[aria-label="答え（数字）"]', correct ? right : '99999')
    await click('答える')
  } else {
    await click('端末のキーボードを使う')
    // 数字の読み方を書く問題（日本語が「3,500ウォン」など）では、数字で答えても正解にせず、書き直しを求める
    if (/[0-9]/.test(q.ja ?? '') && koToDigits.has(right)) {
      await typeInto('input[aria-label="答え（韓国語）"]', koToDigits.get(right))
      await click('答える')
      const warned = (await mainText()).includes('数字ではなく、韓国語（ハングル）で書いてみましょう')
      check(`${label ?? ''} 韓国語で書く数字の問題に、数字（${koToDigits.get(right)}）で答えても正解にしない`, warned && !(await mainText()).includes('正解！'))
      digitsRejectedSeen = true
    }
    await typeInto('input[aria-label="答え（韓国語）"]', correct ? right : '모르겠어요')
    await click('答える')
  }
  await sleep(100)
  const text = await mainText()
  const ok = correct ? text.includes('正解') && !text.includes('おしい！') : text.includes('おしい！')
  if (!ok) check(`${label ?? ''} 答えの判定（${correct ? '正解' : '間違い'}にする）`, false, `${JSON.stringify(q)} → ${right}`)
  if (firstOfForm) await shot(`form-${form}${q.audio ? '-listen' : ''}-${correct ? 'correct' : 'wrong'}-375`)
  const next = (await evaluate(`[...document.querySelectorAll('.practice button')].map((b) => b.textContent.trim()).find((t) => t === '次へ' || t === '結果を見る') ?? ''`)) || '次へ'
  await click(next)
  return { key: q, correct }
}

// ---------- 日付を進める ----------

// ページの「今」を dayOffset 日進める（localStorage の e2e:dayOffset。読み込み直すと効く）
await send('Page.addScriptToEvaluateOnNewDocument', {
  source: `(() => { const days = Number(localStorage.getItem('e2e:dayOffset') || 0); if (!days) return; const off = days * 86400000; const R = Date;
    class D extends R { constructor(...a) { if (a.length === 0) super(R.now() + off); else super(...a) } static now() { return R.now() + off } }
    window.Date = D })()`,
})
const pad = (n) => String(n).padStart(2, '0')
/** 端末の日付で、今日から n 日後（YYYY-MM-DD） */
const dayAfter = (n) => {
  const d = new Date(Date.now() + n * 86400000)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
async function goToDay(n) {
  await evaluate(`localStorage.setItem('e2e:dayOffset', '${n}')`)
  await reload()
  await evaluate(`(() => { if (!window.speechSynthesis) return; const orig = window.speechSynthesis.speak.bind(window.speechSynthesis); window.speechSynthesis.speak = (u) => { window.__spoken = u.text; return orig(u) } })()`)
  await b.continueToHome()
  await click('勉強する（復習・練習・ハングル）')
}
const studyButton = (prefix) => evaluate(`[...document.querySelectorAll('main button')].map((b) => b.textContent.trim()).find((t) => t.startsWith(${JSON.stringify(prefix)})) ?? ''`)

// ---------- はじめ：v4 のセーブデータ（覚えた単語3つ・文法1つ・正解した往復1つ） ----------

const NOW = new Date().toISOString()
const v4 = {
  version: 4,
  createdAt: NOW,
  updatedAt: NOW,
  progress: { currentLocationId: 'home', completedEvents: [], activeEvent: null },
  learning: {
    words: { vocab_001: { learnedAt: NOW, chapter: 1 }, vocab_012: { learnedAt: NOW, chapter: 1 }, vocab_013: { learnedAt: NOW, chapter: 1 } },
    grammar: { grammar_002: { learnedAt: NOW, chapter: 1 } },
    conversations: { 'cafe_009#0': { choice: true, write: false } },
    hangul: {},
    listening: {},
  },
  stats: { xp: 100 },
}
const KEYS = ['word:vocab_001', 'word:vocab_012', 'word:vocab_013', 'grammar:grammar_002', 'turn:cafe_009#0']

/** 会話の画面を、選択肢をランダムに選びながら最後まで進める（正解するまで選び直す） */
async function playReplayConversation() {
  for (let i = 0; i < 80 && (await evaluate(`!!document.querySelector('.conversation')`)); i++) {
    await evaluate(`(() => {
      const n = document.querySelector('.dialogue__next'); if (n) { n.click(); return }
      // 間違えた往復があると、会話の最後にふり返りが出る（GAME_SPEC 4-0）
      const r = [...document.querySelectorAll('.conversation-review button')].find((b) => b.textContent.trim() === '次へ'); if (r) { r.click(); return }
      const tab = document.querySelector('.mode-tab[aria-label="選んで答える"]'); if (tab && tab.getAttribute('aria-pressed') !== 'true') { tab.click(); return }
      const ch = [...document.querySelectorAll('.choice__button:not([disabled])')]; if (ch.length) { ch[Math.floor(Math.random() * ch.length)].click(); return } })()`)
    await sleep(150)
  }
}

// --- BUG-007：Phase 2 で1日目を終えたセーブデータ（作り直した会話の記録がない）でも、章末テストの条件を満たせる ---
async function replaySection(P, W) {
  const T = new Date().toISOString()
  // いまの版（v6）で、すべてのイベントを終えた形（作り直す前の会話の記録だけがある）
  const phase2Done = saveAtHome({
    progress: { completedEvents: allEventIds },
    learning: { ...v4.learning, conversations: { 'home_003#0': { choice: true, write: false }, 'home_003#1': { choice: true, write: false }, 'home_004#0': { choice: true, write: false } } },
    stats: { xp: v4.stats.xp },
    createdAt: T,
    updatedAt: T,
  })
  const test = tests.find((t) => t.chapter === 1)
  const ch1 = conversations.filter((c) => c.chapter === 1)
  await freshStart({ save: phase2Done })
  await goToDay(0)
  await click('会話をもう一度')
  const list = await mainText()
  check(`${P} 会話をもう一度：終えたイベントの会話（${conversations.length}本）を一覧にし、答えた問題の数を出す`, list.split('問題 0 / ').length - 1 === conversations.length && (await evaluate(`document.querySelectorAll('.lesson-item').length`)) === conversations.length, list.slice(0, 300))
  await layoutCheck(`${P} 会話をもう一度の一覧`)
  if (W === 375) await shot('replay-list-375')
  await click('戻る')
  await click('ドリル・テスト')
  await click(test.titleJa, { exact: false })
  const guide = await mainText()
  check(`${P} 章末テスト：受けられないとき、まだ答えていない会話（${ch1.length}本）と「遊ぶ」ボタンを出す`, guide.includes('まだ答えていない会話') && (await evaluate(`[...document.querySelectorAll('.remaining-conversation')].length`)) === ch1.length, guide.slice(0, 300))
  await layoutCheck(`${P} 章末テストの案内`)
  if (W === 375) await shot('test-locked-375')
  for (let n = ch1.length; n > 0; n--) {
    await evaluate(`document.querySelector('.remaining-conversation button').click()`)
    await sleep(200)
    check(`${P} 「遊ぶ」で会話をもう一度遊ぶ画面を開く（背景・立ち絵つき）`, (await evaluate(`!!document.querySelector('.conversation .portrait')`)) && (await mainText()).includes('会話をもう一度'))
    await playReplayConversation()
    const left = await evaluate(`document.querySelectorAll('.remaining-conversation').length`)
    check(`${P} 会話を終えるとテストの画面に戻り、残りの会話が ${n - 1} 本になる`, left === n - 1, String(left))
  }
  const s = await saved()
  const turnIds = ch1.flatMap((c) => c.turns.flatMap((t, i) => (t.choices && t.kind !== 'decision' ? [`${c.id}#${i}`] : [])))
  check(`${P} 遊び直しで答えた問題の往復を記録し、復習に入れる（選択の往復は記録しない）`, turnIds.every((id) => s.learning.conversations[id] && s.learning.review[`turn:${id}`]) && !Object.keys(s.learning.conversations).some((k) => k.startsWith('home_005#1')), JSON.stringify(Object.keys(s.learning.conversations)))
  check(`${P} 遊び直しの初めての正解に経験値（選ぶ ${turnIds.length}問 × 10）`, s.stats.xp === v4.stats.xp + turnIds.length * 10, String(s.stats.xp))
  check(`${P} 条件を満たすと、章末テストを受けられる`, (await mainText()).includes(`${test.passPercent ?? 80}点以上で合格`), (await mainText()).slice(0, 200))
}

/** 幅ごとの確認（途中で止まったら、そこまでの結果と NG を出す） */
async function runWidth(W, H, mobile) {
  const P = `${W}`
  await viewport(W, H, mobile)
  await freshStart({ save: v4 })
  await goToDay(0)

  // --- 移行と、今日（覚えた日）---
  let s = await saved()
  check(`${P} v4 のセーブデータを v6 に移行し、覚えたもの5つを翌日の復習に入れる`, s.version === 6 && KEYS.every((k) => s.learning.review[k]?.due === dayAfter(1)), JSON.stringify(s.learning.review))
  check(`${P} 学習画面：今日の復習（0問）と練習`, (await studyButton('今日の復習')) === '今日の復習（0問）' && (await studyButton('練習')) === '練習')
  await layoutCheck(`${P} 学習画面`)
  await click('今日の復習（0問）')
  check(`${P} 覚えた日には復習がなく、練習を案内する`, (await mainText()).includes('今日の復習はありません'))
  await click('戻る')

  // --- 練習：1問目だけ正解、残りは間違える。経験値なし、間違えた問題は翌日の復習へ ---
  await click('練習')
  const practiceMenu = await mainText()
  check(`${P} 練習：学んだ単語3・文法1・会話1`, ['単語（3）', '文法（1）', '会話（1）'].every((t) => practiceMenu.includes(t)), practiceMenu)
  await layoutCheck(`${P} 練習の選択`)
  await click('単語（3）')
  if (W === 375) await shot('practice-first-375')
  const practiced = []
  for (let i = 0; i < 3; i++) practiced.push(await answer(i === 0, `${P} 練習`))
  const retryText = await mainText()
  check(`${P} 練習：間違えた2問を最後にもう一度出す`, retryText.includes('もう一度 1 / 2'), retryText.slice(0, 120))
  await answer(true)
  await answer(true)
  check(`${P} 練習の結果：3問中 1問正解`, (await mainText()).includes('3問中 1問正解'))
  s = await saved()
  const wrongs = KEYS.filter((k) => k.startsWith('word:')).map((k) => s.learning.review[k].wrong)
  check(`${P} 練習では経験値なし。間違えた2問は「間違えた回数」を数え、今日の復習の上限には数えない`, s.stats.xp === 100 && wrongs.reduce((a, x) => a + x, 0) === 2 && KEYS.every((k) => s.learning.review[k].lastAt === null), JSON.stringify({ xp: s.stats.xp, wrongs }))
  await click('ほかの練習を選ぶ')
  await click('会話（1）')
  const turnQ = await readQuestion()
  check(`${P} 会話の練習は、相手の台詞を場面として見せる`, turnQ?.scene?.length > 0, JSON.stringify(turnQ))
  await answer(true, `${P} 会話の練習`)
  await click('戻る')

  // --- 翌日：5問。1問目だけ間違える ---
  await goToDay(1)
  check(`${P} 翌日：今日の復習（5問）`, (await studyButton('今日の復習')) === '今日の復習（5問）', await studyButton('今日の復習'))
  await click('今日の復習（5問）')
  check(`${P} 今日の復習の説明と問題数`, (await mainText()).includes('今日の問題：5問'))
  await click('はじめる')
  if (W === 375) await shot('review-first-375')
  const first = await readQuestion()
  check(`${P} 間違えた回数の多い問題（練習で間違えた単語）から出す`, first?.position === '1 / 5', JSON.stringify(first))
  for (let i = 0; i < 5; i++) await answer(i !== 0, `${P} 今日の復習`)
  check(`${P} 間違えた問題を最後にもう一度出す`, (await mainText()).includes('もう一度 1 / 1'))
  await answer(true)
  check(`${P} 復習の結果：5問中 4問正解`, (await mainText()).includes('5問中 4問正解'))
  s = await saved()
  const records = KEYS.map((k) => s.learning.review[k])
  const missed = records.filter((r) => r.stage === 0)
  const passed = records.filter((r) => r.stage === 1)
  check(`${P} 正解した4問は3日後、間違えた1問は翌日に。経験値は正解ごとに3`, s.stats.xp === 112 && missed.length === 1 && missed[0].due === dayAfter(2) && passed.length === 4 && passed.every((r) => r.due === dayAfter(4)), JSON.stringify({ xp: s.stats.xp, records }))
  await click('戻る')
  check(`${P} 終えた後は：今日の復習（0問）`, (await studyButton('今日の復習')) === '今日の復習（0問）')
  await click('今日の復習（0問）')
  check(`${P} 「今日の復習は終わりました」`, (await mainText()).includes('今日の復習は終わりました'))
  await reload()
  check(`${P} 再読み込みしても記録が残る`, JSON.stringify((await saved()).learning.review) === JSON.stringify(s.learning.review))

  // --- 2日後：間違えた1問だけ ---
  await goToDay(2)
  check(`${P} 2日後：間違えた1問だけ出る`, (await studyButton('今日の復習')) === '今日の復習（1問）', await studyButton('今日の復習'))
  await click('今日の復習（1問）')
  await click('はじめる')
  await answer(true, `${P} 2日後`)
  check(`${P} 2日後：1問中 1問正解`, (await mainText()).includes('1問中 1問正解'))
  await click('戻る', { within: '.result' })

  // --- 4日後：3日後に回した4問 ---
  await goToDay(4)
  check(`${P} 4日後：正解した4問が3日の間隔で出る`, (await studyButton('今日の復習')) === '今日の復習（4問）', await studyButton('今日の復習'))

  // --- スタンプ：0日目（練習）・翌日（復習）・2日後（復習）。3日目は休み ---
  s = await saved()
  check(`${P} スタンプ：復習のない日の練習、今日の復習を終えた日に押す`, JSON.stringify(s.daily.stamps) === JSON.stringify([dayAfter(0), dayAfter(1), dayAfter(2)]), JSON.stringify(s.daily.stamps))
  await click('戻る')
  await click('スタンプカード')
  let card = await mainText()
  check(`${P} スタンプカード：4日後（3日目は休み）は、続けている日数 0・集めたスタンプ 3`, card.includes('今日のスタンプはまだです') && card.includes('続けている日数：0日') && card.includes('集めたスタンプ：3個'), card.slice(0, 200))
  await layoutCheck(`${P} スタンプカード`)
  await click('戻る')

  // --- 基礎ドリル：数字は入力で答える。1問目だけ間違える ---
  await click('勉強する（復習・練習・ハングル）')
  await click('ドリル・テスト')
  await layoutCheck(`${P} ドリル・テストの一覧`)
  const list = await mainText()
  const firstDrill = drills[0]
  check(`${P} ドリルの一覧（${drills.length}テーマ）と、まだ受けられない章末テスト`, drills.every((d) => list.includes(d.titleJa)) && list.includes('すべて答えると受けられます'), list.slice(0, 300))
  await click(firstDrill.titleJa, { exact: false })
  await click('はじめる')
  if (W === 375) await shot('drill-first-375')
  const drillCount = Math.min(firstDrill.questionCount ?? 10, firstDrill.items.length)
  for (let i = 0; i < drillCount; i++) await answer(i !== 0, `${P} ドリル`)
  while ((await readQuestion()) !== null) await answer(true)
  check(`${P} ドリルの結果：${drillCount}問中 ${drillCount - 1}問正解`, (await mainText()).includes(`${drillCount}問中 ${drillCount - 1}問正解`))
  s = await saved()
  const drillCorrect = Object.keys(s.learning.drills).length
  const drillWrong = Object.keys(s.learning.review).filter((k) => k.startsWith('drill:'))
  check(`${P} ドリル：初めて正解した問題に経験値2、間違えた1問は翌日の復習へ。今日のスタンプ`, drillCorrect === drillCount - 1 && s.stats.xp === 112 + 3 + 2 * drillCorrect && drillWrong.length === 1 && s.learning.review[drillWrong[0]].due === dayAfter(5) && s.daily.stamps.includes(dayAfter(4)), JSON.stringify({ xp: s.stats.xp, drillCorrect, drillWrong, stamps: s.daily.stamps }))
  await click('一覧に戻る')

  // --- 章末テスト：第1章の会話の問題に答えた記録を足すと受けられる。全問正解で合格 ---
  const test = tests.find((t) => t.chapter === 1)
  if (test !== undefined) {
    const turnIds = conversations.filter((c) => c.chapter === 1).flatMap((c) => c.turns.flatMap((t, i) => (t.choices && t.kind !== 'decision' ? [`${c.id}#${i}`] : [])))
    await evaluate(`(() => { const s = JSON.parse(localStorage.getItem('seoul-life:save')); for (const id of ${JSON.stringify(turnIds)}) s.learning.conversations[id] = { choice: true, write: false }; localStorage.setItem('seoul-life:save', JSON.stringify(s)) })()`)
    await goToDay(4)
    await click('ドリル・テスト')
    await click(test.titleJa, { exact: false })
    check(`${P} 章末テスト：第1章の会話の問題（${turnIds.length}問）に答えたので受けられる`, (await mainText()).includes(`${test.passPercent ?? 80}点以上で合格`))
    const xpBefore = (await saved()).stats.xp
    await click('はじめる')
    for (let i = 0; i < 50 && (await readQuestion()) !== null; i++) await answer(true, `${P} 章末テスト`)
    const result = await mainText()
    check(`${P} 章末テスト：全問正解で合格、もう一度出す問題はない`, result.includes('合格！（100点）') && !result.includes('もう一度 1'), result.slice(0, 200))
    s = await saved()
    check(`${P} 章末テスト：初めて合格して経験値30、記録を残す`, s.stats.xp === xpBefore + 30 && s.learning.tests[test.id]?.bestScore === 100 && s.learning.tests[test.id]?.passedAt !== null, JSON.stringify({ xp: s.stats.xp, xpBefore, rec: s.learning.tests[test.id] }))
    await click('一覧に戻る')
    check(`${P} 一覧に「合格（100点）」`, (await mainText()).includes('合格（100点）'))
    await click('戻る')
    await click('戻る')
  }

  // --- 図鑑：ジャンルのタブ、習得状況と品詞で絞り込む ---
  await evaluate(`(() => { const s = JSON.parse(localStorage.getItem('seoul-life:save')); s.learning.review['word:vocab_001'].stage = 4; localStorage.setItem('seoul-life:save', JSON.stringify(s)) })()`)
  await goToDay(4)
  await click('戻る')
  await click('図鑑を見る')
  const dict = await mainText()
  check(`${P} 図鑑：「学んだ単語」と「覚えた」の数`, dict.includes('学んだ単語：3 / ') && dict.includes('覚えた：1 語'), dict.slice(0, 120))
  const chips = await evaluate(`[...document.querySelectorAll('.chip')].map((c) => c.firstChild.textContent)`)
  check(`${P} 図鑑：学んだ単語のあるジャンルだけタブにする`, JSON.stringify(chips) === JSON.stringify(['すべて', 'あいさつ・決まり文句', '食べ物・飲み物']), JSON.stringify(chips))
  await layoutCheck(`${P} 図鑑`)
  const entries = () => evaluate(`[...document.querySelectorAll('.dict-entry .dict-entry__word')].map((e) => { const c = e.cloneNode(true); c.querySelectorAll('rt').forEach((r) => r.remove()); return c.textContent.trim() })`)
  await click('食べ物・飲み物2', { exact: true })
  check(`${P} 図鑑：ジャンルで絞り込む`, JSON.stringify(await entries()) === JSON.stringify(['커피', '아메리카노']), JSON.stringify(await entries()))
  await click('すべて3')
  await click('覚えた')
  check(`${P} 図鑑：「覚えた」で絞り込む（14日の間隔で正解したもの）`, JSON.stringify(await entries()) === JSON.stringify(['안녕하세요']), JSON.stringify(await entries()))
  await click('すべて', { within: '.mode-tabs' })
  await evaluate(`(() => { const el = document.querySelector('.dict-filters select'); const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set; set.call(el, 'greeting'); el.dispatchEvent(new Event('change', { bubbles: true })) })()`)
  await sleep(100)
  check(`${P} 図鑑：品詞で絞り込む`, JSON.stringify(await entries()) === JSON.stringify(['안녕하세요']), JSON.stringify(await entries()))
  if (W === 375) await shot('dictionary-375')
  await click('閉じる')

  // --- スタンプカード：今日（4日後）押したので、続けている日数1・集めたスタンプ4。再読み込みしても残る ---
  await reload()
  await b.continueToHome()
  await click('スタンプカード')
  card = await mainText()
  check(`${P} スタンプが再読み込みしても残る（今日押した・続けて1日・集めた4個）`, card.includes('今日のスタンプを押しました') && card.includes('続けている日数：1日') && card.includes('集めたスタンプ：4個'), card.slice(0, 200))
  const marks = await evaluate(`document.querySelectorAll('.stamp-day--stamped').length`)
  const sameMonth = [0, 1, 2, 4].filter((n) => dayAfter(n).slice(0, 7) === dayAfter(4).slice(0, 7)).length
  check(`${P} カレンダーに今月のスタンプ（${sameMonth}個）`, marks === sameMonth, String(marks))
  if (W === 375) await shot('stamps-375')

  await replaySection(P, W)
}

// --- 狭い幅（320・360・390px）：数字の問題と書く問題が、問題の枠からはみ出さない（BUG-008） ---
async function narrowWidths() {
  for (const W of [320, 360, 390]) {
    await viewport(W, 760, true)
    await freshStart({ save: v4 })
    await goToDay(0)
    await click('ドリル・テスト')
    await click(drills[0].titleJa, { exact: false })
    await click('はじめる')
    const seen = new Set()
    for (let i = 0; i < 30 && (await readQuestion()) !== null; i++) {
      const q = await readQuestion()
      const form = q.number ? 'number' : q.write ? 'write' : 'other'
      if (!seen.has(form)) {
        seen.add(form)
        await fitsCheck(`${W} ドリル：${form}の問題`)
        if (form === 'number') await shot(`narrow-number-${W}`)
      }
      await answer(true)
    }
    check(`${W} ドリルで数字の問題を確かめた`, seen.has('number'), [...seen].join('・'))
  }
}

for (const [W, H, mobile] of [
  [375, 760, true],
  [1280, 800, false],
]) {
  try {
    await runWidth(W, H, mobile)
  } catch (e) {
    check(`${W} 途中で止まった`, false, String(e))
    await shot(`stopped-${W}`)
  }
}

try {
  await narrowWidths()
} catch (e) {
  check('狭い幅の確認が途中で止まった', false, String(e))
}

check(`出た問題の形（両方の幅で合わせて：${[...formsSeen].join('・')}）`, formsSeen.size >= 4 && formsSeen.has('number'), [...formsSeen].join('・'))
check('数字の読み方を書く問題で、数字の答えを正解にしないことを確かめた（問題の形はランダム。出なければ流し直す）', digitsRejectedSeen)

b.finish()
