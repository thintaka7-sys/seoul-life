// 場面の効果音（ドアのベル・ビデオ通話の呼び出し音など。おはなしの sfx の段階で鳴らす）。
// 音のファイル（public/audio/sfx/。npm run audio で作る）を読み込んで、効果音の音量のつまみを通して鳴らす。
// 効果音がオフのとき・まだ画面を操作していないとき・音がない場面では、何もしない。

import { audioAssets } from '../data'
import type { SceneSound } from '../data/types'
import { currentAudioEngine } from './engine'
import { isSfxEnabled } from './sfx'

const buffers = new Map<string, Promise<AudioBuffer | null>>()

function load(ctx: AudioContext, url: string): Promise<AudioBuffer | null> {
  let p = buffers.get(url)
  if (p === undefined) {
    p = fetch(url)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
      .then((data) => ctx.decodeAudioData(data))
      .catch(() => null)
    buffers.set(url, p)
  }
  return p
}

export function playSceneSound(id: SceneSound): void {
  if (!isSfxEnabled()) return
  const engine = currentAudioEngine()
  const entry = audioAssets.sfx[id]
  if (engine === null || entry === undefined || engine.ctx.state !== 'running') return
  void load(engine.ctx, `${import.meta.env.BASE_URL}${entry.src}`).then((buffer) => {
    if (buffer === null) return
    const source = engine.ctx.createBufferSource()
    source.buffer = buffer
    source.connect(engine.sfx)
    source.start()
  })
}
