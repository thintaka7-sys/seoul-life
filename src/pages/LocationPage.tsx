import { useGame, nowIso } from '../app/GameContext'
import { Button } from '../components/Button'
import { ScreenLayout } from '../components/ScreenLayout'
import { conversationsAt, findCharacter, findLocation } from '../data'

export function LocationPage({ locationId }: { locationId: string }) {
  const { dispatch } = useGame()
  const location = findLocation(locationId)
  const conversation = conversationsAt(locationId)[0]
  const partner = conversation ? findCharacter(conversation.character) : undefined

  return (
    <ScreenLayout
      eyebrow="施設"
      title={location?.nameJa ?? locationId}
      footer={<Button onClick={() => dispatch({ type: 'backToMap', now: nowIso() })}>マップへ戻る</Button>}
    >
      <p className="muted">（施設の背景やキャラクターの絵は Phase 1 以降で追加します）</p>
      {conversation ? (
        <Button variant="primary" onClick={() => dispatch({ type: 'talk', conversationId: conversation.id })}>
          {partner?.roleJa ?? '人'}に話しかける
        </Button>
      ) : (
        <p>ここにはまだ話せる人がいません。</p>
      )}
    </ScreenLayout>
  )
}
