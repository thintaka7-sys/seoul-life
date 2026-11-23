// 第1章〜第3章（Phase 3）を、スマホ幅とPC幅で最初から最後まで遊んで確かめる（first-day.mjs を作り直したもの）。
// はじめから自動で始まるおはなし（ふりがな・訳の切り替え、ログ、単語のタップと「覚える」、看板、飛ばす）、
// 先生のビデオ通話の枠と「ハングルは読めますか？」、お隣さんの会話（背景の切り替え・反応と表情・書いて答える）、
// 章の終わりの画面、カフェが開く知らせ、カフェの会話（分かち書きの注意・再読み込みしての再開）、図鑑、
// 読み物（選ぶ・探す・書く・数字。訳は答え終わるまで隠す）、形が変わる言葉の単語カード、注文（書いて注文・店員の反応・施設から注文し直す）、
// イベントの聞き取り、経験値の合計、BGM の読み込み。
// 教材を変えたら、下の「教材に合わせた部分」を直す。
// 使い方: node scripts/e2e/chapters.mjs <URL>

import { readFileSync, readdirSync } from 'node:fs'
import { openBrowser, sleep } from './browser.mjs'

const b = await openBrowser('chapters')
const { send, evaluate, click, clickChoice, chooseMode, typeKeys, heading, mainText, saved, stepHeading, viewport, shot, freshStart, check, layoutCheck, nextCards, reload, advanceEvent } = b

const readJson = (p) => JSON.parse(readFileSync(new URL(`../../src/data/${p}`, import.meta.url), 'utf8'))
const readDir = (d) =>
  readdirSync(new URL(`../../src/data/${d}/`, import.meta.url))
    .filter((f) => f.endsWith('.json'))
    .sort()
    .flatMap((f) => readJson(`${d}/${f}`))
const convs = new Map(readDir('scenarios').map((c) => [c.id, c]))
// 単語カード（learn）で覚える単語。おはなしのタップだけで覚えられる単語（CONTENT_FORMAT 21-2）は、図鑑の「学んだ単語」と経験値に入らない
const vocabTotal = readDir('vocabulary').length
const events = readDir('events')
const readings = new Map(readDir('readings').map((r) => [r.id, r]))
const grammarById = new Map(readDir('grammar').map((g) => [g.id, g]))
const listeningSentences = readDir('listening')
const vocabCount = new Set(events.flatMap((e) => e.steps.flatMap((st) => (st.type === 'learn' ? st.vocabulary : [])))).size

const backdrop = () => evaluate(`document.querySelector('.backdrop__sharp')?.getAttribute('src') ?? ''`)
const expression = () => evaluate(`document.querySelector('.conversation .portrait')?.dataset.expression ?? ''`)
const dialogueText = () =>
  evaluate(`(() => { const d = document.querySelector('.dialogue'); if (!d) return ''; const c = d.cloneNode(true); c.querySelectorAll('rt').forEach(r => r.remove()); return c.textContent.replace(/\\s+/g, ' ') })()`)
const dialogueHas = (s) => `(() => { const d = document.querySelector('.dialogue'); return !!d && d.textContent.includes(${JSON.stringify(s)}) })()`
const answering = `!!document.querySelector('.answer')`
const atLocation = (name) => `!document.querySelector('.event-header') && document.querySelector('h1')?.textContent.trim() === ${JSON.stringify(name)}`
const toast = () => evaluate(`document.querySelector('.toast')?.textContent ?? ''`)

/** 入力欄に文字を入れる（端末のキーボードで打ったのと同じ input イベントを起こす） */
const fillInput = (selector, value) =>
  evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(el, ${JSON.stringify(value)}); el.dispatchEvent(new Event('input', { bubbles: true })) })()`)
const plainText = (selector) =>
  evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return ''; const c = el.cloneNode(true); c.querySelectorAll('rt').forEach(r => r.remove()); return c.textContent.replace(/\\s+/g, ' ').trim() })()`)

/** 読み物の問題に、教材の答えで上から順に答える。正解した問題の数を返す */
async function answerReading(id, P) {
  const reading = readings.get(id)
  let correct = 0
  check(`${P} ${id}：答える前は日本語訳を出さない`, !(await evaluate(`!!document.querySelector('.reading__ja, .menu-item__ja')`)))
  for (const [i, q] of reading.questions.entries()) {
    await sleep(150)
    if (q.type === 'find') {
      const ok = await evaluate(`(() => { const plain = (el) => { const c = el.cloneNode(true); c.querySelectorAll('rt').forEach(r => r.remove()); return c.textContent.replace(/[\\s.,?!]/g, '') }; const b = [...document.querySelectorAll('.find-chip')].find(b => plain(b) === ${JSON.stringify(q.answer)}); if (!b) return false; b.click(); return true })()`)
      check(`${P} ${id}：本文から「${q.answer}」を探して押せる`, ok)
    } else if (q.type === 'choice') {
      const c = q.choices.find((x) => x.correct)
      await clickChoice(c.textJa ?? c.korean)
    } else if (q.type === 'number') {
      await fillInput('input[aria-label="答え（数字）"]', q.digits)
      await click('答える')
    } else {
      await fillInput('.answer-input__field', q.answers[0])
      await click('答える')
    }
    await sleep(150)
    if ((await mainText()).includes('正解！')) correct++
    await click(i === reading.questions.length - 1 ? '答え合わせを終える' : '次の問題へ')
  }
  check(`${P} ${id}：すべて正解し、答え終わったら日本語訳を出す`, correct === reading.questions.length && (await evaluate(`!!document.querySelector('.reading__ja, .menu-item__ja')`)), String(correct))
  await click('読み終える')
  return correct
}

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

