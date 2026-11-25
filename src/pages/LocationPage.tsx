import { useGame, nowIso } from '../app/GameContext'
import { Button } from '../components/Button'
import { ExportReminder } from '../components/ExportReminder'
import { Hud } from '../components/Hud'
import { Notice } from '../components/Notice'
import { Stage } from '../components/scene/Stage'
import { ScreenLayout } from '../components/ScreenLayout'
import { UpdateBanner } from '../components/UpdateBanner'
import { backgroundImage, content, findConversation, findLocation } from '../data'
import type { GameEvent } from '../data/types'
import { completedEventsAt, nextEventAt } from '../game/events/events'
import { isMovedIn } from '../game/home/home'

/** 次のイベントで会話する相手（施設にいる人として立ち絵を出す）。会話がなければ null */
function characterIn(event: GameEvent | undefined): string | null {
  for (const step of event?.steps ?? []) {
    if (step.type === 'conversation') return findConversation(step.id)?.character ?? null
  }
  return null
}

export function LocationPage({ locationId }: { locationId: string }) {
  const { state, dispatch } = useGame()
  const location = findLocation(locationId)
  const save = state.save
  const next = save === null ? undefined : nextEventAt(content.events, save.progress, locationId)
  const resuming = next !== undefined && save?.progress.activeEvent?.id === next.id
  const replays = save === null ? [] : completedEventsAt(content.events, save.progress, locationId)
  // 注文の段階のあるイベントを終えたら（一度注文できたら）、ここから何度でも注文し直せる（GAME_SPEC 4-4）
  const orders =
    save === null
      ? []
      : content.orders.filter((o) => {
          if (o.location !== locationId) return false
          const event = content.events.find((e) => e.steps.some((s) => s.type === 'order' && s.id === o.id))
          return save.learning.orders[o.id] !== undefined || (event !== undefined && save.progress.completedEvents.includes(event.id))
        })

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
      {locationId === 'home' && (
        <>
          <UpdateBanner />
          <ExportReminder />
        </>
      )}
      {save?.progress.notices.includes('storyRestructured') === true && (
        <Notice tone="info">
          <p>物語が新しくなりました（第1章「韓国に到着」から始まります）。覚えた単語・復習・スタンプ・経験値は、そのまま残っています。</p>
          <Button onClick={() => dispatch({ type: 'dismissNotice', notice: 'storyRestructured', now: nowIso() })}>わかりました</Button>
        </Notice>
      )}
      {save?.progress.notices.includes('progressionIntroduced') === true && (
        <Notice tone="info">
          <p>
            レベル・コイン・実績が加わりました。これまでの学習で、実績を{Object.keys(save.achievements).length}個達成し、コインを{save.stats.coins}枚もらっています。
          </p>
          <Button onClick={() => dispatch({ type: 'dismissNotice', notice: 'progressionIntroduced', now: nowIso() })}>わかりました</Button>
        </Notice>
      )}
      <Stage locationId={locationId} characterId={characterIn(next)} hasBackground={backgroundImage(locationId) !== undefined} />

      <div className="panel actions">
        {next !== undefined ? (
          <Button variant="primary" onClick={() => dispatch({ type: 'startEvent', eventId: next.id, now: nowIso() })}>
            {next.actionJa}
            {resuming && '（つづきから）'}
          </Button>
        ) : (
          <p className="muted">いまは、ここですることはありません。</p>
        )}

        {orders.map((o) => (
          <Button key={o.id} onClick={() => dispatch({ type: 'openOrder', orderId: o.id })}>
            注文する（メニューを見る）
          </Button>
        ))}

        {locationId === 'home' && (
          <>
            <Button onClick={() => dispatch({ type: 'openStudy' })}>勉強する（復習・練習・ハングル）</Button>
            {save !== null && isMovedIn(save.progress, content.balance.room) && <Button onClick={() => dispatch({ type: 'openRoom' })}>部屋を飾る（家具）</Button>}
            <Button onClick={() => dispatch({ type: 'openDictionary' })}>図鑑を見る</Button>
            <Button onClick={() => dispatch({ type: 'openStamps' })}>スタンプカード</Button>
            <Button onClick={() => dispatch({ type: 'openAchievements' })}>実績</Button>
            <Button onClick={() => dispatch({ type: 'openAlbum' })}>おはなしのアルバム</Button>
          </>
        )}

        {replays.length > 0 && (
          <section className="replays" aria-label="もう一度遊ぶ">
            <h2 className="section-title">もう一度遊ぶ（経験値は、初めて正解した問題だけ）</h2>
            {replays.map((e) => (
              <Button key={e.id} onClick={() => dispatch({ type: 'startEvent', eventId: e.id, now: nowIso() })}>
                {e.objectiveJa}
              </Button>
            ))}
          </section>
        )}
      </div>
    </ScreenLayout>
  )
}
