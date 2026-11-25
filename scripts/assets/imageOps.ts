// 画像の加工（背景の透過・表情ごとの切り分け・位置合わせ）。
// RGBA の画素の配列だけを扱う純粋な関数にして、小さな画像でテストできるようにする。
// ファイルの読み書きと縮小・WebP 化は build.ts（sharp）で行う。

export interface RGBAImage {
  width: number
  height: number
  /** 1画素4バイト（R, G, B, A） */
  data: Uint8ClampedArray
}

export interface RGB {
  r: number
  g: number
  b: number
}

export interface Box {
  x0: number
  y0: number
  /** 含まない（x0 ≤ x < x1） */
  x1: number
  y1: number
}

export function createImage(width: number, height: number, fill: [number, number, number, number] = [0, 0, 0, 0]): RGBAImage {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < width * height; i++) data.set(fill, i * 4)
  return { width, height, data }
}

function px(img: RGBAImage, x: number, y: number): number {
  return (y * img.width + x) * 4
}

function colorDistance(data: Uint8ClampedArray, i: number, key: RGB): number {
  const dr = (data[i] ?? 0) - key.r
  const dg = (data[i + 1] ?? 0) - key.g
  const db = (data[i + 2] ?? 0) - key.b
  return Math.sqrt(dr * dr + dg * dg + db * db)
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)] ?? 0
}

/** 背景の色の種類。立ち絵は緑、家具はマゼンタ（#FF00FF。家具には緑の植物があるため。docs/PHASE4_HOME_PLAN.md 2-3） */
export type KeyKind = 'green' | 'magenta'

/** 背景の色らしい画素か（緑：G が R・B より十分大きい。マゼンタ：R と B が G より十分大きい） */
function isKeyLike(r: number, g: number, b: number, kind: KeyKind): boolean {
  return kind === 'green' ? g > r + 60 && g > b + 60 : r > g + 60 && b > g + 60
}

/**
 * 背景の緑（kind が magenta ならマゼンタ）を、画像の縁の画素から測る（Gemini の色はちょうど #00FF00・#FF00FF とは限らないため）。
 * 縁のうち、背景の色らしい画素の中央値を使う。
 */
export function estimateKeyColor(img: RGBAImage, kind: KeyKind = 'green'): RGB {
  const rs: number[] = []
  const gs: number[] = []
  const bs: number[] = []
  const visit = (x: number, y: number) => {
    const i = px(img, x, y)
    const r = img.data[i] ?? 0
    const g = img.data[i + 1] ?? 0
    const b = img.data[i + 2] ?? 0
    if (isKeyLike(r, g, b, kind)) {
      rs.push(r)
      gs.push(g)
      bs.push(b)
    }
  }
  for (let x = 0; x < img.width; x++) {
    visit(x, 0)
    visit(x, img.height - 1)
  }
  for (let y = 0; y < img.height; y++) {
    visit(0, y)
    visit(img.width - 1, y)
  }
  if (gs.length === 0) {
    throw new Error(kind === 'green' ? '画像の縁に緑の背景が見つかりません（背景が緑一色か確かめてください）' : '画像の縁にマゼンタの背景が見つかりません（背景がマゼンタ一色か確かめてください）')
  }
  return { r: median(rs), g: median(gs), b: median(bs) }
}

export interface KeyOptions {
  /** この距離より近い色は背景（完全に透明） */
  hard: number
  /** hard〜soft の距離の境目の画素は半透明にする */
  soft: number
  /**
   * この距離より近い色は、縁とつながっていなくても背景とみなす（腕と体の間などに閉じ込められた背景）。
   * かんざしの葉のような暗い緑は、背景の明るい緑から離れているので残る。
   */
  enclosed: number
  /** 透明にした部分から何画素までの範囲で、緑のにじみを取るか */
  despillRadius: number
  /** にじみを取る色（省略したら緑） */
  spill?: KeyKind
}

export const DEFAULT_KEY_OPTIONS: KeyOptions = { hard: 90, soft: 170, enclosed: 75, despillRadius: 3 }

/** 家具（マゼンタの背景）の透過の設定 */
export const FURNITURE_KEY_OPTIONS: KeyOptions = { ...DEFAULT_KEY_OPTIONS, spill: 'magenta' }

/**
 * 緑の背景を透明にする。
 * 1. 縁の画素と、背景の色にとても近い画素を起点に、背景に近い色（hard 未満）をたどって透明にする
 * 2. 透明にした部分のすぐ隣で、背景に少し近い色（soft 未満）は、距離に応じて半透明にする
 * 3. 透明にした部分の近くでは、緑のにじみを取る（G を R・B の大きい方までに抑える）
 */
