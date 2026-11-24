// ホーム画面のアイコン（PWA。GAME_SPEC 10-6）を作る。
// 使い方: npm run icons
//   assets-inbox/ に app_icon（.png・.jpg など。正方形の絵）があれば、それから作る。なければ仮のアイコン（図形だけ）を作る。
//   できた PNG（public/icons/）をコミットする。元の絵は git に入れない（.gitignore）。
//   - icon-192.png・icon-512.png：ふつうのアイコン（manifest）
//   - icon-maskable-512.png：Android が丸や角丸に切り抜くためのアイコン。絵を中央の 80% に収め、まわりを背景色で埋める
//   - apple-touch-icon.png：iPhone のホーム画面（180px。透明な部分を背景色で埋める）

import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp, { type Sharp } from 'sharp'
import { findInput } from '../assets/inputFiles.ts'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const outDir = join(root, 'public', 'icons')
/** アイコンの背景色（ゲームの地の色） */
export const ICON_BACKGROUND = '#f8f3ec'

/** 仮のアイコン：地の色に、オレンジの角丸と白い家（自宅）とカップ（カフェ）。文字は入れない */
function placeholderSvg(size: number): Buffer {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="${ICON_BACKGROUND}"/>
  <rect x="56" y="56" width="400" height="400" rx="88" fill="#d69c5e"/>
  <path d="M120 262 L226 168 L332 262 L332 372 L120 372 Z" fill="#fffaf3"/>
  <rect x="198" y="300" width="56" height="72" rx="8" fill="#d69c5e"/>
  <path d="M342 318 h50 v26 a25 25 0 0 1 -50 0 z" fill="#fffaf3"/>
  <path d="M392 326 a12 12 0 0 1 0 22" stroke="#fffaf3" stroke-width="7" fill="none"/>
  <rect x="336" y="368" width="62" height="6" rx="3" fill="#fffaf3"/>
</svg>`)
}

async function source(): Promise<Sharp> {
  const file = findInput(join(root, 'assets-inbox'), 'app_icon')
  if (file === null) {
    console.log('assets-inbox/app_icon がないので、仮のアイコンを作ります')
    return sharp(placeholderSvg(1024))
  }
  console.log(`アイコンの絵：${file}`)
  return sharp(file).resize(1024, 1024, { fit: 'cover' })
}

async function main() {
  mkdirSync(outDir, { recursive: true })
  const base = await (await source()).png().toBuffer()
  const flat = (size: number) => sharp(base).resize(size, size).flatten({ background: ICON_BACKGROUND }).png()
  await flat(192).toFile(join(outDir, 'icon-192.png'))
  await flat(512).toFile(join(outDir, 'icon-512.png'))
  await flat(180).toFile(join(outDir, 'apple-touch-icon.png'))
  // 切り抜かれても絵が欠けないよう、中央の 80% に収める
  const inner = await sharp(base).resize(410, 410).png().toBuffer()
  await sharp({ create: { width: 512, height: 512, channels: 4, background: ICON_BACKGROUND } })
    .composite([{ input: inner, gravity: 'center' }])
    .flatten({ background: ICON_BACKGROUND })
    .png()
    .toFile(join(outDir, 'icon-maskable-512.png'))
  console.log('public/icons/ に4つのアイコンを書き出しました')
}

await main()
