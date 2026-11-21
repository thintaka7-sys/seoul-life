// 練習・復習・ドリル・章末テスト・聞き分けの問題の正解を、教材の JSON から求める（phase25.mjs・phase26.mjs で使う）。

import { readdirSync, readFileSync } from 'node:fs'
import { sleep } from './browser.mjs'

export function readdirJson(dir) {
  return readdirSync(dir)
    .filter((n) => n.endsWith('.json'))
    .flatMap((n) => JSON.parse(readFileSync(`${dir}/${n}`, 'utf8')))
}

/** b は openBrowser() の戻り値 */
export function practiceAnswers(b) {
  const { evaluate, click } = b
  // ---------- 教材から正解を求める ----------

  const vocab = readdirJson('src/data/vocabulary')
  const grammar = readdirJson('src/data/grammar')
  const conversations = readdirJson('src/data/scenarios')
  const drills = readdirJson('src/data/drills')
  const tests = readdirJson('src/data/tests')
  const drillItems = [...drills.flatMap((d) => d.items), ...tests.flatMap((t) => t.items ?? [])]
  /** 韓国語 → 数字（数字の問題） */
  const koToDigits = new Map(drillItems.filter((i) => i.digits).map((i) => [i.korean, i.digits]))
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
  for (const i of drillItems) addPair(i.korean, i.japanese)
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
      if (q.number) return koToDigits.get(spoken)
      if (q.options.length > 0) return q.options.find((o) => o === spoken)
      return spoken
    }
    if (q.number) return koToDigits.get(q.target)
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

  return { vocab, grammar, conversations, drills, tests, koToDigits, norm, readQuestion, correctAnswer, typeInto }
}
