// Phase 2.6 の確認：答えた後の見せ方（GAME_SPEC 4-0）と、聞き分け練習（4-10）。
// ヘッドレスのブラウザには韓国語の音声がないことが多いので、偽の読み上げ（何を・どの速さで読んだかを記録する）を入れて確かめる。
// 実際の音が聞き分けられるかは、実機で確かめる（報告では未確認に入れる）。使い方は scripts/e2e/README.md。

import { openBrowser, sleep } from './browser.mjs'
import { practiceAnswers } from './practice-answers.mjs'

const b = await openBrowser('phase26')
const { evaluate, click, mainText, viewport, shot, freshStart, check, layoutCheck, send } = b
const { readQuestion, correctAnswer, typeInto } = practiceAnswers(b)

// ---------- 偽の読み上げ ----------

await send('Page.addScriptToEvaluateOnNewDocument', {
  source: `(() => {
    const voice = { lang: 'ko-KR', name: 'e2e', localService: true, default: false, voiceURI: 'e2e-ko' }
    window.__spokenLog = []
    const synth = {
      speaking: false, pending: false, paused: false,
      getVoices: () => [voice],
      speak(u) { window.__spoken = u.text; window.__spokenLog.push({ text: u.text, rate: u.rate }); setTimeout(() => { u.onstart?.(); u.onend?.() }, 10) },
      cancel() {}, pause() {}, resume() {},
      addEventListener() {}, removeEventListener() {},
    }
    class Utterance { constructor(text) { this.text = text; this.lang = ''; this.voice = null; this.rate = 1; this.pitch = 1; this.volume = 1 } }
    Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true })
    window.SpeechSynthesisUtterance = Utterance
  })()`,
})
const lastSpoken = () => evaluate(`window.__spokenLog.at(-1) ?? null`)

// ---------- セーブデータ：1日目を終え、単語3つ・文法1つを覚えた ----------

const NOW = new Date().toISOString()
const SAVE = {
  version: 4,
  createdAt: NOW,
  updatedAt: NOW,
  progress: { currentLocationId: 'home', completedEvents: ['event_001', 'event_002', 'event_003'], activeEvent: null },
  learning: {
    words: { vocab_001: { learnedAt: NOW, chapter: 1 }, vocab_012: { learnedAt: NOW, chapter: 1 }, vocab_013: { learnedAt: NOW, chapter: 1 } },
    grammar: { grammar_002: { learnedAt: NOW, chapter: 1 } },
    conversations: {},
    hangul: {},
    listening: {},
  },
  stats: { xp: 100 },
}

async function openStudy() {
  await freshStart({ save: SAVE })
  await click('つづきから')
  await click('勉強する（復習・練習・ハングル）')
}

const plain = `(el) => { if (!el) return ''; const c = el.cloneNode(true); c.querySelectorAll('rt, .quiz-option__mark').forEach((r) => r.remove()); return c.textContent.replace(/\\s+/g, ' ').trim() }`
/** 選択肢を、表示の文字（フリガナ・印を除く）で押す */
const clickOption = (text) => evaluate(`(() => { const plain = ${plain}; const o = [...document.querySelectorAll('.quiz-option')].find((b) => plain(b) === ${JSON.stringify(text)}); if (!o) return false; o.click(); return true })()`)
const optionTexts = () => evaluate(`(() => { const plain = ${plain}; return [...document.querySelectorAll('.quiz-option')].map(plain) })()`)
const marks = () => evaluate(`[...document.querySelectorAll('.quiz-option__mark')].map((m) => m.textContent.trim())`)
const furiganaInOptions = () => evaluate(`document.querySelectorAll('.quiz-option rt').length`)
const nextLabel = (within) => evaluate(`[...document.querySelectorAll(${JSON.stringify(within + ' button')})].map((b) => b.textContent.trim()).find((t) => t === '次へ' || t === '結果を見る') ?? ''`)

