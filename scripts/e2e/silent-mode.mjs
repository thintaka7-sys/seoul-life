// マナーモード（iPhone の消音スイッチ）の確認。読み上げの間（audioSession が 'playback'）に、BGM・効果音を流し始めないこと。
// スマホ確認（2026-11-24）：おはなしの早送りの後、流れ直した BGM がマナーモードでも鳴った。
// 'playback' の間に流し始めた音は、'ambient' に戻した後もマナーモードで鳴ってしまうため、どの道筋でも 'playback' の間は流し始めない（audioSession.ts）。
// ヘッドレスのブラウザには navigator.audioSession がないので、偽物を入れ、audio 要素の play() と AudioContext の resume() が呼ばれたときの扱いを記録する。
// 読み上げも偽物にして、終わる時刻をこちらで決める（終わりの知らせが来ない端末もまねる）。
// マイク（話して答える）：iPhone はマイクを使うと play-and-record になり、聞き終わっても・ページを開き直してもマナーモードが効かなかった。
// 偽の音声認識で、聞いている間は BGM・音の出口を止め、マイクを閉じたら 'auto' → 'ambient' とかけ直してから音を戻すこと、
// 起動時（開き直したとき）も最初の音の前にかけ直すことを確かめる。

import { readdirSync, readFileSync } from 'node:fs'
import { FAST_SETTINGS, openBrowser, saveAtHome, sleep } from './browser.mjs'

const b = await openBrowser('silent-mode')
const { send, evaluate, check, freshStart, viewport } = b

await send('Page.addScriptToEvaluateOnNewDocument', {
  source: `(() => {
    // 偽の audioSession：type を変えた記録を残す。e2e:sessionType で、開いたときの値を決める（前のページの値が残っている端末をまねる）
    window.__sessionLog = []
    const session = { _type: localStorage.getItem('e2e:sessionType') ?? 'auto', get type() { return this._type }, set type(v) { this._type = v; window.__sessionLog.push({ type: v, t: performance.now() }) } }
    Object.defineProperty(navigator, 'audioSession', { value: session, configurable: true })
    // BGM の audio 要素と AudioContext：流し始めたときの扱いを記録する
    window.__audios = new Set()
    window.__starts = []
    const play = HTMLMediaElement.prototype.play
    HTMLMediaElement.prototype.play = function () { window.__audios.add(this); window.__starts.push({ what: 'play', type: navigator.audioSession.type, mic: window.__micOpen === true, t: performance.now(), src: (this.src || '').split('/').pop() }); return play.call(this) }
    window.__contexts = []
    const Base = window.AudioContext
    if (Base) {
      const resume = Base.prototype.resume
      Base.prototype.resume = function () { window.__starts.push({ what: 'resume', type: navigator.audioSession.type, mic: window.__micOpen === true, t: performance.now(), state: this.state }); return resume.call(this) }
      window.AudioContext = class extends Base { constructor(...a) { super(...a); window.__contexts.push(this) } }
    }
    // 偽の読み上げ：window.__endSpeech() で終わる。cancel() では終わりの知らせを出さない（iPhone で来ないことがあるため）
    const voice = { lang: 'ko-KR', name: 'Fake Korean', localService: true, default: false, voiceURI: 'fake-ko' }
    let current = null
    const synth = {
      speaking: false, pending: false, paused: false,
      getVoices: () => [voice],
      speak(u) { current = u; synth.speaking = true; window.__spoken = u.text; setTimeout(() => u.onstart?.(), 10) },
      cancel() { current = null; synth.speaking = false },
      pause() {}, resume() {}, addEventListener() {}, removeEventListener() {},
    }
    window.__endSpeech = () => { const u = current; current = null; synth.speaking = false; u?.onend?.({ elapsedTime: 0 }) }
    class Utterance { constructor(text) { this.text = text; this.lang = ''; this.voice = null; this.rate = 1; this.pitch = 1; this.volume = 1 } }
    Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true })
    window.SpeechSynthesisUtterance = Utterance
    // 偽の音声認識：window.__fakeSpeech の先頭を使う。noEnd なら、確定した結果を出した後もブラウザが終わらない（マイクを開いたまま）
    // マイクを開いている間は window.__micOpen が true。閉じた時刻を window.__micClosedAt に残す
    const ev = (t, final) => ({ results: [Object.assign([{ transcript: t }], { isFinal: final })] })
    const close = () => { window.__micOpen = false; window.__micClosedAt = performance.now() }
    class FakeRecognition {
      start() {
        window.__micOpen = true
        const step = (window.__fakeSpeech ?? []).shift()
        this.timers = [setTimeout(() => this.onstart?.(), 300)]
        if (!step) return
        this.timers.push(setTimeout(() => { this.onresult?.(ev(step.final, true)); if (!step.noEnd) { close(); this.onend?.() } }, 1500))
      }
      stop() { this.timers?.forEach(clearTimeout); close(); this.onend?.() }
      abort() { this.timers?.forEach(clearTimeout); close(); this.onerror?.({ error: 'aborted' }); this.onend?.() }
    }
    window.SpeechRecognition = FakeRecognition
    window.webkitSpeechRecognition = FakeRecognition
  })()`,
})

