import { useGame, nowIso } from '../app/GameContext'
import { Button } from '../components/Button'
import { ScreenLayout } from '../components/ScreenLayout'
import { content } from '../data'

export function MainPage() {
  const { dispatch } = useGame()

  return (
    <ScreenLayout title="街のマップ" footer={<Button onClick={() => dispatch({ type: 'backToTitle' })}>タイトルへ</Button>}>
      <p className="muted">現在地：街の中</p>
      <p className="muted">行きたい場所を選んでください。（マップの絵は Phase 1 以降で追加します）</p>
      <ul className="tile-grid">
        {content.locations.map((loc) => (
          <li key={loc.id}>
            <Button className="tile" onClick={() => dispatch({ type: 'goToLocation', locationId: loc.id, now: nowIso() })}>
              {loc.nameJa}
            </Button>
          </li>
        ))}
      </ul>
    </ScreenLayout>
  )
}
