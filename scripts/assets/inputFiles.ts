// assets-inbox/ の元の画像を探す。Gemini の仕様で PNG と JPEG（.jpg・.jpeg・.jpe）が混ざるため、
// 設定に書いたファイル名の拡張子を除いた名前で探し、同じ名前が複数あれば新しい（更新日時の遅い）ほうを使う。

import { readdirSync, statSync } from 'node:fs'
import { extname, join } from 'node:path'

export const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.jpe'] as const

/** 拡張子を除いた名前（例：bg_home.png → bg_home） */
export function baseName(file: string): string {
  const ext = extname(file)
  return (IMAGE_EXTENSIONS as readonly string[]).includes(ext.toLowerCase()) ? file.slice(0, -ext.length) : file
}

export interface Candidate {
  name: string
  mtimeMs: number
}

/** 候補の中から、名前の合うもののうち新しいものを選ぶ。なければ null */
export function pickNewest(wanted: string, candidates: readonly Candidate[]): string | null {
  const base = baseName(wanted)
  const matches = candidates.filter((c) => baseName(c.name) === base && (IMAGE_EXTENSIONS as readonly string[]).includes(extname(c.name).toLowerCase()))
  if (matches.length === 0) return null
  const newest = matches.reduce((a, b) => (b.mtimeMs > a.mtimeMs ? b : a))
  return newest.name
}

/** フォルダの中から、設定に書いた名前の画像を探す（フルパス）。なければ null */
export function findInput(dir: string, wanted: string): string | null {
  let names: string[]
  try {
    names = readdirSync(dir)
  } catch {
    return null
  }
  const found = pickNewest(
    wanted,
    names.map((name) => ({ name, mtimeMs: statSync(join(dir, name)).mtimeMs })),
  )
  return found === null ? null : join(dir, found)
}
