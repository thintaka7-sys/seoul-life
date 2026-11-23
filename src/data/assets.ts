// 加工済みの画像の一覧（src/data/assets/manifest.json。npm run assets が書き出す）を読み、確かめる。
// 一覧がない・壊れている・知らないキャラクターや背景を指している場合は、その画像を使わない（画面では仮の絵を出す）。

import { BGM_IDS, EXPRESSIONS, MENU_IMAGES, SCENE_SOUNDS, type AssetManifest, type BgmId, type Expression, type ImageAsset, type SceneSound, type ValidationIssue } from './types'

const FILE = 'assets/manifest.json'

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function parseImage(v: unknown): ImageAsset | null {
  if (!isObj(v)) return null
  const { src, width, height } = v
  if (typeof src !== 'string' || !/^assets\/[\w/.-]+\.webp(\?v=[0-9a-f]+)?$/.test(src)) return null
  if (typeof width !== 'number' || typeof height !== 'number' || width <= 0 || height <= 0) return null
  return { src, width, height }
}

export function emptyAssetManifest(): AssetManifest {
  return { characters: {}, backgrounds: {}, map: null, cg: {}, menu: {}, figures: {} }
}

/** 画像の一覧を確かめる。使えない項目は除き、問題の一覧を返す */
export function parseAssetManifest(
  raw: unknown,
  ids: { characterIds: ReadonlySet<string>; backgroundIds: ReadonlySet<string> },
): { manifest: AssetManifest; issues: ValidationIssue[] } {
  const manifest = emptyAssetManifest()
  const issues: ValidationIssue[] = []
  const issue = (path: string, message: string) => issues.push({ file: FILE, index: null, id: null, path, message })
  if (raw === undefined) return { manifest, issues }
  if (!isObj(raw)) {
    issue('', '画像の一覧の形ではありません（npm run assets で作り直してください）')
    return { manifest, issues }
  }

  const characters = isObj(raw['characters']) ? raw['characters'] : {}
  for (const [id, entry] of Object.entries(characters)) {
    if (!ids.characterIds.has(id)) {
      issue(`characters.${id}`, `存在しないキャラクターIDです：${id}`)
      continue
    }
    if (!isObj(entry)) continue
    const images: Partial<Record<Expression, ImageAsset>> = {}
    for (const [expression, image] of Object.entries(entry)) {
      const key = EXPRESSIONS.find((e) => e === expression)
      const parsed = parseImage(image)
      if (key === undefined || parsed === null) issue(`characters.${id}.${expression}`, '表情のキーか画像の情報が正しくありません')
      else images[key] = parsed
    }
    manifest.characters[id] = images
  }

  const backgrounds = isObj(raw['backgrounds']) ? raw['backgrounds'] : {}
  for (const [id, image] of Object.entries(backgrounds)) {
    const parsed = parseImage(image)
    if (!ids.backgroundIds.has(id)) issue(`backgrounds.${id}`, `存在しない背景IDです（施設IDか場面の背景のID）：${id}`)
    else if (parsed === null) issue(`backgrounds.${id}`, '画像の情報が正しくありません')
    else manifest.backgrounds[id] = parsed
  }

  const cg = isObj(raw['cg']) ? raw['cg'] : {}
  for (const [key, image] of Object.entries(cg)) {
    const parsed = parseImage(image)
    if (!/^[a-z][a-z0-9_]*$/.test(key) || parsed === null) issue(`cg.${key}`, '一枚絵のキーか画像の情報が正しくありません')
    else manifest.cg[key] = parsed
  }

  const menu = isObj(raw['menu']) ? raw['menu'] : {}
  for (const [key, image] of Object.entries(menu)) {
    const parsed = parseImage(image)
    if (!MENU_IMAGES.some((k) => k === key)) issue(`menu.${key}`, `メニューの絵のキーではありません：${key}`)
    else if (parsed === null) issue(`menu.${key}`, '画像の情報が正しくありません')
    else manifest.menu[key] = parsed
  }

  const figures = isObj(raw['figures']) ? raw['figures'] : {}
  for (const [key, image] of Object.entries(figures)) {
    const parsed = parseImage(image)
    if (!/^[a-z][a-z0-9_]*$/.test(key) || parsed === null) issue(`figures.${key}`, '図の絵のキーか画像の情報が正しくありません')
    else manifest.figures[key] = parsed
  }

  if (raw['map'] !== null && raw['map'] !== undefined) {
    const parsed = parseImage(raw['map'])
    if (parsed === null) issue('map', '画像の情報が正しくありません')
    else manifest.map = parsed
  }
  return { manifest, issues }
}

// ---------- 音の一覧（src/data/assets/audio.json。npm run audio が書き出す） ----------

export interface AudioTrack {
  /** public/ からの相対パス（?v=… つき） */
  src: string
  /** 長さ（秒）。BGM はこの長さでくり返す（終わりの手前で重ねて切り替える） */
  duration: number
}

export interface AudioManifest {
  bgm: Partial<Record<BgmId, AudioTrack>>
  sfx: Partial<Record<SceneSound, { src: string }>>
}

const AUDIO_SRC = /^audio\/[\w/.-]+\.mp3(\?v=[0-9a-f]+)?$/

/** 音の一覧を確かめる。使えない項目は除く（その音は鳴らさない） */
export function parseAudioManifest(raw: unknown): { manifest: AudioManifest; issues: ValidationIssue[] } {
  const manifest: AudioManifest = { bgm: {}, sfx: {} }
  const issues: ValidationIssue[] = []
  const issue = (path: string, message: string) => issues.push({ file: 'assets/audio.json', index: null, id: null, path, message })
  if (raw === undefined) return { manifest, issues }
  if (!isObj(raw)) {
    issue('', '音の一覧の形ではありません（npm run audio で作り直してください）')
    return { manifest, issues }
  }
  for (const [id, track] of Object.entries(isObj(raw['bgm']) ? raw['bgm'] : {})) {
    const key = BGM_IDS.find((b) => b === id)
    const src = isObj(track) ? track['src'] : undefined
    const duration = isObj(track) ? track['duration'] : undefined
    if (key === undefined || typeof src !== 'string' || !AUDIO_SRC.test(src) || typeof duration !== 'number' || duration <= 5) issue(`bgm.${id}`, 'BGM のIDか、曲の情報が正しくありません')
    else manifest.bgm[key] = { src, duration }
  }
  for (const [id, sound] of Object.entries(isObj(raw['sfx']) ? raw['sfx'] : {})) {
    const key = SCENE_SOUNDS.find((s) => s === id)
    const src = isObj(sound) ? sound['src'] : undefined
    if (key === undefined || typeof src !== 'string' || !AUDIO_SRC.test(src)) issue(`sfx.${id}`, '効果音のIDか、音の情報が正しくありません')
    else manifest.sfx[key] = { src }
  }
  return { manifest, issues }
}
