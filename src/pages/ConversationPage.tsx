import { useGame } from '../app/GameContext'
import { Button } from '../components/Button'
import { DraftBadge } from '../components/DraftBadge'
import { ScreenLayout } from '../components/ScreenLayout'
import { findCharacter, findConversation } from '../data'
import { PLAYER_SPEAKER_ID } from '../data/types'

function speakerName(speaker: string): string {
  if (speaker === PLAYER_SPEAKER_ID) return 'あなた'
  return findCharacter(speaker)?.roleJa ?? speaker
}

export function ConversationPage({ conversationId }: { conversationId: string }) {
  const { dispatch } = useGame()
  const conversation = findConversation(conversationId)
  const partner = conversation ? findCharacter(conversation.character) : undefined

  return (
    <ScreenLayout
      eyebrow="会話"
      title={partner?.roleJa ?? '会話'}
      footer={<Button onClick={() => dispatch({ type: 'endConversation' })}>会話を終える</Button>}
    >
      {conversation === undefined ? (
        <p>会話データが見つかりませんでした。</p>
      ) : (
        <>
          {!conversation.reviewed && <DraftBadge />}
          <ol className="lines">
            {conversation.lines.map((line, i) => (
              <li key={i} className="line">
                <span className="line__speaker">{speakerName(line.speaker)}</span>
                <p className="line__ko" lang="ko">
                  {line.korean}
                </p>
                <p className="line__ja">{line.japanese}</p>
              </li>
            ))}
          </ol>
          <p className="muted">（返事の方法〈選ぶ・書く・読み上げ〉は Phase 1 で追加します）</p>
        </>
      )}
    </ScreenLayout>
  )
}