/** 聞き比べのボタンで、選んだ音と正解の音が読まれる */
async function checkListenCompare(label, given, answer) {
  const buttons = await evaluate(`[...document.querySelectorAll('.listen-compare button')].map((b) => b.textContent.trim())`)
  check(`${label}：聞き比べのボタン（あなたの答え・正解）`, buttons.length === 2 && buttons[0].includes(given) && buttons[1].includes(answer), JSON.stringify(buttons))
  await evaluate(`document.querySelectorAll('.listen-compare button')[0]?.click()`)
  await sleep(60)
  const g = await lastSpoken()
  await evaluate(`document.querySelectorAll('.listen-compare button')[1]?.click()`)
  await sleep(60)
  const a = await lastSpoken()
  check(`${label}：聞き比べで、選んだ音と正解の音を読む`, g?.text === given && a?.text === answer, JSON.stringify([g, a]))
}

// ---------- 4-0：練習（単語）で、わざと間違える ----------

/** いまの問題に、わざと間違えて答える。答えた形と自分の答えを返す */
async function answerWrong(P, record) {
  const q = await readQuestion()
  if (q === null) return null
  const form = q.options.length > 0 ? 'choose' : q.tiles.length > 0 ? 'arrange' : q.write ? 'write' : 'number'
  const retry = (q.position ?? '').includes('もう一度')
  if (q.audio && q.options.length > 0 && record) check(`${P} 聞いて選ぶ問題：答えるまで選択肢にフリガナを出さない`, (await furiganaInOptions()) === 0)
  const right = await correctAnswer(q)
  let given
  if (form === 'choose') {
    given = q.options.find((o) => o !== right)
    await clickOption(given)
  } else if (form === 'arrange') {
    given = q.tiles.join(q.heading.includes('語を並べて') ? ' ' : '')
    for (const t of q.tiles) await evaluate(`[...document.querySelectorAll('.arrange__pool .letter-tile')].find((x) => x.textContent === ${JSON.stringify(t)} && !x.disabled).click()`)
    await click('答える')
  } else if (form === 'number') {
    given = '99999'
    await typeInto('input[aria-label="答え（数字）"]', given)
    await click('答える')
  } else {
    given = '모르겠어요'
    await click('端末のキーボードを使う')
    await typeInto('input[aria-label="答え（韓国語）"]', given)
    await click('答える')
  }
  await sleep(120)
  const text = await mainText()
  if (!text.includes('ざんねん')) {
    // 並べ替えの札がたまたま正しい順だったなど。見せ方の確認はせずに進む
    await click((await nextLabel('.practice')) || '次へ')
    return { form, given, wrong: false, retry }
  }
  if (record) {
    if (form === 'choose') {
      const m = await marks()
      check(`${P} ${form}${q.audio ? '（聞く）' : ''}：選んだものに「✗ あなたの答え」、正解に「✓ 正解」`, m.includes('✗ あなたの答え') && m.includes('✓ 正解'), JSON.stringify(m))
      if (q.audio) {
        check(`${P} 聞いて選ぶ問題：答えた後はフリガナを出す`, (await furiganaInOptions()) > 0)
        await checkListenCompare(`${P} 聞いて選ぶ問題`, given, right)
      }
    } else {
      const compare = await evaluate(`(() => { const c = document.querySelector('.practice .answer-compare'); return c ? { text: c.textContent, diffs: c.querySelectorAll('mark.diff').length } : null })()`)
      check(`${P} ${form}：自分の答えと正解を並べ、違う文字に印を付ける`, compare !== null && compare.text.includes('あなたの答え') && compare.text.includes('正解') && compare.diffs > 0, JSON.stringify(compare))
    }
    await layoutCheck(`${P} ${form}：答えた後`)
    if (P === '375') await shot(`feedback-${form}${q.audio ? '-listen' : ''}-375`)
  }
  await click((await nextLabel('.practice')) || '次へ')
  return { form, given, wrong: true, retry }
}

