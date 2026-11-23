// Phase 3 区切り3の確認：図と絵（GAME_SPEC 4-11）、形が変わる言葉（4-3。単語カード・図鑑・復習の問題）、
// 注文（4-4。分からない言い方・答えの例・偽の音声認識で話して注文）、
// 教材の図（ハングルのレッスンの説明・文字・パッチム・音の変化のカード、聞き分けの組）を、スマホ幅（320px）とPC幅で確かめる。
// 第1〜3章を通した流れ（読み物・注文・聞き取りの段階）は chapters.mjs で確かめる。
// 使い方: node scripts/e2e/phase3.mjs <URL>

import { readFileSync, readdirSync } from 'node:fs'
import { FAST_SETTINGS, openBrowser, saveAtHome, sleep } from './browser.mjs'

const b = await openBrowser('phase3')
const { send, evaluate, click, mainText, saved, viewport, shot, freshStart, check, layoutCheck } = b

const dataDir = new URL('../../src/data/', import.meta.url)
const readDir = (d) =>
  readdirSync(new URL(`${d}/`, dataDir))
    .filter((f) => f.endsWith('.json'))
    .sort()
    .flatMap((f) => JSON.parse(readFileSync(new URL(`${d}/${f}`, dataDir), 'utf8')))
const events = readDir('events')
const vocab = readDir('vocabulary')
const drills = readDir('drills')
const withForms = vocab.filter((v) => (v.forms ?? []).length > 0)
// 図の種類をすべて使った見本のドリル（仮データ）
const figureDrill = drills.find((d) => d.id === 'drill_901')
const lessons = readDir('hangul').sort((a, b) => a.order - b.order)
const earSets = readDir('ear')
/** 図の配列から、画面に出るはずの図の数・絵（画像）の数・断面図（SVG）の数を数える */
const expectFigures = (figures = []) => {
  const arts = figures.flatMap((f) => (f.type === 'image' ? [f.image] : f.type === 'compare' ? f.items.flatMap((i) => (i.image === undefined ? [] : [i.image])) : []))
  return { all: figures.length, img: arts.filter((k) => !k.startsWith('final_')).length, svg: arts.filter((k) => k.startsWith('final_')).length, fallback: 0 }
}
/** 画面の中の、先生の説明に入った図を数える（画像は読み込めたものだけ。絵がないときの札の一覧は fallback） */
const countFigures = () =>
  evaluate(`({
    all: document.querySelectorAll('.teacher-says .figure').length,
    img: [...document.querySelectorAll('.teacher-says .figure__img')].filter(i => i.complete && i.naturalWidth > 0).length,
    svg: document.querySelectorAll('.teacher-says .figure__svg').length,
    fallback: document.querySelectorAll('.teacher-says .figure__label-list').length,
  })`)
const waitImages = () => evaluate(`Promise.all([...document.querySelectorAll('.figure__img')].map(i => i.decode().catch(() => undefined)))`)
const orderEvent = events.find((e) => e.steps.some((s) => s.type === 'order'))
const orderId = orderEvent.steps.find((s) => s.type === 'order').id

const plain = (selector) =>
  evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return ''; const c = el.cloneNode(true); c.querySelectorAll('rt').forEach(r => r.remove()); return c.textContent.replace(/\\s+/g, ' ').trim() })()`)
const fillInput = (selector, value) =>
  evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(el, ${JSON.stringify(value)}); el.dispatchEvent(new Event('input', { bubbles: true })) })()`)

// ヘッドレスにはマイクがないので、音声認識を偽物に置き換える（phase2.mjs と同じ）
await send('Page.addScriptToEvaluateOnNewDocument', {
  source: `(() => {
    const ev = (t, final) => ({ results: [Object.assign([{ transcript: t }], { isFinal: final })] })
    class FakeRecognition {
      start() {
        const step = (window.__fakeSpeech ?? []).shift()
        this.timers = [setTimeout(() => this.onstart?.(), 300)]
        if (!step) return
        this.timers.push(setTimeout(() => { this.onresult?.(ev(step.final, true)); this.onend?.() }, 700))
      }
      stop() { this.timers?.forEach(clearTimeout); this.onend?.() }
      abort() { this.timers?.forEach(clearTimeout); this.onerror?.({ error: 'aborted' }); this.onend?.() }
    }
    window.SpeechRecognition = FakeRecognition
    window.webkitSpeechRecognition = FakeRecognition
  })()`,
})