let P = ''
/** 会話を最後まで進める（first-day.mjs と同じ。plan[往復の番号] で答え方を決める） */
async function playConversation(id, plan = {}) {
  const conv = convs.get(id)
  const wrongs = []
  for (let t = 0; t < conv.turns.length; t++) {
    const turn = conv.turns[t]
    if (turn.choices === undefined) break
    await advanceUntil(answering, `${id} 往復${t}`)
    const p = plan[t] ?? {}
    if (turn.kind !== 'decision') {
      const task = await evaluate(`document.querySelector('.answer .task__text')?.textContent ?? ''`)
      check(`${P} ${id} 往復${t}：言うこと「${turn.task}」`, task === turn.task, task)
    }
    if (p.before) await p.before()
    if (!p.write) await chooseMode('選んで答える')
    if (p.wrong) {
      await clickChoice(p.wrong)
      wrongs.push({ wrong: p.wrong, correct: (turn.choices.find((c) => c.correct) ?? turn.choices[0]).korean })
      await sleep(250)
      if (p.onWrong) await p.onWrong()
    }
    if (p.write) {
      if (!(await chooseMode('書いて答える'))) throw new Error(`${id} 往復${t}：書いて答えるのタブがありません`)
      await typeKeys(p.write)
      await click('答える')
    } else await clickChoice(p.choice ?? (turn.choices.find((c) => c.correct) ?? turn.choices[0]).korean)
    await sleep(200)
    if (p.after) await p.after()
  }
  await advanceUntil(`!document.querySelector('.conversation') || !!document.querySelector('.conversation-review')`, `${id} の終わり`)
  const review = await evaluate(`document.querySelector('.conversation-review')?.textContent ?? null`)
  if (wrongs.length === 0) {
    check(`${P} ${id}：間違えなければ、ふり返りは出ない`, review === null, review ?? '')
  } else {
    check(`${P} ${id}：会話の最後のふり返りに、間違えた答えと正解が出る`, review !== null && wrongs.every((w) => review.includes(`✗ 選んだ答え：${w.wrong}`) && review.includes(`✓ 正解：${w.correct}`)), review ?? '')
    await click('次へ', { within: '.conversation-review' })
    await advanceUntil(`!document.querySelector('.conversation')`, `${id} のふり返りの後`)
  }
}

