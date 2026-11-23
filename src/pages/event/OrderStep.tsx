import { useMemo, useState } from 'react'
import { nowIso, useGame } from '../../app/GameContext'
import { glossSpansOf } from '../../app/glossary'
import { useCanSpeak, useFuriganaDisplay } from '../../app/hooks'
import { playSfx } from '../../audio/sfx'
import { AnswerInput } from '../../components/AnswerInput'
import { Button } from '../../components/Button'
import { characterColors } from '../../components/dialogue/characterColors'
import { NamePlate } from '../../components/dialogue/NamePlate'
import { DraftBadge } from '../../components/DraftBadge'
import { KoreanText } from '../../components/KoreanText'
import { MenuBoard } from '../../components/MenuBoard'
import { MicButton } from '../../components/MicButton'
import { Notice } from '../../components/Notice'
import { Portrait } from '../../components/scene/Portrait'
import { SpeakButton } from '../../components/SpeakButton'
import { TaskLabel } from '../../components/TaskLabel'
import { Translation } from '../../components/Translation'
import { useGlossPopup } from '../../components/useGlossPopup'
import { content, findVocab } from '../../data'
import type { ConversationLine, Order } from '../../data/types'
import { judgeOrder, judgeSpokenOrder, orderExample, orderReaction, type OrderContext, type OrderJudge } from '../../learning/order/order'

type Mode = 'write' | 'speak'

/** 店員の台詞（読み上げ・訳・単語のタップつき） */
function StaffLine({ line, chapter }: { line: ConversationLine; chapter: number }) {
  const display = useFuriganaDisplay(chapter)
  const gloss = useGlossPopup(chapter)
  const spans = useMemo(() => glossSpansOf(line.korean, line.glosses), [line])
  return (
    <div className="order-line dialogue dialogue--line" style={characterColors(line.speaker)}>
      <NamePlate speaker={line.speaker} display={display} />
      <div className="ko-row">
        <KoreanText korean={line.korean} reading={line.pronunciation} display={display} className="dialogue__ko" glossSpans={spans} onGloss={gloss.onGloss} />
        <SpeakButton text={line.korean} />
      </div>
      <Translation text={line.japanese} className="dialogue__ja" />
      {gloss.popup}
    </div>
  )
}

/**
 * 注文（GAME_SPEC 4-4。書く・話す専用）。メニューを見て、好きなものを1つ韓国語で注文する。店員は教材の台詞で反応する。
 * 書くのも話すのも難しいときは「答えの例を見る」で進める（その場合は、注文できた記録・経験値を付けない）
 */
export function OrderStep({ order, onDone, doneLabel = '次へ' }: { order: Order; onDone: () => void; doneLabel?: string }) {
  const { dispatch } = useGame()
  const canSpeak = useCanSpeak()
  const display = useFuriganaDisplay(order.chapter)
  const [mode, setMode] = useState<Mode>('write')
  const [attempt, setAttempt] = useState(0)
  const [judge, setJudge] = useState<OrderJudge | null>(null)
  const [given, setGiven] = useState<string | null>(null)
  const [showExample, setShowExample] = useState(false)
  const menu = content.menus.find((m) => m.id === order.menu)
  const ctx: OrderContext | null = menu === undefined ? null : { order, menu, vocab: findVocab }
  const example = ctx === null ? null : orderExample(ctx)
  const done = judge?.kind === 'ok'
  const lines = judge === null ? order.lines : orderReaction(judge, order)
  const expression = lines.findLast((l) => l.speaker === order.character)?.expression ?? 'normal'

  function settle(j: OrderJudge, text: string, counts: boolean) {
    playSfx(j.kind === 'ok' ? 'correct' : 'wrong')
    setJudge(j)
    setGiven(text)
    setAttempt((a) => a + 1)
    if (j.kind === 'ok' && counts) dispatch({ type: 'orderPlaced', orderId: order.id, itemKey: j.item.key, now: nowIso() })
  }

  if (ctx === null) return <Notice tone="warn">メニューが見つかりませんでした。</Notice>

  return (
    <div className="order-step">
      {!order.reviewed && <DraftBadge />}
      <div className="order-step__staff">
        <Portrait characterId={order.character} expression={expression} className="order-step__portrait" />
      </div>
      <div className="order-step__lines" aria-live="polite">
        {lines.map((line, i) => (
          <StaffLine key={`${attempt}:${i}`} line={line} chapter={order.chapter} />
        ))}
      </div>

      {done ? (
        <section className="panel" aria-label="注文できました">
          <p className="correct">注文できました！</p>
          {given !== null && (
            <p>
              あなたの注文：「<span lang="ko">{given}</span>」
            </p>
          )}
          {judge?.kind === 'ok' && judge.counterMismatch && order.counterNoteJa !== undefined && <Notice tone="warn">{order.counterNoteJa}</Notice>}
          <Button variant="primary" onClick={onDone}>
            {doneLabel}
          </Button>
        </section>
      ) : (
        <>
          <MenuBoard menu={ctx.menu} display={display} showJapanese={true} />
          <section className="answer panel" aria-label="注文する">
            {canSpeak && (
              <div className="mode-tabs mode-tabs--2" role="group" aria-label="答え方">
                {(['write', 'speak'] as const).map((m) => (
                  <button key={m} type="button" className="mode-tab" aria-pressed={mode === m} aria-label={m === 'write' ? '書いて答える' : '話して答える'} onClick={() => setMode(m)}>
                    {m === 'write' ? '書く' : '話す'}
                  </button>
                ))}
              </div>
            )}
            <TaskLabel task={order.task} />
            {judge !== null && given !== null && (
              <Notice tone="warn">
                {mode === 'speak' ? '聞き取った言葉' : 'あなたの答え'}：「<span lang="ko">{given}</span>」。
                {judge.kind === 'notOnMenu' ? 'メニューにある品物を選んでみましょう。' : '「品物の名前 ＋ 주세요」の形で言ってみましょう。'}
              </Notice>
            )}
            {mode === 'write' ? (
              <AnswerInput key={attempt} onSubmit={(text) => settle(judgeOrder(text, ctx), text.trim(), true)} />
            ) : (
              <MicButton key={attempt} onHeard={(alternatives) => settle(judgeSpokenOrder(alternatives, ctx), alternatives[0] ?? '', true)} />
            )}
            {example !== null &&
              (showExample ? (
                <div className="order-example">
                  <p className="muted small">答えの例</p>
                  <div className="ko-row">
                    <KoreanText korean={example.korean} reading={example.pronunciation} display={display === 'tap' ? 'show' : display} />
                    <SpeakButton text={example.korean} />
                  </div>
                  <Button onClick={() => settle(judgeOrder(example.korean, ctx), example.korean, false)}>この言い方で注文する</Button>
                </div>
              ) : (
                <button type="button" className="link-button" onClick={() => setShowExample(true)}>
                  答えの例を見る
                </button>
              ))}
          </section>
        </>
      )}
    </div>
  )
}
