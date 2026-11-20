// Phase 2.5「復習と練習」の確認：今日の復習と練習。
// v4 のセーブデータ（覚えた単語・文法・正解した会話の往復）で始め、v5 への移行で復習に入ることを確かめる。
// ページの日付を進めて（翌日・2日後・4日後）、間違えた問題が翌日に、正解した問題が決めた間隔で出ることを確かめる。
// 問題の正解は、教材の JSON から求める。使い方は scripts/e2e/README.md。

import { readdirSync, readFileSync } from 'node:fs'
import { openBrowser, sleep } from './browser.mjs'

const b = await openBrowser('phase25')
const { evaluate, click, mainText, saved, viewport, shot, freshStart, reload, check, layoutCheck, send } = b

function readdirJson(dir) {
  return readdirSync(dir)
    .filter((n) => n.endsWith('.json'))
    .flatMap((n) => JSON.parse(readFileSync(`${dir}/${n}`, 'utf8')))
}

// ---------- 教材から正解を求める ----------

const vocab = readdirJson('src/data/vocabulary')
const grammar = readdirJson('src/data/grammar')
const conversations = readdirJson('src/data/scenarios')
const norm = (s) => s.replace(/[.,?!。、]/g, ' ').replace(/\s+/g, ' ').trim()

/** 日本語 → 韓国語（単語・文法の例文） */
const jaToKo = new Map()
/** 韓国語 → 日本語 */
const koToJa = new Map()
const addPair = (ko, ja) => {
  jaToKo.set(ja, [...(jaToKo.get(ja) ?? []), ko])
  koToJa.set(ko, [...(koToJa.get(ko) ?? []), ja])
}
for (const v of vocab) addPair(v.korean, v.japanese)
for (const g of grammar) for (const e of g.examples) addPair(e.korean, e.japanese)
/** 穴埋めの文（例文と日本語）。「커피 주세요」と「녹차 주세요」のように、日本語で区別する */
const sentences = new Set([
  ...vocab.filter((v) => v.example).map((v) => `${v.example}|${v.exampleJapanese ?? v.japanese}`),
  ...grammar.flatMap((g) => g.examples.map((e) => `${e.korean}|${e.japanese}`)),
])
/** 会話の場面（最後の台詞）→ 正解の選択肢・書く問題の模範解答 */
const sceneAnswers = new Map()
for (const c of conversations) {
  c.turns.forEach((t, i) => {
    if (t.choices === undefined || t.kind === 'decision') return
    const prev = c.turns[i - 1]
    const context = t.lines.length > 0 ? t.lines : ((prev?.choices?.find((x) => x.correct) ?? prev?.choices?.[0])?.reply ?? [])
    const last = context.at(-1)?.korean ?? ''
    const entry = sceneAnswers.get(last) ?? { choices: [], write: [] }
    entry.choices.push(...t.choices.filter((x) => x.correct).map((x) => x.korean))
    if (t.freeAnswer) entry.write.push(t.freeAnswer.answers[0])
    sceneAnswers.set(last, entry)
  })
}

/** いまの問題の様子 */
const readQuestion = () =>
  evaluate(`(() => {
    const plain = (el) => { if (!el) return null; const c = el.cloneNode(true); c.querySelectorAll('rt').forEach((r) => r.remove()); return c.textContent.replace(/\\s+/g, ' ').trim() }
    const q = document.querySelector('.practice')
    if (!q) return null
    const blank = q.querySelector('.practice-blank')
    const [before, after] = blank ? blank.textContent.split('（　　）') : [null, null]
    const blankJa = blank ? plain(q.querySelector('.practice-ja .muted')) : null
    return {
      position: plain(q.querySelector('.muted.small')),
      heading: plain(q.querySelector('.step-heading')),
      target: plain(q.querySelector('.quiz-target')),
      ja: plain(q.querySelector('.practice-ja__text')),
      before, after, blankJa,
      scene: q.querySelector('.practice-scene') ? [...q.querySelectorAll('.practice-scene__line .ko-text')].map(plain) : null,
      audio: [...q.querySelectorAll('button')].some((b) => b.textContent.includes('聞く')),
      options: [...q.querySelectorAll('.quiz-option')].map((o) => { const c = o.cloneNode(true); c.querySelectorAll('rt, .quiz-option__mark').forEach((r) => r.remove()); return c.textContent.replace(/\\s+/g, ' ').trim() }),
      tiles: [...q.querySelectorAll('.arrange__pool .letter-tile')].map((t) => t.textContent),
      write: !!q.querySelector('input[aria-label="答え（韓国語）"]'),
      number: !!q.querySelector('input[aria-label="答え（数字）"]'),
    }
  })()`)