for (const [W, H, mobile] of [
  [375, 760, true],
  [1280, 800, false],
]) {
  P = `${W}`
  let readingCorrect = 0
  await viewport(W, H, mobile)
  await freshStart()

  // ---------- 第1章：はじめから自動で始まる空港のおはなし ----------
  await click('はじめから')
  await sleep(200)
  check(`${P} はじめから → 空港のおはなしが自動で始まる（空港の背景）`, (await evaluate(`!!document.querySelector('.story')`)) && (await backdrop()).includes('bg/airport'), await backdrop())
  check(`${P} おはなしの操作（ふりがな・日本語訳・早送り・ログ・飛ばす）`, (await evaluate(`[...document.querySelectorAll('.story__toolbar button')].map(b => b.textContent.trim()).join(',')`)) === 'ふりがな,日本語訳,早送り,ログ,飛ばす')
  check(`${P} 確認済みのおはなしには「仮データ」の印を出さない`, !(await evaluate(`!!document.querySelector('.story .draft-badge')`)))
  if (W === 375) await shot('375-01-airport')
  await layoutCheck(`${P} おはなし（空港）`)

  // 台詞まで進め、ふりがなと訳をその場で切り替える（第1章は、設定「おすすめ」ならふりがなを表示）
  await advanceEvent(`!!document.querySelector('.dialogue--line, .dialogue--player')`, '最初の台詞')
  const rt0 = await evaluate(`document.querySelectorAll('.dialogue rt').length`)
  await click('ふりがな')
  const rt1 = await evaluate(`document.querySelectorAll('.dialogue rt').length`)
  await click('ふりがな')
  check(`${P} ふりがなをその場で消し、また出せる`, rt0 > 0 && rt1 === 0 && (await evaluate(`document.querySelectorAll('.dialogue rt').length`)) === rt0, `${rt0} → ${rt1}`)
  await click('日本語訳')
  const jaOff = await evaluate(`!document.querySelector('.dialogue .dialogue__ja')`)
  await click('日本語訳')
  check(`${P} 日本語訳をその場で消し、また出せる`, jaOff && (await evaluate(`!!document.querySelector('.dialogue .dialogue__ja')`)))

  // 単語のタップ（GAME_SPEC 4-8）
  await advanceEvent(`!!document.querySelector('.dialogue .gloss')`, '押せる単語のある台詞')
  await evaluate(`document.querySelector('.dialogue .gloss').click()`)
  await sleep(150)
  const popup = await evaluate(`document.querySelector('.gloss-popup')?.textContent ?? ''`)
  check(`${P} 単語を押すと、読み・意味の窓が出る`, popup !== '', popup)
  if (W === 375) await shot('375-02-gloss')
  if (await evaluate(`[...document.querySelectorAll('.gloss-popup button')].some(b => b.textContent.includes('覚える'))`)) {
    await click('覚える（復習に加える）')
    const seen = (await saved()).learning.seen
    check(`${P} 「覚える」で見かけた単語に入れ、翌日の復習に加える`, Object.keys(seen).length === 1 && (await saved()).learning.review[`word:${Object.keys(seen)[0]}`] !== undefined, JSON.stringify(seen))
  }
  await click('閉じる', { within: '.overlay' })
  // 単語の教材にない語句（名前など）は「覚える」を出さず、理由を一言出す
  let noteFound = false
  for (let i = 0; i < 40 && !noteFound; i++) {
    const opened = await evaluate(`(async () => {
      for (const g of document.querySelectorAll('.dialogue .gloss')) {
        g.click(); await new Promise(r => setTimeout(r, 120))
        const p = document.querySelector('.gloss-popup'); if (!p) continue
        if (![...p.querySelectorAll('button')].some(b => b.textContent.includes('覚える')) && !p.textContent.includes('図鑑で覚えた') && !p.textContent.includes('見かけた単語に入れました')) return p.textContent;
        [...p.querySelectorAll('button')].find(b => b.textContent.trim() === '閉じる').click(); await new Promise(r => setTimeout(r, 80))
      }
      return '' })()`)
    if (opened !== '') {
      check(`${P} 図鑑に入らない語句（名前など）には、「覚える」の代わりに理由を出す`, opened.includes('図鑑には入りません'), opened)
      await click('閉じる', { within: '.overlay' })
      noteFound = true
      break
    }
    if (await evaluate(`!!document.querySelector('.dialogue--sign')`)) break
    await evaluate(`document.querySelector('.dialogue__next')?.click()`)
    await sleep(120)
  }
  if (!noteFound) check(`${P} 図鑑に入らない語句（名前など）のある台詞が、看板の前にある`, false)

  // 看板とログ
  await advanceEvent(`!!document.querySelector('.dialogue--sign')`, '看板')
  check(`${P} 看板（案内表示）の韓国語を、背景とは別の板で出す`, (await evaluate(`document.querySelector('.dialogue--sign .story__sign-text')?.textContent ?? ''`)) !== '')
  await click('ログ')
  check(`${P} ログに、これまでの地の文と台詞が並ぶ`, (await evaluate(`document.querySelectorAll('.overlay .log-list li').length`)) >= 2)
  await click('閉じる', { within: '.overlay' })

  // タクシーのおはなしは、最後まで飛ばす（確認つき）
  await advanceEvent(`(document.querySelector('.backdrop__sharp')?.getAttribute('src') ?? '').includes('bg/taxi')`, 'タクシーの場面')
  check(`${P} 空港のおはなしの後、タクシーの背景に変わる`, (await backdrop()).includes('bg/taxi'))
  await click('飛ばす')
  check(`${P} 飛ばす前に確かめる`, (await evaluate(`document.querySelector('.overlay')?.textContent ?? ''`)).includes('最後まで飛ばしますか'))
  await click('最後まで飛ばす')
  await sleep(200)
  const after = await saved()
  check(`${P} 飛ばしても、見たおはなしとして記録し、次の段階（案内文）へ`, Object.keys(after.progress.storiesSeen).length === 2 && (await mainText()).includes('新しい家に着きました'), JSON.stringify(after.progress.storiesSeen))
  check(`${P} おはなしを終えると、イベントの背景（自宅）に戻る`, (await backdrop()).includes('bg/home'), await backdrop())
  await advanceEvent(atLocation('自宅'), '第1章のはじめの後')
  check(`${P} 空港のイベントを終えて自宅へ`, (await saved()).progress.completedEvents.includes('event_004'))

  // 先生の授業（ビデオ通話の枠）と「ハングルは読めますか？」
  await click('ノートパソコンを開く')
  await advanceEvent(`!!document.querySelector('.call-frame--story')`, 'ビデオ通話')
  check(`${P} 先生がビデオ通話の枠に出る`, await evaluate(`!!document.querySelector('.call-frame--story .portrait')`))
  if (W === 375) await shot('375-03-call')
  await layoutCheck(`${P} ビデオ通話`)
  await advanceEvent(`!!document.querySelector('.hangul-intro')`, 'ハングルは読めますか？')
  check(`${P} 先生の授業の中で「ハングルは読めますか？」と聞く（先生が話す枠）`, await evaluate(`!!document.querySelector('.teacher-says .call-frame--mini')`))
  await layoutCheck(`${P} ハングルは読めますか`)
  await click('このまま物語を進める')
  await advanceEvent(atLocation('自宅'), '先生の授業の後')

  // ---------- 第1章：お隣さん（event_001。first-day.mjs と同じ確かめ） ----------
  await click('玄関に出る')
  check(`${P} 最初の案内文は部屋の背景`, (await mainText()).includes('チャイムが鳴りました') && (await backdrop()).includes('bg/home'), await backdrop())
  await click('次へ')
  await sleep(200)
  check(`${P} 案内文の後で玄関の背景に切り替わる（単語カード）`, (await backdrop()).includes('bg/entrance') && (await stepHeading()).includes('1 / 5'), await backdrop())
  check(`${P} 進み具合のバーは背景の段階を数えない（8段階）`, (await evaluate(`document.querySelector('.event-progress').max`)) === 8)
  await layoutCheck(`${P} 玄関・単語カード`)
  await nextCards(5)
  check(`${P} 이수진の紹介`, (await mainText()).includes('이수진'))
  await playConversation('home_005', {
    0: {
      wrong: '안녕히 계세요.',
      onWrong: async () => {
        check(`${P} home_005：間違えた選択肢の反応（reply）を表示`, (await dialogueText()).includes('이제 막 왔는데요'), await dialogueText())
        check(`${P} home_005：間違えたら困り顔`, (await expression()) === 'troubled', await expression())
        await layoutCheck(`${P} 会話（玄関）`)
      },
      after: async () => {
        await advanceUntil(dialogueHas('반가워요'), '반가워요')
        check(`${P} home_005：正解の反応は笑顔`, (await expression()) === 'smile', await expression())
        check(`${P} 会話中も玄関の背景`, (await backdrop()).includes('bg/entrance'))
      },
      // 会話の台詞の単語も押せる（GAME_SPEC 4-8。「안녕하세요! 옆집에 살아요.」の 안녕하세요）
      before: async () => check(`${P} 会話の台詞の単語も押せる`, await evaluate(`[...document.querySelectorAll('.dialogue .gloss')].some((g) => g.textContent.includes('안녕하세요'))`)),
    },
    1: {
      before: async () => {
        const text = await mainText()
        const tabs = await evaluate(`document.querySelectorAll('.mode-tab').length`)
        check(`${P} home_005：選択の往復は「どうしますか？」と聞き、選ぶだけ`, text.includes('どうしますか') && tabs === 0, `${tabs} ${text.slice(0, 120)}`)
      },
      choice: '아니요.',
      after: async () => {
        await advanceUntil(dialogueHas('잘하시겠네요'), '잘하시겠네요')
        check(`${P} home_005：選んだ答えで反応が変わる（いいえ）`, (await expression()) === 'normal', await expression())
      },
    },
  })
  check(`${P} 会話の後の案内文（玄関のまま）`, (await mainText()).includes('包みを差し出して') && (await backdrop()).includes('bg/entrance'))
  await click('次へ')
  check(`${P} 떡 を含む 6 枚のカード`, (await stepHeading()).includes('/ 6'), await stepHeading())
  await nextCards(6)
  const xp0 = (await saved()).stats.xp
  await playConversation('home_006', {
    0: {
      write: 'ㄱㅗㅁㅏㅇㅜㅓㅇㅛ',
      after: async () => check(`${P} home_006：別の正解（고마워요）を書いて正解 +15`, (await saved()).stats.xp - xp0 === 15, `${xp0} → ${(await saved()).stats.xp}`),
    },
    1: {
      wrong: '안녕하세요.',
      onWrong: async () => check(`${P} home_006：反応に expression の指定があれば、間違いでも笑顔`, (await dialogueText()).includes('만났을 때') && (await expression()) === 'smile', `${await dialogueText()} / ${await expression()}`),
      choice: '안녕히 가세요.',
    },
  })
  await sleep(200)
  check(`${P} home_006 の後は部屋の背景に戻り、コラム「引っ越しとお餅」`, (await backdrop()).includes('bg/home') && (await mainText()).includes('引っ越しとお餅'), await backdrop())
  await click('次へ')
  // 教材に合わせた部分：最後の案内文
  check(`${P} 最後の案内文（先生に話す）`, (await mainText()).includes('先生に話してみましょう'))
  await click('次へ')
  check(`${P} event_001 完了`, (await saved()).progress.completedEvents.includes('event_001') && (await heading()) === '自宅')

  // 先生とふり返り → 第1章の終わり
  await click('ノートパソコンを開く')
  await advanceEvent(`!!document.querySelector('.chapter-end')`, '第1章の終わり')
  const end1 = await mainText()
  check(`${P} 第1章の終わりの画面（章の題・できるようになったこと・章末テストの案内）`, end1.includes('第1章 クリア') && end1.includes('韓国に到着') && end1.includes('できるようになったこと') && end1.includes('第1章のテスト'), end1.slice(0, 300))
  if (W === 375) await shot('375-04-chapter-end')
  await layoutCheck(`${P} 章の終わり`)
  await click('次へ')
  await advanceEvent(atLocation('自宅'), '第1章の後')

  // ---------- 第2章：自己紹介（event_007・event_008） ----------
  await click('外に出る（マップへ）')
  check(`${P} 第2章の間は、カフェにまだ行けない`, await evaluate(`[...document.querySelectorAll('main button')].find(b => b.textContent.includes('カフェ'))?.disabled === true`))
  await click('自宅目標')
  await click('外に出てみる')
  await advanceEvent(`!!document.querySelector('.story')`, '第2章のおはなし')
  check(`${P} 第2章のおはなし（教材）には「仮データ」の印を出さない`, !(await evaluate(`!!document.querySelector('.story .draft-badge')`)))
  check(`${P} 家の前の道の背景`, (await backdrop()).includes('bg/street'), await backdrop())
  await advanceEvent(`!!document.querySelector('.learn-card')`, '第2章の単語カード')
  /** 単語・文法カードをめくりながら、形が変わる言葉の図・文法の図があるかを見る */
  async function flipCards(label) {
    const total = Number((await stepHeading()).match(/\/ (\d+)/)?.[1] ?? 0)
    let forms = 0
    let grammarFigures = 0
    for (let i = 0; i < total; i++) {
      if (await evaluate(`!!document.querySelector('.learn-card .vocab-forms .formation__result')`)) {
        if (forms === 0 && W === 375) await shot(`375-04b-forms-${label}`)
        if (forms === 0) await layoutCheck(`${P} 形が変わる言葉の単語カード（${label}）`)
        forms++
      }
      if (await evaluate(`!!document.querySelector('.learn-card .teacher-says .figure')`)) grammarFigures++
      await click(i === total - 1 ? '覚えた！' : '次へ')
    }
    return { total, forms, grammarFigures }
  }
  const cards1 = await flipCards('自己紹介')
  check(`${P} 第2章の1つ目の単語カード（単語8・文法2）に、形が変わる言葉の図がある`, cards1.total === 10 && cards1.forms > 0, JSON.stringify(cards1))
  /** 書いて答えるタブがあるか（第2章の会話でも、書く問題の往復では出る） */
  const writeTab = async (label) => {
    const tabs = await evaluate(`[...document.querySelectorAll('.mode-tab')].map((b) => b.getAttribute('aria-label')).join(',')`)
    check(`${P} ${label}：書いて答えるタブがある`, tabs.includes('書いて答える'), tabs)
    if (W === 375) await shot(`375-04a-answer-${label.replace(/\s/g, '-')}`)
  }
  await playConversation('home_007', {
    0: { before: () => writeTab('home_007 往復0'), write: 'ㅂㅏㄴㄱㅏㅇㅜㅓㅇㅛ' },
    1: { before: () => writeTab('home_007 往復1'), wrong: '네, 저는 일본 사람이에요.' },
  })
  await advanceEvent(`!!document.querySelector('.learn-card')`, '第2章の2つ目の単語カード')
  const cards2 = await flipCards('仕事')
  check(`${P} 第2章の2つ目の単語カード（単語6・文法1）に、文法の図（이름이 뭐예요?）がある`, cards2.total === 7 && cards2.grammarFigures > 0, JSON.stringify(cards2))
  await playConversation('home_008', {
    0: { before: async () => check(`${P} home_008：仕事は選ぶだけ（選択の往復）`, (await mainText()).includes('どうしますか')), choice: '저는 학생이에요.' },
    1: { before: () => writeTab('home_008 往復1') },
    2: { before: () => writeTab('home_008 往復2') },
  })
  await sleep(200)
  check(`${P} 第2章のコラム「年齢と呼び方」（部屋の背景）`, (await mainText()).includes('年齢と呼び方') && (await backdrop()).includes('bg/home'), (await mainText()).slice(0, 200))
  await layoutCheck(`${P} 第2章のコラム`)
  await advanceEvent(atLocation('自宅'), '第2章の自己紹介の後')
  check(`${P} event_007 完了`, (await saved()).progress.completedEvents.includes('event_007'))
  await click('ノートパソコンを開く')
  await advanceEvent(`!!document.querySelector('.chapter-end')`, '第2章の終わり')
  const end2 = await mainText()
  check(`${P} 第2章の終わりの画面と、章末テストの案内`, end2.includes('第2章 クリア') && end2.includes('第2章のテスト'), end2.slice(0, 300))
  await click('次へ')
  await advanceEvent(atLocation('自宅'), '第2章の後')

  // ---------- 第3章：初めてのカフェ（event_009 → event_002 → event_010 → event_011） ----------
  // --- event_009（ハナさんのおすすめ。カフェが開く） ---
  await click('外に出てみる')
  await advanceEvent(`!!document.querySelector('.story')`, '第3章のおはなし')
  check(`${P} 第3章のおはなし（教材）には「仮データ」の印を出さない`, !(await evaluate(`!!document.querySelector('.story .draft-badge')`)))
  await advanceEvent(`(document.querySelector('main')?.textContent ?? '').includes('マップから行ってみましょう')`, 'カフェの案内文')
  check(`${P} おはなしの後は部屋の背景に戻して案内する`, (await backdrop()).includes('bg/home'), await backdrop())
  await advanceEvent(atLocation('自宅'), 'カフェをすすめられた後')
  check(`${P} カフェに行けるようになったと知らせる`, (await toast()).includes('カフェに行けるようになりました'), await toast())
  if (W === 375) await shot('375-05-unlocked')

  // --- event_002（初めてのカフェ） ---
  await click('外に出る（マップへ）')
  await layoutCheck(`${P} マップ`)
  await click('カフェ目標')
  await click('カウンターへ行く')
  check(`${P} カフェの最初の案内文`, (await mainText()).includes('ちょっとした特徴'))
  await click('次へ')
  check(`${P} コラム「韓国のカフェあるある」`, (await mainText()).includes('韓国のカフェあるある') && (await backdrop()).includes('bg/cafe'))
  await click('次へ')
  await click('次へ')
  await nextCards(7)
  await playConversation('cafe_008')
  check(`${P} 注文の前の案内文`, (await mainText()).includes('注文のしかたと'))
  await click('次へ')
  check(`${P} 単語6＋文法2のカード（文法は先生が説明する）`, (await stepHeading()).includes('/ 8'), await stepHeading())
  for (let i = 0; i < 7; i++) await click('次へ')
  check(`${P} 文法カードの説明を、先生が話す形で出す`, await evaluate(`!!document.querySelector('.learn-card .teacher-says')`))
  {
    // 最後のカードは、そのイベントで習う最後の文法。教材の図（部品 → くっついた形）を、先生の説明の中に出す
    const learnStep = events.filter((e) => e.location === 'cafe').flatMap((e) => e.steps).find((s) => s.type === 'learn' && (s.grammar ?? []).length === 2)
    const lastGrammar = grammarById.get(learnStep.grammar.at(-1))
    const want = (lastGrammar.figures ?? []).length
    const got = await evaluate(`document.querySelectorAll('.learn-card .teacher-says .figure').length`)
    check(`${P} 文法カードの図（${lastGrammar.id}：${want}個）`, want > 0 && got === want, `${got} / ${want}`)
    if (W === 375) await shot('375-06b-grammar-figure')
  }
  await click('覚えた！')
  const before = (await saved()).progress.activeEvent
  await reload()
  await click('つづきから')
  await sleep(200)
  check(`${P} 再読み込み → つづきから同じ段階（cafe_009）`, (await saved()).progress.activeEvent?.step === before?.step && (await mainText()).includes('뭐 드릴까요'), JSON.stringify(before))
  await playConversation('cafe_009', {
    0: {
      write: 'ㅇㅏㅁㅔㄹㅣㅋㅏㄴㅗㅎㅏㄴㅈㅏㄴㅈㅜㅅㅔㅇㅛ',
      after: async () => {
        check(`${P} 分かち書きだけ違う → 注意つきで正解`, (await mainText()).includes('分かち書きに注意'))
        check(`${P} 分かち書きの注意：自分の答えと正解を並べ、空白の違いに印`, await evaluate(`!!document.querySelector('.dialogue .answer-compare') && document.querySelectorAll('.dialogue .diff--space').length >= 1`))
      },
    },
    1: {
      wrong: '감사합니다.',
      onWrong: async () => check(`${P} cafe_009：間違えたら聞き返す`, (await dialogueText()).includes('아이스로 드릴까요'), await dialogueText()),
    },
    2: {
      choice: '아니요, 괜찮아요.',
      after: async () => {
        await advanceUntil(dialogueHas('알겠습니다'), '알겠습니다')
        check(`${P} cafe_009：選択の反応に表情の指定があれば、その表情（困り顔）`, (await expression()) === 'troubled', await expression())
      },
    },
  })
  await click('次へ')
  await nextCards(1)
  await playConversation('cafe_010', { 1: { wrong: '안녕히 가세요.' } })
  // 教材に合わせた部分：最後の案内文
  check(`${P} 最後の案内文（次はメニューを読む）`, (await mainText()).includes('メニューをじっくり読んで'))
  await click('次へ')
  check(`${P} event_002 完了`, (await saved()).progress.completedEvents.includes('event_002'))

  // --- event_010（2回目のカフェ：単語 → メニューを読む → おはなし → 単語 → 注文 → 聞き取り） ---
  await click('もう一度カフェに入る')
  await click('次へ')
  const cards3 = await flipCards('カフェ')
  check(`${P} 飲み物の単語カード（7枚）に、形が変わる言葉（따뜻한）の図がある`, cards3.total === 7 && cards3.forms > 0, JSON.stringify(cards3))
  await advanceEvent(`!!document.querySelector('.reading-step')`, 'メニューの読み物')
  const menu = readDir('menus').find((m) => m.id === 'menu_001')
  check(`${P} メニューの読み物：品物の絵（${menu.items.length}品）・品名・値段`, (await evaluate(`document.querySelectorAll('.menu-item .menu-item__img').length`)) === menu.items.length && (await plainText('.menu-board')).includes('4,500원'), await plainText('.menu-board'))
  if (W === 375) await shot('375-07-menu')
  await layoutCheck(`${P} メニューの読み物`)
  readingCorrect += await answerReading('reading_001', P)
  await advanceEvent(`!!document.querySelector('.learn-card')`, '食べ物の単語カード')
  const cards4 = await flipCards('食べ物')
  check(`${P} 食べ物の単語カード（9枚）に、形が変わる言葉（맛있어요）の図がある`, cards4.total === 9 && cards4.forms > 0, JSON.stringify(cards4))
  await sleep(150)
  check(`${P} 注文の画面：店員の台詞・メニュー・言うこと`, (await plainText('.order-step')).includes('주문하시겠어요') && (await evaluate(`!!document.querySelector('.order-step .menu-board') && !!document.querySelector('.order-step .task-label, .order-step .task')`)), (await plainText('.order-step')).slice(0, 200))
  if (W === 375) await shot('375-08-order')
  await layoutCheck(`${P} 注文`)
  await fillInput('.answer-input__field', '아메리카노 한 잔 주세요')
  await click('答える')
  await sleep(200)
  const reaction = await plainText('.order-step__lines')
  const americanoReply = menu.items.find((i) => i.key === 'americano').reply[0].korean
  check(`${P} 注文できた：数の確かめ → 品物のひとこと → 締めの台詞`, (await mainText()).includes('注文できました') && reaction.includes('한 잔이요') && reaction.includes(americanoReply) && reaction.includes('기다려 주세요'), reaction)
  check(`${P} 注文の記録（初めての注文）`, JSON.stringify((await saved()).learning.orders['order_001']?.items) === '["americano"]', JSON.stringify((await saved()).learning.orders))
  await click('次へ')
  await sleep(200)
  // 聞き取り：読み上げが使えれば答え、使えなければ飛ばす。問題は音で出すので、選択肢の組からどの文かを見分けて答える
  let listened = 0
  const eventSentences = listeningSentences.filter((x) => x.afterEvent === 'event_010')
  const squash = (t) => t.replace(/\s+/g, '')
  if (await evaluate(`!!document.querySelector('.quiz') && !!document.querySelector('.choice__button')`)) {
    for (let i = 0; i < eventSentences.length; i++) {
      const shown = await evaluate(`[...document.querySelectorAll('.choice__button')].map((b) => { const c = b.cloneNode(true); c.querySelectorAll('rt').forEach((r) => r.remove()); return c.textContent })`)
      const flat = shown.map(squash)
      const s = eventSentences.find((x) => [x.korean, ...x.distractors.map((d) => d.korean)].every((k) => flat.some((c) => c.includes(squash(k)))))
      if (s === undefined) throw new Error(`聞き取りの問題が分かりません: ${JSON.stringify(shown)}`)
      await clickChoice(s.korean)
      if ((await mainText()).includes('正解！')) listened++
      await click(i === eventSentences.length - 1 ? '結果を見る' : '次へ')
    }
    check(`${P} イベントの聞き取り：${eventSentences.length}問に答え、結果を出す`, listened === eventSentences.length && (await mainText()).includes(`${eventSentences.length}問中 ${eventSentences.length}問正解`), (await mainText()).slice(0, 200))
    await click('次へ')
  } else {
    check(`${P} イベントの聞き取り：読み上げが使えない端末では、案内を出して飛ばせる`, (await mainText()).includes('聞き取りの問題は飛ばします'))
  }
  await advanceEvent(`document.querySelector('h1')?.textContent.trim() === 'カフェ' && !document.querySelector('.event-header')`, '2回目のカフェの後')
  check(`${P} event_010 完了`, (await saved()).progress.completedEvents.includes('event_010'))

  // --- event_011（先生とふり返り → 第3章の終わり） ---
  await click('外に出る（マップへ）')
  await click('自宅目標')
  await click('ノートパソコンを開く')
  await advanceEvent(`!!document.querySelector('.chapter-end')`, '第3章の終わり')
  check(`${P} 第3章の終わりの画面と、章末テストの案内`, (await mainText()).includes('第3章 クリア') && (await mainText()).includes('第3章のテスト'), (await mainText()).slice(0, 300))
  await click('次へ')
  await advanceEvent(atLocation('自宅'), '第3章の後')

  // 図鑑：単語カードで覚えた単語の数（おはなしのタップだけで覚える単語は入らない）
  await click('図鑑を見る')
  check(`${P} 図鑑：単語カードで覚えた${vocabCount}語（全${vocabTotal}語）`, (await mainText()).includes(`${vocabCount} / ${vocabTotal}`), (await mainText()).slice(0, 200))
  await click('閉じる')
  // 教材に合わせた部分：答えた問題の往復の数（home_005:1, home_006:2, home_007:2, home_008:2, cafe_008:1, cafe_009:2, cafe_010:2）と、書いて答えた数（3）
  const turnsCorrect = 1 + 2 + 2 + 2 + 1 + 2 + 2
  const written = 3

  // 施設の画面から、もう一度注文する（メニューにない品物 → 聞き返し、答えの例でも進める。経験値は初回だけ）
  const order = readDir('orders').find((o) => o.id === 'order_001')
  await click('外に出る（マップへ）')
  await click('カフェ', { exact: false, within: '.town-map' })
  const xpBeforeReorder = (await saved()).stats.xp
  await click('注文する（メニューを見る）')
  await fillInput('.answer-input__field', '라면 주세요')
  await click('答える')
  await sleep(200)
  check(`${P} メニューにない品物：店員が「ありません」と答え、もう一度注文できる`, (await plainText('.order-step__lines')).includes('그건 없어요') && (await evaluate(`!!document.querySelector('.answer-input__field')`)))
  await fillInput('.answer-input__field', '아메리카노 한 개 주세요')
  await click('答える')
  await sleep(200)
  check(`${P} 数え方の単位が品物と合わない：通じたものとして、注意を出す`, (await mainText()).includes('注文できました') && (await mainText()).includes(order.counterNoteJa), (await mainText()).slice(0, 300))
  check(`${P} 2回目の注文では経験値を付けない`, (await saved()).stats.xp === xpBeforeReorder)
  await click('店を出る')
  check(`${P} 注文し直した後は、カフェの画面に戻る`, (await heading()) === 'カフェ')

  const final = await saved()
  // 単語×2 ＋ 選んだ往復×10 ＋ 書いた往復×15 ＋ イベント×20 ＋ 読み物の正解×5 ＋ 初めての注文15 ＋ 聞き取りの正解×3（src/data/game/balance.json）
  const expectXp = vocabCount * 2 + (turnsCorrect - written) * 10 + written * 15 + events.length * 20 + readingCorrect * 5 + 15 + listened * 3
  check(`${P} 経験値の合計 ${expectXp}`, final.stats.xp === expectXp, String(final.stats.xp))
  check(`${P} すべてのイベント完了（${events.length}）`, final.progress.completedEvents.length === events.length, JSON.stringify(final.progress.completedEvents))

  // --- おはなしのアルバム ---
  await click('外に出る（マップへ）')
  await click('自宅', { exact: false, within: '.town-map' })
  await click('おはなしのアルバム')
  const albumItems = await evaluate(`document.querySelectorAll('.album-list__item').length`)
  check(`${P} アルバムに、見たおはなしが並ぶ（${Object.keys(final.progress.storiesSeen).length}本）`, albumItems === Object.keys(final.progress.storiesSeen).length && albumItems > 0, String(albumItems))
  await layoutCheck(`${P} アルバム`)
  await evaluate(`document.querySelector('.album-list__item').click()`)
  await sleep(200)
  check(`${P} アルバムから、おはなしをもう一度見られる`, await evaluate(`!!document.querySelector('.story')`))
  await click('閉じる')
  await click('戻る')
  check(`${P} アルバム → 自宅`, (await heading()) === '自宅')
}

