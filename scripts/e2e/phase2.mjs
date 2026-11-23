// Phase 2「文字と音」の確認：物語の中の「ハングルは読めますか？」（第1章の先生の授業）→ ハングルのレッスン1（小テストに合格）→ 物語へ、
// 学習画面・レッスン一覧、日本語訳の表示の切り替え、話して答える（マイク）の表示、設定画面。
// 実機確認で見つかった不具合の確認：指のタップで効果音が鳴る準備ができること（BUG-002）、
// 小さい画面でも「話して答える前に」のボタンが押せること（BUG-003）、幅320〜390pxでキーボードがはみ出さないこと（BUG-005）。
// ヘッドレスのブラウザには韓国語の音声がないことが多い。その場合は「音声なし」の側の動きを確かめる。
// 使い方は scripts/e2e/README.md。

import { readdirSync, readFileSync } from 'node:fs'
import { FAST_SETTINGS, openBrowser, saveAtHome, sleep } from './browser.mjs'

const b = await openBrowser('phase2')
const { evaluate, click, chooseMode, heading, mainText, saved, stepHeading, viewport, shot, view, freshStart, check, layoutCheck, nextCards, send, advanceEvent } = b
const atHome = `!document.querySelector('.event-header') && document.querySelector('h1')?.textContent.trim() === '自宅'`

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
const vocabById = new Map(readdirJson('src/data/vocabulary').map((v) => [v.id, v]))
for (const v of vocabById.values()) answerOf.set(v.korean, { ...answerOf.get(v.korean), reading: v.pronunciation, meaning: v.japanese })

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

  // --- はじめから → 第1章のおはなし → 先生の授業で「ハングルは読めますか？」→ ハングルから学ぶ → レッスン1 ---
  await freshStart()
  await recordSpeech()
  await click('はじめから')
  await advanceEvent(atHome, '空港・タクシーのおはなしの後')
  await click('ノートパソコンを開く')
  await advanceEvent(`!!document.querySelector('.hangul-intro')`, 'ハングルは読めますか？')
  check(`${P} 先生の授業で、ハングルを読めるかを聞く`, (await mainText()).includes('ハングルは読めますか？'))
  await layoutCheck(`${P} ハングルは読めますか`)
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
  check(`${P} 全問まちがえると不合格`, (await mainText()).includes('あと少し！') && (await mainText()).includes(`${total}問中 0問正解`))
  check(`${P} 不合格では記録しない`, (await saved()).learning.hangul[firstLesson.id] === undefined)
  await click('もう一度小テスト')
  const xp0 = (await saved()).stats.xp
  await takeQuiz(0)
  check(`${P} 全問正解で合格（100点）`, (await mainText()).includes('合格！') && (await mainText()).includes('100点'))
  const s1 = await saved()
  check(`${P} 合格を記録し、経験値 +20`, s1.learning.hangul[firstLesson.id]?.bestScore === 100 && s1.stats.xp - xp0 === 20, JSON.stringify(s1.learning.hangul) + ` xp ${xp0}→${s1.stats.xp}`)
  if (W === 375) await shot('result-375')
  await click('物語に戻る')
  check(`${P} 物語に戻る → 自宅（先生の授業は終わり）`, (await heading()) === '自宅')

  // --- 自宅 → 勉強する → ハングル一覧 ---
  await click('勉強する（復習・練習・ハングル）')
  check(`${P} 学習画面`, (await heading()) === '勉強する')
  check(`${P} 合格したレッスンの数`, (await mainText()).includes(`ハングル（1 / ${lessons.length} レッスン合格）`), await mainText())
  const listeningDisabled = await evaluate(`[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'リスニング')?.disabled`)
  check(`${P} リスニングは、韓国語の音声がなければ押せず理由を出す`, audio ? !listeningDisabled : listeningDisabled && (await mainText()).includes('リスニングは使えません'))
  await layoutCheck(`${P} 学習画面`)
  await click(`ハングル（1 / ${lessons.length} レッスン合格）`)
  check(`${P} レッスン一覧（${lessons.length}本、1本目は合格）`, (await evaluate(`document.querySelectorAll('.lesson-item').length`)) === lessons.length && (await mainText()).includes('合格（100点）'))
  await layoutCheck(`${P} レッスン一覧`)
  if (W === 375) await shot('lesson-list-375')
  const draftBadges = await evaluate(`document.querySelectorAll('.lesson-item .draft-badge').length`)
  check(`${P} 「仮データ」の印は reviewed: false のレッスンだけ（${lessons.filter((l) => !l.reviewed).length}本）`, draftBadges === lessons.filter((l) => !l.reviewed).length, String(draftBadges))
  const openLesson = async (lesson) => {
    await evaluate(`[...document.querySelectorAll('.lesson-item')].find((b) => b.textContent.includes(${JSON.stringify(lesson.titleJa)})).click()`)
    await sleep(150)
  }
  const batchim = lessons.find((l) => l.kind === 'batchim')
  if (batchim !== undefined) {
    await openLesson(batchim)
    await click('文字を見る')
    check(`${P} パッチムのカード`, (await mainText()).includes(`パッチム：${batchim.finals[0].sound} の音になる文字`))
    await click('やめる')
    check(`${P} やめる → レッスン一覧`, (await heading()) === 'ハングル')
  }
  const soundChange = lessons.find((l) => l.kind === 'soundChange')
  if (soundChange !== undefined) {
    const rule = soundChange.rules[0]
    await openLesson(soundChange)
    await click('文字を見る')
    check(`${P} 音の変化のカード（${rule.titleJa}、[${rule.examples[0].spoken}]）`, (await mainText()).includes(rule.titleJa) && (await mainText()).includes(`[${rule.examples[0].spoken}]`))
    for (let i = 1; i < soundChange.rules.length; i++) await click('次へ')
    await click('小テストへ')
    // 小テストは「発音どおりの形を選ぶ」「カタカナの読みを選ぶ」「聞いてつづりを選ぶ（音声があるときだけ）」。どの変化かを選ぶ問題は出さない（Phase 2.5 計画 Q12）
    const speechOk = await speechAvailable()
    const headings = []
    for (let i = 0; i < 20 && (await stepHeading()) !== ''; i++) {
      headings.push(await stepHeading())
      if (i === 0 && W === 375) await shot('sound-change-quiz-375')
      await evaluate(`document.querySelector('.quiz-option')?.click()`)
      await sleep(50)
      const nextLabel = await evaluate(`[...document.querySelectorAll('main button')].map((b) => b.textContent.trim()).find((t) => t === '次へ' || t === '結果を見る') ?? ''`)
      if (nextLabel === '') break
      await click(nextLabel)
      if (nextLabel === '結果を見る') break
    }
    const kinds = new Set(headings.map((h) => (h.includes('発音どおり') ? 'spoken' : h.includes('読みを選んで') ? 'kana' : h.includes('つづり') ? 'spelling' : h)))
    check(`${P} 音の変化の小テストは、発音どおりの形・カタカナの読み${speechOk ? '・聞いてつづり' : ''}を選ぶ（${headings.length}問）`, kinds.has('spoken') && kinds.has('kana') && [...kinds].every((k) => ['spoken', 'kana', 'spelling'].includes(k)) && kinds.has('spelling') === speechOk, JSON.stringify([...kinds]))
    // 結果画面にも「間違えた問題」の見出しがあるので、結果画面かどうかは .result で見分ける
    if (!(await evaluate(`!!document.querySelector('.result')`))) await click('やめる')
    else await click('レッスン一覧へ', { exact: false })
  }
  const reading = lessons.find((l) => l.kind === 'reading')
  if (reading !== undefined) {
    await openLesson(reading)
    await click('読んでみる')
    const items = await evaluate(`[...document.querySelectorAll('.word-item__ko')].map((e) => e.textContent)`)
    const expected = [...(reading.words ?? []).map((w) => w.korean), ...reading.vocabulary.map((id) => vocabById.get(id)?.korean)]
    check(`${P} 「${reading.titleJa}」で教材の単語（${expected.length}語）を読む`, JSON.stringify(items) === JSON.stringify(expected), JSON.stringify(items))
    await click('やめる')
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
  await freshStart({ settings: { ...FAST_SETTINGS, translation: mode }, save: saveAtHome() })
  await click('つづきから')
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
  // 説明は画面の一番外側（#overlay-root）に重ねて出すので、main の外を探す
  check('初めてマイクを押すと、音声が外部で処理されることがあると説明する', (await evaluate(`document.querySelector('.overlay')?.textContent ?? ''`)).includes('提供元（Google・Apple など）のサーバー'))
  await shot('voice-notice-375')
  // 低い画面でも、説明のボタンが画面の中にあり、押せる（ほかのものに隠れていない）こと（BUG-003）
  for (const [w, h] of [
    [375, 560],
    [320, 480],
  ]) {
    await viewport(w, h, true)
    await sleep(200)
    const r = await evaluate(`(() => {
      const overlay = document.querySelector('.overlay')
      const buttons = [...overlay.querySelectorAll('button')].filter((b) => ['使う', '使わない'].includes(b.textContent.trim()))
      const reachable = buttons.map((b) => { const r = b.getBoundingClientRect(); const x = r.left + r.width / 2, y = r.top + r.height / 2
        return r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth && document.elementFromPoint(x, y)?.closest('button') === b })
      const panel = overlay.querySelector('.overlay__panel').getBoundingClientRect()
      return { inRoot: overlay.parentElement?.id === 'overlay-root', count: buttons.length, reachable, panel: [Math.round(panel.top), Math.round(panel.bottom)], ih: innerHeight }
    })()`)
    check(`話して答える前に（${w}×${h}）：画面全体に重ね、「使う」「使わない」が画面の中で押せる`, r.inRoot && r.count === 2 && r.reachable.every(Boolean) && r.panel[0] >= 0 && r.panel[1] <= r.ih, JSON.stringify(r))
    await view(`voice-notice-${w}x${h}`)
  }
  await viewport(375, 760, true)
  await sleep(150)
  await click('使わない')
  const settings = await evaluate(`JSON.parse(localStorage.getItem('seoul-life:settings'))`)
  check('「使わない」で音声入力をオフにし、「話す」を隠す（書いて答えるにする）', settings.voiceInput === false && settings.voiceInputNoticeSeen === true && !(await evaluate(`!!document.querySelector('.mode-tab[aria-label="話して答える"]')`)) && (await evaluate(`document.querySelector('.mode-tab[aria-pressed="true"]')?.getAttribute('aria-label')`)) === '書いて答える', JSON.stringify(settings))
}