/** 正解の韓国語（選ぶ問題では、正解の選択肢の文字） */
async function correctAnswer(q) {
  if (q.audio) {
    await click('▶ 聞く')
    const spoken = await evaluate('window.__spoken ?? null')
    if (q.options.length > 0) return q.options.find((o) => o === spoken)
    return spoken
  }
  if (q.scene !== null) {
    const entry = sceneAnswers.get(q.scene.at(-1)) ?? { choices: [], write: [] }
    return q.options.length > 0 ? q.options.find((o) => entry.choices.includes(o)) : entry.write[0]
  }
  if (q.before !== null) return q.options.find((o) => sentences.has(`${q.before + o + q.after}|${q.blankJa}`))
  if (q.target !== null) return q.options.find((o) => (koToJa.get(q.target) ?? []).includes(o))
  const candidates = jaToKo.get(q.ja) ?? []
  if (q.options.length > 0) return q.options.find((o) => candidates.includes(o))
  if (q.tiles.length > 0) {
    const sorted = (xs) => [...xs].sort().join('|')
    return candidates.find((k) => sorted(q.heading.includes('語を並べて') ? norm(k).split(' ') : [...norm(k)]) === sorted(q.tiles))
  }
  return candidates[0]
}

/** 入力欄に文字を入れる（React の入力欄なので、値の設定と input イベントを送る） */
async function typeInto(selector, text) {
  await evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(el, ${JSON.stringify(text)}); el.dispatchEvent(new Event('input', { bubbles: true })) })()`)
  await sleep(50)
}

const formsSeen = new Set()

/** いまの問題に答えて「次へ」を押す。正解を求められなかったら null */
async function answer(correct, label) {
  const q = await readQuestion()
  if (q === null) return null
  const form = q.options.length > 0 ? 'choose' : q.tiles.length > 0 ? 'arrange' : q.write ? 'write' : 'number'
  const formName = `${form}${q.audio ? '（聞く）' : ''}`
  const firstOfForm = !formsSeen.has(formName) && label?.startsWith('375') === true
  formsSeen.add(formName)
  if (firstOfForm) await shot(`form-${form}${q.audio ? '-listen' : ''}-375`)
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
  } else {
    await click('端末のキーボードを使う')
    await typeInto('input[aria-label="答え（韓国語）"]', correct ? right : '모르겠어요')
    await click('答える')
  }
  await sleep(100)
  const text = await mainText()
  const ok = correct ? text.includes('正解') && !text.includes('ざんねん') : text.includes('ざんねん')
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
  await click('つづきから')
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
    conversations: { 'cafe_006#0': { choice: true, write: false } },
    hangul: {},
    listening: {},
  },
  stats: { xp: 100 },
}
const KEYS = ['word:vocab_001', 'word:vocab_012', 'word:vocab_013', 'grammar:grammar_002', 'turn:cafe_006#0']

/** 幅ごとの確認（途中で止まったら、そこまでの結果と NG を出す） */
async function runWidth(W, H, mobile) {
  const P = `${W}`
  await viewport(W, H, mobile)
  formsSeen.clear()
  await freshStart({ save: v4 })
  await goToDay(0)

  // --- 移行と、今日（覚えた日）---
  let s = await saved()
  check(`${P} v4 のセーブデータを v5 に移行し、覚えたもの5つを翌日の復習に入れる`, s.version === 5 && KEYS.every((k) => s.learning.review[k]?.due === dayAfter(1)), JSON.stringify(s.learning.review))
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
  check(`${P} 出た問題の形（${[...formsSeen].join('・')}）`, formsSeen.size >= 3, [...formsSeen].join('・'))
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

b.finish()
