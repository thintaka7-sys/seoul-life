// assets.config.json（どの画像を何として使うか）の形と検証。

import { EXPRESSIONS, type Expression } from '../../src/data/types.ts'
import type { Box } from './imageOps.ts'

export interface CharacterSheetConfig {
  /** キャラクターID（src/data/characters） */
  id: string
  /** 表情を横に並べた画像のファイル名 */
  sheet: string
  /** 左から順の表情 */
  expressions: Expression[]
  /** 緑みを取らずに残す範囲（元の画像の画素の位置）。かんざしの葉など、わざと緑で描いた部分 */
  keepGreen: Box[]
}

export interface AssetConfig {
  inputDir: string
  outputDir: string
  manifest: string
  webpQuality: number
  /** 立ち絵の高さ（px） */
  characterHeight: number
  /** 背景の幅（px） */
  backgroundWidth: number
  /** マップの幅（px） */
  mapWidth: number
  characters: CharacterSheetConfig[]
  /** id は施設ID か場面の背景のID。fallbackId：元の画像がまだないときに、代わりに使う背景（仮の絵） */
  backgrounds: { id: string; file: string; fallbackId?: string }[]
  map: { file: string } | null
  /** おはなしの一枚絵（id は一枚絵のキー。元の画像は cg_キー） */
  cg: { id: string; file: string }[]
  /** 枠線で囲んだマスを並べた画像（メニューの品物・説明の図）。左上から行ごとの順に keys のキーで切り出す */
  cellSheets: CellSheetConfig[]
  /** メニューの品物の絵の大きさ（正方形の1辺、px） */
  menuSize: number
  /** 説明の図の絵の幅（px） */
  figureWidth: number
  /** 家具のデータのフォルダ（家具の image のキーを読み、元の画像 fur_キー を探す） */
  furnitureData: string
  /** 家具の絵の長い辺の最大（px） */
  furnitureSize: number
}