export function removeBackground(src: RGBAImage, key: RGB, opts: KeyOptions = DEFAULT_KEY_OPTIONS): RGBAImage {
  const { width, height } = src
  const data = new Uint8ClampedArray(src.data)
  const n = width * height
  const dist = new Float32Array(n)
  for (let p = 0; p < n; p++) dist[p] = colorDistance(data, p * 4, key)

  // 1. 背景をたどる（幅優先）
  const removed = new Uint8Array(n)
  const queue = new Int32Array(n)
  let head = 0
  let tail = 0
  const seed = (p: number) => {
    if (removed[p] === 0 && (dist[p] ?? Infinity) < opts.hard) {
      removed[p] = 1
      queue[tail++] = p
    }
  }
  for (let x = 0; x < width; x++) {
    seed(x)
    seed((height - 1) * width + x)
  }
  for (let y = 0; y < height; y++) {
    seed(y * width)
    seed(y * width + width - 1)
  }
  for (let p = 0; p < n; p++) if ((dist[p] ?? Infinity) < opts.enclosed) seed(p)
  while (head < tail) {
    const p = queue[head++] ?? 0
    const x = p % width
    if (x > 0) seed(p - 1)
    if (x < width - 1) seed(p + 1)
    if (p >= width) seed(p - width)
    if (p < n - width) seed(p + width)
  }

  // 2. 境目を半透明に（透明にした画素の隣だけ）
  for (let p = 0; p < n; p++) {
    if (removed[p] === 1) {
      data[p * 4 + 3] = 0
      continue
    }
    const x = p % width
    const touches =
      (x > 0 && removed[p - 1] === 1) || (x < width - 1 && removed[p + 1] === 1) || (p >= width && removed[p - width] === 1) || (p < n - width && removed[p + width] === 1)
    const d = dist[p] ?? Infinity
    if (touches && d < opts.soft) {
      const alpha = (d - opts.hard) / (opts.soft - opts.hard)
      data[p * 4 + 3] = Math.round(Math.max(0, Math.min(1, alpha)) * (data[p * 4 + 3] ?? 255))
    }
  }

  // 3. 緑のにじみを取る（透明にした部分からの距離を、近い順に広げて求める）
  const near = new Int32Array(n).fill(-1)
  head = 0
  tail = 0
  for (let p = 0; p < n; p++) {
    if (removed[p] === 1) {
      near[p] = 0
      queue[tail++] = p
    }
  }
  while (head < tail) {
    const p = queue[head++] ?? 0
    const d = near[p] ?? 0
    if (d >= opts.despillRadius) continue
    const x = p % width
    const neighbors = [x > 0 ? p - 1 : -1, x < width - 1 ? p + 1 : -1, p >= width ? p - width : -1, p < n - width ? p + width : -1]
    for (const q of neighbors) {
      if (q < 0 || near[q] !== -1) continue
      near[q] = d + 1
      queue[tail++] = q
    }
  }
  for (let p = 0; p < n; p++) {
    if (removed[p] === 1 || near[p] === -1) continue
    const i = p * 4
    if (opts.spill === 'magenta') {
      // マゼンタのにじみ：R と B の両方が G より大きい分（赤紫み）を、両方から引く
      const g = data[i + 1] ?? 0
      const excess = Math.min(data[i] ?? 0, data[i + 2] ?? 0) - g
      if (excess > 0) {
        data[i] = (data[i] ?? 0) - excess
        data[i + 2] = (data[i + 2] ?? 0) - excess
      }
      continue
    }
    const limit = Math.max(data[i] ?? 0, data[i + 2] ?? 0)
    if ((data[i + 1] ?? 0) > limit) data[i + 1] = limit
  }
  return { width, height, data }
}

function inBoxes(x: number, y: number, boxes: readonly Box[]): boolean {
  return boxes.some((b) => x >= b.x0 && x < b.x1 && y >= b.y0 && y < b.y1)
}

/**
 * 人物全体から緑みを取る（G を R・B の大きい方までに抑える）。
 * 髪の毛のすき間など、背景とつながっていない小さな緑（removeBackground で取りきれないもの）を消すため。
 * 立ち絵には緑を使わない決まり（docs/ART_GUIDE.md）なので、全体にかけてよい。
 * かんざしの葉のように、わざと緑で描いた部分は keep の箱で守る。
 * 緑みの強い画素は、背景が透けて見えていた所なので、緑みの強さに応じて半透明にする
 * （緑を取っただけだと、髪のすき間に灰色の線が残るため）。
 */