// ---------- BGM：最初の操作で鳴り始め、場面の曲を読み込む。画面が見えなくなったら止め、戻ったら続きから。設定で音量を変えられる ----------
// BGM の audio 要素と AudioContext は画面に出ないので、作られたものを記録しておく
await send('Page.addScriptToEvaluateOnNewDocument', {
  source: `(() => {
    window.__audios = new Set()
    const play = HTMLMediaElement.prototype.play
    HTMLMediaElement.prototype.play = function () { window.__audios.add(this); return play.call(this) }
    window.__contexts = []
    const Base = window.AudioContext
    if (Base) window.AudioContext = class extends Base { constructor(...a) { super(...a); window.__contexts.push(this) } }
  })()`,
})
await viewport(375, 760, true)
await freshStart()
const clickByMouse = async (text) => {
  const pt = await evaluate(`(() => { const b = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === ${JSON.stringify(text)}); const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } })()`)
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: pt.x, y: pt.y, button: 'left', clickCount: 1 })
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: pt.x, y: pt.y, button: 'left', clickCount: 1 })
  await sleep(1500)
}
const loaded = (name) => evaluate(`performance.getEntriesByType('resource').some((e) => e.name.includes(${JSON.stringify(name)}))`)
check('BGM：操作の前は曲を読み込まない', !(await loaded('audio/bgm_')))
await clickByMouse('はじめから')
check('BGM：はじめからで、おはなしの曲（story）を読み込む', await loaded('audio/bgm_story'))

