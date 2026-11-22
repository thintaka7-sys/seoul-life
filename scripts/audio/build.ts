// assets-inbox/audio/ の音（BGM・効果音）を加工して public/audio/ に置き、音の一覧（src/data/assets/audio.json）を書き出す。
// 使い方: npm run audio
//   ローカルで実行し、できた MP3 と audio.json をコミットする（CI では実行しない）。ffmpeg が必要（PC に入れる。リポジトリには入れない）。
//   - BGM：最初の無音とフェードアウトを切り、音の大きさをそろえて 128kbps の MP3 にする。つなぎ目はゲームが重ねて切り替える
//   - 効果音：使う部分を切り出し、いちばん大きいところを -3dB にそろえて、モノラルの MP3 にする

import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { findLoopRange, rmsWindows } from './loop.ts'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

interface BgmConfig {
  id: string
  file: string
}
interface SfxConfig {
  id: string
  file: string
  /** 切り出す位置と長さ（秒）。省略したら全体 */
  start?: number
  duration?: number
}
interface AudioConfig {
  inputDir: string
  outputDir: string
  manifest: string
  bgm: BgmConfig[]
  sfx: SfxConfig[]
}

const config = JSON.parse(readFileSync(join(root, 'scripts/audio/audio.config.json'), 'utf8')) as AudioConfig

/** ffmpeg の場所：環境変数 FFMPEG、PATH の ffmpeg、winget で入れた場所の順に探す */
function findFfmpeg(): string {
  const candidates = [process.env['FFMPEG'], 'ffmpeg']
  const wingetRoot = join(process.env['LOCALAPPDATA'] ?? '', 'Microsoft', 'WinGet', 'Packages')
  if (existsSync(wingetRoot)) {
    for (const pkg of readdirSync(wingetRoot).filter((d) => d.startsWith('Gyan.FFmpeg'))) {
      for (const build of readdirSync(join(wingetRoot, pkg))) candidates.push(join(wingetRoot, pkg, build, 'bin', 'ffmpeg.exe'))
    }
  }
  for (const c of candidates) {
    if (c === undefined || c === '') continue
    if (spawnSync(c, ['-version'], { stdio: 'ignore' }).status === 0) return c
  }
  throw new Error('ffmpeg が見つかりません。PC に入れるか、環境変数 FFMPEG に場所を書いてください')
}

const ffmpeg = findFfmpeg()

function run(args: string[]): Buffer {
  const r = spawnSync(ffmpeg, ['-hide_banner', '-v', 'error', ...args], { maxBuffer: 1024 * 1024 * 512 })
  if (r.status !== 0) throw new Error(`ffmpeg が失敗しました：${r.stderr.toString()}`)
  return r.stdout
}

function inputPath(file: string): string | null {
  const p = join(root, config.inputDir, file)
  if (existsSync(p)) return p
  console.warn(`  ！ ${config.inputDir}/${file} がないため飛ばします`)
  return null
}

function publish(out: string): string {
  const buffer = readFileSync(out)
  const hash = createHash('sha256').update(buffer).digest('hex').slice(0, 10)
  const publicPath = relative(join(root, 'public'), out).split(sep).join('/')
  console.log(`  → ${publicPath}（${Math.round(buffer.length / 1024)}KB）`)
  return `${publicPath}?v=${hash}`
}

/** 最大の音量（dB）。効果音の大きさをそろえるのに使う */
function maxVolume(file: string, extra: string[]): number {
  const r = spawnSync(ffmpeg, ['-hide_banner', ...extra, '-i', file, '-af', 'volumedetect', '-f', 'null', '-'], { encoding: 'utf8' })
  const m = /max_volume: (-?[\d.]+) dB/.exec(r.stderr)
  return m?.[1] === undefined ? 0 : Number(m[1])
}

const manifest: { bgm: Record<string, { src: string; duration: number }>; sfx: Record<string, { src: string }> } = { bgm: {}, sfx: {} }
const outDir = join(root, config.outputDir)
mkdirSync(join(outDir, 'sfx'), { recursive: true })

const WINDOW_SEC = 1
const RATE = 8000
for (const b of config.bgm) {
  console.log(`BGM：${b.id}（${b.file}）`)
  const file = inputPath(b.file)
  if (file === null) continue
  const pcm = run(['-i', file, '-ac', '1', '-ar', String(RATE), '-f', 's16le', '-'])
  const range = findLoopRange(rmsWindows(new Uint8Array(pcm), RATE * WINDOW_SEC), WINDOW_SEC)
  console.log(`  使う範囲：${range.start}〜${range.end} 秒（全体 ${(pcm.length / 2 / RATE).toFixed(1)} 秒）`)
  const out = join(outDir, `bgm_${b.id}.mp3`)
  run(['-y', '-ss', String(range.start), '-to', String(range.end), '-i', file, '-af', 'loudnorm=I=-18:TP=-2:LRA=11,aresample=44100', '-ac', '2', '-codec:a', 'libmp3lame', '-b:a', '128k', '-map_metadata', '-1', out])
  manifest.bgm[b.id] = { src: publish(out), duration: Math.round((range.end - range.start) * 100) / 100 }
}

for (const s of config.sfx) {
  console.log(`効果音：${s.id}（${s.file}）`)
  const file = inputPath(s.file)
  if (file === null) continue
  const cut = [...(s.start === undefined ? [] : ['-ss', String(s.start)]), ...(s.duration === undefined ? [] : ['-t', String(s.duration)])]
  const gain = -3 - maxVolume(file, cut)
  // 切り出した音は、終わりを短くフェードアウトして「プツッ」と切れないようにする
  const fade = s.duration === undefined ? '' : `,afade=t=out:st=${Math.max(0, s.duration - 0.4)}:d=0.4`
  const out = join(outDir, 'sfx', `${s.id}.mp3`)
  run(['-y', ...cut, '-i', file, '-af', `volume=${gain.toFixed(1)}dB,afade=t=in:d=0.01${fade}`, '-ac', '1', '-ar', '44100', '-codec:a', 'libmp3lame', '-b:a', '96k', '-map_metadata', '-1', out])
  manifest.sfx[s.id] = { src: publish(out) }
}

const manifestPath = join(root, config.manifest)
mkdirSync(dirname(manifestPath), { recursive: true })
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n')
console.log(`音の一覧：${config.manifest}`)