export function removeGreenSpill(src: RGBAImage, key: RGB, keep: readonly Box[] = []): RGBAImage {
  const data = new Uint8ClampedArray(src.data)
  const keyGreenness = Math.max(1, key.g - Math.max(key.r, key.b))
  for (let y = 0; y < src.height; y++) {
    for (let x = 0; x < src.width; x++) {
      const i = px(src, x, y)
      const alpha = data[i + 3] ?? 0
      if (alpha === 0 || inBoxes(x, y, keep)) continue
      const limit = Math.max(data[i] ?? 0, data[i + 2] ?? 0)
      const greenness = (data[i + 1] ?? 0) - limit
      if (greenness <= 0) continue
      data[i + 1] = limit
      data[i + 3] = Math.round(alpha * (1 - Math.min(1, greenness / keyGreenness)))
    }
  }
  return { width: src.width, height: src.height, data }
}

/** 不透明（alpha が threshold 以上）の画素を囲む最小の箱。なければ null */
export function contentBox(img: RGBAImage, area: Box = { x0: 0, y0: 0, x1: img.width, y1: img.height }, threshold = 16): Box | null {
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (let y = area.y0; y < area.y1; y++) {
    for (let x = area.x0; x < area.x1; x++) {
      if ((img.data[px(img, x, y) + 3] ?? 0) < threshold) continue
      if (x < x0) x0 = x
      if (x >= x1) x1 = x + 1
      if (y < y0) y0 = y
      if (y >= y1) y1 = y + 1
    }
  }
  return x1 < 0 ? null : { x0, y0, x1, y1 }
}

/**
 * 横に並んだ人物を、何も描かれていない縦の列のすき間で分ける。
 * 人の幅や間隔がばらばらでもよい。髪の毛先などの小さなすき間は、人数に合うまで、狭いすき間からつなげる。
 */
export function splitFigures(img: RGBAImage, count: number): Box[] {
  // 列ごとの不透明な画素の数（画像の高さの0.5%未満は、ちりとみなして数えない）
  const minPixels = Math.max(1, Math.round(img.height * 0.005))
  const occupied: boolean[] = []
  for (let x = 0; x < img.width; x++) {
    let c = 0
    for (let y = 0; y < img.height; y++) if ((img.data[px(img, x, y) + 3] ?? 0) >= 128) c++
    occupied.push(c >= minPixels)
  }
  let runs: { x0: number; x1: number }[] = []
  for (let x = 0; x < img.width; x++) {
    if (!occupied[x]) continue
    const last = runs.at(-1)
    if (last !== undefined && last.x1 === x) last.x1 = x + 1
    else runs.push({ x0: x, x1: x + 1 })
  }
  if (runs.length < count) {
    throw new Error(`人物が ${count} 人に分けられません（見つかったのは ${runs.length} 人）。人物どうしが重なっていないか確かめてください`)
  }
  while (runs.length > count) {
    // いちばん狭いすき間をつなげる
    let best = 0
    for (let i = 1; i < runs.length - 1; i++) {
      const gap = (runs[i + 1]?.x0 ?? 0) - (runs[i]?.x1 ?? 0)
      const bestGap = (runs[best + 1]?.x0 ?? 0) - (runs[best]?.x1 ?? 0)
      if (gap < bestGap) best = i
    }
    const a = runs[best]
    const b = runs[best + 1]
    if (a === undefined || b === undefined) break
    runs = [...runs.slice(0, best), { x0: a.x0, x1: b.x1 }, ...runs.slice(best + 2)]
  }
  return runs.map((r) => {
    const box = contentBox(img, { x0: r.x0, y0: 0, x1: r.x1, y1: img.height })
    if (box === null) throw new Error('人物の範囲が空です')
    return box
  })
}

/** 箱の中の、下の方（体）の不透明な画素の横方向の中心。表情を変えても体の位置が動かないように、ここをそろえる */
export function bodyCenterX(img: RGBAImage, box: Box, bottomRatio = 0.15): number {
  const top = Math.max(box.y0, Math.floor(box.y1 - (box.y1 - box.y0) * bottomRatio))
  let sum = 0
  let count = 0
  for (let y = top; y < box.y1; y++) {
    for (let x = box.x0; x < box.x1; x++) {
      if ((img.data[px(img, x, y) + 3] ?? 0) >= 128) {
        sum += x
        count++
      }
    }
  }
  return count === 0 ? (box.x0 + box.x1) / 2 : sum / count
}

