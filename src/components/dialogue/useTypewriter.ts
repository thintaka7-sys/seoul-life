import { useCallback, useEffect, useState } from 'react'

/**
 * 文字送り。key が変わるたびに0文字から始め、msPerChar ごとに1文字ずつ増やす。
 * msPerChar が0なら、はじめから全文。complete() で全文にする（タップで全文を表示）。
 */
export function useTypewriter(key: string, total: number, msPerChar: number) {
  const [progress, setProgress] = useState<{ key: string; visible: number }>({ key, visible: 0 })
  const current = progress.key === key ? progress.visible : 0
  const done = msPerChar === 0 || current >= total

  useEffect(() => {
    if (msPerChar === 0) return
    const start = performance.now()
    const id = window.setInterval(() => {
      const n = Math.floor((performance.now() - start) / msPerChar) + 1
      setProgress((p) => {
        const before = p.key === key ? p.visible : 0
        if (before >= total) return p
        return { key, visible: Math.min(total, Math.max(n, before)) }
      })
      if (n >= total) window.clearInterval(id)
    }, Math.max(16, msPerChar))
    return () => window.clearInterval(id)
  }, [key, total, msPerChar])

  const complete = useCallback(() => setProgress({ key, visible: total }), [key, total])
  return { visible: done ? total : current, done, complete }
}
