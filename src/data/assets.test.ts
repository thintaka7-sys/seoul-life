import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { emptyAssetManifest, parseAssetManifest } from './assets'
import { assetIssues, assets, characterImage } from './index'

const ids = { characterIds: new Set(['cafe_staff']), locationIds: new Set(['cafe']) }
const image = { src: 'assets/char/cafe_staff/normal.webp?v=abc123', width: 718, height: 1200 }

describe('画像の一覧', () => {
  it('一覧がなければ空（すべて仮の絵）', () => {
    expect(parseAssetManifest(undefined, ids)).toEqual({ manifest: emptyAssetManifest(), issues: [] })
  })

  it('正しい項目を読み込む', () => {
    const raw = { characters: { cafe_staff: { normal: image, smile: image } }, backgrounds: { cafe: { ...image, src: 'assets/bg/cafe.webp' } }, map: { ...image, src: 'assets/map/town.webp' } }
    const { manifest, issues } = parseAssetManifest(raw, ids)
    expect(issues).toEqual([])
    expect(manifest.characters['cafe_staff']?.smile).toEqual(image)
    expect(manifest.backgrounds['cafe']?.src).toBe('assets/bg/cafe.webp')
    expect(manifest.map?.src).toBe('assets/map/town.webp')
  })

  it('知らないキャラクター・施設・表情、壊れた画像の情報は除いて知らせる', () => {
    const raw = {
      characters: { friend: { normal: image }, cafe_staff: { angry: image, normal: { ...image, width: 0 } } },
      backgrounds: { park: image, cafe: { ...image, src: '../secret.png' } },
      map: 3,
    }
    const { manifest, issues } = parseAssetManifest(raw, ids)
    expect(manifest.characters).toEqual({ cafe_staff: {} })
    expect(manifest.backgrounds).toEqual({})
    expect(manifest.map).toBeNull()
    expect(issues.map((i) => i.path)).toEqual(['characters.friend', 'characters.cafe_staff.angry', 'characters.cafe_staff.normal', 'backgrounds.park', 'backgrounds.cafe', 'map'])
  })
})

describe('実際の画像の一覧（src/data/assets/manifest.json）', () => {
  it('問題が1件もない', () => {
    expect(assetIssues).toEqual([])
  })

  it('立ち絵は、どの表情も同じ大きさ（表情を変えても位置がずれない）', () => {
    for (const [id, images] of Object.entries(assets.characters)) {
      const sizes = new Set(Object.values(images).map((i) => `${i.width}x${i.height}`))
      expect(sizes.size, id).toBe(1)
    }
  })

  it('表情の画像がなければ通常の画像を使う', () => {
    const normal = assets.characters['cafe_staff']?.normal
    if (normal === undefined) return
    expect(characterImage('cafe_staff', 'smile')).toBeDefined()
    expect(characterImage('nobody', 'smile')).toBeUndefined()
  })
})

describe('一覧の画像ファイル', () => {
  it('public/ に実際にある', () => {
    const all = [...Object.values(assets.characters).flatMap((c) => Object.values(c)), ...Object.values(assets.backgrounds), ...(assets.map === null ? [] : [assets.map])]
    for (const image of all) {
      const path = fileURLToPath(new URL(`../../public/${image.src.replace(/\?.*$/, '')}`, import.meta.url))
      expect(existsSync(path), image.src).toBe(true)
    }
  })
})