await viewport(375, 760, true)
await freshStart()

/** 本物のマウス操作で押す（ブラウザが「利用者の操作」と認めるように） */
async function mouseClick(selector) {
  const pt = await evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return null; el.scrollIntoView({ block: 'center' }); const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } })()`)
  if (pt === null) throw new Error(`押せません: ${selector}`)
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: pt.x, y: pt.y, button: 'left', clickCount: 1 })
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: pt.x, y: pt.y, button: 'left', clickCount: 1 })
}
const buttonByText = (text) => `[...document.querySelectorAll('button')].find((b) => b.textContent.replace(/▼/g, '').trim() === ${JSON.stringify(text)})`
async function mouseClickText(text) {
  await evaluate(`(() => { const b = ${buttonByText(text)}; if (b) b.setAttribute('data-e2e-target', '1') })()`)
  await mouseClick('[data-e2e-target="1"]')
  await evaluate(`document.querySelector('[data-e2e-target="1"]')?.removeAttribute('data-e2e-target')`)
}

const state = () =>
  evaluate(`({
    type: navigator.audioSession.type,
    playing: [...window.__audios].filter((a) => !a.paused).map((a) => ({ src: a.src.split('/').pop(), t: a.currentTime })),
    contexts: window.__contexts.map((c) => c.state),
  })`)
/** 'playback' の間に、BGM の play() か AudioContext の resume() が呼ばれた記録 */
const startsWhilePlayback = () => evaluate(`window.__starts.filter((s) => s.type === 'playback')`)
async function waitFor(cond, ms = 3000) {
  for (let i = 0; i < ms / 100; i++) {
    if (await cond()) return true
    await sleep(100)
  }
  return false
}
const bgmPlaying = async () => {
  const s = await state()
  return s.type === 'ambient' && s.playing.length === 1 && s.contexts.includes('running')
}

// ---------- はじめから：BGM がふだんの扱い（ambient）で流れる ----------
await mouseClickText('はじめから')
check('起動時：音の扱いは ambient（マナーモードでは BGM・効果音を鳴らさない）', (await state()).type === 'ambient', JSON.stringify(await state()))
check('はじめから：BGM が流れ始める', await waitFor(bgmPlaying), JSON.stringify(await state()))
await waitFor(async () => (await state()).playing[0]?.t > 0.3)

// 読み上げボタンのある台詞まで進める
const speakSelector = '.dialogue button[aria-label^="読み上げ："]'
for (let i = 0; i < 30 && !(await evaluate(`!!document.querySelector(${JSON.stringify(speakSelector)})`)); i++) {
  await evaluate(`document.querySelector('.dialogue__next')?.click()`)
  await sleep(200)
}

// ---------- 読み上げの間：BGM を止め、音の出口も止める。操作・早送り・場面の切り替えがあっても流し始めない ----------
await mouseClick(speakSelector)
const held = await waitFor(async () => (await state()).type === 'playback')
const during = await state()
check('読み上げを始めると、playback にする（読み上げはマナーモードでも鳴らす）', held, JSON.stringify(during))
check('読み上げの間：BGM を止め、音の出口（効果音）も止める', during.playing.length === 0 && during.contexts.every((c) => c !== 'running'), JSON.stringify(during))

// 読み上げの間に、ほかのボタンを押す（操作のたびに BGM・音の出口を動かそうとする道筋）・早送りで進める（場面が切り替わる）
await mouseClickText('早送り')
await sleep(300)
await mouseClickText('ログ')
await sleep(300)
await mouseClickText('閉じる')
await sleep(2500)
const afterTaps = await state()
check('読み上げの間：操作・早送りがあっても、BGM・音の出口を動かさない', afterTaps.type === 'playback' && afterTaps.playing.length === 0 && afterTaps.contexts.every((c) => c !== 'running'), JSON.stringify(afterTaps))
// 端末が BGM を止めた（iPhone で、読み上げに止められた）ときの流し直しも、読み上げの間はしない
await evaluate(`[...window.__audios].forEach((a) => a.pause())`)
await sleep(1200)
const healed = await startsWhilePlayback()
check('読み上げの間：端末に止められた BGM を流し直さない', (await state()).playing.length === 0 && healed.length === 0, JSON.stringify(healed))

// ---------- 読み上げが終わったら：ambient に戻してから、BGM を続きから流し、音の出口を動かす ----------
await evaluate(`window.__endSpeech()`)
check('読み上げが終わると、ambient に戻す', await waitFor(async () => (await state()).type === 'ambient'), JSON.stringify(await state()))
check('読み上げが終わると、BGM を続きから流し、音の出口も動かす（操作なしで）', await waitFor(bgmPlaying), JSON.stringify(await state()))

// ---------- 早送り（読み上げなし）：おはなしが進んでも BGM が止まらない ----------
await sleep(2500)
check('早送りで進めても、BGM が流れている', await bgmPlaying(), JSON.stringify(await state()))

// ---------- 読み上げの終わりの知らせが来ないまま、別の画面に切り替えた → 戻った ----------
const speakable = await evaluate(`!!document.querySelector('button[aria-label^="読み上げ："]:not([disabled])')`)
if (speakable) {
  await mouseClick('button[aria-label^="読み上げ："]:not([disabled])')
  check('2回目の読み上げ：playback にし、BGM を止める', await waitFor(async () => { const s = await state(); return s.type === 'playback' && s.playing.length === 0 }), JSON.stringify(await state()))
  await evaluate(`(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' })
    document.dispatchEvent(new Event('visibilitychange'))
  })()`)
  await sleep(600)
  const hidden = await state()
  check('見えなくなったら：読み上げを止めて ambient に戻し、BGM は止めたまま', hidden.type === 'ambient' && hidden.playing.length === 0 && hidden.contexts.every((c) => c !== 'running'), JSON.stringify(hidden))
  await evaluate(`(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' })
    document.dispatchEvent(new Event('visibilitychange'))
  })()`)
  check('戻ったら：ambient のまま、BGM を続きから流す', await waitFor(bgmPlaying), JSON.stringify(await state()))
} else {
  check('2回目の読み上げ：読み上げボタンがある', false, '早送りで、読み上げボタンのない段階まで進んだ')
}

// ---------- まとめ：playback の間に、BGM・音の出口を流し始めたことが一度もない ----------
const bad = await startsWhilePlayback()
check('playback の間に、BGM の play()・AudioContext の resume() を一度も呼ばない', bad.length === 0, JSON.stringify(bad))
check('記録：BGM・音の出口を流し始めた回数（ambient の間）', (await evaluate(`window.__starts.length`)) > 0, JSON.stringify(await evaluate(`window.__sessionLog`)))

// ---------- マイク（話して注文）：聞いている間は止め、マイクを閉じたらかけ直してから音を戻す ----------
const allEvents = readdirSync('src/data/events').filter((n) => n.endsWith('.json')).flatMap((n) => JSON.parse(readFileSync(`src/data/events/${n}`, 'utf8'))).map((e) => e.id)
const vocab = readdirSync('src/data/vocabulary').filter((n) => n.endsWith('.json')).flatMap((n) => JSON.parse(readFileSync(`src/data/vocabulary/${n}`, 'utf8')))
const T = '2026-11-20T10:00:00.000Z'
const SAVE = saveAtHome({ progress: { completedEvents: allEvents, currentLocationId: 'home' }, learning: { words: Object.fromEntries(vocab.map((v) => [v.id, { learnedAt: T, chapter: 3 }])) } })
await freshStart({ settings: { ...FAST_SETTINGS, voiceInputNoticeSeen: true }, save: SAVE })
await mouseClickText('つづきから')
await sleep(800)
if (await evaluate(`!!document.querySelector('.event-header')`)) await mouseClickText('やめる')
await mouseClickText('外に出る（マップへ）')
await sleep(300)
await evaluate(`[...document.querySelectorAll('.town-map button')].find((b) => b.textContent.includes('カフェ'))?.setAttribute('data-e2e-target', '1')`)
await mouseClick('[data-e2e-target="1"]')
await sleep(300)
await mouseClickText('注文する（メニューを見る）')
await sleep(300)
await mouseClickText('話す')
check('カフェ：BGM が流れている（マイクの前）', await waitFor(bgmPlaying), JSON.stringify(await state()))
await waitFor(async () => (await state()).playing[0]?.t > 0.3)

/** 話して注文し、マイクを閉じるまで待つ。閉じた後の扱いのかけ直しと、BGM が戻ることを確かめる */
async function speakAndCheck(label, step) {
  await evaluate(`window.__fakeSpeech = [${JSON.stringify(step)}]; window.__sessionLog = []`)
  await mouseClick('.mic__button')
  await sleep(700)
  const listening = await state()
  check(`${label}：聞いている間は、BGM を止め、音の出口も止める`, (await evaluate(`window.__micOpen`)) && listening.playing.length === 0 && listening.contexts.every((c) => c !== 'running'), JSON.stringify(listening))
  const closed = await waitFor(async () => (await evaluate(`window.__micOpen`)) === false, 5000)
  check(`${label}：マイクを閉じる（ブラウザが終わらないときは、こちらで閉じさせる）`, closed)
  check(`${label}：マイクを閉じたら、BGM を続きから流し、音の出口も動かす`, await waitFor(bgmPlaying), JSON.stringify(await state()))
  const r = await evaluate(`(() => {
    const closedAt = window.__micClosedAt
    const log = window.__sessionLog.filter((e) => e.t >= closedAt)
    const autoAt = log.findIndex((e) => e.type === 'auto')
    const ambientAfter = autoAt >= 0 ? log.slice(autoAt + 1).find((e) => e.type === 'ambient') : undefined
    const firstStart = window.__starts.find((s) => s.t >= closedAt)
    return { log: log.map((e) => e.type), reapplied: ambientAfter !== undefined, lastAmbient: Math.max(...log.filter((e) => e.type === 'ambient').map((e) => e.t)), firstStart: firstStart?.t ?? null, whileMic: window.__starts.filter((s) => s.mic) }
  })()`)
  check(`${label}：マイクを閉じた後、auto → ambient とかけ直してから、BGM・音の出口を流し始める`, r.reapplied && r.firstStart !== null && r.firstStart > r.lastAmbient, JSON.stringify(r))
  check(`${label}：マイクを開いている間は、BGM の play()・AudioContext の resume() を呼ばない`, r.whileMic.length === 0, JSON.stringify(r.whileMic))
}
await speakAndCheck('話して注文', { final: '아메리카노 한 잔 주세요' })
check('話して注文：注文できる', (await b.mainText()).includes('注文できました'))
await mouseClickText('店を出る')
await sleep(300)
await mouseClickText('注文する（メニューを見る）')
await sleep(300)
await mouseClickText('話す')
await speakAndCheck('ブラウザが聞き取りを終えない端末', { final: '아메리카노 한 잔 주세요', noEnd: true })

// ---------- ページを開き直したとき：前のページの値（ambient）が残っていても、最初の音の前にかけ直す ----------
await evaluate(`localStorage.setItem('e2e:sessionType', 'ambient')`)
await b.reload()
const boot = await evaluate(`window.__sessionLog.map((e) => e.type)`)
check('開き直したとき：すでに ambient でも、起動時に auto → ambient とかけ直す', JSON.stringify(boot.slice(0, 2)) === JSON.stringify(['auto', 'ambient']), JSON.stringify(boot))
await mouseClickText('つづきから')
check('開き直したとき：最初の操作で、ambient のまま BGM が流れる', await waitFor(bgmPlaying), JSON.stringify(await state()))
const firstPlay = await evaluate(`(() => { const p = window.__starts[0]; const reapplied = window.__sessionLog.find((e) => e.type === 'ambient'); return { p, reappliedAt: reapplied?.t ?? null } })()`)
check('開き直したとき：かけ直しの後に、最初の音を流す', firstPlay.p !== undefined && firstPlay.reappliedAt !== null && firstPlay.p.t > firstPlay.reappliedAt && firstPlay.p.type === 'ambient', JSON.stringify(firstPlay))
await evaluate(`localStorage.removeItem('e2e:sessionType')`)

// ---------- 設定「話して答えたあと、BGM・効果音を止める」：iPhone（audioSession がある）では最初からオン ----------
// v5 の設定（この項目がない）から移すと、audioSession がある端末ではオンになる。マイクを使った後は、開き直すまで BGM・効果音を止めたまま。読み上げは鳴る
const { quietAfterVoiceInput: _q, ...v5Settings } = { ...FAST_SETTINGS, version: 5, voiceInputNoticeSeen: true }
await freshStart({ settings: v5Settings, save: SAVE })
await mouseClickText('つづきから')
await sleep(800)
if (await evaluate(`!!document.querySelector('.event-header')`)) await mouseClickText('やめる')
await mouseClickText('外に出る（マップへ）')
await sleep(300)
await evaluate(`[...document.querySelectorAll('.town-map button')].find((b) => b.textContent.includes('カフェ'))?.setAttribute('data-e2e-target', '1')`)
await mouseClick('[data-e2e-target="1"]')
await sleep(300)
await mouseClickText('注文する（メニューを見る）')
await sleep(300)
await mouseClickText('話す')
check('設定オン：マイクを使う前は、BGM が流れている', await waitFor(bgmPlaying), JSON.stringify(await state()))
await evaluate(`window.__fakeSpeech = [{ final: '아메리카노 한 잔 주세요' }]`)
await mouseClick('.mic__button')
await waitFor(async () => (await evaluate(`window.__micOpen`)) === false, 5000)
const quietFrom = await evaluate(`performance.now()`)
await sleep(1500)
const quiet = await state()
const stopped = (s) => s.playing.length === 0 && s.contexts.every((c) => c !== 'running')
check('設定オン：マイクを閉じた後も、BGM を止めたまま、音の出口も止めたまま', stopped(quiet), JSON.stringify(quiet))
await mouseClickText('店を出る')
await sleep(500)
await mouseClickText('注文する（メニューを見る）')
await sleep(500)
check('設定オン：画面を進めても（操作があっても）、BGM・音の出口を動かさない', stopped(await state()), JSON.stringify(await state()))
const speakButton = 'button[aria-label^="読み上げ："]'
const canSpeak = await evaluate(`!!document.querySelector(${JSON.stringify(speakButton)})`)
check('設定オン：読み上げボタンがある', canSpeak)
await evaluate(`window.__spoken = null`)
await mouseClick(speakButton)
await sleep(300)
check('設定オン：読み上げは鳴る', (await evaluate(`window.__spoken`)) !== null)
await evaluate(`window.__endSpeech()`)
await sleep(1200)
const afterSpeech = await state()
check('設定オン：読み上げが終わった後も、BGM・音の出口は止めたまま（ambient に戻す）', stopped(afterSpeech) && afterSpeech.type === 'ambient', JSON.stringify(afterSpeech))
check('設定オン：マイクを閉じた後、BGM の play()・AudioContext の resume() を一度も呼ばない', (await evaluate(`window.__starts.filter((s) => s.t >= ${quietFrom}).length`)) === 0, JSON.stringify(await evaluate(`window.__starts.filter((s) => s.t >= ${quietFrom})`)))
// 設定画面：オンになっている。オフにすると、BGM が戻る
await mouseClickText('やめる')
await sleep(300)
await mouseClickText('設定')
await sleep(500)
const quietRadios = `[...document.querySelectorAll('input[name="quietAfterVoiceInput"]')]`
check('設定画面：「話して答えたあと、BGM・効果音を止める」が、最初からオン', await evaluate(`${quietRadios}[0]?.checked === true`))
check('設定画面：説明に理由（iPhone でマイクを使うと、マナーモードでも音が鳴ることがある）を書く', (await b.mainText()).includes('iPhone でマイクを使うと、マナーモードでも音が鳴ることがあるため'))
await evaluate(`${quietRadios}[1].closest('label').setAttribute('data-e2e-target', '1')`)
await mouseClick('[data-e2e-target="1"]')
check('設定でオフにすると、BGM を続きから流す', await waitFor(bgmPlaying), JSON.stringify(await state()))
check('オフにした設定を保存する（v6）', await evaluate(`(() => { const s = JSON.parse(localStorage.getItem('seoul-life:settings')); return s.version === 6 && s.quietAfterVoiceInput === false })()`))

b.finish()