// 画面が見えなくなったら（別のタブ・ホーム画面）、BGM を止め、音の出口（効果音）も止める。戻ったら BGM を続きから
const audioState = () =>
  evaluate(`({
    playing: [...window.__audios].filter((a) => !a.paused).map((a) => ({ src: a.src.split('/').pop(), t: a.currentTime })),
    paused: [...window.__audios].filter((a) => a.paused && a.currentTime > 0).map((a) => ({ src: a.src.split('/').pop(), t: a.currentTime })),
    contexts: window.__contexts.map((c) => c.state),
  })`)
const setVisibility = async (state, event) => {
  await evaluate(`(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => ${JSON.stringify(state)} })
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => ${JSON.stringify(state === 'hidden')} })
    ${event === 'visibilitychange' ? `document.dispatchEvent(new Event('visibilitychange'))` : `window.dispatchEvent(new PageTransitionEvent(${JSON.stringify(event)}, { persisted: true }))`}
  })()`)
  await sleep(500)
}
const playingBefore = await audioState()
check('BGM：はじめからで、曲が流れ始める', playingBefore.playing.length === 1 && playingBefore.contexts.includes('running'), JSON.stringify(playingBefore))
// 流れ始めた直後（位置が 0 のまま）に止めると、止めた曲として数えられないので、少し進むのを待つ
for (let i = 0; i < 20 && !((await audioState()).playing[0]?.t > 0.3); i++) await sleep(150)
for (const [hideEvent, showEvent] of [
  ['visibilitychange', 'visibilitychange'],
  ['pagehide', 'pageshow'],
]) {
  await setVisibility('hidden', hideEvent)
  const hiddenState = await audioState()
  check(`見えなくなったら（${hideEvent}）：BGM を止め、音の出口も止める`, hiddenState.playing.length === 0 && hiddenState.paused.length >= 1 && hiddenState.contexts.every((c) => c !== 'running'), JSON.stringify(hiddenState))
  const stoppedAt = Math.max(...hiddenState.paused.map((a) => a.t))
  await sleep(600)
  check(`見えない間は、BGM を進めない（${hideEvent}）`, Math.max(...(await audioState()).paused.map((a) => a.t)) === stoppedAt)
  await setVisibility('visible', showEvent)
  const shown = await audioState()
  check(`戻ったら（${showEvent}）：BGM を続きから流し、音の出口も動かす`, shown.playing.length === 1 && shown.playing[0].t >= stoppedAt && shown.contexts.includes('running'), JSON.stringify({ stoppedAt, shown }))
}
await click('設定')
await click('オフ', { within: 'fieldset:has(input[name="bgm"])' }).catch(async () => evaluate(`document.querySelector('input[name="bgm"][type="radio"]:not(:checked)').click()`))
await sleep(200)
const settings = await evaluate(`JSON.parse(localStorage.getItem('seoul-life:settings'))`)
check('BGM：設定でオフにでき、設定（v5）に保存する', settings.version === 5 && settings.bgm === false, JSON.stringify(settings))
await layoutCheck('設定（BGM・音量）')
await shot('375-06-settings')

b.finish()