for (const [W, H, mobile] of [
  [375, 760, true],
  [1280, 800, false],
]) {
  const P = `${W}`
  await viewport(W, H, mobile)
  await openStudy()
  check(`${P} 偽の読み上げで、リスニングを押せる`, await evaluate(`[...document.querySelectorAll('main button')].some((b) => b.textContent.trim() === 'リスニング' && !b.disabled)`))
  await click('練習')
  await click('単語（3）')
  const firstWrong = []
  const seenForms = new Set()
  for (let i = 0; i < 20 && !(await evaluate(`!!document.querySelector('.result')`)); i++) {
    const r = await answerWrong(P, true)
    if (r === null) break
    seenForms.add(r.form)
    if (!r.retry && r.wrong) firstWrong.push(r.given)
  }
  const missed = await evaluate(`[...document.querySelectorAll('.missed__item')].map((li) => li.textContent)`)
  check(`${P} 結果画面：間違えた問題（${firstWrong.length}問）を一覧にし、自分の答えを見返せる`, missed.length === firstWrong.length && firstWrong.every((g, i) => (missed[i] ?? '').replace(/\s+/g, '').includes(g.replace(/\s+/g, ''))), JSON.stringify(missed).slice(0, 400))
  check(`${P} 結果画面：見返す一覧に正解も出す`, missed.every((m) => m.includes('正解')))
  if (P === '375') await shot('feedback-result-375')
  await layoutCheck(`${P} 練習の結果画面`)
  console.log(`  出た問題の形（${P}）: ${[...seenForms].join(', ')}`)
}

// ---------- 4-0：「▶ 聞く」と「ゆっくり」 ----------

await viewport(375, 760, true)
await openStudy()
await click('リスニング')
await click('はじめる')
await click('ゆっくり')
await sleep(60)
const slow = await lastSpoken()
await click('▶ 聞く')
await sleep(60)
const normal = await lastSpoken()
check('375 リスニング：「ゆっくり」は遅い速さ（0.7）、「▶ 聞く」は設定の速さ（1）で読む', slow?.rate === 0.7 && normal?.rate === 1 && slow?.text === normal?.text, JSON.stringify([slow, normal]))

// ---------- 4-0：リスニング ----------

check('375 リスニング：答えるまで選択肢にフリガナを出さない', (await furiganaInOptions()) === 0)
let listeningWrong = 0
for (let i = 0; i < 10 && !(await evaluate(`!!document.querySelector('.result')`)); i++) {
  await click('▶ 聞く')
  const spoken = (await lastSpoken())?.text
  const options = await optionTexts()
  const given = options.find((o) => o !== spoken) ?? options[0]
  await clickOption(given)
  await sleep(100)
  if ((await mainText()).includes('ざんねん')) {
    listeningWrong++
    if (listeningWrong === 1) {
      const m = await marks()
      check('375 リスニング：選んだものに「✗ あなたの答え」、正解に「✓ 正解」', m.includes('✗ あなたの答え') && m.includes('✓ 正解'), JSON.stringify(m))
      const answer = await evaluate(`(() => { const plain = ${plain}; const o = [...document.querySelectorAll('.quiz-option--answer')][0]; return o ? plain(o.querySelector('.ko-text') ?? o) : '' })()`)
      await checkListenCompare('375 リスニング', given, answer)
      await shot('feedback-listening-375')
    }
  }
  await click((await nextLabel('main')) || '次へ')
}
const listeningMissed = await evaluate(`document.querySelectorAll('.missed__item').length`)
check(`375 リスニングの結果画面：間違えた問題（${listeningWrong}問）を一覧にする`, listeningWrong > 0 && listeningMissed === listeningWrong, `${listeningMissed}`)

// ---------- 4-0：ハングルの小テスト（レッスン1） ----------

