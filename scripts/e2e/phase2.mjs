// Phase 2「文字と音」の確認：はじめからの案内 → ハングルのレッスン1（小テストに合格）→ 物語へ、
// 学習画面・レッスン一覧、日本語訳の表示の切り替え、話して答える（マイク）の表示、設定画面。
// ヘッドレスのブラウザには韓国語の音声がないことが多い。その場合は「音声なし」の側の動きを確かめる。
// 使い方は scripts/e2e/README.md。

import { readdirSync, readFileSync } from 'node:fs'
import { FAST_SETTINGS, openBrowser, sleep } from './browser.mjs'

const b = await openBrowser('phase2')
const { evaluate, click, chooseMode, heading, mainText, saved, stepHeading, viewport, shot, freshStart, check, layoutCheck, nextCards, send } = b

/** フォルダの JSON（配列）をすべて読んでつなげる */
function readdirJson(dir) {
  return readdirSync(dir)
    .filter((n) => n.endsWith('.json'))
    .flatMap((n) => JSON.parse(readFileSync(`${dir}/${n}`, 'utf8')))
}

// 小テストの正解を求めるため、ハングルの教材を読む（レッスンの最初の1本を使う）
const lessons = readdirJson('src/data/hangul').sort((x, y) => x.order - y.order)
const firstLesson = lessons[0]
const answerOf = new Map() // 韓国語 → { reading, meaning, spoken }
for (const l of lessons) {
  for (const s of [...(l.letters ?? []).flatMap((x) => x.sounds), ...(l.finals ?? []).flatMap((f) => f.sounds)]) answerOf.set(s.korean, { ...answerOf.get(s.korean), reading: s.pronunciation })
  for (const w of l.words ?? []) answerOf.set(w.korean, { ...answerOf.get(w.korean), reading: w.pronunciation, meaning: w.japanese })
  for (const r of l.rules ?? []) for (const e of r.examples) answerOf.set(e.korean, { ...answerOf.get(e.korean), spoken: e.spoken })
}
for (const f of ['ch01', 'ch03_cafe']) {
  for (const v of JSON.parse(readFileSync(`src/data/vocabulary/${f}.json`, 'utf8'))) answerOf.set(v.korean, { ...answerOf.get(v.korean), reading: v.pronunciation, meaning: v.japanese })
}

const target = () => evaluate(`document.querySelector('.quiz-target')?.textContent.trim() ?? ''`)

/** 読み上げた文を記録する（ヘッドレスで音声がなくても、聞いて選ぶ問題の正解が分かるように） */
async function recordSpeech() {
  await evaluate(`(() => { if (!window.speechSynthesis || window.__spokenHooked) return; window.__spokenHooked = true; const orig = window.speechSynthesis.speak.bind(window.speechSynthesis); window.speechSynthesis.speak = (u) => { window.__spoken = u.text; return orig(u) } })()`)
}

/** 小テストを1問答える。correct が false なら、わざと間違える */
async function answerQuestion(correct = true) {
  const head = await stepHeading()
  let answer
  if (head.includes('音を聞いて')) {
    await click('▶ 音を聞く')
    answer = await evaluate(`window.__spoken ?? ''`)
  } else if (head.includes('組み立てて')) {
    const t = await target()
    await click('端末のキーボードを使う')
    await evaluate(`document.querySelector('.answer-input__field').focus()`)
    await send('Input.insertText', { text: correct ? t : 'ㅋ' })
    await sleep(100)
    await click('答える')
    return
  } else {
    const t = await target()
    const info = answerOf.get(t) ?? {}
    answer = head.includes('読み') ? info.reading : head.includes('意味') ? info.meaning : `[${info.spoken}]`
  }
  const ok = await evaluate(`(() => {
    const opts = [...document.querySelectorAll('.quiz-option')]
    const plain = (b) => b.textContent.replace('（正解）', '').trim()
    const pick = ${correct} ? opts.find((o) => plain(o) === ${JSON.stringify(answer)}) : opts.find((o) => plain(o) !== ${JSON.stringify(answer)})
    if (!pick) return false; pick.click(); return true })()`)
  if (!ok) throw new Error(`選択肢が見つかりません：${head} / ${answer}`)
  await sleep(120)
}

/** 小テストを最後まで答える（wrong 問だけ間違える） */
async function takeQuiz(wrong = 0) {
  const total = Number((await evaluate(`document.querySelector('.quiz .muted')?.textContent ?? ''`)).split('/')[1])
  for (let i = 0; i < total; i++) {
    await answerQuestion(i >= wrong)
    await click(i === total - 1 ? '結果を見る' : '次へ')
  }
  return total
}

