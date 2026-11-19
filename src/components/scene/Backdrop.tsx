import type { ImageAsset } from '../../data/types'
import { assetUrl } from './assetUrl'

/**
 * 画面の後ろに敷く背景。画面全体にぼかした絵を敷き、その上の内容の幅の部分にくっきりした絵を重ねる
 * （スマホでは内容の幅＝画面の幅なので、くっきりした絵だけが見える）。
 * 画像がなければ何も出さない（ふだんの背景色のまま）。
 */
export function Backdrop({ image }: { image: ImageAsset | undefined }) {
  if (image === undefined) return null
  const src = assetUrl(image.src)
  return (
    <div className="backdrop" aria-hidden="true">
      <img className="backdrop__blur" src={src} alt="" decoding="async" />
      <img key={src} className="backdrop__sharp" src={src} alt="" decoding="async" />
    </div>
  )
}
