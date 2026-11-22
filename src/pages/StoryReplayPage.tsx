import { useCallback } from 'react'
import { useGame } from '../app/GameContext'
import { Button } from '../components/Button'
import { findStory } from '../data'
import { StoryStep } from './event/StoryStep'

/** アルバムから、見たおはなしをもう一度見る（記録は変えない。最後まで見たらアルバムに戻る） */
export function StoryReplayPage({ storyId }: { storyId: string }) {
  const { dispatch } = useGame()
  const story = findStory(storyId)
  const close = useCallback(() => dispatch({ type: 'closeStudyScene' }), [dispatch])
  return (
    <main className="screen">
      <header className="screen__header event-header">
        <div>
          <p className="screen__eyebrow">おはなしのアルバム</p>
          <h1 className="screen__title">{story?.titleJa ?? 'おはなし'}</h1>
        </div>
        <div className="event-header__actions">
          <button type="button" className="link-button" onClick={close}>
            閉じる
          </button>
        </div>
      </header>
      <div className="screen__body">
        {story === undefined ? (
          <div className="panel">
            <p>おはなしが見つかりませんでした。</p>
            <Button onClick={close}>戻る</Button>
          </div>
        ) : (
          <StoryStep story={story} background="home" onDone={close} />
        )}
      </div>
    </main>
  )
}