const speechAvailable = async () => evaluate(`!!window.speechSynthesis && speechSynthesis.getVoices().some((v) => v.lang.toLowerCase().startsWith('ko'))`)
const recognitionInBrowser = async () => evaluate(`'SpeechRecognition' in window || 'webkitSpeechRecognition' in window`)

for (const [W, H, mobile] of [
  [375, 760, true],
  [1280, 800, false],
]) {
  const P = `${W}`
  await viewport(W, H, mobile)

  // --- はじめから → ハングルから学ぶ → レッスン1 ---
  await freshStart()
  await recordSpeech()
  await click('はじめから')
  check(`${P} はじめから → ハングルを読めるかを聞く`, (await heading()) === 'ハングルは読めますか？')
  await layoutCheck(`${P} はじめからの案内`)
  await click(`ハングルから学ぶ（${firstLesson.titleJa}）`)
  check(`${P} レッスン1を開く`, (await heading()).includes(firstLesson.titleJa), await heading())
  check(`${P} 続きは「勉強する」から進められると案内する`, (await mainText()).includes('「勉強する」→「ハングル」'))
  check(`${P} 仮データの印を出す`, (await mainText()).includes('仮データ') === !firstLesson.reviewed)
  await click('文字を見る')
  check(`${P} 文字のカード（1 / ${firstLesson.letters.length}）`, (await mainText()).includes(`1 / ${firstLesson.letters.length}`))
  check(`${P} 文字と音節とカタカナを表示`, (await mainText()).includes(firstLesson.letters[0].jamo) && (await mainText()).includes(firstLesson.letters[0].sounds[0].pronunciation))
  await layoutCheck(`${P} 文字のカード`)
  if (W === 375) await shot('lesson-card-375')
  for (let i = 1; i < firstLesson.letters.length; i++) await click('次へ')
  await click('言葉を読む')
  check(`${P} 読む練習の言葉（${firstLesson.words.length}語）`, (await evaluate(`document.querySelectorAll('.word-item').length`)) === firstLesson.words.length)
  await click('読みと意味を見る', { exact: true })
  check(`${P} 読みと意味を表示`, (await mainText()).includes(firstLesson.words[0].japanese))
  await click('小テストへ')
  const audio = await speechAvailable()
  check(`${P} 小テストを始める（音声${audio ? 'あり' : 'なし'}）`, (await mainText()).includes('小テスト 1 /'))
  await layoutCheck(`${P} 小テスト`)
  if (W === 375) await shot('quiz-375')
  // わざと全問間違えて、不合格 → もう一度
  const total = await takeQuiz(99)
  check(`${P} 全問まちがえると不合格`, (await mainText()).includes('もう少し！') && (await mainText()).includes(`${total}問中 0問正解`))
  check(`${P} 不合格では記録しない`, (await saved()).learning.hangul[firstLesson.id] === undefined)
  await click('もう一度小テスト')
  const xp0 = (await saved()).stats.xp
  await takeQuiz(0)
  check(`${P} 全問正解で合格（100点）`, (await mainText()).includes('合格！') && (await mainText()).includes('100点'))
  const s1 = await saved()
  check(`${P} 合格を記録し、経験値 +20`, s1.learning.hangul[firstLesson.id]?.bestScore === 100 && s1.stats.xp - xp0 === 20, JSON.stringify(s1.learning.hangul) + ` xp ${xp0}→${s1.stats.xp}`)
  if (W === 375) await shot('result-375')
  await click('物語を始める')
  check(`${P} 物語を始める → 自宅`, (await heading()) === '自宅')

  // --- 自宅 → 勉強する → ハングル一覧 ---
  await click('勉強する（ハングル・リスニング）')
  check(`${P} 学習画面`, (await heading()) === '勉強する')
  check(`${P} 合格したレッスンの数`, (await mainText()).includes(`ハングル（1 / ${lessons.length} レッスン合格）`), await mainText())
  const listeningDisabled = await evaluate(`[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'リスニング')?.disabled`)
  check(`${P} リスニングは、韓国語の音声がなければ押せず理由を出す`, audio ? !listeningDisabled : listeningDisabled && (await mainText()).includes('リスニングは使えません'))
  await layoutCheck(`${P} 学習画面`)
  await click(`ハングル（1 / ${lessons.length} レッスン合格）`)
  check(`${P} レッスン一覧（${lessons.length}本、1本目は合格）`, (await evaluate(`document.querySelectorAll('.lesson-item').length`)) === lessons.length && (await mainText()).includes('合格（100点）'))
  await layoutCheck(`${P} レッスン一覧`)
  if (W === 375) await shot('lesson-list-375')
  const batchim = lessons.find((l) => l.kind === 'batchim')
  if (batchim !== undefined) {
    await evaluate(`[...document.querySelectorAll('.lesson-item')].find((b) => b.textContent.includes(${JSON.stringify(batchim.titleJa)})).click()`)
    await sleep(150)
    await click('文字を見る')
    check(`${P} パッチムのカード`, (await mainText()).includes(`パッチム：${batchim.finals[0].sound} の音になる文字`))
    await click('やめる')
    check(`${P} やめる → レッスン一覧`, (await heading()) === 'ハングル')
  }
  await click('戻る')
  await click('戻る')
  check(`${P} 戻る → 自宅`, (await heading()) === '自宅')
}

