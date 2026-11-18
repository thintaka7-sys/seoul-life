import { useGame } from '../app/GameContext'
import { useFuriganaDisplay } from '../app/hooks'
import { Button } from '../components/Button'
import { KoreanText } from '../components/KoreanText'
import { ScreenLayout } from '../components/ScreenLayout'
import { content } from '../data'
import { FURIGANA_MODES, SPEECH_RATES, type FuriganaMode, type SpeechRate } from '../storage/settings'

const FURIGANA_LABELS: Record<FuriganaMode, string> = {
  recommended: `おすすめ（第${content.balance.furiganaAlwaysUntilChapter}章まではいつも表示、その後はタップで表示）`,
  always: 'いつも表示',
  tap: 'タップしたときだけ表示',
  off: '表示しない',
}

const SPEECH_LABELS: Record<SpeechRate, string> = {
  slow: 'ゆっくり',
  normal: 'ふつう',
}

function FuriganaPreview() {
  const sample = content.vocabulary.find((v) => v.example !== undefined)
  const display = useFuriganaDisplay(1)
  if (sample?.example === undefined || sample.examplePronunciation === undefined) return null
  return (
    <p className="preview">
      <span className="muted small">表示の例（第1章）：</span>
      <KoreanText korean={sample.example} reading={sample.examplePronunciation} display={display} />
    </p>
  )
}

export function SettingsPage() {
  const { state, dispatch } = useGame()
  const { settings } = state

  return (
    <ScreenLayout title="設定" footer={<Button onClick={() => dispatch({ type: 'closeSettings' })}>戻る</Button>}>
      <fieldset className="field">
        <legend>フリガナ（カタカナの読み）</legend>
        {FURIGANA_MODES.map((mode) => (
          <label key={mode} className="radio">
            <input
              type="radio"
              name="furigana"
              value={mode}
              checked={settings.furigana === mode}
              onChange={() => dispatch({ type: 'changeSettings', settings: { ...settings, furigana: mode } })}
            />
            <span>{FURIGANA_LABELS[mode]}</span>
          </label>
        ))}
        <FuriganaPreview />
        <p className="muted small">カタカナでは表せない音もあるので、フリガナは読み上げと一緒に使ってください。</p>
      </fieldset>

      <fieldset className="field">
        <legend>読み上げの速さ</legend>
        {SPEECH_RATES.map((rate) => (
          <label key={rate} className="radio">
            <input
              type="radio"
              name="speechRate"
              value={rate}
              checked={settings.speechRate === rate}
              onChange={() => dispatch({ type: 'changeSettings', settings: { ...settings, speechRate: rate } })}
            />
            <span>{SPEECH_LABELS[rate]}</span>
          </label>
        ))}
      </fieldset>

      <p className="muted small">セーブデータの書き出し・読み込みなどは、今後のPhaseで追加します。</p>
    </ScreenLayout>
  )
}
