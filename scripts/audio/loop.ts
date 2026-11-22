// BGM のループの位置を、音の大きさの並びから決める（純粋な関数。テストする）。
// Gemini で作った曲は、最後がフェードアウトして無音で終わるため、フェードが始まる手前で切ってつなぐ（SOUND_GUIDE 4章）。

/** 曲の中ほど（前後25%を除いた部分）の音の大きさの中央値。曲の「ふだんの大きさ」とみなす */
export function bodyLevel(rms: readonly number[]): number {
  if (rms.length === 0) return 0
  const from = Math.floor(rms.length * 0.25)
  const to = Math.max(from + 1, Math.ceil(rms.length * 0.75))
  const middle = [...rms.slice(from, to)].sort((a, b) => a - b)
  return middle[Math.floor(middle.length / 2)] ?? 0
}

export interface LoopRange {
  /** 使い始める位置（秒。最初の無音を飛ばす） */
  start: number
  /** 切る位置（秒。フェードアウトが始まる手前） */
  end: number
}

/**
 * 区切り（windowSec 秒ごと）の音の大きさ（RMS）から、使う範囲を決める。
 * - 始まり：ふだんの大きさの 5% を初めて超える区切り
 * - 終わり：ふだんの大きさの fadeRatio 倍を最後に超えている区切りの終わり（そこから先はフェードアウト）
 */
export function findLoopRange(rms: readonly number[], windowSec: number, fadeRatio = 0.6): LoopRange {
  const body = bodyLevel(rms)
  if (body === 0) return { start: 0, end: rms.length * windowSec }
  const first = rms.findIndex((r) => r >= body * 0.05)
  let last = rms.length - 1
  while (last > 0 && (rms[last] ?? 0) < body * fadeRatio) last--
  const start = Math.max(0, first) * windowSec
  const end = Math.max(start + windowSec, (last + 1) * windowSec)
  return { start: round2(start), end: round2(end) }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/** 16ビットのモノラルの音（リトルエンディアン）を、windowSamples ごとの RMS（0〜1）にする */
export function rmsWindows(pcm: Uint8Array, windowSamples: number): number[] {
  const view = new DataView(pcm.buffer, pcm.byteOffset, pcm.byteLength)
  const samples = Math.floor(pcm.byteLength / 2)
  const result: number[] = []
  for (let w = 0; w * windowSamples < samples; w++) {
    let sum = 0
    let n = 0
    for (let i = w * windowSamples; i < Math.min(samples, (w + 1) * windowSamples); i++) {
      const v = view.getInt16(i * 2, true) / 32768
      sum += v * v
      n++
    }
    result.push(n === 0 ? 0 : Math.sqrt(sum / n))
  }
  return result
}
