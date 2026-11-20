// ブラウザでの確認スクリプトの共通部分。
// ヘッドレスの Edge（または Chrome）を DevTools プロトコルで動かし、画面を操作して確かめる。
// 追加のパッケージは使わない（Node 22 以降の組み込みの fetch と WebSocket だけを使う）。
// 使い方は scripts/e2e/README.md。

import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const BROWSER_CANDIDATES = [
  process.env['E2E_BROWSER'],
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
].filter((p) => p !== undefined && p !== '')

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** 設定を「文字送りなし」にして、操作を速く・確実にする（文字送りの確認をするときは使わない） */
export const FAST_SETTINGS = { version: 3, furigana: 'recommended', translation: 'always', speechRate: 'normal', textSpeed: 'instant', soundEffects: true, effects: 'normal', voiceInput: true, voiceInputNoticeSeen: false }

/**
 * ブラウザを開き、確認に使う関数をまとめて返す。
 * @param {string} name 出力フォルダの名前（e2e-output/<name>/ にスクリーンショットを書き出す）
 */
export async function openBrowser(name) {
  const url = process.argv[2]
  if (url === undefined) {
    console.error('使い方: node scripts/e2e/<スクリプト>.mjs <URL>（例: http://localhost:4173/seoul-life/）')
    process.exit(2)
  }
  const outDir = resolve('e2e-output', name)
  mkdirSync(outDir, { recursive: true })
  const profileDir = join(outDir, 'profile')
  rmSync(profileDir, { recursive: true, force: true })

  const exe = BROWSER_CANDIDATES.find((p) => existsSync(p))
  if (exe === undefined) throw new Error('Edge か Chrome が見つかりません。環境変数 E2E_BROWSER に実行ファイルの場所を入れてください')
  const port = 9333 + Math.floor(Math.random() * 500)
  const browser = spawn(exe, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profileDir}`, '--no-first-run', '--disable-gpu', '--lang=ja',
    // スマホと同じく、利用者の操作の前には音を出させない（効果音の確認のため。BUG-002）
    '--autoplay-policy=user-gesture-required', 'about:blank'], { stdio: 'ignore' })
  // 途中でエラーになっても、ブラウザを残さない
  process.on('exit', () => browser.kill())

  let target
  for (let i = 0; i < 100 && !target; i++) {
    try {
      target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === 'page')
    } catch {
      // まだ起動中
    }
    if (!target) await sleep(200)
  }
  if (!target) throw new Error(`ブラウザに接続できません port=${port}`)

  const ws = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((r) => ws.addEventListener('open', r))
  let nextId = 0
  const pending = new Map()
  const listeners = []
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data)
    if (msg.id !== undefined) {
      const p = pending.get(msg.id)
      pending.delete(msg.id)
      if (msg.error) p.reject(new Error(JSON.stringify(msg.error)))
      else p.resolve(msg.result)
    } else for (const l of listeners) l(msg)
  })
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++nextId
      pending.set(id, { resolve, reject })
      ws.send(JSON.stringify({ id, method, params }))
    })

  // コンソールのエラー・警告、通信の失敗、ダイアログを記録する
  const problems = []
  listeners.push((m) => {
    if (m.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(m.params.type)) problems.push(`console.${m.params.type}: ${m.params.args.map((a) => a.value ?? a.description).join(' ')}`)
    if (m.method === 'Runtime.exceptionThrown') problems.push(`exception: ${m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text}`)
    if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') problems.push(`log: ${m.params.entry.text} ${m.params.entry.url ?? ''}`)
    if (m.method === 'Network.loadingFailed' && !m.params.canceled) problems.push(`network failed: ${m.params.errorText}`)
    if (m.method === 'Network.responseReceived' && m.params.response.status >= 400) problems.push(`HTTP ${m.params.response.status}: ${m.params.response.url}`)
    if (m.method === 'Page.javascriptDialogOpening') void send('Page.handleJavaScriptDialog', { accept: true })
  })
  await send('Page.enable')
  await send('Runtime.enable')
  await send('Log.enable')
  await send('Network.enable')

  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
    if (r.exceptionDetails) throw new Error(`evaluate: ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`)
    return r.result.value
  }
  async function load(u = url) {
    const loaded = new Promise((r) => listeners.push((m) => m.method === 'Page.loadEventFired' && r()))
    await send('Page.navigate', { url: u })
    await loaded
    await sleep(500)
  }
  const reload = () => load(url)

  /** ボタンを文字で探して押す（▼ は無視する） */
  async function click(text, { within = 'body', exact = true } = {}) {
    const ok = await evaluate(`(() => {
      const els = [...document.querySelectorAll(${JSON.stringify(within)} + ' button')]
      const b = els.find(b => { const t = b.textContent.replace(/▼/g, '').trim(); return (${exact} ? t === ${JSON.stringify(text)} : t.includes(${JSON.stringify(text)})) && !b.disabled })
      if (!b) return false; b.click(); return true })()`)
    if (!ok) throw new Error(`ボタンが押せません: ${text}`)
    await sleep(120)
  }
  /** 会話の選択肢を韓国語で探して押す（フリガナは除いて比べる） */
  async function clickChoice(korean) {
    const ok = await evaluate(
      `(() => { const plain = (el) => { const c = el.cloneNode(true); c.querySelectorAll('rt').forEach(r => r.remove()); return c.textContent.replace(/\\s+/g, ' ').trim() }; const b = [...document.querySelectorAll('.choice__button')].find(b => plain(b) === ${JSON.stringify(korean)}); if (!b || b.disabled) return false; b.click(); return true })()`,
    )
    if (!ok) throw new Error(`選択肢が押せません: ${korean}`)
    await sleep(120)
  }
  /** ゲーム内キーボードで字母を順に押す（複合母音 ㅝ などは ㅜ＋ㅓ のように分けて書く） */
  async function typeKeys(jamos) {
    for (const j of jamos) {
      if (j === ' ') await click('空白', { within: '.keyboard' })
      else {
        const ok = await evaluate(`(() => { const b = document.querySelector('.keyboard button[aria-label=${JSON.stringify(j)}]'); if (!b) return false; b.click(); return true })()`)
        if (!ok) throw new Error(`キーがありません: ${j}`)
      }
    }
    await sleep(100)
  }
  /**
   * 会話の答え方のタブを押す（label は「選んで答える」「書いて答える」「話して答える」）。
   * 答え方が3つのときはタブの文字が短くなる（選ぶ・書く・話す）ので、aria-label で探す。タブがなければ false
   */
  async function chooseMode(label) {
    const ok = await evaluate(
      `(() => { const b = document.querySelector('.mode-tab[aria-label=${JSON.stringify(label)}]'); if (!b) return false; if (b.getAttribute('aria-pressed') !== 'true') b.click(); return true })()`,
    )
    await sleep(100)
    return ok
  }
  const heading = () => evaluate(`document.querySelector('h1')?.innerText ?? ''`)
  /** main の文字（フリガナを除く） */
  const mainText = () => evaluate(`(() => { const m = document.querySelector('main'); if (!m) return ''; const c = m.cloneNode(true); c.querySelectorAll('rt').forEach(r => r.remove()); return c.textContent })()`)
  const saved = () => evaluate(`JSON.parse(localStorage.getItem('seoul-life:save') ?? 'null')`)
  const stepHeading = () => evaluate(`document.querySelector('.step-heading')?.innerText ?? ''`)
  const viewport = (width, height, mobile) => send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile })
  /** ページ全体のスクリーンショット */
  async function shot(fileName) {
    const { data } = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true })
    writeFileSync(join(outDir, `${fileName}.png`), Buffer.from(data, 'base64'))
  }
  /** 見えている範囲だけのスクリーンショット */
  async function view(fileName) {
    const { data } = await send('Page.captureScreenshot', { format: 'png' })
    writeFileSync(join(outDir, `${fileName}.png`), Buffer.from(data, 'base64'))
  }
  /** localStorage を消して、設定（とセーブデータ）を入れてから読み込み直す */
  async function freshStart({ settings = FAST_SETTINGS, save = null } = {}) {
    await load(url)
    const items = [['seoul-life:settings', settings], ...(save === null ? [] : [['seoul-life:save', save]])]
    await evaluate(`localStorage.clear(); ${items.map(([k, v]) => `localStorage.setItem(${JSON.stringify(k)}, ${JSON.stringify(JSON.stringify(v))})`).join('; ')}`)
    await reload()
  }

  const results = []
  const check = (label, ok, detail = '') => results.push([label, !!ok, ok ? '' : detail])
  /** 横スクロールがないこと、ボタンが44px以上あることを確かめる */
  async function layoutCheck(label) {
    const r = await evaluate(`(() => {
      const small = [...document.querySelectorAll('button, input[type=radio], input[type=text]')].filter(b => !b.closest('.keyboard') && !b.classList.contains('ko-text--tap')).map(b => {
        const el = b.type === 'radio' ? b.closest('label') : b
        const r = el.getBoundingClientRect(); return { t: (b.textContent || b.value || b.type).trim().slice(0,12), w: Math.round(r.width), h: Math.round(r.height) } }).filter(x => x.w < 44 || x.h < 44)
      const keys = [...document.querySelectorAll('.keyboard button')].map(b => b.getBoundingClientRect()).filter(r => r.height < 44)
      return { overflowX: document.documentElement.scrollWidth > window.innerWidth, sw: document.documentElement.scrollWidth, small, lowKeys: keys.length }
    })()`)
    check(`${label}: 横スクロールなし・ボタン44px以上（キーボードは高さ44px以上）`, !r.overflowX && r.small.length === 0 && r.lowKeys === 0, JSON.stringify(r))
  }
  /** 単語・文法カードを n 枚めくって「覚えた！」まで押す */
  async function nextCards(n) {
    for (let i = 0; i < n - 1; i++) await click('次へ')
    await click('覚えた！')
  }

  /** 結果を表示してブラウザを閉じる。NG かコンソールの問題があれば終了コード 1 */
  function finish() {
    for (const [label, ok, detail] of results) console.log(`${ok ? 'OK' : 'NG'}  ${label}${detail ? '  ' + detail : ''}`)
    const passed = results.filter((r) => r[1]).length
    console.log(`\n${passed}/${results.length} OK`)
    console.log(problems.length ? 'コンソール・通信の問題:\n' + problems.join('\n') : 'コンソールのエラー・警告、通信の失敗: なし')
    console.log(`スクリーンショット: ${outDir}`)
    ws.close()
    browser.kill()
    process.exit(passed === results.length && problems.length === 0 ? 0 : 1)
  }

  return {
    url,
    outDir,
    send,
    evaluate,
    load,
    reload,
    click,
    clickChoice,
    chooseMode,
    typeKeys,
    heading,
    mainText,
    saved,
    stepHeading,
    viewport,
    shot,
    view,
    freshStart,
    check,
    layoutCheck,
    nextCards,
    finish,
  }
}
