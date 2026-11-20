import { useEffect, type CSSProperties } from 'react'
import { useGame, nowIso } from '../../app/GameContext'
import { playSfx } from '../../audio/sfx'
import { Button } from '../../components/Button'
import { useCountUp } from '../../components/useCountUp'
import { content, findConversation, findVocab } from '../../data'
import { conversationsOf, eventsOfDay, vocabularyOf } from '../../game/events/events'
import { conversationTurnKey } from '../../storage/saveData'

/** 1日の終わりの結果画面：学んだ単語・経験値・会話の正解の数を順に出し、今日の単語を並べる */
export function DayEndStep({ textJa, eventId }: { textJa: string; eventId: string }) {
  const { state, dispatch } = useGame()
  const save = state.save
  const run = state.run
  const animate = state.settings.effects === 'normal'

  // イベントを終えたときの経験値は「閉じる」の後で付くため、初めて終えるときは先に足して見せる
  const firstFinish = run !== null && !run.replay && save?.progress.completedEvents.includes(run.eventId) === false
  const xpNow = save?.stats.xp ?? 0
  const xp = useCountUp(xpNow + (firstFinish ? content.balance.xp.eventComplete : 0), animate, xpNow, 900)

  const today = eventsOfDay(content.events, eventId)
  const todayWords = vocabularyOf(today).flatMap((id) => findVocab(id) ?? [])
  const learned = todayWords.filter((v) => save?.learning.words[v.id] !== undefined)
  const correctTurns = conversationsOf(today).reduce((sum, id) => {
    const turns = findConversation(id)?.turns ?? []
    return sum + turns.filter((_, i) => {
      const r = save?.learning.conversations[conversationTurnKey(id, i)]
      return r !== undefined && (r.choice || r.write)
    }).length
  }, 0)

  // ファンファーレ（開発中の二重実行で2回鳴らないよう、少し待ってから鳴らす）
  useEffect(() => {
    const timer = window.setTimeout(() => playSfx('fanfare'), 150)
    return () => window.clearTimeout(timer)
  }, [])

  const item = (i: number) => ({ '--i': i }) as CSSProperties

  return (
    <div className="day-end">
      <p className="day-end__label">きょうのまとめ</p>
      <p className="day-end__title">{textJa}</p>
      <dl className="stats">
        <div className="stats__item" style={item(0)}>
          <dt>学んだ単語</dt>
          <dd>
            <strong>{learned.length}</strong> 語
          </dd>
        </div>
        <div className="stats__item" style={item(1)}>
          <dt>会話で正解</dt>
          <dd>
            <strong>{correctTurns}</strong> 回
          </dd>
        </div>
        <div className="stats__item" style={item(2)}>
          <dt>経験値（合計）</dt>
          <dd>
            <strong>{xp}</strong>
          </dd>
        </div>
      </dl>
      {todayWords.length > 0 && (
        <section className="day-words stats__item" style={item(3)} aria-label="今日の単語">
          <h2 className="section-title">今日の単語</h2>
          <ul className="day-words__list">
            {todayWords.map((v) => (
              <li key={v.id} className="day-words__word">
                <span lang="ko">{v.korean}</span>
                <span className="day-words__ja">{v.japanese}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <Button variant="primary" sound={null} onClick={() => dispatch({ type: 'stepDone', now: nowIso() })}>
        閉じる
      </Button>
    </div>
  )
}
