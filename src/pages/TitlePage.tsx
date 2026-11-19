import { useGame, nowIso } from '../app/GameContext'
import { BUILD_LABEL, GAME_TITLE_JA, GAME_TITLE_KO } from '../app/gameInfo'
import { Button } from '../components/Button'
import { Notice } from '../components/Notice'
import { content } from '../data'

export function TitlePage() {
  const { state, dispatch } = useGame()
  const hasSave = state.save !== null

  function startNew() {
    if (hasSave && !window.confirm('いまのセーブデータを消して、はじめから始めますか？')) return
    dispatch({ type: 'startNew', now: nowIso() })
  }

  return (
    <main className="screen screen--title">
      <div className="title-card">
        <h1 className="title">
          <span className="title__ko" lang="ko">
            {GAME_TITLE_KO}
          </span>
          <span className="title__ja">{GAME_TITLE_JA}</span>
        </h1>

        <div className="menu">
          <Button variant="primary" onClick={startNew}>
            はじめから
          </Button>
          <Button onClick={() => dispatch({ type: 'continue' })} disabled={!hasSave} aria-describedby={hasSave ? undefined : 'no-save-hint'}>
            つづきから
          </Button>
          {!hasSave && (
            <p id="no-save-hint" className="hint">
              セーブデータはまだありません
            </p>
          )}
          <Button onClick={() => dispatch({ type: 'openSettings' })}>設定</Button>
        </div>
      </div>

      {import.meta.env.DEV && content.issues.length > 0 && (
        <Notice tone="warn">
          教材データに{content.issues.length}件の問題があり、該当するデータを除外しました。開発者ツールのコンソールを確認してください。
        </Notice>
      )}

      <p className="build-label">{BUILD_LABEL}</p>
    </main>
  )
}
