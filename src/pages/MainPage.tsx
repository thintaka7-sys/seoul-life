import { useGame, nowIso } from '../app/GameContext'
import { Button } from '../components/Button'
import { Hud } from '../components/Hud'
import { TownMap } from '../components/scene/TownMap'
import { ScreenLayout } from '../components/ScreenLayout'
import { assets, content } from '../data'
import type { Location } from '../data/types'
import { nextEvent, unlockedLocations } from '../game/events/events'

type MappedLocation = Location & { mapArea: NonNullable<Location['mapArea']> }
const mapped = content.locations.filter((l): l is MappedLocation => l.mapArea !== undefined)

export function MainPage() {
  const { state, dispatch } = useGame()
  const target = state.save === null ? undefined : nextEvent(content.events, state.save.progress)?.location
  // 最初から行ける施設と、終えたイベントで開いた施設（GAME_SPEC 6-1・計画 Q13）
  const unlocked = unlockedLocations(content.events, content.balance.initialLocations, state.save?.progress.completedEvents ?? [])
  const go = (locationId: string) => dispatch({ type: 'goToLocation', locationId, now: nowIso() })
  // マップの絵に載せていない施設は、下のボタンの一覧で選ぶ（マップの絵がなければ、すべてボタンの一覧）
  const listed = assets.map === null ? content.locations : content.locations.filter((l) => l.mapArea === undefined)

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
      <p className="panel-text">行きたい場所を選んでください。</p>
      {assets.map !== null && <TownMap image={assets.map} locations={mapped} isOpen={(id) => unlocked.has(id)} targetId={target} onSelect={go} />}
      {listed.length > 0 && (
        <ul className="tile-grid">
          {listed.map((loc) => {
            const open = unlocked.has(loc.id)
            return (
              <li key={loc.id}>
                <Button className={`tile${loc.id === target ? ' tile--target' : ''}`} disabled={!open} onClick={() => go(loc.id)}>
                  <span className="tile__name">{loc.nameJa}</span>
                  {!open && <span className="tile__note">🔒 まだ行けません</span>}
                  {open && loc.id === target && <span className="tile__note">目標</span>}
                </Button>
              </li>
            )
          })}
        </ul>
      )}
    </ScreenLayout>
  )
}
