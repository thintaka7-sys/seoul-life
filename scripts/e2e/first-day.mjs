// 「最初の1日」（event_001〜003）を、スマホ幅とPC幅で最初から最後まで遊んで確かめる。
// 背景の切り替え（部屋→玄関→部屋）、会話の反応と表情、書いて答える、分かち書きの注意、
// 途中で再読み込みしての再開、コラム、図鑑、1日の終わりの結果と経験値の合計。
// 教材を変えたら、下の「教材に合わせた部分」を直す。
// 使い方: node scripts/e2e/first-day.mjs <URL>

import { readFileSync } from 'node:fs'
import { openBrowser, sleep } from './browser.mjs'

const b = await openBrowser('first-day')
const { evaluate, click, clickChoice, typeKeys, heading, mainText, saved, stepHeading, viewport, shot, freshStart, check, layoutCheck, nextCards, reload } = b

const readJson = (p) => JSON.parse(readFileSync(new URL(`../../src/data/${p}`, import.meta.url), 'utf8'))
const convs = new Map([...readJson('scenarios/ch01_home.json'), ...readJson('scenarios/ch03_cafe.json')].map((c) => [c.id, c]))
const vocabCount = readJson('vocabulary/ch01.json').length + readJson('vocabulary/ch03_cafe.json').length

const backdrop = () => evaluate(`document.querySelector('.backdrop__sharp')?.getAttribute('src') ?? ''`)
const expression = () => evaluate(`document.querySelector('.conversation .portrait')?.dataset.expression ?? ''`)
const dialogueText = () =>
  evaluate(`(() => { const d = document.querySelector('.dialogue'); if (!d) return ''; const c = d.cloneNode(true); c.querySelectorAll('rt').forEach(r => r.remove()); return c.textContent.replace(/\\s+/g, ' ') })()`)
const dialogueHas = (s) => `(() => { const d = document.querySelector('.dialogue'); return !!d && d.textContent.includes(${JSON.stringify(s)}) })()`
const answering = `!!document.querySelector('.answer')`

/** 条件を満たすまで、紹介カードの「会話をはじめる」と台詞の「次へ」を押して進める */
async function advanceUntil(cond, label) {
  for (let i = 0; i < 40; i++) {
    if (await evaluate(cond)) return
    const did = await evaluate(`(() => {
      const start = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === '会話をはじめる'); if (start) { start.click(); return 'start' }
      const n = document.querySelector('.dialogue__next'); if (n) { n.click(); return 'next' }
      return '' })()`)
    await sleep(did ? 150 : 200)
  }
  throw new Error(`進めません: ${label}`)
}

/**
 * 会話を最後まで進める。plan[往復の番号] で答え方を決める（なければ最初の正解を選ぶ）
 * - wrong: 先に選ぶ不正解の選択肢、onWrong: そのあとの確認
 * - write: 書いて答える字母、choice: 選ぶ選択肢、before / after: 答える前後の確認
 */
async function playConversation(id, plan = {}) {
  const conv = convs.get(id)
  for (let t = 0; t < conv.turns.length; t++) {
    const turn = conv.turns[t]
    if (turn.choices === undefined) break
    await advanceUntil(answering, `${id} 往復${t}`)
    const p = plan[t] ?? {}
    if (p.before) await p.before()
    // 前の往復で「書いて答える」にしていると、次の往復も書く画面で始まるので、選ぶ画面に戻す
    if (!p.write) await evaluate(`(() => { const b = [...document.querySelectorAll('.mode-tab')].find(b => b.textContent.includes('選んで')); if (b && b.getAttribute('aria-pressed') !== 'true') b.click() })()`)
    await sleep(100)
    if (p.wrong) {
      await clickChoice(p.wrong)
      await sleep(250)
      if (p.onWrong) await p.onWrong()
    }
    if (p.write) {
      await click('書いて答える')
      await typeKeys(p.write)
      await click('答える')
    } else await clickChoice(p.choice ?? turn.choices.find((c) => c.correct).korean)
    await sleep(200)
    if (p.after) await p.after()
  }
  await advanceUntil(`!document.querySelector('.conversation')`, `${id} の終わり`)
}