// ゲーム内キーボードが、画面と返事の欄の板からはみ出さない（BUG-005）
await chooseMode('書いて答える')
for (const w of [320, 360, 375, 390]) {
  await viewport(w, 760, true)
  await sleep(200)
  const r = await evaluate(`(() => {
    const k = document.querySelector('.keyboard').getBoundingClientRect()
    const p = document.querySelector('.answer').getBoundingClientRect()
    return { iw: innerWidth, sw: document.documentElement.scrollWidth, kb: [k.left, k.right], panel: [p.left, p.right] }
  })()`)
  check(`キーボード（幅${w}px）：画面と板の中に収まる`, r.iw === w && r.sw <= w && r.kb[0] >= r.panel[0] - 0.5 && r.kb[1] <= r.panel[1] + 0.5 && r.kb[1] <= w, JSON.stringify(r))
  await layoutCheck(`キーボード（幅${w}px）`)
  if (w === 320) await view('keyboard-320')
}
await viewport(375, 760, true)

// --- 効果音：スマホの指のタップで音の準備ができ、鳴る（BUG-002） ---
// 音の部品（AudioContext）を記録する。ブラウザは「操作の前は音を出さない」設定で起動している（browser.mjs）
await send('Page.addScriptToEvaluateOnNewDocument', {
  source: `(() => { const C = window.AudioContext; if (!C) return; window.__audio = { contexts: [], oscillators: 0 }
    window.AudioContext = class extends C { constructor(...a) { super(...a); window.__audio.contexts.push(this) } createOscillator() { window.__audio.oscillators++; return super.createOscillator() } } })()`,
})
await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 })
await freshStart()
/** 指でボタンを触る（end が false なら、触れたまま離さない） */
async function touchButton(text, end = true) {
  const pt = await evaluate(`(() => { const b = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === ${JSON.stringify(text)}); const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } })()`)
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [pt] })
  await sleep(80)
  if (end) await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await sleep(250)
}
const audioState = () => evaluate(`window.__audio ? { n: window.__audio.contexts.length, state: window.__audio.contexts[0]?.state ?? null, osc: window.__audio.oscillators } : null`)
check('効果音：画面を開いただけでは音の部品を作らない', (await audioState())?.n === 0, JSON.stringify(await audioState()))
await touchButton('はじめから')
const afterTap = await audioState()
check('効果音：指でタップすると音の準備ができ（running）、ボタンの音が鳴る', afterTap?.n === 1 && afterTap.state === 'running' && afterTap.osc > 0, JSON.stringify(afterTap))
await send('Emulation.setTouchEmulationEnabled', { enabled: false })

