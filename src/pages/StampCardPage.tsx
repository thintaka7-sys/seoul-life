import { useState } from 'react'
import { nowIso, useGame } from '../app/GameContext'
import { Button } from '../components/Button'
import { ScreenLayout } from '../components/ScreenLayout'
import { content } from '../data'
import type { StampActivity } from '../data/types'
import { currentStreak, monthGrid, shiftMonth } from '../game/stamps/stamps'
import { localDate } from '../learning/review/dates'

const ACTIVITY_LABELS: Record<StampActivity, string> = {
  review: '今日の復習を最後まで（復習がない日は、練習1回）',
  drill: '基礎ドリルを1回',
  chapterTest: '章末テストを1回',
  hangulLesson: 'ハングルのレッスンに合格',
  listening: 'リスニングを1回',
  event: '物語のイベントを1つ',
  ear: '聞き分けを1回',
}

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土']

/** スタンプカード（GAME_SPEC 7-6）。休んだ日があっても、集めたスタンプは消えない */
export function StampCardPage() {
  const { state, dispatch } = useGame()
  const today = localDate(nowIso())
  const [view, setView] = useState(() => ({ year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)) }))
  const stamps = new Set(state.save?.daily.stamps ?? [])
  const streak = currentStreak([...stamps], today)
  const weeks = monthGrid(view.year, view.month)
  const close = () => dispatch({ type: 'closeStudyScene' })

  return (
    <ScreenLayout eyebrow="自宅" title="スタンプカード" footer={<Button onClick={close}>戻る</Button>}>
      <section className="panel">
        <p className={stamps.has(today) ? 'correct' : undefined}>{stamps.has(today) ? '今日のスタンプを押しました！' : '今日のスタンプはまだです。'}</p>
        <ul className="info-list">
          <li>
            続けている日数：<strong>{streak}</strong>日
          </li>
          <li>
            集めたスタンプ：<strong>{stamps.size}</strong>個
          </li>
        </ul>
        <p className="muted small">次のどれかを終えると、その日のスタンプが押されます。休んだ日があっても、集めたスタンプは消えません。</p>
        <ul className="stamp-rules">
          {content.balance.stampActivities.map((a) => (
            <li key={a}>{ACTIVITY_LABELS[a]}</li>
          ))}
        </ul>
      </section>

      <section className="panel" aria-label="カレンダー">
        <div className="stamp-month">
          <Button onClick={() => setView((v) => shiftMonth(v.year, v.month, -1))} aria-label="前の月">
            ◀
          </Button>
          <p className="stamp-month__title">
            {view.year}年{view.month}月
          </p>
          <Button onClick={() => setView((v) => shiftMonth(v.year, v.month, 1))} aria-label="次の月">
            ▶
          </Button>
        </div>
        <table className="stamp-calendar">
          <thead>
            <tr>
              {WEEKDAYS.map((w) => (
                <th key={w} scope="col">
                  {w}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {weeks.map((week, i) => (
              <tr key={i}>
                {week.map((day, j) => (
                  <td key={j} className={day === null ? undefined : `stamp-day${stamps.has(day) ? ' stamp-day--stamped' : ''}${day === today ? ' stamp-day--today' : ''}`}>
                    {day !== null && (
                      <>
                        <span className="stamp-day__number">{Number(day.slice(8))}</span>
                        {stamps.has(day) && (
                          <span className="stamp-day__mark" role="img" aria-label="スタンプ">
                            ★
                          </span>
                        )}
                      </>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </ScreenLayout>
  )
}