export interface CellSheetConfig {
  kind: 'menu' | 'figure'
  file: string
  rows: number
  cols: number
  keys: string[]
  /** 枠線から内側へ、切り落とす幅（元の画像の画素） */
  inset: number
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function str(o: Record<string, unknown>, key: string, where: string): string {
  const v = o[key]
  if (typeof v !== 'string' || v === '') throw new Error(`${where}.${key} は空でない文字列にしてください`)
  return v
}

function posInt(o: Record<string, unknown>, key: string): number {
  const v = o[key]
  if (typeof v !== 'number' || !Number.isInteger(v) || v <= 0) throw new Error(`${key} は正の整数にしてください`)
  return v
}

function list(o: Record<string, unknown>, key: string): Record<string, unknown>[] {
  const v = o[key]
  if (!Array.isArray(v) || !v.every(isObj)) throw new Error(`${key} はオブジェクトの配列にしてください`)
  return v
}

/** 設定を確かめて型付きにする。間違いがあれば理由つきで例外を投げる（加工の前に止める） */
export function parseAssetConfig(raw: unknown): AssetConfig {
  if (!isObj(raw)) throw new Error('設定はオブジェクトにしてください')
  const quality = posInt(raw, 'webpQuality')
  if (quality > 100) throw new Error('webpQuality は 1〜100 にしてください')
  const characters = list(raw, 'characters').map((c, i) => {
    const where = `characters[${i}]`
    const expressions = c['expressions']
    if (!Array.isArray(expressions) || expressions.length === 0) throw new Error(`${where}.expressions は1つ以上の表情の配列にしてください`)
    const parsed = expressions.map((e) => {
      const found = EXPRESSIONS.find((k) => k === e)
      if (found === undefined) throw new Error(`${where}.expressions の「${String(e)}」は表情のキーではありません（${EXPRESSIONS.join(', ')}）`)
      return found
    })
    if (new Set(parsed).size !== parsed.length) throw new Error(`${where}.expressions に同じ表情が重複しています`)
    const rawKeep = c['keepGreen'] ?? []
    if (!Array.isArray(rawKeep)) throw new Error(`${where}.keepGreen は配列にしてください`)
    const keepGreen = rawKeep.map((k: unknown, j): Box => {
      const at = `${where}.keepGreen[${j}]`
      if (!isObj(k)) throw new Error(`${at} は { "x", "y", "w", "h" } にしてください`)
      const [x, y, w, h] = (['x', 'y', 'w', 'h'] as const).map((key) => {
        const v = k[key]
        if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) throw new Error(`${at}.${key} は0以上の整数にしてください`)
        return v
      })
      return { x0: x ?? 0, y0: y ?? 0, x1: (x ?? 0) + (w ?? 0), y1: (y ?? 0) + (h ?? 0) }
    })
    return { id: str(c, 'id', where), sheet: str(c, 'sheet', where), expressions: parsed, keepGreen }
  })
  const backgrounds = list(raw, 'backgrounds').map((b, i): AssetConfig['backgrounds'][number] => {
    const where = `backgrounds[${i}]`
    const entry = { id: str(b, 'id', where), file: str(b, 'file', where) }
    return b['fallbackId'] === undefined ? entry : { ...entry, fallbackId: str(b, 'fallbackId', where) }
  })
  for (const b of backgrounds) {
    if (b.fallbackId !== undefined && !backgrounds.some((o) => o.id === b.fallbackId && o.fallbackId === undefined)) {
      throw new Error(`backgrounds の ${b.id} の fallbackId（${b.fallbackId}）は、fallbackId のない背景の id にしてください`)
    }
  }
  const cg = raw['cg'] === undefined ? [] : list(raw, 'cg').map((b, i) => ({ id: str(b, 'id', `cg[${i}]`), file: str(b, 'file', `cg[${i}]`) }))
  const cellSheets = (raw['cellSheets'] === undefined ? [] : list(raw, 'cellSheets')).map((s, i): CellSheetConfig => {
    const where = `cellSheets[${i}]`
    const kind = s['kind']
    if (kind !== 'menu' && kind !== 'figure') throw new Error(`${where}.kind は menu か figure にしてください`)
    const rows = posInt(s, 'rows')
    const cols = posInt(s, 'cols')
    const keys = s['keys']
    if (!Array.isArray(keys) || !keys.every((k) => typeof k === 'string' && /^[a-z][a-z0-9_]*$/.test(k))) throw new Error(`${where}.keys は英小文字のキーの配列にしてください`)
    if (keys.length !== rows * cols) throw new Error(`${where}.keys の数を、マスの数（${rows * cols}）に合わせてください`)
    return { kind, file: str(s, 'file', where), rows, cols, keys, inset: posInt(s, 'inset') }
  })
  const allKeys = cellSheets.flatMap((s) => s.keys.map((k) => `${s.kind}:${k}`))
  if (new Set(allKeys).size !== allKeys.length) throw new Error('cellSheets の keys に同じキーが重複しています')
  const rawMap = raw['map']
  const map = rawMap === null || rawMap === undefined ? null : isObj(rawMap) ? { file: str(rawMap, 'file', 'map') } : null
  return {
    inputDir: str(raw, 'inputDir', ''),
    outputDir: str(raw, 'outputDir', ''),
    manifest: str(raw, 'manifest', ''),
    webpQuality: quality,
    characterHeight: posInt(raw, 'characterHeight'),
    backgroundWidth: posInt(raw, 'backgroundWidth'),
    mapWidth: posInt(raw, 'mapWidth'),
    characters,
    backgrounds,
    map,
    cg,
    cellSheets,
    menuSize: posInt(raw, 'menuSize'),
    figureWidth: posInt(raw, 'figureWidth'),
    furnitureData: str(raw, 'furnitureData', ''),
    furnitureSize: posInt(raw, 'furnitureSize'),
  }
}
