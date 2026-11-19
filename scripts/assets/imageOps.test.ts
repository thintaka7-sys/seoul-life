import { describe, expect, it } from 'vitest'
import { parseAssetConfig } from './config.ts'
import { alignFigures, bodyCenterX, contentBox, createImage, estimateKeyColor, removeBackground, removeGreenSpill, splitFigures, type RGBAImage } from './imageOps.ts'

const GREEN: [number, number, number, number] = [10, 250, 5, 255]
const KEY = { r: 10, g: 250, b: 5 }

function rgba(img: RGBAImage, x: number, y: number): number[] {
  const i = (y * img.width + x) * 4
  return Array.from(img.data.subarray(i, i + 4))
}

function fillRect(img: RGBAImage, x0: number, y0: number, x1: number, y1: number, color: [number, number, number, number]) {
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) img.data.set(color, (y * img.width + x) * 4)
}

/** 緑の背景に、茶色の四角（人物の代わり）を置いた画像 */
function figureOnGreen(): RGBAImage {
  const img = createImage(20, 20, GREEN)
  fillRect(img, 5, 5, 15, 20, [120, 70, 40, 255])
  return img
}

describe('背景の緑を測る', () => {
  it('縁の緑の画素の中央値を使う（人物が縁に掛かっていてもよい）', () => {
    expect(estimateKeyColor(figureOnGreen())).toEqual(KEY)
  })

  it('縁に緑がなければ止める', () => {
    expect(() => estimateKeyColor(createImage(4, 4, [200, 200, 200, 255]))).toThrow(/緑の背景/)
  })
})

describe('背景を透明にする', () => {
  it('縁とつながった緑は透明、人物は残る', () => {
    const out = removeBackground(figureOnGreen(), KEY)
    expect(rgba(out, 0, 0)[3]).toBe(0)
    expect(rgba(out, 19, 10)[3]).toBe(0)
    expect(rgba(out, 10, 10)).toEqual([120, 70, 40, 255])
  })

  it('人物の中に閉じ込められた緑でも、背景の色にとても近ければ透明にする（腕と体の間など）', () => {
    const img = figureOnGreen()
    fillRect(img, 8, 8, 11, 11, [20, 240, 15, 255])
    const out = removeBackground(img, KEY)
    expect(rgba(out, 9, 9)[3]).toBe(0)
  })

  it('人物の中の暗い緑（かんざしの葉など）は残す', () => {
    const img = figureOnGreen()
    fillRect(img, 8, 8, 11, 11, [60, 140, 60, 255])
    const out = removeBackground(img, KEY)
    expect(rgba(out, 9, 9)).toEqual([60, 140, 60, 255])
  })

  it('境目の、背景に少し近い色は半透明にし、緑のにじみを取る', () => {
    const img = figureOnGreen()
    // 人物の左端の列を、緑と茶色の中間の色にする（線の境目のにじみ）
    fillRect(img, 5, 5, 6, 20, [70, 180, 25, 255])
    const out = removeBackground(img, KEY)
    const [r, g, b, a] = rgba(out, 5, 10)
    expect(a).toBeGreaterThan(0)
    expect(a).toBeLessThan(255)
    expect(g).toBeLessThanOrEqual(Math.max(r ?? 0, b ?? 0))
  })

  it('緑のにじみは、透明にした部分の近く（despillRadius 画素まで）だけで取る', () => {
    const img = createImage(30, 10, GREEN)
    fillRect(img, 3, 0, 30, 10, [100, 140, 90, 255])
    const out = removeBackground(img, KEY, { hard: 90, soft: 170, enclosed: 40, despillRadius: 3 })
    expect(rgba(out, 4, 5)[1]).toBe(100)
    expect(rgba(out, 20, 5)[1]).toBe(140)
  })
})

describe('人物全体の緑みを取る', () => {
  it('緑みを取り、緑みの強さに応じて半透明にする。keep の箱の中はそのまま', () => {
    const img = createImage(4, 1, [0, 0, 0, 255])
    img.data.set([100, 100, 90, 255], 0) // 緑みなし
    img.data.set([60, 180, 50, 255], 4) // 緑みが強い（背景が透けていた所）
    img.data.set([60, 140, 60, 255], 8) // keep の中の葉
    img.data.set([0, 0, 0, 0], 12) // 透明
    const out = removeGreenSpill(img, KEY, [{ x0: 2, y0: 0, x1: 3, y1: 1 }])
    expect(rgba(out, 0, 0)).toEqual([100, 100, 90, 255])
    const [r, g, , a] = rgba(out, 1, 0)
    expect(g).toBe(r)
    expect(a).toBe(Math.round(255 * (1 - 120 / 240)))
    expect(rgba(out, 2, 0)).toEqual([60, 140, 60, 255])
    expect(rgba(out, 3, 0)).toEqual([0, 0, 0, 0])
  })
})

