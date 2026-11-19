import { useGame } from '../app/GameContext'
import { useFuriganaDisplay } from '../app/hooks'
import { Button } from '../components/Button'
import { KoreanText } from '../components/KoreanText'
import { ScreenLayout } from '../components/ScreenLayout'
import { content } from '../data'
import { useState } from 'react'
import { playSfx } from '../audio/sfx'
import { TEXT_SPEED_MS, totalChars } from '../components/dialogue/typewriter'
import { useTypewriter } from '../components/dialogue/useTypewriter'
import { pairReading } from '../learning/furigana/furigana'
import {
  EFFECT_LEVELS,
  FURIGANA_MODES,
  SPEECH_RATES,
  TEXT_SPEEDS,
  TRANSLATION_MODES,
  type EffectLevel,
  type FuriganaMode,
  type Settings,
  type SpeechRate,
  type TextSpeed,
  type TranslationMode,
} from '../storage/settings'

const FURIGANA_LABELS: Record<FuriganaMode, string> = {
  recommended: `おすすめ（第${content.balance.furiganaAlwaysUntilChapter}章まではいつも表示、その後はタップで表示）`,
  always: 'いつも表示',
  tap: 'タップしたときだけ表示',
  off: '表示しない',
}

const TRANSLATION_LABELS: Record<TranslationMode, string> = {
  always: 'いつも表示',
  tap: 'タップしたときだけ表示',
  off: '表示しない',
}

const SPEECH_LABELS: Record<SpeechRate, string> = {
  slow: 'ゆっくり',
  normal: 'ふつう',
}

const TEXT_SPEED_LABELS: Record<TextSpeed, string> = {
  instant: 'なし（すぐに全文を表示）',
  fast: '速い',
  normal: 'ふつう',
  slow: 'ゆっくり',
}

const EFFECT_LABELS: Record<EffectLevel, string> = {
  normal: 'ふつう',
  reduced: '控えめ（動きを減らし、フェードだけにする）',
}

/** 文字送りの見本（「もう一度」で最初から） */
function TextSpeedPreview({ speed }: { speed: TextSpeed }) {
  const [round, setRound] = useState(0)
  const sample = content.vocabulary.find((v) => v.example !== undefined)
  const display = useFuriganaDisplay(1)
  const korean = sample?.example ?? ''
  const reading = sample?.examplePronunciation ?? null
  const segments = reading === null ? null : pairReading(korean, reading)
  const typing = useTypewriter(`${speed}:${round}`, segments === null ? [...korean].length : totalChars(segments), TEXT_SPEED_MS[speed])
  if (korean === '') return null
  return (
    <div className="preview preview--typing">
      <KoreanText korean={korean} reading={reading} display={display} visibleChars={typing.done ? undefined : typing.visible} />
      <button type="button" className="link-button" onClick={() => setRound((r) => r + 1)}>
        もう一度
      </button>
    </div>
  )
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
  const change = (patch: Partial<Settings>) => dispatch({ type: 'changeSettings', settings: { ...settings, ...patch } })

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
        <legend>日本語訳</legend>
        {TRANSLATION_MODES.map((mode) => (
          <label key={mode} className="radio">
            <input type="radio" name="translation" value={mode} checked={settings.translation === mode} onChange={() => change({ translation: mode })} />
            <span>{TRANSLATION_LABELS[mode]}</span>
          </label>
        ))}
        <p className="muted small">台詞・単語カードの例文・コラムの韓国語に付く訳です。単語の意味と、書いて答えるときのお題はいつも表示します。慣れてきたら、訳を隠して挑戦してみましょう。</p>
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

      <fieldset className="field">
        <legend>台詞の文字送り</legend>
        {TEXT_SPEEDS.map((speed) => (
          <label key={speed} className="radio">
            <input type="radio" name="textSpeed" value={speed} checked={settings.textSpeed === speed} onChange={() => change({ textSpeed: speed })} />
            <span>{TEXT_SPEED_LABELS[speed]}</span>
          </label>
        ))}
        <TextSpeedPreview speed={settings.textSpeed} />
        <p className="muted small">台詞をタップすると、文字送りの途中でもすぐに全文を表示します。</p>
      </fieldset>

      <fieldset className="field">
        <legend>効果音</legend>
        {([true, false] as const).map((on) => (
          <label key={String(on)} className="radio">
            <input type="radio" name="soundEffects" checked={settings.soundEffects === on} onChange={() => change({ soundEffects: on })} />
            <span>{on ? 'オン' : 'オフ'}</span>
          </label>
        ))}
        <Button sound={null} disabled={!settings.soundEffects} onClick={() => playSfx('correct')}>
          試しに鳴らす
        </Button>
        <p className="muted small">iPhone では、マナーモード（消音）のときは効果音が鳴りません。読み上げの音とは別です。</p>
      </fieldset>

      <fieldset className="field">
        <legend>演出</legend>
        {EFFECT_LEVELS.map((level) => (
          <label key={level} className="radio">
            <input type="radio" name="effects" value={level} checked={settings.effects === level} onChange={() => change({ effects: level })} />
            <span>{EFFECT_LABELS[level]}</span>
          </label>
        ))}
      </fieldset>

      <p className="muted small">セーブデータの書き出し・読み込みなどは、今後のPhaseで追加します。</p>
    </ScreenLayout>
  )
}
