import type { ImageAsset } from '../../data/types'
import type { PlacedFurniture } from '../../game/home/home'
import { assetUrl } from './assetUrl'
import { RoomScene } from './RoomScene'

/**
 * 画面の後ろに敷く背景。画面全体にぼかした絵を敷き、その上の内容の幅の部分にくっきりした絵を重ねる
 * （スマホでは内容の幅＝画面の幅なので、くっきりした絵だけが見える）。
 * 自宅の部屋の絵なら（room がある）、切り取らずに部屋全体を見せ、置いた家具を重ねる。
 * 画像がなければ何も出さない（ふだんの背景色のまま）。
 */
export function Backdrop({ image, room }: { image: ImageAsset | undefined; room?: readonly PlacedFurniture[] | undefined }) {
  if (image === undefined) return null
  const src = assetUrl(image.src)
  return (
    <div className="backdrop" aria-hidden="true">
      <img className="backdrop__blur" src={src} alt="" decoding="async" />
      {room === undefined ? (
        <img key={src} className="backdrop__sharp" src={src} alt="" decoding="async" />
      ) : (
        <div key={src} className="backdrop__room">
          <RoomScene image={image} placed={room} imageClassName="backdrop__sharp" />
        </div>
      )}
    </div>
  )
}
