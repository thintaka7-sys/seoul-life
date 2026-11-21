// Phase 2.6 の確認：答えた後の見せ方（GAME_SPEC 4-0）と、聞き分け練習（4-10）。
// ヘッドレスのブラウザには韓国語の音声がないことが多いので、偽の読み上げ（何を・どの速さで読んだかを記録する）を入れて確かめる。
// 実際の音が聞き分けられるかは、実機で確かめる（報告では未確認に入れる）。使い方は scripts/e2e/README.md。

import { openBrowser, sleep } from './browser.mjs'
import { practiceAnswers, readdirJson } from './practice-answers.mjs'

const b = await openBrowser('phase26')
const { evaluate, click, mainText, viewport, shot, freshStart, check, layoutCheck, send, saved, reload } = b
const { readQuestion, correctAnswer, typeInto, norm } = practiceAnswers(b)
const earSets = readdirJson('src/data/ear')

// ---------- 偽の読み上げ・日付 ----------

// localStorage の e2e:noSpeech があれば、韓国語の音声がない端末にする
await send('Page.addScriptToEvaluateOnNewDocument', {
  source: `(() => {
    const voice = { lang: 'ko-KR', name: 'e2e', localService: true, default: false, voiceURI: 'e2e-ko' }
    const noSpeech = localStorage.getItem('e2e:noSpeech') === '1'
    window.__spokenLog = []
    const synth = {
      speaking: false, pending: false, paused: false,
      getVoices: () => (noSpeech ? [] : [voice]),
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

// ページの「今」を dayOffset 日進める（phase25.mjs と同じ。localStorage の e2e:dayOffset）
await send('Page.addScriptToEvaluateOnNewDocument', {
  source: `(() => { const days = Number(localStorage.getItem('e2e:dayOffset') || 0); if (!days) return; const off = days * 86400000; const R = Date;
    class D extends R { constructor(...a) { if (a.length === 0) super(R.now() + off); else super(...a) } static now() { return R.now() + off } }
    window.Date = D })()`,
})
const pad = (n) => String(n).padStart(2, '0')
const dayAfter = (n) => {
  const d = new Date(Date.now() + n * 86400000)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

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

// ---------- 4-10：聞き分け練習 ----------

const firstSet = earSets[0]
const themes = [...new Set(earSets.map((e) => e.theme))]
for (const [W, H, mobile] of [
  [320, 640, true],
  [1280, 800, false],
]) {
  const P = `${W}`
  await viewport(W, H, mobile)
  await openStudy()
  await click('聞き分け')
  const list = await evaluate(`({ themes: document.querySelectorAll('main h2.step-heading').length, sets: document.querySelectorAll('.lesson-item').length })`)
  check(`${P} 聞き分け：組（${earSets.length}組）をテーマ（${themes.length}つ）ごとにまとめて出す`, list.themes === themes.length && list.sets === earSets.length, JSON.stringify(list))
  await layoutCheck(`${P} 聞き分けの組の一覧`)
  if (P === '320') await shot('ear-list-320')

  // 試しに聞く
  await evaluate(`document.querySelector('.lesson-item').click()`)
  await sleep(150)
  const preview = await evaluate(`[...document.querySelectorAll('.ear-preview__item')].map((li) => li.textContent)`)
  check(`${P} 試しに聞く：組の音（${firstSet.items.length}つ）を意味つきで出す`, preview.length === firstSet.items.length && firstSet.items.every((i, k) => preview[k].includes(i.korean) && preview[k].includes(i.japanese)), JSON.stringify(preview))
  const second = firstSet.items[1]
  await evaluate(`document.querySelectorAll('.ear-preview__item')[1].querySelectorAll('button')[0].click()`)
  await sleep(60)
  const normal = await lastSpoken()
  await evaluate(`document.querySelectorAll('.ear-preview__item')[1].querySelectorAll('button')[1].click()`)
  await sleep(60)
  const slow = await lastSpoken()
  check(`${P} 試しに聞く：音ごとに「▶ ふつう」（速さ1）と「ゆっくり」（0.7）で聞ける`, normal?.text === second.korean && normal?.rate === 1 && slow?.text === second.korean && slow?.rate === 0.7, JSON.stringify([normal, slow]))
  check(`${P} 試しに聞く：聞き分けのこつを出す`, (await mainText()).includes(firstSet.tipJa))
  await layoutCheck(`${P} 試しに聞く`)
  if (P === '320') await shot('ear-preview-320')

  // 練習する：1問目だけわざと間違える
  await click('練習する')
  const own = firstSet.items.map((i) => i.korean).sort().join('|')
  const targets = []
  let sameSet = true
  let meaningsBefore = true
  let noFurigana = true
  let wrongGiven = null
  for (let i = 0; i < 25 && !(await evaluate(`!!document.querySelector('.result')`)); i++) {
    const q = await readQuestion()
    const retry = (q.position ?? '').includes('もう一度')
    const options = q.options.map((o) => (o.match(/^[가-힣 ]+/)?.[0] ?? o).trim())
    if (options.sort().join('|') !== own) sameSet = false
    if ((await evaluate(`document.querySelectorAll('.quiz-option .quiz-option__meaning').length`)) !== firstSet.items.length) meaningsBefore = false
    if ((await furiganaInOptions()) !== 0) noFurigana = false
    await click('▶ 聞く')
    const target = (await lastSpoken())?.text
    if (!retry) targets.push(target)
    const wrong = i === 0
    const choice = wrong ? firstSet.items.map((x) => x.korean).find((k) => k !== target) : target
    await evaluate(`(() => { const o = [...document.querySelectorAll('.quiz-option')].find((b) => b.querySelector('.ko-text') && (${plain})(b.querySelector('.ko-text')) === ${JSON.stringify(choice)}); o.click() })()`)
    await sleep(100)
    if (wrong) {
      wrongGiven = choice
      check(`${P} 聞き分け：間違えると ✗・✓ と、聞き分けのこつを出す`, (await marks()).includes('✗ あなたの答え') && (await mainText()).includes(firstSet.tipJa))
      await checkListenCompare(`${P} 聞き分け`, choice, target)
      await layoutCheck(`${P} 聞き分け：答えた後`)
      if (P === '320') await shot('ear-feedback-320')
    }
    await click((await nextLabel('.practice')) || '次へ')
  }
  check(`${P} 聞き分け：選択肢はいつも同じ組の音だけ`, sameSet)
  check(`${P} 聞き分け：選択肢には答える前から意味を出し、フリガナは出さない`, meaningsBefore && noFurigana)
  const counts = firstSet.items.map((i) => targets.filter((t) => t === i.korean).length)
  check(`${P} 聞き分け：${targets.length}問で、読み上げる音がかたよらない（回数の差は1回まで）`, targets.length === 10 && Math.max(...counts) - Math.min(...counts) <= 1, JSON.stringify(counts))
  const missed = await evaluate(`[...document.querySelectorAll('.missed__item')].map((li) => li.textContent)`)
  check(`${P} 聞き分けの結果画面：間違えた1問を、こつと一緒に見返せる`, missed.length === 1 && missed[0].includes(wrongGiven) && missed[0].includes(firstSet.tipJa), JSON.stringify(missed))
  const s = await saved()
  const record = s.learning.review[`ear:${firstSet.id}`]
  check(`${P} 間違えた組を復習に入れる（明日 ${dayAfter(1)}）`, record?.due === dayAfter(1), JSON.stringify(record))
  check(`${P} 聞き分けを1回終えると、今日のスタンプ`, s.daily.stamps.includes(dayAfter(0)), JSON.stringify(s.daily.stamps))
}

// 翌日の今日の復習に、聞き分けの組が出る（選択肢は同じ組の音だけ）。正解すると次の間隔へ
await evaluate(`localStorage.setItem('e2e:dayOffset', '1')`)
await reload()
await click('つづきから')
await click('勉強する（復習・練習・ハングル）')
await click('今日の復習', { exact: false })
await click('はじめる')
let earInReview = null
for (let i = 0; i < 30 && !(await evaluate(`!!document.querySelector('.result')`)) && earInReview === null; i++) {
  const q = await readQuestion()
  if (q.heading === 'どれが聞こえましたか') {
    await click('▶ 聞く')
    const target = (await lastSpoken())?.text
    earInReview = q.options.map((o) => (o.match(/^[가-힣 ]+/)?.[0] ?? o).trim()).sort().join('|')
    await evaluate(`(() => { const plain = ${plain}; const o = [...document.querySelectorAll('.quiz-option')].find((b) => b.querySelector('.ko-text') && plain(b.querySelector('.ko-text')) === window.__spoken); o.click() })()`)
    await sleep(100)
    check('375 今日の復習：聞き分けの組で正解できる', (await mainText()).includes('正解！'), target)
    break
  }
  // ほかの問題は正解して進める
  const right = await correctAnswer(q)
  if (q.options.length > 0) await clickOption(right)
  else if (q.tiles.length > 0) {
    for (const t of q.heading.includes('語を並べて') ? norm(right).split(' ') : [...norm(right)]) await evaluate(`[...document.querySelectorAll('.arrange__pool .letter-tile')].find((x) => x.textContent === ${JSON.stringify(t)} && !x.disabled).click()`)
    await click('答える')
  } else if (q.number) {
    await typeInto('input[aria-label="答え（数字）"]', right)
    await click('答える')
  } else {
    await click('端末のキーボードを使う')
    await typeInto('input[aria-label="答え（韓国語）"]', right)
    await click('答える')
  }
  await sleep(100)
  await click((await nextLabel('.practice')) || '次へ')
}
check(`翌日の今日の復習に、聞き分けの組が出る（選択肢は同じ組の音だけ）`, earInReview === firstSet.items.map((i) => i.korean).sort().join('|'), earInReview ?? '')
const afterReview = (await saved()).learning.review[`ear:${firstSet.id}`]
check('今日の復習で聞き分けの組に正解すると、次の間隔（3日後）へ', afterReview?.stage === 1 && afterReview?.due === dayAfter(1 + 3), JSON.stringify(afterReview))

// 韓国語の音声がない端末：聞き分けは練習できないと案内し、今日の復習では期限を残して出さない（3日後の期限の日に確かめる）
await evaluate(`localStorage.setItem('e2e:dayOffset', '4'); localStorage.setItem('e2e:noSpeech', '1')`)
await reload()
await sleep(2300)
await click('つづきから')
await click('勉強する（復習・練習・ハングル）')
check('音声のない端末：学習画面に、聞き分けが使えない理由を出す', (await mainText()).includes('聞き分けの練習は使えません'))
await click('聞き分け')
check('音声のない端末：組の一覧で案内し、まぜた練習は押せない', (await mainText()).includes('聞き分けの練習は使えません') && (await evaluate(`[...document.querySelectorAll('main button')].find((b) => b.textContent.includes('まぜて練習'))?.disabled === true`)))
await click('戻る')
await click('今日の復習', { exact: false })
check('音声のない端末：今日の復習に聞き分けの組を出さず、残っていることを案内する', (await mainText()).includes('聞き分けの組（1組）は、読み上げが使える端末で出ます'), (await mainText()).slice(0, 300))
await evaluate(`localStorage.removeItem('e2e:noSpeech'); localStorage.removeItem('e2e:dayOffset')`)

b.finish()