// --- 日本語訳の表示（設定）と、話して答える ---
await viewport(375, 760, true)
for (const [mode, expectButton, expectText] of [
  ['tap', true, false],
  ['off', false, false],
  ['always', false, true],
]) {
  await freshStart({ settings: { ...FAST_SETTINGS, translation: mode } })
  await click('はじめから')
  await click('このまま物語を始める')
  await click('玄関に出る')
  // 案内文 → 単語カード → 会話
  for (let i = 0; i < 6 && !(await evaluate(`!!document.querySelector('.dialogue')`)); i++) {
    if (await evaluate(`!!document.querySelector('.learn-card')`)) await nextCards(Number(/\/\s*(\d+)/.exec(await stepHeading())?.[1]))
    else await click('次へ')
  }
  await evaluate(`(() => { const s = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === '会話をはじめる'); if (s) s.click() })()`)
  await sleep(150)
  const ja = await evaluate(`document.querySelector('.dialogue__ja')?.textContent.trim() ?? null`)
  const hasButton = ja === '日本語訳を見る'
  check(`訳「${mode}」：台詞の訳 ${expectText ? 'を表示' : expectButton ? 'はボタンで出す' : 'を出さない'}`, hasButton === expectButton && (expectText ? ja !== null && !hasButton : true) && (mode === 'off' ? ja === null : true), String(ja))
  if (mode === 'tap') {
    await click('日本語訳を見る')
    const opened = await evaluate(`document.querySelector('.dialogue__ja')?.textContent.trim() ?? ''`)
    check('訳「tap」：押すと訳を表示し、もう一度押すと隠す', opened !== '' && opened !== '日本語訳を見る', opened)
    await shot('translation-tap-375')
  }
}

// 話して答える：書く問題のある往復まで進める
for (let i = 0; i < 20 && !(await evaluate(`!!document.querySelector('.answer')`)); i++) {
  await evaluate(`document.querySelector('.dialogue__next')?.click()`)
  await sleep(150)
}
const recognition = await recognitionInBrowser()
const speakTab = await evaluate(`!!document.querySelector('.mode-tab[aria-label="話して答える"]')`)
check(`話して答える：音声認識が${recognition ? 'ある' : 'ない'}ブラウザでは「話す」を${recognition ? '出す' : '出さない'}`, speakTab === recognition)
if (recognition) {
  await layoutCheck('答え方が3つのとき')
  await shot('speak-tabs-375')
  await chooseMode('話して答える')
  // 「話す」はタブ（短い名前）とマイクの両方にあるので、マイクはクラスで押す
  await evaluate(`document.querySelector('.mic__button').click()`)
  await sleep(150)
  check('初めてマイクを押すと、音声が外部で処理されることがあると説明する', (await mainText()).includes('提供元（Google・Apple など）のサーバー'))
  await shot('voice-notice-375')
  await click('使わない')
  const settings = await evaluate(`JSON.parse(localStorage.getItem('seoul-life:settings'))`)
  check('「使わない」で音声入力をオフにし、「話す」を隠す（書いて答えるにする）', settings.voiceInput === false && settings.voiceInputNoticeSeen === true && !(await evaluate(`!!document.querySelector('.mode-tab[aria-label="話して答える"]')`)) && (await evaluate(`document.querySelector('.mode-tab[aria-pressed="true"]')?.getAttribute('aria-label')`)) === '書いて答える', JSON.stringify(settings))
}

// --- 設定画面 ---
await freshStart()
await click('設定')
const settingsText = await mainText()
check('設定：日本語訳と音声入力の項目がある', settingsText.includes('日本語訳') && settingsText.includes('音声入力（話して答える）'))
check('設定：音声認識がない環境では理由を出す', recognition || settingsText.includes('この環境では使えません'))
await evaluate(`document.querySelector('input[name="translation"][value="off"]').click()`)
await sleep(100)
check('設定：日本語訳の選択を保存する', (await evaluate(`JSON.parse(localStorage.getItem('seoul-life:settings')).translation`)) === 'off')
await layoutCheck('設定画面')
await shot('settings-375')

b.finish()
