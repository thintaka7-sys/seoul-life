import { useEffect, useRef, useState } from 'react'

/**
 * 数字を、前の値から新しい値まで少しずつ増やして見せる。
 * animate が false（演出が控えめ）なら、すぐ新しい値にする。
 * initial を渡すと、最初の表示でも initial から value まで増やす（画面を開き直したときに、前に見せた値から続けるため）。
 */
export function useCountUp(value: number, animate: boolean, initial = value, durationMs = 600): number {
  const [shown, setShown] = useState(initial)
  const from = useRef(initial)

  useEffect(() => {
    const start = from.current
    from.current = value
    if (!animate || start === value) {
      setShown(value)
      return
    }
    const t0 = performance.now()
    let frame = 0
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / durationMs)
      // 最後をゆっくりにする
      const eased = 1 - (1 - p) ** 3
      setShown(Math.round(start + (value - start) * eased))
      if (p < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [value, animate, durationMs])

  return animate ? shown : value
}
