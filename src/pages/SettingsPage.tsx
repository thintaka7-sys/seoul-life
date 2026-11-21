import { nowIso, useGame } from '../app/GameContext'
import { useFuriganaDisplay, useRecognitionStatus, useSpeechStatus } from '../app/hooks'
import { Button } from '../components/Button'
import { KoreanText } from '../components/KoreanText'
import { ScreenLayout } from '../components/ScreenLayout'
import { content } from '../data'
import { useState } from 'react'
import { playSfx } from '../audio/sfx'
import { checkSpeech } from '../audio/speech'
import { syllableCount, type RateSupport, type SpeechCheckResult } from '../audio/speechPlayer'
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

/**
 * 読み上げの確認に使う文（教材の例文・会話から、8〜14音節のもの）。
 * 短い言葉では、読み始めまでの待ち時間などの割合が大きく、速さの差が測りにくいため（BUG-010）
 */
const SPEECH_CHECK_TEXT =
  [
    ...content.grammar.flatMap((g) => g.examples.map((e) => e.korean)),
    ...content.vocabulary.flatMap((v) => (v.example === undefined ? [] : [v.example])),
    ...content.conversations.flatMap((c) => c.turns.flatMap((t) => t.lines.map((l) => l.korean))),
  ].find((t) => syllableCount(t) >= 8 && syllableCount(t) <= 14) ?? content.vocabulary[0]?.korean

const seconds = (ms: number | null) => (ms === null ? '測れませんでした' : `${(ms / 1000).toFixed(2)}秒`)

/** 確かめた結果の説明 */
function checkVerdict(support: RateSupport, rate: number | null | undefined): string {
  if (rate === undefined || support === 'unknown') return '時間をうまく測れませんでした。もう一度お試しください。'
  if (rate === null) return 'この端末では、読み上げの速さが変わらないようです。「ゆっくり」のボタンは、間を空けて2回くり返して読みます。'
  if (support === 'weak') return `十分には遅くなりませんでしたが、いちばん遅くなった速さ ${rate} で「ゆっくり」を読みます。短い単語は、もう1回くり返します。`
  return `この端末では、「ゆっくり」を速さ ${rate} で読みます。短い単語は、もう1回くり返します。`
}

/**
 * 読み上げの確認（GAME_SPEC 10-4。BUG-010）：同じ文を、ふつう → 遅い速さの候補で読み比べ、
 * この端末で十分に遅くなる速さを選んで、設定に保存する
 */
function SpeechCheck({ saved, onSave }: { saved: Settings['slowSpeech']; onSave: (rate: number | null) => void }) {
  const speech = useSpeechStatus()
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<SpeechCheckResult | null>(null)
  if (SPEECH_CHECK_TEXT === undefined) return null
  const text = SPEECH_CHECK_TEXT

  async function run() {
    setRunning(true)
    const r = await checkSpeech(text)
    setResult(r)
    if (r !== null && r.rate !== undefined) onSave(r.rate)
    setRunning(false)
  }

  return (
    <div className="speech-check">
      <p className="step-heading">読み上げの確認</p>
      <p className="muted small">
        「<span lang="ko">{text}</span>」を、ふつうの速さと、遅い速さで読み比べて、この端末の「ゆっくり」の速さを決めます（数回読みます）。端末によっては、読み上げの速さが変わりにくいことがあります。
      </p>
      {result === null && saved !== null && (
        <p className="small">
          前に確かめた結果：{saved.rate === null ? '「ゆっくり」は2回くり返して読みます' : `「ゆっくり」を速さ ${saved.rate} で読みます`}
        </p>
      )}
      <Button onClick={() => void run()} disabled={speech.state !== 'available' || running}>
        {running ? '読み上げ中…' : saved === null ? '確かめる' : 'もう一度確かめる'}
      </Button>
      {speech.state === 'unavailable' && <p className="muted small">読み上げは使えません：{speech.reason}</p>}
      {result !== null && (
        <div aria-live="polite">
          <ul className="info-list">
            <li>ふつう（速さ 1）：{seconds(result.normal)}</li>
            {result.trials.map((t) => (
              <li key={t.rate}>
                速さ {t.rate}：{seconds(t.ms)}（{t.ratio.toFixed(1)}倍）
              </li>
            ))}
          </ul>
          <p className="small">{checkVerdict(result.support, result.rate)}</p>
          <p className="muted small">測り方：{result.method === 'engine' ? '端末が知らせる「話していた時間」' : '読み始めから読み終わりまでの時刻'}</p>
        </div>
      )}
    </div>
  )
}

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
  const recognition = useRecognitionStatus()
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
        <SpeechCheck saved={settings.slowSpeech} onSave={(rate) => change({ slowSpeech: { rate, measuredAt: nowIso() } })} />
      </fieldset>

      <fieldset className="field">
        <legend>音声入力（話して答える）</legend>
        {([true, false] as const).map((on) => (
          <label key={String(on)} className="radio">
            <input type="radio" name="voiceInput" checked={settings.voiceInput === on} onChange={() => change({ voiceInput: on })} />
            <span>{on ? 'オン' : 'オフ'}</span>
          </label>
        ))}
        {recognition.state === 'unavailable' ? (
          <p className="muted small">この環境では使えません：{recognition.reason}</p>
        ) : (
          <p className="muted small">
            会話で「話す」を選ぶと、声で答えられます。声はブラウザの音声認識の機能で文字にし、ブラウザの提供元（Google・Apple など）のサーバーで処理されることがあります。このゲームは声を保存しません。
          </p>
        )}
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
