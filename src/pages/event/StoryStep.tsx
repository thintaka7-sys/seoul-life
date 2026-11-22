import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import { useGame } from '../../app/GameContext'
import { glossSpansOf } from '../../app/glossary'
import { useFuriganaDisplay } from '../../app/hooks'
import { backdropOverride, bgmOverride } from '../../app/overrides'
import { playSceneSound } from '../../audio/sceneSounds'
import { Button } from '../../components/Button'
import { characterColors } from '../../components/dialogue/characterColors'
import { NamePlate } from '../../components/dialogue/NamePlate'
import { TEXT_SPEED_MS, plainSegments, totalChars } from '../../components/dialogue/typewriter'
import { useTypewriter } from '../../components/dialogue/useTypewriter'
import { DraftBadge } from '../../components/DraftBadge'
import { useGlossPopup } from '../../components/useGlossPopup'
import { KoreanText } from '../../components/KoreanText'
import { Overlay } from '../../components/Overlay'
import { Portrait } from '../../components/scene/Portrait'
import { assetUrl } from '../../components/scene/assetUrl'
import { SpeakButton } from '../../components/SpeakButton'
import { CallFrame } from '../../components/TeacherCall'
import { Translation } from '../../components/Translation'
import { assets, cgImage } from '../../data'
import { PLAYER_SPEAKER_ID, type Story } from '../../data/types'
import { advanceStory, chooseInStory, currentShown, skipStory, startStory, type StoryLogEntry, type StoryShown } from '../../game/story/storyRunner'
import { pairReading, type FuriganaDisplay } from '../../learning/furigana/furigana'
import type { TranslationMode } from '../../storage/settings'

/** 早送りのとき、次へ進むまでの間（ミリ秒） */
const FAST_FORWARD_MS = 700

interface StoryStepProps {
  story: Story
  /** おはなしの最初の背景（イベントのそのときの背景） */
  background: string
  /** 最後まで見た（飛ばした）とき */
  onDone: () => void
}

function shownKey(shown: StoryShown | null, beat: number, logLength: number): string {
  return `${beat}:${logLength}:${shown?.kind ?? 'end'}`
}

/** これまでに見せたもの（ログ） */
function StoryLog({ log, display, mode, onClose }: { log: readonly StoryLogEntry[]; display: FuriganaDisplay; mode: TranslationMode; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <Overlay
      label="おはなしのログ"
      actions={
        <Button ref={closeRef} variant="primary" onClick={onClose}>
          閉じる
        </Button>
      }
    >
      <h2 className="section-title">おはなしのログ</h2>
      <ol className="log-list">
        {log.map((entry, i) =>
          entry.kind === 'narration' ? (
            <li key={i} className="log-line log-line--narration">
              <p>{entry.textJa}</p>
            </li>
          ) : (
            <li key={i} className={`log-line log-line--${entry.kind}`} style={entry.kind === 'line' ? characterColors(entry.speaker) : undefined}>
              {entry.kind === 'line' ? <NamePlate speaker={entry.speaker} display={display} /> : <p className="nameplate">表示</p>}
              <div className="ko-row">
                <KoreanText korean={entry.korean} reading={entry.pronunciation} display={display} />
                <SpeakButton text={entry.korean} />
              </div>
              <Translation text={entry.japanese} className="log-line__ja" mode={mode} />
            </li>
          ),
        )}
      </ol>
    </Overlay>
  )
}

/**
 * おはなし（GAME_SPEC 3-2）。紙芝居のように1つずつ見せる。正解・不正解はない。
 * フリガナと日本語訳はその場で切り替えられ（初期値は設定）、台詞ごとに読み上げ、早送り・最後まで飛ばす・ログがある。
 */