await openStudy()
await click('ハングル（0 / 12 レッスン合格）', { exact: false })
await evaluate(`document.querySelector('.lesson-item').click()`)
await sleep(150)
await click('文字を見る')
for (let i = 0; i < 20; i++) {
  const label = await evaluate(`[...document.querySelectorAll('.card-nav button')].map((b) => b.textContent.trim()).at(-1) ?? ''`)
  if (label === '') break
  await click(label)
  if (label !== '次へ') break
}
if (await evaluate(`[...document.querySelectorAll('main button')].some((b) => b.textContent.trim() === '小テストへ')`)) await click('小テストへ')
let hangulWrong = 0
let hangulMarked = 0
let hangulListenChecked = false
for (let i = 0; i < 20 && !(await evaluate(`!!document.querySelector('.result')`)); i++) {
  const heading = await evaluate(`document.querySelector('.quiz .step-heading')?.textContent ?? ''`)
  let given = null
  if (heading.includes('組み立てて')) {
    await click('端末のキーボードを使う')
    await typeInto('input[aria-label="答え（韓国語）"]', '가')
    await click('答える')
  } else {
    let answer = null
    if (heading.includes('音を聞いて')) {
      await click('▶ 音を聞く')
      answer = (await lastSpoken())?.text
    }
    const options = await optionTexts()
    given = options.find((o) => o !== answer) ?? options[0]
    await clickOption(given)
    await sleep(80)
    const m = await marks()
    if (m.some((t) => t.startsWith('✓'))) hangulMarked++
    if (answer !== null && !hangulListenChecked && (await mainText()).includes('ざんねん')) {
      hangulListenChecked = true
      await checkListenCompare('375 ハングルの小テスト（音を聞く）', given, answer)
    }
  }
  await sleep(80)
  if ((await mainText()).includes('ざんねん')) hangulWrong++
  await click((await nextLabel('main')) || '次へ')
}
check('375 ハングルの小テスト：答えた選ぶ問題すべてに ✓ の印（正解の場所）が出る', hangulMarked > 0)
const hangulMissed = await evaluate(`document.querySelectorAll('.missed__item').length`)
check(`375 ハングルの小テストの結果画面：間違えた問題（${hangulWrong}問）を一覧にする`, hangulWrong > 0 && hangulMissed === hangulWrong, `${hangulMissed}`)
await shot('feedback-hangul-result-375')

// ---------- 4-0：会話（書いて間違える → 答えを見る → ふり返り） ----------

await openStudy()
await click('会話をもう一度')
const entries = await evaluate(`document.querySelectorAll('.lesson-item').length`)
let played = false
for (let i = 0; i < entries && !played; i++) {
  await evaluate(`document.querySelectorAll('.lesson-item')[${i}].click()`)
  await sleep(150)
  for (let k = 0; k < 30 && !(await evaluate(`!!document.querySelector('.answer')`)); k++) {
    await evaluate(`document.querySelector('.dialogue__next')?.click()`)
    await sleep(120)
  }
  if (!(await evaluate(`!!document.querySelector('.mode-tab[aria-label="書いて答える"]')`))) {
    await click('やめる')
    await sleep(150)
    continue
  }
  played = true
  await evaluate(`document.querySelector('.mode-tab[aria-label="書いて答える"]').click()`)
  await sleep(100)
  await click('端末のキーボードを使う')
  for (const wrong of ['모르겠어요', '잘 모르겠어요']) {
    await typeInto('input[aria-label="答え（韓国語）"]', wrong)
    await click('答える')
    await sleep(120)
    check(`375 会話：書いて間違えたら、自分の答え「${wrong}」を出す（正解はまだ出さない）`, (await mainText()).includes(`あなたの答え：「${wrong}」`))
  }
  await click('答えを見る')
  await sleep(150)
  const compare = await evaluate(`document.querySelector('.dialogue .answer-compare')?.textContent ?? ''`)
  check('375 会話：「答えを見る」の後、最後に書いた答えと正解を並べる', compare.includes('잘 모르겠어요') && compare.includes('正解'), compare)
  await shot('feedback-conversation-reveal-375')
  for (let k = 0; k < 60 && !(await evaluate(`!!document.querySelector('.conversation-review')`)) && (await evaluate(`!!document.querySelector('.conversation')`)); k++) {
    await evaluate(`(() => {
      const n = document.querySelector('.dialogue__next'); if (n) { n.click(); return }
      const tab = document.querySelector('.mode-tab[aria-label="選んで答える"]'); if (tab && tab.getAttribute('aria-pressed') !== 'true') { tab.click(); return }
      const ch = [...document.querySelectorAll('.choice__button:not([disabled])')]; if (ch.length) ch[0].click() })()`)
    await sleep(120)
  }
  const review = await evaluate(`(() => { const r = document.querySelector('.conversation-review'); return r ? { text: r.textContent, compares: r.querySelectorAll('.answer-compare').length } : null })()`)
  check('375 会話の最後のふり返り：書いて間違えた答え（2つ）を、それぞれ正解と並べる', review !== null && review.compares >= 2 && review.text.includes('모르겠어요'), JSON.stringify(review).slice(0, 300))
  await shot('feedback-conversation-review-375')
  await layoutCheck('375 会話のふり返り')
}
check('375 会話をもう一度：書いて答えられる会話がある', played)

b.finish()
