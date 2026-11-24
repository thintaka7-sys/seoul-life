// マナーモード（iPhone の消音スイッチ）の確認。読み上げの間（audioSession が 'playback'）に、BGM・効果音を流し始めないこと。
// スマホ確認（2026-11-24）：おはなしの早送りの後、流れ直した BGM がマナーモードでも鳴った。
// 'playback' の間に流し始めた音は、'ambient' に戻した後もマナーモードで鳴ってしまうため、どの道筋でも 'playback' の間は流し始めない（audioSession.ts）。
// ヘッドレスのブラウザには navigator.audioSession がないので、偽物を入れ、audio 要素の play() と AudioContext の resume() が呼ばれたときの扱いを記録する。
// 読み上げも偽物にして、終わる時刻をこちらで決める（終わりの知らせが来ない端末もまねる）。

import { openBrowser, sleep } from './browser.mjs'

const b = await openBrowser('silent-mode')
const { send, evaluate, check, freshStart, viewport } = b

await send('Page.addScriptToEvaluateOnNewDocument', {
  source: `(() => {
    // 偽の audioSession：type を変えた記録を残す
    window.__sessionLog = []
    const session = { _type: 'auto', get type() { return this._type }, set type(v) { this._type = v; window.__sessionLog.push({ type: v, t: performance.now() }) } }
    Object.defineProperty(navigator, 'audioSession', { value: session, configurable: true })
    // BGM の audio 要素と AudioContext：流し始めたときの扱いを記録する
    window.__audios = new Set()
    window.__starts = []
    const play = HTMLMediaElement.prototype.play
    HTMLMediaElement.prototype.play = function () { window.__audios.add(this); window.__starts.push({ what: 'play', type: navigator.audioSession.type, src: (this.src || '').split('/').pop() }); return play.call(this) }
    window.__contexts = []
    const Base = window.AudioContext
    if (Base) {
      const resume = Base.prototype.resume
      Base.prototype.resume = function () { window.__starts.push({ what: 'resume', type: navigator.audioSession.type, state: this.state }); return resume.call(this) }
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

b.finish()