// --- 話して答える：聞き取りの流れ（BUG-004） ---
// ヘッドレスにはマイクがないので、音声認識を偽物に置き換える。start のたびに __fakeSpeech の先頭を使い、
// 0.5秒後にマイクが動き出し（onstart）、0.9秒後に途中の結果、1.4秒後に確定した結果を返して終わる
await send('Page.addScriptToEvaluateOnNewDocument', {
  source: `(() => {
    const ev = (t, final) => ({ results: [Object.assign([{ transcript: t }], { isFinal: final })] })
    class FakeRecognition {
      start() {
        const step = (window.__fakeSpeech ?? []).shift()
        this.timers = [setTimeout(() => this.onstart?.(), 500)]
        if (!step) return
        if (step.interim) this.timers.push(setTimeout(() => this.onresult?.(ev(step.interim, false)), 900))
        this.timers.push(setTimeout(() => { this.onresult?.(ev(step.final, true)); this.onend?.() }, 1400))
      }
      stop() { this.timers?.forEach(clearTimeout); this.onend?.() }
      abort() { this.timers?.forEach(clearTimeout); this.onerror?.({ error: 'aborted' }); this.onend?.() }
    }
    window.SpeechRecognition = FakeRecognition
    window.webkitSpeechRecognition = FakeRecognition
  })()`,
})
await freshStart({ settings: { ...FAST_SETTINGS, voiceInputNoticeSeen: true }, save: saveAtHome() })
await click('つづきから')
await click('玄関に出る')
for (let i = 0; i < 6 && !(await evaluate(`!!document.querySelector('.dialogue')`)); i++) {
  if (await evaluate(`!!document.querySelector('.learn-card')`)) await nextCards(Number(/\/\s*(\d+)/.exec(await stepHeading())?.[1]))
  else await click('次へ')
}
for (let i = 0; i < 20 && !(await evaluate(`!!document.querySelector('.answer')`)); i++) {
  await evaluate(`(() => { const s = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === '会話をはじめる'); if (s) { s.click(); return } document.querySelector('.dialogue__next')?.click() })()`)
  await sleep(150)
}
await chooseMode('話して答える')
// 1回目：文の途中まで → 違う文（안녕히 계세요）。2回目：つなぎの声＋母音のつづり違い（음 안녕하새요）は通じる
await evaluate(`window.__fakeSpeech = [{ interim: '안녕', final: '안녕히 계세요' }, { final: '음 안녕하새요' }]`)
const micText = () => evaluate(`document.querySelector('.mic__button')?.textContent.trim() ?? ''`)
const answerText = () => evaluate(`document.querySelector('.answer')?.textContent ?? ''`)
await evaluate(`document.querySelector('.mic__button').click()`)
await sleep(150)
check('話す：押した直後は「準備中」（まだ話さない）', (await micText()).includes('準備中'), await micText())
await sleep(550)
check('話す：マイクが動き出したら「どうぞ、話してください」', (await micText()).includes('どうぞ、話してください'), await micText())
await sleep(350)
check('話す：途中の結果を「聞こえた言葉」として出す', (await answerText()).includes('聞こえた言葉：「안녕」'), await answerText())
await shot('speak-listening-375')
await sleep(700)
const failed = await answerText()
check('話す：違う文なら、聞き取った言葉とコツを出し、ボタンを「もう一度話す」にする', failed.includes('聞き取った言葉：「안녕히 계세요」') && failed.includes('ゆっくり、はっきり') && (await micText()) === 'もう一度話す', failed)
check('話す：通じなかった言葉は、マイクのボタンより上に出す', await evaluate(`(() => { const n = document.querySelector('.answer .notice'); const m = document.querySelector('.answer .mic__button'); return !!n && !!m && n.getBoundingClientRect().bottom <= m.getBoundingClientRect().top })()`))
await layoutCheck('話す：通じなかったとき')
await shot('speak-retry-375')
const xpBefore = (await saved()).stats.xp
await evaluate(`document.querySelector('.mic__button').click()`)
await sleep(1700)
check('話す：つなぎの声（음）と同じ音の母音のつづり違い（새）は通じ、書いて正解と同じ経験値（+15）', !(await evaluate(`!!document.querySelector('.answer')`)) && (await saved()).stats.xp - xpBefore === 15, `xp ${xpBefore}→${(await saved()).stats.xp}`)

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