/**
 * 切り分けた人物を、同じ大きさの画像に並べ直す。
 * 縦は元の画像の位置のまま（上下の範囲は全員で共通）、横は体の中心が画像の中央に来るように置く。
 */
export function alignFigures(img: RGBAImage, boxes: Box[]): RGBAImage[] {
  const top = Math.min(...boxes.map((b) => b.y0))
  const bottom = Math.max(...boxes.map((b) => b.y1))
  const centers = boxes.map((b) => Math.round(bodyCenterX(img, b)))
  const half = Math.max(...boxes.map((b, i) => Math.max((centers[i] ?? 0) - b.x0, b.x1 - (centers[i] ?? 0))))
  const width = half * 2
  const height = bottom - top
  return boxes.map((b, i) => {
    const out = createImage(width, height)
    const offsetX = half - (centers[i] ?? 0)
    for (let y = top; y < bottom; y++) {
      for (let x = b.x0; x < b.x1; x++) {
        const from = px(img, x, y)
        const to = ((y - top) * width + (x + offsetX)) * 4
        out.data.set(img.data.subarray(from, from + 4), to)
      }
    }
    return out
  })
}

function luminance(img: RGBAImage, x: number, y: number): number {
  const i = px(img, x, y)
  return 0.299 * (img.data[i] ?? 0) + 0.587 * (img.data[i + 1] ?? 0) + 0.114 * (img.data[i + 2] ?? 0)
}

/**
 * 枠線で囲んだマスを並べた画像（メニューの品物・説明の図）から、各マスの枠の内側を求める（左上から行ごとの順）。
 * マスの外（すき間）は無地なので、おおよそのマスの位置の外側から内側へ向かって、すき間の色と明るさが大きく違う最初の画素（枠線）を探す。
 * 何本も調べた位置の中央値を枠線の位置とし、そこから inset だけ内側を返す（枠線と、そのにじみを含めないため）。
 */
export function findCellFrames(img: RGBAImage, rows: number, cols: number, inset: number, threshold = 35): Box[] {
  const slotW = img.width / cols
  const slotH = img.height / rows
  const boxes: Box[] = []
  /** (x, y) から (dx, dy) の向きに、limit 画素まで調べて、枠線までの距離を返す（見つからなければ null） */
  const scan = (x: number, y: number, dx: number, dy: number, limit: number): number | null => {
    const base = luminance(img, x, y)
    for (let d = 1; d < limit; d++) {
      const cx = x + dx * d
      const cy = y + dy * d
      if (cx < 0 || cy < 0 || cx >= img.width || cy >= img.height) return null
      if (Math.abs(luminance(img, cx, cy) - base) > threshold) return d
    }
    return null
  }
  const edge = (values: (number | null)[], where: string): number => {
    const found = values.filter((v): v is number => v !== null)
    if (found.length < values.length / 2) throw new Error(`マスの枠線が見つかりません（${where}）`)
    return median(found)
  }
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const sx0 = Math.round(c * slotW)
      const sx1 = Math.round((c + 1) * slotW) - 1
      const sy0 = Math.round(r * slotH)
      const sy1 = Math.round((r + 1) * slotH) - 1
      const where = `${r + 1}段目の${c + 1}つ目`
      // マスの真ん中の 60% の範囲で、20本ずつ調べる
      const ys = Array.from({ length: 20 }, (_, k) => Math.round(sy0 + slotH * (0.2 + (0.6 * k) / 19)))
      const xs = Array.from({ length: 20 }, (_, k) => Math.round(sx0 + slotW * (0.2 + (0.6 * k) / 19)))
      const left = sx0 + edge(ys.map((y) => scan(sx0, y, 1, 0, Math.round(slotW / 2))), where)
      const right = sx1 - edge(ys.map((y) => scan(sx1, y, -1, 0, Math.round(slotW / 2))), where)
      const top = sy0 + edge(xs.map((x) => scan(x, sy0, 0, 1, Math.round(slotH / 2))), where)
      const bottom = sy1 - edge(xs.map((x) => scan(x, sy1, 0, -1, Math.round(slotH / 2))), where)
      if (right - left <= inset * 2 || bottom - top <= inset * 2) throw new Error(`マスが小さすぎます（${where}）`)
      boxes.push({ x0: left + inset, y0: top + inset, x1: right - inset + 1, y1: bottom - inset + 1 })
    }
  }
  return boxes
}
