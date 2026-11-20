import { useEffect, useRef, useState } from 'react'
import { useGame } from '../app/GameContext'
import { useCanSpeak } from '../app/hooks'
import { recognizeKorean, type RecognitionSession } from '../audio/recognition'
import { Notice } from './Notice'
import { VoiceInputNotice } from './VoiceInputNotice'

interface MicButtonProps {
  /** 聞き取った言葉の候補（確からしい順）を受け取る */
  onHeard: (alternatives: string[]) => void
  label?: string
  /** 1回話した後のボタンの文字 */
  retryLabel?: string
}

/** idle: 待っている、preparing: 押した直後でマイクがまだ声を拾っていない、listening: 声を拾っている */
type MicPhase = 'idle' | 'preparing' | 'listening'

/**
 * 話して答えるためのマイクボタン。音声認識が使えない環境や、設定で音声入力がオフのときは何も出さない。
 * 初めて押したときは、音声が外部で処理されることがあるという説明を出してから始める。
 * 押した直後はマイクがまだ声を拾っていないので「準備中」と出し、拾い始めてから「どうぞ」と出す（話し始めが切れないように。BUG-004）。
 * 聞いている間にもう一度押すと、そこまでの声で聞き取りを終える。
 */
export function MicButton({ onHeard, label = '話す', retryLabel = 'もう一度話す' }: MicButtonProps) {
  const { state, dispatch } = useGame()
  const canSpeak = useCanSpeak()
  const [phase, setPhase] = useState<MicPhase>('idle')
  const [partial, setPartial] = useState('')
  const [tried, setTried] = useState(false)
  const listening = phase !== 'idle'
  const [error, setError] = useState<string | null>(null)
  const [noticeOpen, setNoticeOpen] = useState(false)
  const session = useRef<RecognitionSession | null>(null)
  const onHeardRef = useRef(onHeard)

  useEffect(() => {
    onHeardRef.current = onHeard
  }, [onHeard])

  // 画面を離れたら聞き取りをやめる
  useEffect(() => () => session.current?.abort(), [])

  if (!canSpeak) return null

  async function listen() {
    setError(null)
    setPartial('')
    setPhase('preparing')
    // 読み上げ中の声をマイクが拾わないように止める
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel()
    const current = recognizeKorean({
      onReady: () => {
        if (session.current === current) setPhase('listening')
      },
      onPartial: (text) => {
        if (session.current === current) setPartial(text)
      },
    })
    session.current = current
    const outcome = await current.result
    if (session.current !== current) return
    session.current = null
    setPhase('idle')
    setPartial('')
    setTried(true)
    if (outcome.kind === 'heard') onHeardRef.current(outcome.alternatives)
    else if (outcome.error.kind !== 'aborted') setError(outcome.error.message)
  }

  function press() {
    if (listening) {
      session.current?.stop()
      return
    }
    if (!state.settings.voiceInputNoticeSeen) {
      setNoticeOpen(true)
      return
    }
    void listen()
  }

  return (
    <div className="mic">
      <button type="button" className={`button button--primary mic__button mic__button--${phase}`} onClick={press} aria-pressed={listening}>
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">
          <rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor" />
          <path d="M6 11a6 6 0 0 0 12 0M12 17v4M8 21h8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        {phase === 'preparing' ? '準備中…（まだ話さない）' : phase === 'listening' ? 'どうぞ、話してください（押すと終わる）' : tried ? retryLabel : label}
      </button>
      {listening && (
        <p className="mic__partial muted small" aria-live="polite">
          {partial === '' ? (phase === 'preparing' ? 'マイクの準備をしています。' : '聞いています…') : <>聞こえた言葉：「<span lang="ko">{partial}</span>」</>}
        </p>
      )}
      {error !== null && <Notice tone="warn">{error}</Notice>}
      {noticeOpen && (
        <VoiceInputNotice
          onAccept={() => {
            setNoticeOpen(false)
            dispatch({ type: 'changeSettings', settings: { ...state.settings, voiceInputNoticeSeen: true } })
            void listen()
          }}
          onDecline={() => {
            setNoticeOpen(false)
            dispatch({ type: 'changeSettings', settings: { ...state.settings, voiceInput: false, voiceInputNoticeSeen: true } })
          }}
        />
      )}
    </div>
  )
}
