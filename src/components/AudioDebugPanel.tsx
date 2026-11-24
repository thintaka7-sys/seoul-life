import { useEffect, useState, useSyncExternalStore } from 'react'
import { audioDebugEntries, currentSessionSnapshot, formatEntry, isSuspicious, subscribeAudioDebug } from '../audio/audioDebug'

/**
 * 音の記録（開発者向け。?debug=audio で開いたときだけ出す。audio/audioDebug.ts）。
 * いまの audioSession の扱いと、BGM・効果音を流し始めた時点の扱いを、新しい順に出す。
 * 音を流し始めたのに ambient でない記録は、赤くして「!!」を付ける（マナーモードで鳴ってしまう恐れがある）。
 * ゲームのボタンを覆わないように、最初はたたんでおく（いまの扱いと、ambient 以外で鳴らした件数だけ出す）
 */
export function AudioDebugPanel() {
  const entries = useSyncExternalStore(subscribeAudioDebug, audioDebugEntries)
  const [open, setOpen] = useState(false)
  const [now, setNow] = useState(currentSessionSnapshot)
  const [copied, setCopied] = useState<string | null>(null)

  // いまの扱いは、記録の外でも変わることがある（端末が変える）ので、1秒ごとに読み直す
  useEffect(() => {
    const id = window.setInterval(() => setNow(currentSessionSnapshot()), 1000)
    return () => window.clearInterval(id)
  }, [])

  const suspicious = entries.filter(isSuspicious).length

  async function copy() {
    const text = [`seoul-life 音の記録 ${new Date().toISOString()}`, navigator.userAgent, ...entries.map(formatEntry)].join('\n')
    try {
      await navigator.clipboard.writeText(text)
      setCopied('コピーしました')
    } catch {
      setCopied('コピーできませんでした')
    }
  }

  return (
    <aside className="audio-debug" aria-label="音の記録（開発者向け）">
      <div className="audio-debug__bar">
        <p className="audio-debug__now">
          いま type=<b>{now.type}</b> state={now.state}
          <span className={suspicious > 0 ? 'audio-debug__count audio-debug__count--bad' : 'audio-debug__count'}>
            {suspicious > 0 ? `ambient 以外で鳴らした：${suspicious}件` : 'ambient 以外で鳴らした：0件'}
          </span>
        </p>
        <button type="button" className="audio-debug__button" onClick={() => void copy()}>
          コピー
        </button>
        <button type="button" className="audio-debug__button" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          {open ? 'たたむ' : 'ひらく'}
        </button>
      </div>
      {copied !== null && <p className="audio-debug__copied">{copied}</p>}
      {open && (
        <ol className="audio-debug__list">
          {[...entries].reverse().map((e, i) => (
            <li key={entries.length - i} className={isSuspicious(e) ? 'audio-debug__row audio-debug__row--bad' : e.sound ? 'audio-debug__row audio-debug__row--sound' : 'audio-debug__row'}>
              {formatEntry(e)}
            </li>
          ))}
        </ol>
      )}
    </aside>
  )
}