for (const [W, H, mobile] of [
  [375, 760, true],
  [1280, 800, false],
]) {
  const P = `${W}`
  await viewport(W, H, mobile)
  await freshStart()
  await click('はじめから')
  check(`${P} はじめから → 自宅`, (await heading()) === '自宅')

  // --- event_001（自宅・玄関） ---
  await click('玄関に出る')
  check(`${P} 最初の案内文は部屋の背景`, (await mainText()).includes('チャイムが鳴りました') && (await backdrop()).includes('bg/home'), await backdrop())
  await click('次へ')
  await sleep(200)
  check(`${P} 案内文の後で玄関の背景に切り替わる（単語カード）`, (await backdrop()).includes('bg/entrance') && (await stepHeading()).includes('1 / 5'), await backdrop())
  check(`${P} 進み具合のバーは背景の段階を数えない（8段階）`, (await evaluate(`document.querySelector('.event-progress').max`)) === 8)
  if (W === 375) await shot('375-01-entrance-learn')
  await layoutCheck(`${P} 玄関・単語カード`)
  await nextCards(5)
  check(`${P} 이수진の紹介`, (await mainText()).includes('이수진'))
  await playConversation('home_003', {
    0: {
      wrong: '안녕히 계세요.',
      onWrong: async () => {
        check(`${P} home_003：間違えた選択肢の反応（reply）を表示`, (await dialogueText()).includes('이제 막 왔는데요'), await dialogueText())
        check(`${P} home_003：間違えたら困り顔`, (await expression()) === 'troubled', await expression())
        if (W === 375) await shot('375-02-wrong-reply')
        await layoutCheck(`${P} 会話（玄関）`)
      },
      after: async () => {
        await advanceUntil(dialogueHas('반가워요'), '반가워요')
        check(`${P} home_003：正解の反応は笑顔`, (await expression()) === 'smile', await expression())
        check(`${P} 会話中も玄関の背景`, (await backdrop()).includes('bg/entrance'))
      },
    },
    1: {
      choice: '아니요.',
      after: async () => {
        await advanceUntil(dialogueHas('잘하시겠네요'), '잘하시겠네요')
        check(`${P} home_003：選んだ答えで反応が変わる（いいえ）`, true)
      },
    },
  })
  check(`${P} 会話の後の案内文（玄関のまま）`, (await mainText()).includes('包みを差し出して') && (await backdrop()).includes('bg/entrance'))
  await click('次へ')
  check(`${P} 떡 を含む 6 枚のカード`, (await stepHeading()).includes('/ 6'), await stepHeading())
  await nextCards(6)
  const xp0 = (await saved()).stats.xp
  await playConversation('home_004', {
    0: {
      write: 'ㄱㅗㅁㅏㅇㅜㅓㅇㅛ',
      after: async () => check(`${P} home_004：別の正解（고마워요）を書いて正解 +15`, (await saved()).stats.xp - xp0 === 15, `${xp0} → ${(await saved()).stats.xp}`),
    },
    1: {
      wrong: '안녕하세요.',
      onWrong: async () => {
        check(`${P} home_004：反応に expression の指定があれば、間違いでも笑顔`, (await dialogueText()).includes('만났을 때') && (await expression()) === 'smile', `${await dialogueText()} / ${await expression()}`)
      },
      choice: '안녕히 가세요.',
    },
  })
  await sleep(200)
  check(`${P} home_004 の後は部屋の背景に戻り、コラム「引っ越しとお餅」`, (await backdrop()).includes('bg/home') && (await mainText()).includes('引っ越しとお餅'), await backdrop())
  if (W === 375) await shot('375-03-column1')
  await layoutCheck(`${P} コラム1`)
  await click('次へ')
  check(`${P} 最後の案内文`, (await mainText()).includes('カフェに行ってみましょう'))
  await click('次へ')
  check(`${P} event_001 完了`, (await saved()).progress.completedEvents.includes('event_001') && (await heading()) === '自宅')
  check(`${P} イベントが終わると施設の背景`, (await backdrop()).includes('bg/home'))

  // --- event_002（カフェ） ---
  await click('外に出る（マップへ）')
  await layoutCheck(`${P} マップ`)
  await click('カフェ目標')
  await click('カウンターへ行く')
  check(`${P} カフェの最初の案内文`, (await mainText()).includes('ちょっとした特徴'))
  await click('次へ')
  check(`${P} コラム「韓国のカフェあるある」`, (await mainText()).includes('韓国のカフェあるある') && (await backdrop()).includes('bg/cafe'))
  if (W === 375) await shot('375-04-column2')
  await click('次へ')
  await click('次へ')
  await nextCards(7)
  await playConversation('cafe_005')
  check(`${P} 注文の前の案内文`, (await mainText()).includes('注文のしかたと'))
  await click('次へ')
  check(`${P} 単語6＋文法2のカード`, (await stepHeading()).includes('/ 8'), await stepHeading())
  await nextCards(8)
  // 途中で再読み込み → 同じ段階から
  const before = (await saved()).progress.activeEvent
  await reload()
  await click('つづきから')
  await sleep(200)
  check(`${P} 再読み込み → つづきから同じ段階（cafe_006）`, (await saved()).progress.activeEvent?.step === before?.step && (await mainText()).includes('뭐 드릴까요'), JSON.stringify(before))
  await playConversation('cafe_006', {
    0: {
      write: 'ㅇㅏㅁㅔㄹㅣㅋㅏㄴㅗㅎㅏㄴㅈㅏㄴㅈㅜㅅㅔㅇㅛ',
      after: async () => check(`${P} 分かち書きだけ違う → 注意つきで正解`, (await mainText()).includes('分かち書きに注意')),
    },
    1: { before: async () => check(`${P} freeAnswer のない往復は「書いて答える」を出さない`, !(await evaluate(`[...document.querySelectorAll('.mode-tab')].some(b => b.textContent.includes('書いて'))`))) },
    2: { choice: '아니요, 괜찮아요.' },
  })
  await click('次へ')
  await nextCards(1)
  await playConversation('cafe_007', { 1: { wrong: '안녕히 가세요.' } })
  check(`${P} 最後の案内文（カフェ）`, (await mainText()).includes('初めての注文ができました'))
  await click('次へ')
  check(`${P} event_002 完了`, (await saved()).progress.completedEvents.includes('event_002'))

  // --- event_003（自宅・図鑑・1日の終わり） ---
  await click('外に出る（マップへ）')
  await click('自宅目標')
  await click('図鑑を開く')
  await click('次へ')
  await nextCards(2)
  check(`${P} 図鑑：${vocabCount}語すべて`, (await mainText()).includes(`${vocabCount} / ${vocabCount}`), (await mainText()).slice(0, 200))
  await click('閉じる')
  await sleep(1600)
  // 教材に合わせた部分：答えた往復の数（home_003:2, home_004:2, cafe_005:1, cafe_006:3, cafe_007:2）と、書いて答えた数（2）
  const turnsCorrect = 2 + 2 + 1 + 3 + 2
  const written = 2
  check(`${P} 1日の終わり：単語${vocabCount}語・会話の正解${turnsCorrect}回`, (await mainText()).includes(`${vocabCount} 語`) && (await mainText()).includes(`${turnsCorrect} 回`), (await mainText()).slice(0, 300))
  if (W === 375) await shot('375-05-dayend')
  await click('閉じる')
  const final = await saved()
  // 単語×2 ＋ 選んだ往復×10 ＋ 書いた往復×15 ＋ イベント3×20（src/data/game/balance.json）
  const expectXp = vocabCount * 2 + (turnsCorrect - written) * 10 + written * 15 + 3 * 20
  check(`${P} 経験値の合計 ${expectXp}`, final.stats.xp === expectXp, String(final.stats.xp))
  check(`${P} すべてのイベント完了`, final.progress.completedEvents.length === 3)
}

b.finish()