const T = '2026-11-20T10:00:00.000Z'
const allDone = events.map((e) => e.id)
const words = Object.fromEntries(vocab.map((v) => [v.id, { learnedAt: T, chapter: 2 }]))
const formKeys = withForms.flatMap((v) => v.forms.map((f) => `form:${v.id}#${f.korean}`))
/** 形の問題だけを、今日の復習に出す */
const review = Object.fromEntries(formKeys.map((k) => [k, { stage: 0, due: '2000-01-01', correct: 0, wrong: 0, lastAt: null }]))
const SAVE = saveAtHome({ progress: { completedEvents: allDone, currentLocationId: 'home' }, learning: { words, review } })

for (const [W, H, mobile] of [
  [320, 700, true],
  [1280, 800, false],
]) {
  const P = `${W}`
  await viewport(W, H, mobile)
  await freshStart({ settings: { ...FAST_SETTINGS, voiceInputNoticeSeen: true }, save: SAVE })
  await click('つづきから')
  await sleep(200)

  // --- 図と絵（図の見本のドリル） ---
  await click('勉強する（復習・練習・ハングル）')
  await click('ドリル・テスト')
  await click(figureDrill.titleJa, { exact: false })
  await sleep(400)
  await waitImages()
  const figures = await evaluate(`({
    all: document.querySelectorAll('.figure').length,
    svg: document.querySelectorAll('.figure__svg').length,
    img: [...document.querySelectorAll('.figure__img')].filter(i => i.complete && i.naturalWidth > 0).length,
    labels: document.querySelectorAll('.figure__label').length,
    cells: document.querySelectorAll('.syllable-grid__cell').length,
    formation: document.querySelectorAll('.formation__result').length,
  })`)
  check(`${P} 図：比べる図・絵と札・パッチムの断面図（SVG）・音節のマス・部品とくっついた形を、説明の下に出す`, figures.all === figureDrill.figures.length && figures.svg === 3 && figures.img === 3 && figures.labels === 1 && figures.cells === 3 && figures.formation === 1, JSON.stringify(figures))
  check(`${P} 図は先生の説明の中に出す`, await evaluate(`!!document.querySelector('.teacher-says .figures')`))
  await layoutCheck(`${P} 図の見本`)
  await shot(`figures-${W}`)
  await click('戻る')
  await click('戻る')

  // --- 教材の図：ハングルのレッスン（説明・カード）。教材のとおりの数の図が、先生の説明の中に出る ---
  const lessonProblems = []
  let lessonFigures = 0
  await click('レッスン合格', { exact: false })
  for (const [li, lesson] of lessons.entries()) {
    await evaluate(`document.querySelectorAll('.lesson-item')[${li}].click()`)
    await sleep(200)
    await waitImages()
    const screens = [{ name: '説明', figures: lesson.figures }, ...(lesson.letters ?? []).map((x) => ({ name: x.jamo, figures: x.figures })), ...(lesson.finals ?? []).map((x) => ({ name: `パッチム${x.sound}`, figures: x.figures })), ...(lesson.rules ?? []).map((x) => ({ name: x.titleJa, figures: x.figures }))]
    for (const [si, screen] of screens.entries()) {
      if (si === 1) await click('文字を見る')
      else if (si > 1) await click('次へ')
      if (si > 0) {
        await sleep(120)
        await waitImages()
      }
      const want = expectFigures(screen.figures)
      const got = await countFigures()
      lessonFigures += got.all
      if (JSON.stringify(got) !== JSON.stringify(want)) lessonProblems.push({ lesson: lesson.id, screen: screen.name, want, got })
      if ((screen.figures ?? []).length > 0) await layoutCheck(`${P} ${lesson.id} ${screen.name} の図`)
      if (W === 320 && lesson.id === 'hangul_009' && si === 1) await shot('lesson-final-figure-320')
      if (W === 320 && lesson.id === 'hangul_006' && si === 0) await shot('lesson-compare-figure-320')
    }
    await click('やめる').catch(() => click('戻る'))
    await sleep(150)
    if ((await evaluate(`document.querySelector('h1')?.textContent.trim()`)) !== 'ハングル') await click('レッスン一覧へ', { exact: false }).catch(() => undefined)
  }
  const lessonFigureTotal = lessons.reduce((n, l) => n + [l, ...(l.letters ?? []), ...(l.finals ?? []), ...(l.rules ?? [])].reduce((m, x) => m + (x.figures ?? []).length, 0), 0)
  check(`${P} ハングルのレッスン：教材の図（${lessonFigureTotal}個）がすべて、絵も読み込めて出る`, lessonProblems.length === 0 && lessonFigures === lessonFigureTotal, JSON.stringify({ lessonFigures, lessonProblems }))
  await click('戻る')

  // --- 教材の図：聞き分けの組（試しに聞く画面の、先生のこつの中） ---
  await click('聞き分け', { exact: false })
  const earProblems = []
  for (const set of earSets.filter((s) => (s.figures ?? []).length > 0)) {
    await evaluate(`[...document.querySelectorAll('.lesson-item--plain')].find(b => b.querySelector('.lesson-item__title').firstChild.textContent === ${JSON.stringify(set.titleJa)}).click()`)
    await sleep(200)
    await waitImages()
    const want = expectFigures(set.figures)
    const got = await countFigures()
    if (JSON.stringify(got) !== JSON.stringify(want)) earProblems.push({ set: set.id, want, got })
    await layoutCheck(`${P} ${set.id} の図`)
    if (W === 320 && set.id === 'ear_001') await shot('ear-figure-320')
    await click('戻る')
    await sleep(120)
  }
  check(`${P} 聞き分け：教材の図（${earSets.filter((s) => (s.figures ?? []).length > 0).length}組）が、絵も読み込めて出る`, earProblems.length === 0, JSON.stringify(earProblems))
  await click('戻る')

  // --- 形が変わる言葉：今日の復習に形の問題が出る ---
  const reviewButton = await evaluate(`[...document.querySelectorAll('button')].find(b => b.textContent.startsWith('今日の復習'))?.textContent.trim() ?? ''`)
  check(`${P} 形が変わる言葉の問題が、今日の復習に出る（${formKeys.length}問）`, reviewButton === `今日の復習（${formKeys.length}問）`, reviewButton)
  await click(reviewButton)
  await click('はじめる').catch(() => undefined)
  let answered = 0
  const headings = new Set()
  for (let i = 0; i < formKeys.length + 4; i++) {
    const heading = await evaluate(`document.querySelector('.practice .step-heading')?.textContent ?? ''`)
    if (heading === '') break
    headings.add(heading)
    // 正解：部品からなら、くっついた形。くっついた形からなら、元の形（見出し語）
    const prompt = (await plain('.practice .practice-ja, .practice .quiz-target')).replace(/\s+/g, '')
    const target = withForms.flatMap((v) => v.forms.map((f) => ({ v, f }))).find(({ f }) => (heading.includes('くっつけた') ? prompt.startsWith(`${f.parts.join('＋')}→`) : prompt === f.korean))
    const answer = target === undefined ? '' : heading.includes('くっつけた') ? target.f.korean : (target.v.base?.korean ?? target.v.korean)
    const ok = await evaluate(`(() => { const plain = (el) => { const c = el.cloneNode(true); c.querySelectorAll('rt').forEach(r => r.remove()); return c.textContent.replace(/\\s+/g, '') }; const b = [...document.querySelectorAll('.practice .choice__button')].find(b => plain(b).startsWith(${JSON.stringify(answer)})); if (!b) return false; b.click(); return true })()`)
    if (!ok) break
    await sleep(150)
    if ((await mainText()).includes('正解！')) answered++
    if (i === 0) {
      if (W === 320) await shot('form-question-320')
      await layoutCheck(`${P} 形の問題`)
    }
    await evaluate(`[...document.querySelectorAll('.practice-feedback button')].at(-1)?.click()`)
    await sleep(200)
  }
  // どちらの問題になるかはランダムなので、出た見出しが2種類のどちらかであることを確かめる（作り分けは forms.test.ts で確かめる）
  const knownHeading = (h) => h.includes('元の形') || h.includes('縮める前の形') || h.includes('くっつけた')
  check(`${P} 形の問題：元の形（縮める前の形）を選ぶ・部品から形を選ぶ問題が出て、すべて正解できる`, answered === formKeys.length && headings.size > 0 && [...headings].every(knownHeading), JSON.stringify({ answered, headings: [...headings] }))
  const forms = (await saved()).learning.forms
  check(`${P} 形の問題に初めて正解した記録を付ける`, formKeys.every((k) => forms[k.slice('form:'.length)] !== undefined), JSON.stringify(forms))
  await evaluate(`[...document.querySelectorAll('button')].find(b => b.textContent.trim() === '戻る')?.click()`)
  await sleep(150)
  await evaluate(`[...document.querySelectorAll('button')].find(b => b.textContent.trim() === '戻る')?.click()`)
  await sleep(150)

  // --- 図鑑：形が変わる言葉を開いて見られる ---
  await click('図鑑を見る')
  await sleep(150)
  const details = await evaluate(`document.querySelectorAll('.dict-entry__forms').length`)
  check(`${P} 図鑑：形が変わる単語（${withForms.length}語）に「形が変わる言葉」を出す`, details === withForms.length, String(details))
  await evaluate(`document.querySelector('.dict-entry__forms summary').click()`)
  await sleep(100)
  check(`${P} 図鑑：開くと、部品 → くっついた形の図`, await evaluate(`!!document.querySelector('.dict-entry__forms[open] .formation__result')`))
  await layoutCheck(`${P} 図鑑（形が変わる言葉）`)
  await click('戻る').catch(() => click('閉じる'))

  // --- 注文し直す：分からない言い方 → 答えの例で進む（記録しない）→ 話して注文 ---
  await click('外に出る（マップへ）')
  await click('カフェ', { exact: false })
  await click('注文する（メニューを見る）')
  await sleep(200)
  await layoutCheck(`${P} 注文し直す`)
  await fillInput('.answer-input__field', '한 잔 주세요')
  await click('答える')
  await sleep(200)
  check(`${P} 品名のない言い方：店員が聞き返し、言い方のこつを出す`, (await plain('.order-step__lines')).includes('다시 한번') && (await mainText()).includes('品物の名前 ＋ 주세요'), await plain('.order-step__lines'))
  await click('答えの例を見る')
  const example = await plain('.order-example')
  check(`${P} 答えの例：品物＋数＋주세요（読みつき）`, example.includes('아메리카노 한 잔 주세요'), example)
  const ordersBefore = JSON.stringify((await saved()).learning.orders)
  await click('この言い方で注文する')
  await sleep(200)
  check(`${P} 答えの例でも進めるが、注文できた記録は付けない`, (await mainText()).includes('注文できました') && JSON.stringify((await saved()).learning.orders) === ordersBefore, JSON.stringify((await saved()).learning.orders))
  await click('店を出る')

  await click('注文する（メニューを見る）')
  await click('話す')
  await evaluate(`window.__fakeSpeech = [{ final: '케이크 1개 주세요' }]`)
  await evaluate(`document.querySelector('.mic__button').click()`)
  await sleep(1200)
  const spoken = (await saved()).learning.orders[orderId]
  check(`${P} 話して注文：数字の数（1개）でも通じ、店員がその品物に反応する`, (await mainText()).includes('注文できました') && spoken?.items.includes('cheesecake') && (await plain('.order-step__lines')).includes('한 개요'), JSON.stringify(spoken))
  if (W === 320) await shot('order-spoken-320')
  await click('店を出る')
}

b.finish()