/** 透明な画像に、x の範囲ごとに人物（不透明な四角）を置く */
function figuresAt(width: number, height: number, ranges: [number, number, number][]): RGBAImage {
  const img = createImage(width, height)
  for (const [x0, x1, top] of ranges) fillRect(img, x0, top, x1, height, [200, 150, 120, 255])
  return img
}

describe('表情ごとに切り分ける', () => {
  it('幅や間隔がばらばらでも、すき間で分ける', () => {
    const img = figuresAt(100, 40, [
      [5, 25, 5],
      [30, 60, 10],
      [80, 95, 2],
    ])
    expect(splitFigures(img, 3)).toEqual([
      { x0: 5, y0: 5, x1: 25, y1: 40 },
      { x0: 30, y0: 10, x1: 60, y1: 40 },
      { x0: 80, y0: 2, x1: 95, y1: 40 },
    ])
  })

  it('離れた毛先など、人数より多く分かれたら、狭いすき間からつなげる', () => {
    const img = figuresAt(100, 40, [
      [5, 25, 5],
      [27, 29, 5], // 毛先（すき間2）
      [40, 60, 10],
      [80, 95, 2],
    ])
    expect(splitFigures(img, 3).map((b) => [b.x0, b.x1])).toEqual([
      [5, 29],
      [40, 60],
      [80, 95],
    ])
  })

  it('人数が足りなければ止める（人物が重なっている）', () => {
    expect(() => splitFigures(figuresAt(50, 20, [[5, 45, 0]]), 3)).toThrow(/3 人に分けられません/)
  })

  it('ごく少ない画素の列（ちり）は人物とみなさない', () => {
    const img = figuresAt(60, 400, [
      [5, 20, 0],
      [40, 55, 0],
    ])
    img.data.set([255, 255, 255, 255], (10 * 60 + 30) * 4)
    expect(splitFigures(img, 2)).toHaveLength(2)
  })
})

describe('位置をそろえる', () => {
  it('同じ大きさの画像にし、体（下の方）の中心を画像の中央にそろえる。上下の位置は元のまま', () => {
    const img = figuresAt(100, 40, [
      [5, 25, 5],
      [30, 60, 10],
    ])
    // 2人目に、上の方だけ右に張り出した部分（腕など）を足す
    fillRect(img, 60, 12, 70, 20, [200, 150, 120, 255])
    const boxes = splitFigures(img, 2)
    const out = alignFigures(img, boxes)
    const [a, b] = out
    expect(a?.width).toBe(b?.width)
    expect(a?.height).toBe(35)
    for (const fig of out) {
      const box = contentBox(fig)
      expect(box).not.toBeNull()
      if (box === null) continue
      expect(Math.abs(bodyCenterX(fig, { ...box, y0: box.y1 - 5 }) - fig.width / 2)).toBeLessThanOrEqual(1)
      expect(box.y1).toBe(fig.height)
    }
    // 1人目は2人目より5画素低い位置から始まる（上の余白が5）
    expect(contentBox(a ?? createImage(1, 1))?.y0).toBe(0)
    expect(contentBox(b ?? createImage(1, 1))?.y0).toBe(5)
  })
})

describe('設定（assets.config.json）', () => {
  const valid = {
    inputDir: 'assets-inbox',
    outputDir: 'public/assets',
    manifest: 'src/data/assets/manifest.json',
    webpQuality: 82,
    characterHeight: 1200,
    backgroundWidth: 1080,
    mapWidth: 1080,
    characters: [{ id: 'neighbor', sheet: 's.png', expressions: ['normal', 'smile'], keepGreen: [{ x: 1, y: 2, w: 3, h: 4 }] }],
    backgrounds: [{ id: 'home', file: 'bg.png' }],
    map: { file: 'map.png' },
  }

  it('正しい設定を読み、keepGreen を箱にする', () => {
    const config = parseAssetConfig(valid)
    expect(config.characters[0]?.keepGreen).toEqual([{ x0: 1, y0: 2, x1: 4, y1: 6 }])
    expect(parseAssetConfig({ ...valid, map: null }).map).toBeNull()
  })

  it('表情のキーの間違い・重複、品質の範囲外は止める', () => {
    expect(() => parseAssetConfig({ ...valid, characters: [{ id: 'a', sheet: 's.png', expressions: ['happy'] }] })).toThrow(/表情のキー/)
    expect(() => parseAssetConfig({ ...valid, characters: [{ id: 'a', sheet: 's.png', expressions: ['smile', 'smile'] }] })).toThrow(/重複/)
    expect(() => parseAssetConfig({ ...valid, webpQuality: 101 })).toThrow(/webpQuality/)
  })
})
