import { useGame } from '../app/GameContext'
import { Button } from '../components/Button'
import { ScreenLayout } from '../components/ScreenLayout'
import { content } from '../data'

/** おはなしのアルバム（GAME_SPEC 3-2）。見たおはなしを章ごとに並べ、もう一度見られる */
export function AlbumPage() {
  const { state, dispatch } = useGame()
  const seen = state.save?.progress.storiesSeen ?? {}
  const stories = content.stories.filter((s) => seen[s.id] !== undefined)
  const chapters = [...new Set(stories.map((s) => s.chapter))].sort((a, b) => a - b)

  return (
    <ScreenLayout title="おはなしのアルバム" footer={<Button onClick={() => dispatch({ type: 'closeStudyScene' })}>戻る</Button>}>
      {stories.length === 0 ? (
        <p className="panel-text">まだ見たおはなしはありません。物語を進めると、ここに増えていきます。</p>
      ) : (
        chapters.map((chapter) => {
          const title = content.chapters.find((c) => c.chapter === chapter)?.titleJa
          return (
            <section key={chapter} className="panel album-chapter" aria-label={`第${chapter}章`}>
              <h2 className="section-title">
                第{chapter}章{title !== undefined && `　${title}`}
              </h2>
              <ul className="album-list">
                {stories
                  .filter((s) => s.chapter === chapter)
                  .map((s) => (
                    <li key={s.id}>
                      <Button className="album-list__item" onClick={() => dispatch({ type: 'openStoryReplay', storyId: s.id })}>
                        {s.titleJa}
                      </Button>
                    </li>
                  ))}
              </ul>
            </section>
          )
        })
      )}
    </ScreenLayout>
  )
}
