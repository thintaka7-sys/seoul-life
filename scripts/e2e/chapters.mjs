// 第1章〜第3章（Phase 3）を、スマホ幅とPC幅で最初から最後まで遊んで確かめる（first-day.mjs を作り直したもの）。
// はじめから自動で始まるおはなし（ふりがな・訳の切り替え、ログ、単語のタップと「覚える」、看板、飛ばす）、
// 先生のビデオ通話の枠と「ハングルは読めますか？」、お隣さんの会話（背景の切り替え・反応と表情・書いて答える）、
// 章の終わりの画面、カフェが開く知らせ、カフェの会話（分かち書きの注意・再読み込みしての再開）、図鑑、1日の終わり、経験値の合計、BGM の読み込み。
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
const vocabCount = readDir('vocabulary').length
const events = readDir('events')

const backdrop = () => evaluate(`document.querySelector('.backdrop__sharp')?.getAttribute('src') ?? ''`)
const expression = () => evaluate(`document.querySelector('.conversation .portrait')?.dataset.expression ?? ''`)
const dialogueText = () =>
  evaluate(`(() => { const d = document.querySelector('.dialogue'); if (!d) return ''; const c = d.cloneNode(true); c.querySelectorAll('rt').forEach(r => r.remove()); return c.textContent.replace(/\\s+/g, ' ') })()`)
const dialogueHas = (s) => `(() => { const d = document.querySelector('.dialogue'); return !!d && d.textContent.includes(${JSON.stringify(s)}) })()`
const answering = `!!document.querySelector('.answer')`
const atLocation = (name) => `!document.querySelector('.event-header') && document.querySelector('h1')?.textContent.trim() === ${JSON.stringify(name)}`
const toast = () => evaluate(`document.querySelector('.toast')?.textContent ?? ''`)

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

  // ---------- 第2章（仮のおはなし） ----------
  await click('外に出る（マップへ）')
  check(`${P} 第2章の間は、カフェにまだ行けない`, await evaluate(`[...document.querySelectorAll('main button')].find(b => b.textContent.includes('カフェ'))?.disabled === true`))
  await click('自宅目標')
  await click('外に出てみる')
  await advanceEvent(`!!document.querySelector('.story')`, '第2章のおはなし')
  check(`${P} 仮のおはなしには「仮データ」の印`, await evaluate(`!!document.querySelector('.story .draft-badge')`))
  check(`${P} 家の前の道の背景`, (await backdrop()).includes('bg/street'), await backdrop())
  await advanceEvent(atLocation('自宅'), '第2章のはじめの後')
  await click('先生に報告する')
  await advanceEvent(`!!document.querySelector('.chapter-end')`, '第2章の終わり')
  check(`${P} 第2章の終わりの画面`, (await mainText()).includes('第2章 クリア'))
  await click('次へ')
  await advanceEvent(atLocation('自宅'), '第2章の後')

  // ---------- 第3章：カフェが開く ----------
  await click('外に出てみる')
  await advanceEvent(atLocation('自宅'), 'カフェをすすめられた後')
  check(`${P} カフェに行けるようになったと知らせる`, (await toast()).includes('カフェに行けるようになりました'), await toast())
  if (W === 375) await shot('375-05-unlocked')

  // --- event_002（カフェ） ---
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
  check(`${P} 最後の案内文（カフェ）`, (await mainText()).includes('初めての注文ができました'))
  await click('次へ')
  check(`${P} event_002 完了`, (await saved()).progress.completedEvents.includes('event_002'))

  // --- event_003（自宅・図鑑・1日の終わり。第3章の教材が届くまで今のまま） ---
  await click('外に出る（マップへ）')
  await click('自宅目標')
  await click('図鑑を開く')
  await click('次へ')
  await nextCards(2)
  check(`${P} 図鑑：${vocabCount}語すべて`, (await mainText()).includes(`${vocabCount} / ${vocabCount}`), (await mainText()).slice(0, 200))
  await click('閉じる')
  await sleep(1600)
  // 教材に合わせた部分：答えた問題の往復の数（home_005:1, home_006:2, cafe_008:1, cafe_009:2, cafe_010:2）と、書いて答えた数（2）
  const turnsCorrect = 1 + 2 + 1 + 2 + 2
  const written = 2
  check(`${P} 1日の終わり：単語${vocabCount}語・会話の正解${turnsCorrect}回`, (await mainText()).includes(`${vocabCount} 語`) && (await mainText()).includes(`${turnsCorrect} 回`), (await mainText()).slice(0, 300))
  await click('閉じる')
  const final = await saved()
  // 単語×2 ＋ 選んだ往復×10 ＋ 書いた往復×15 ＋ イベント×20（src/data/game/balance.json）
  const expectXp = vocabCount * 2 + (turnsCorrect - written) * 10 + written * 15 + events.length * 20
  check(`${P} 経験値の合計 ${expectXp}`, final.stats.xp === expectXp, String(final.stats.xp))
  check(`${P} すべてのイベント完了（${events.length}）`, final.progress.completedEvents.length === events.length, JSON.stringify(final.progress.completedEvents))

  // --- おはなしのアルバム ---
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

// ---------- BGM：最初の操作で鳴り始め、場面の曲を読み込む。設定で音量を変えられる ----------
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
await click('設定')
await click('オフ', { within: 'fieldset:has(input[name="bgm"])' }).catch(async () => evaluate(`document.querySelector('input[name="bgm"][type="radio"]:not(:checked)').click()`))
await sleep(200)
const settings = await evaluate(`JSON.parse(localStorage.getItem('seoul-life:settings'))`)
check('BGM：設定でオフにでき、設定（v5）に保存する', settings.version === 5 && settings.bgm === false, JSON.stringify(settings))
await layoutCheck('設定（BGM・音量）')
await shot('375-06-settings')

b.finish()
