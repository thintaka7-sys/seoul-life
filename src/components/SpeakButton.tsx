import { useSpeak, useSpeechStatus } from '../app/hooks'

/** 読み上げボタン。韓国語の音声がない環境では押せない（理由は SpeechNotice で表示する） */
export function SpeakButton({ text }: { text: string }) {
  const status = useSpeechStatus()
  const speak = useSpeak()
  const available = status.state === 'available'
  const title = available ? '読み上げる' : status.state === 'checking' ? '読み上げの準備中' : status.reason
  return (
    <button type="button" className="icon-button" onClick={() => speak(text)} disabled={!available} aria-label={`読み上げ：${text}`} title={title}>
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">
        <path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor" />
        <path d="M16 8.5a4.5 4.5 0 0 1 0 7M18.5 6a8 8 0 0 1 0 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    </button>
  )
}
