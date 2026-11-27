// 部屋の絵の色を測る（家具に、置いた場所の光の色をのせるため。docs/PHASE4_HOME_PLAN.md 2-4）。
// 部屋の絵を小さく描いて画素を読み、範囲の平均の色を返す。絵が読めない環境（テストなど）では null のまま（色をのせない）。

import { useEffect, useReducer } from 'react'
import type { RoomRect } from '../../game/home/layout'

export type RoomSampler = (rect: RoomRect) => readonly [number, number, number]

const SAMPLE_WIDTH = 270

/** 読み終えた部屋の絵（src ごと）。null は読めなかった */
const samplers = new Map<string, RoomSampler | null>()
const loading = new Map<string, Promise<void>>()

function createSampler(data: Uint8ClampedArray, width: number, height: number): RoomSampler {
  return (rect) => {
    const x0 = Math.max(0, Math.floor((rect.x / 100) * width))
    const x1 = Math.min(width, Math.ceil(((rect.x + rect.w) / 100) * width))
    const y0 = Math.max(0, Math.floor((rect.y / 100) * height))
    const y1 = Math.min(height, Math.ceil(((rect.y + rect.h) / 100) * height))
    let r = 0
    let g = 0
    let b = 0
    let n = 0
    for (let y = y0; y < y1; y += 2) {
      for (let x = x0; x < x1; x += 2) {
        const i = (y * width + x) * 4
        r += data[i] ?? 0
        g += data[i + 1] ?? 0
        b += data[i + 2] ?? 0
        n++
      }
    }
    return n === 0 ? [255, 255, 255] : [r / n, g / n, b / n]
  }
}

function load(src: string): Promise<void> {
  const running = loading.get(src)
  if (running !== undefined) return running
  const promise = new Promise<void>((resolve) => {
    const img = new Image()
    img.decoding = 'async'
    img.onload = () => {
      try {
        const height = Math.max(1, Math.round((SAMPLE_WIDTH * img.naturalHeight) / Math.max(1, img.naturalWidth)))
        const canvas = document.createElement('canvas')
        canvas.width = SAMPLE_WIDTH
        canvas.height = height
        const ctx = canvas.getContext('2d')
        if (ctx === null) {
          samplers.set(src, null)
        } else {
          ctx.drawImage(img, 0, 0, SAMPLE_WIDTH, height)
          samplers.set(src, createSampler(ctx.getImageData(0, 0, SAMPLE_WIDTH, height).data, SAMPLE_WIDTH, height))
        }
      } catch {
        samplers.set(src, null)
      }
      resolve()
    }
    img.onerror = () => {
      samplers.set(src, null)
      resolve()
    }
    img.src = src
  })
  loading.set(src, promise)
  return promise
}

/** 部屋の絵の色を測る関数。読み終えるまでは null */
export function useRoomSampler(src: string): RoomSampler | null {
  const [, rerender] = useReducer((n: number) => n + 1, 0)
  useEffect(() => {
    if (samplers.has(src)) return
    let alive = true
    void load(src).then(() => {
      if (alive) rerender()
    })
    return () => {
      alive = false
    }
  }, [src])
  return samplers.get(src) ?? null
}

/** 測った色から、明るさを除いた色み（いちばん強い成分を 255 にする）。掛け合わせで、明るさを変えずに色みだけのせる */
export function toneColor(sample: readonly [number, number, number]): [number, number, number] {
  const max = Math.max(1, ...sample)
  return [Math.round((sample[0] / max) * 255), Math.round((sample[1] / max) * 255), Math.round((sample[2] / max) * 255)]
}
