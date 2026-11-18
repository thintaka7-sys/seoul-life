import { useGame, nowIso } from '../app/GameContext'
import { Button } from '../components/Button'
import { Hud } from '../components/Hud'
import { ScreenLayout } from '../components/ScreenLayout'
import { content } from '../data'
import { nextEvent } from '../game/events/events'

const unlocked = new Set(content.balance.initialLocations)

export function MainPage() {
  const { state, dispatch } = useGame()
  const target = state.save === null ? undefined : nextEvent(content.events, state.save.progress)?.location

  return (
    <ScreenLayout
      title="街のマップ"
      footer={
        <>
          <Button onClick={() => dispatch({ type: 'openSettings' })}>設定</Button>
          <Button onClick={() => dispatch({ type: 'backToTitle' })}>タイトルへ</Button>
        </>
      }
    >
      <Hud />
      <p className="muted">行きたい場所を選んでください。（マップの絵は、絵柄が決まってから追加します）</p>
      <ul className="tile-grid">
        {content.locations.map((loc) => {
          const open = unlocked.has(loc.id)
          return (
            <li key={loc.id}>
              <Button
                className={`tile${loc.id === target ? ' tile--target' : ''}`}
                disabled={!open}
                onClick={() => dispatch({ type: 'goToLocation', locationId: loc.id, now: nowIso() })}
              >
                <span className="tile__name">{loc.nameJa}</span>
                {!open && <span className="tile__note">🔒 まだ行けません</span>}
                {open && loc.id === target && <span className="tile__note">目標</span>}
              </Button>
            </li>
          )
        })}
      </ul>
    </ScreenLayout>
  )
}
