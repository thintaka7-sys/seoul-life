import { useSpeechStatus } from '../app/hooks'
import { Notice } from './Notice'

/** 読み上げが使えない環境で、理由を表示する */
export function SpeechNotice() {
  const status = useSpeechStatus()
  if (status.state !== 'unavailable') return null
  return <Notice>読み上げは使えません：{status.reason}</Notice>
}
