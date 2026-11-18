import { useGame } from '../app/GameContext'
import { Button } from '../components/Button'
import { ScreenLayout } from '../components/ScreenLayout'

export function SettingsPage() {
  const { dispatch } = useGame()
  return (
    <ScreenLayout title="設定" footer={<Button onClick={() => dispatch({ type: 'closeSettings' })}>戻る</Button>}>
      <p className="muted">設定の項目（表示の切り替え、読み上げ、セーブデータの書き出しなど）は、今後のPhaseで追加します。</p>
    </ScreenLayout>
  )
}
