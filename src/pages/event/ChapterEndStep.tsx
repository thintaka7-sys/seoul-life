import { useEffect, type CSSProperties } from 'react'
import { useGame, nowIso } from '../../app/GameContext'
import { playSfx } from '../../audio/sfx'
import { Button } from '../../components/Button'
import { content, findVocab } from '../../data'
import { chapterSummary } from '../../game/events/events'

/**
 * 章の終わりの画面（chapterEnd の段階）。章の題とできるようになったこと、この章の単語、章末テストの案内。
 * 章末テストは次の章に進む条件にしない（計画 Q4）
 */
export function ChapterEndStep({ chapter, textJa }: { chapter: number; textJa: string }) {
  const { state, dispatch } = useGame()
  const info = content.chapters.find((c) => c.chapter === chapter)
  const words = chapterSummary(content.events, chapter).vocabulary.flatMap((id) => findVocab(id) ?? [])
  const test = content.chapterTests.find((t) => t.chapter === chapter)
  const passedAt = test === undefined ? undefined : state.save?.learning.tests[test.id]?.passedAt
  const passed = passedAt !== undefined && passedAt !== null

  // ファンファーレ（開発中の二重実行で2回鳴らないよう、少し待ってから鳴らす）
  useEffect(() => {
    const timer = window.setTimeout(() => playSfx('fanfare'), 150)
    return () => window.clearTimeout(timer)
  }, [])

  const item = (i: number) => ({ '--i': i }) as CSSProperties
  return (
    <div className="day-end chapter-end">
      <p className="day-end__label">第{chapter}章 クリア</p>
      {info !== undefined && <p className="chapter-end__title">{info.titleJa}</p>}
      <p className="day-end__title">{textJa}</p>
      {info !== undefined && (
        <section className="stats__item" style={item(0)} aria-label="できるようになったこと">
          <h2 className="section-title">できるようになったこと</h2>
          <p>{info.goalJa}</p>
        </section>
      )}
      {words.length > 0 && (
        <section className="day-words stats__item" style={item(1)} aria-label="この章の単語">
          <h2 className="section-title">この章の単語（{words.length}語）</h2>
          <ul className="day-words__list">
            {words.map((v) => (
              <li key={v.id} className="day-words__word">
                <span lang="ko">{v.korean}</span>
                <span className="day-words__ja">{v.japanese}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {test !== undefined && (
        <p className="panel-text stats__item" style={item(2)}>
          {passed ? `✓ ${test.titleJa}に合格しています。` : `「${test.titleJa}」で、この章の内容を確かめられます。自宅の「勉強する」→「ドリル・テスト」から、いつでも受けられます。`}
        </p>
      )}
      <Button variant="primary" sound={null} onClick={() => dispatch({ type: 'stepDone', now: nowIso() })}>
        次へ
      </Button>
    </div>
  )
}
