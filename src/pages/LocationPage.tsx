import { useGame, nowIso } from '../app/GameContext'
import { Button } from '../components/Button'
import { Hud } from '../components/Hud'
import { ScreenLayout } from '../components/ScreenLayout'
import { content, findLocation } from '../data'
import { completedEventsAt, nextEventAt } from '../game/events/events'

/** 仮の絵（絵柄が決まるまで、施設ごとの絵文字で表す） */
const PLACEHOLDER_ART: Readonly<Record<string, string>> = {
  home: '🏠',
  cafe: '☕',
}

export function LocationPage({ locationId }: { locationId: string }) {
  const { state, dispatch } = useGame()
  const location = findLocation(locationId)
  const save = state.save
  const next = save === null ? undefined : nextEventAt(content.events, save.progress, locationId)
  const resuming = next !== undefined && save?.progress.activeEvent?.id === next.id
  const replays = save === null ? [] : completedEventsAt(content.events, save.progress, locationId)

  return (
    <ScreenLayout
      eyebrow="施設"
      title={location?.nameJa ?? locationId}
      footer={
        <>
          <Button onClick={() => dispatch({ type: 'backToMap', now: nowIso() })}>外に出る（マップへ）</Button>
          <Button onClick={() => dispatch({ type: 'openSettings' })}>設定</Button>
        </>
      }
    >
      <Hud />
      <div className="scene-art" aria-hidden="true">
        {PLACEHOLDER_ART[locationId] ?? '🏢'}
      </div>

      {next !== undefined ? (
        <Button variant="primary" onClick={() => dispatch({ type: 'startEvent', eventId: next.id, now: nowIso() })}>
          {next.actionJa}
          {resuming && '（つづきから）'}
        </Button>
      ) : (
        <p className="muted">いまは、ここですることはありません。</p>
      )}

      {locationId === 'home' && <Button onClick={() => dispatch({ type: 'openDictionary' })}>図鑑を見る</Button>}

      {replays.length > 0 && (
        <section className="replays" aria-label="もう一度遊ぶ">
          <h2 className="section-title">もう一度遊ぶ（経験値は増えません）</h2>
          {replays.map((e) => (
            <Button key={e.id} onClick={() => dispatch({ type: 'startEvent', eventId: e.id, now: nowIso() })}>
              {e.objectiveJa}
            </Button>
          ))}
        </section>
      )}
    </ScreenLayout>
  )
}