export function StoryStep({ story, background, onDone }: StoryStepProps) {
  const { state } = useGame()
  const [run, setRun] = useState(() => startStory(story, background))
  const [logOpen, setLogOpen] = useState(false)
  const [skipAsk, setSkipAsk] = useState(false)
  const [fast, setFast] = useState(false)
  const settingsDisplay = useFuriganaDisplay(story.chapter)
  const [furigana, setFurigana] = useState<FuriganaDisplay | null>(null)
  const [translation, setTranslation] = useState<TranslationMode | null>(null)
  const display = furigana ?? settingsDisplay
  const mode = translation ?? state.settings.translation
  const gloss = useGlossPopup(story.chapter)
  const doneRef = useRef(false)

  const shown = currentShown(story, run)
  const korean = shown?.kind === 'line' ? shown.line : shown?.kind === 'sign' ? shown : null
  const segments = korean === null ? [] : (pairReading(korean.korean, korean.pronunciation) ?? plainSegments(korean.korean))
  const key = shownKey(shown, run.beat, run.log.length)
  const msPerChar = fast || shown?.kind !== 'line' || shown.line.speaker === PLAYER_SPEAKER_ID ? 0 : TEXT_SPEED_MS[state.settings.textSpeed]
  const typing = useTypewriter(key, totalChars(segments), msPerChar)

  // 舞台の背景と BGM は、画面の一番外側に伝える（おはなしを閉じたら元に戻す）
  useEffect(() => backdropOverride.set(run.stage.background), [run.stage.background])
  useEffect(() => bgmOverride.set(run.bgm), [run.bgm])
  useEffect(
    () => () => {
      backdropOverride.set(null)
      bgmOverride.set(null)
    },
    [],
  )
  const lastSfx = useRef(0)
  useEffect(() => {
    if (run.sfx !== null && run.sfx.seq !== lastSfx.current) {
      lastSfx.current = run.sfx.seq
      playSceneSound(run.sfx.id)
    }
  }, [run.sfx])

  useEffect(() => {
    if (run.done && !doneRef.current) {
      doneRef.current = true
      onDone()
    }
  }, [run.done, onDone])

  // 早送り：選択まで、少しずつ自動で進める
  useEffect(() => {
    if (!fast || run.done || shown?.kind === 'choice' || logOpen || skipAsk) return
    const id = window.setTimeout(() => setRun((r) => advanceStory(story, r)), FAST_FORWARD_MS)
    return () => window.clearTimeout(id)
  }, [fast, run, shown?.kind, story, logOpen, skipAsk])

  const spans = useMemo(() => (korean === null ? [] : glossSpansOf(korean.korean, korean.glosses)), [korean])

  function next() {
    if (!typing.done) typing.complete()
    else setRun((r) => advanceStory(story, r))
  }

  function tapBox(e: MouseEvent<HTMLElement>) {
    if (e.target instanceof Element && e.target.closest('button') !== null) return
    if (shown?.kind !== 'choice') next()
  }

  const stage = run.stage
  const cg = stage.image === null ? undefined : cgImage(stage.image)
  const portraitId = stage.character !== null && assets.characters[stage.character] !== undefined ? stage.character : null

  return (
    <div className="story">
      {!story.reviewed && <DraftBadge />}
      <div className="story__stage">
        {cg !== undefined && <img className="story__cg" src={assetUrl(cg.src)} width={cg.width} height={cg.height} alt="" decoding="async" />}
        {stage.call !== null && <CallFrame characterId={stage.call} expression={stage.callExpression} />}
        {cg === undefined && portraitId !== null && <Portrait key={portraitId} characterId={portraitId} expression={stage.expression} className="story__portrait" />}
      </div>

      <div className="story__toolbar" role="toolbar" aria-label="おはなしの操作">
        <button type="button" className="chip-toggle" aria-pressed={display === 'show'} onClick={() => setFurigana(display === 'show' ? 'hide' : 'show')}>
          ふりがな
        </button>
        <button type="button" className="chip-toggle" aria-pressed={mode !== 'off'} onClick={() => setTranslation(mode === 'off' ? 'always' : 'off')}>
          日本語訳
        </button>
        <button type="button" className="chip-toggle" aria-pressed={fast} onClick={() => setFast((f) => !f)}>
          早送り
        </button>
        <button type="button" className="chip-toggle" onClick={() => setLogOpen(true)}>
          ログ
        </button>
        <button type="button" className="chip-toggle" onClick={() => setSkipAsk(true)}>
          飛ばす
        </button>
      </div>

      {shown?.kind === 'narration' && (
        <section className="dialogue dialogue--narration" onClick={tapBox} aria-label="地の文">
          <p className="story__narration">{shown.textJa}</p>
          <Button variant="primary" className="dialogue__next" onClick={next}>
            次へ<span aria-hidden="true" className="dialogue__next-mark">▼</span>
          </Button>
        </section>
      )}

      {(shown?.kind === 'line' || shown?.kind === 'sign') && korean !== null && (
        <section
          className={`dialogue ${shown.kind === 'sign' ? 'dialogue--sign' : shown.line.speaker === PLAYER_SPEAKER_ID ? 'dialogue--player' : 'dialogue--line'}`}
          style={shown.kind === 'line' ? characterColors(shown.line.speaker) : undefined}
          onClick={tapBox}
          aria-label={shown.kind === 'sign' ? '表示' : '台詞'}
        >
          <div className="dialogue__head">{shown.kind === 'line' ? <NamePlate speaker={shown.line.speaker} display={display} /> : <p className="nameplate nameplate--sign">表示</p>}</div>
          <div className="ko-row">
            <KoreanText
              korean={korean.korean}
              reading={korean.pronunciation}
              display={display}
              className={shown.kind === 'sign' ? 'story__sign-text' : 'dialogue__ko'}
              visibleChars={typing.done ? undefined : typing.visible}
              glossSpans={spans}
              onGloss={gloss.onGloss}
            />
            <SpeakButton text={korean.korean} />
          </div>
          <Translation text={korean.japanese} className={`dialogue__ja${typing.done ? '' : ' dialogue__ja--waiting'}`} mode={mode} />
          <Button variant="primary" className="dialogue__next" onClick={next}>
            次へ<span aria-hidden="true" className="dialogue__next-mark">▼</span>
          </Button>
        </section>
      )}

      {shown?.kind === 'choice' && (
        <section className="dialogue dialogue--choice" aria-label="返事を選ぶ">
          <p className="story__prompt">{shown.promptJa ?? 'どう返事する？'}</p>
          <ul className="story__choices">
            {shown.choices.map((c, i) => (
              <li key={i} className="story__choice">
                <Button className="story__choice-button" onClick={() => setRun((r) => chooseInStory(story, r, i))}>
                  <KoreanText korean={c.korean} reading={c.pronunciation} display={display === 'tap' ? 'hide' : display} />
                  {mode !== 'off' && <span className="story__choice-ja">{c.japanese}</span>}
                </Button>
                <SpeakButton text={c.korean} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {logOpen && <StoryLog log={run.log} display={display} mode={mode} onClose={() => setLogOpen(false)} />}
      {skipAsk && (
        <Overlay
          label="おはなしを飛ばす"
          actions={
            <>
              <Button variant="primary" onClick={() => setRun((r) => skipStory(story, r))}>
                最後まで飛ばす
              </Button>
              <Button onClick={() => setSkipAsk(false)}>続きを見る</Button>
            </>
          }
        >
          <p>おはなしを最後まで飛ばしますか？</p>
          <p className="muted small">見たおはなしは、自宅の「おはなしのアルバム」からいつでも見返せます。</p>
        </Overlay>
      )}
      {gloss.popup}
    </div>
  )
}
