// assets-inbox/ の画像を加工して public/assets/ に WebP で置き、画像の一覧（manifest.json）を書き出す。
// 使い方: npm run assets [-- --preview <確認用の画像を書き出すフォルダ>]
//   ローカルで実行し、できた WebP と manifest.json をコミットする（CI では実行しない）。
//   元の画像がないものは飛ばす（ゲームでは仮の絵を出す）。

import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import sharp, { type Sharp } from 'sharp'
import type { AssetManifest, ImageAsset } from '../../src/data/types.ts'
import { parseAssetConfig, type AssetConfig } from './config.ts'
import { findInput } from './inputFiles.ts'
import { DEFAULT_KEY_OPTIONS, alignFigures, estimateKeyColor, removeBackground, removeGreenSpill, splitFigures, type RGBAImage } from './imageOps.ts'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const { values } = parseArgs({ options: { preview: { type: 'string' } } })
const config: AssetConfig = parseAssetConfig(JSON.parse(readFileSync(join(root, 'scripts/assets/assets.config.json'), 'utf8')))

async function readRgba(file: string): Promise<RGBAImage> {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  return { width: info.width, height: info.height, data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.length) }
}

function fromRgba(img: RGBAImage) {
  return sharp(Buffer.from(img.data.buffer, img.data.byteOffset, img.data.length), { raw: { width: img.width, height: img.height, channels: 4 } })
}

/** WebP にして書き出し、一覧に載せる情報を返す（メタデータは付けない） */
async function writeWebp(pipeline: Sharp, outRelative: string): Promise<ImageAsset> {
  const out = join(root, config.outputDir, outRelative)
  mkdirSync(dirname(out), { recursive: true })
  const buffer = await pipeline.webp({ quality: config.webpQuality, alphaQuality: 90, effort: 6 }).toBuffer()
  writeFileSync(out, buffer)
  const meta = await sharp(buffer).metadata()
  const hash = createHash('sha256').update(buffer).digest('hex').slice(0, 10)
  const publicPath = relative(join(root, 'public'), out).split('\\').join('/')
  console.log(`  → ${publicPath}（${meta.width}×${meta.height}、${Math.round(buffer.length / 1024)}KB）`)
  return { src: `${publicPath}?v=${hash}`, width: meta.width ?? 0, height: meta.height ?? 0 }
}

/** 確認用：透過した画像を、目立つ色の上に重ねた PNG を書き出す（緑の残りや欠けを目で確かめるため） */
async function writePreview(img: RGBAImage, name: string): Promise<void> {
  if (values.preview === undefined) return
  mkdirSync(values.preview, { recursive: true })
  const png = await fromRgba(img).png().toBuffer()
  for (const [label, color] of [
    ['magenta', '#FF00FF'],
    ['dark', '#202020'],
  ] as const) {
    // sharp は縮小を重ね合わせより先に行うため、重ねた結果を一度画像にしてから縮小する
    const composed = await sharp({ create: { width: img.width, height: img.height, channels: 4, background: color } })
      .composite([{ input: png }])
      .png()
      .toBuffer()
    await sharp(composed)
      .resize({ height: 900 })
      .png()
      .toFile(join(values.preview, `${name}_${label}.png`))
  }
}

/** 元の画像を探す（.png・.jpg・.jpeg・.jpe のどれでもよい。同じ名前が複数あれば新しいほう） */
function inputPath(file: string): string | null {
  const p = findInput(join(root, config.inputDir), file)
  if (p !== null) {
    console.log(`  元の画像：${relative(root, p).split(sep).join('/')}`)
    return p
  }
  console.warn(`  ！ ${config.inputDir}/${file} がないため飛ばします（ゲームでは仮の絵を出します）`)
  return null
}

const manifest: AssetManifest = { characters: {}, backgrounds: {}, map: null }

for (const c of config.characters) {
  console.log(`立ち絵：${c.id}（${c.sheet}）`)
  const file = inputPath(c.sheet)
  if (file === null) continue
  const sheet = await readRgba(file)
  const key = estimateKeyColor(sheet)
  console.log(`  背景の緑：rgb(${key.r}, ${key.g}, ${key.b})`)
  const keyed = removeGreenSpill(removeBackground(sheet, key, DEFAULT_KEY_OPTIONS), key, c.keepGreen)
  const boxes = splitFigures(keyed, c.expressions.length)
  console.log(`  切り分け：${boxes.map((b) => `x ${b.x0}〜${b.x1}`).join('、')}`)
  const figures = alignFigures(keyed, boxes)
  const entry: AssetManifest['characters'][string] = {}
  for (const [i, expression] of c.expressions.entries()) {
    const figure = figures[i]
    if (figure === undefined) continue
    await writePreview(figure, `${c.id}_${expression}`)
    entry[expression] = await writeWebp(fromRgba(figure).resize({ height: config.characterHeight }), `char/${c.id}/${expression}.webp`)
  }
  manifest.characters[c.id] = entry
}

for (const b of config.backgrounds) {
  console.log(`背景：${b.id}（${b.file}）`)
  const file = inputPath(b.file)
  if (file === null) continue
  manifest.backgrounds[b.id] = await writeWebp(sharp(file).resize({ width: config.backgroundWidth }), `bg/${b.id}.webp`)
}

if (config.map !== null) {
  console.log(`マップ（${config.map.file}）`)
  const file = inputPath(config.map.file)
  if (file !== null) manifest.map = await writeWebp(sharp(file).resize({ width: config.mapWidth }), 'map/town.webp')
}

const manifestPath = join(root, config.manifest)
mkdirSync(dirname(manifestPath), { recursive: true })
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n')
console.log(`画像の一覧：${config.manifest}`)
