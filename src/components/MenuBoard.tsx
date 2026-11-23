import { assets, findVocab } from '../data'
import type { Menu, MenuItem } from '../data/types'
import type { FuriganaDisplay } from '../learning/furigana/furigana'
import { formatNumber } from '../learning/reading/reading'
import { KoreanText } from './KoreanText'
import { assetUrl } from './scene/assetUrl'
import { SpeakButton } from './SpeakButton'

interface MenuBoardProps {
  menu: Menu
  display: FuriganaDisplay
  /** 品名の日本語を出すか（読み物では、問題に答え終わるまで出さない） */
  showJapanese: boolean
  /** 「本文から探して押す」問題の間：品名を押せるようにする */
  onFind?: ((name: string) => void) | undefined
  /** 印を付ける品物（探す問題の答えなど） */
  marked?: { key: string; tone: 'correct' | 'wrong' }[]
}

function itemName(item: MenuItem) {
  return findVocab(item.vocab)
}

/** 店のメニュー（GAME_SPEC 4-4）。品物の絵・品名・値段を並べる。読み物と注文で同じものを使う */
export function MenuBoard({ menu, display, showJapanese, onFind, marked = [] }: MenuBoardProps) {
  return (
    <section className="menu-board" aria-label={menu.titleJa}>
      <h2 className="menu-board__title">{menu.titleJa}</h2>
      <ul className="menu-board__items">
        {menu.items.map((item) => {
          const v = itemName(item)
          const image = item.image === undefined ? undefined : assets.menu[item.image]
          const mark = marked.find((m) => m.key === item.key)
          const price = `${formatNumber(String(item.price))}${menu.currency.korean}`
          return (
            <li key={item.key} className={`menu-item${mark === undefined ? '' : ` menu-item--${mark.tone}`}`}>
              {image !== undefined && <img className="menu-item__img" src={assetUrl(image.src)} width={image.width} height={image.height} alt="" decoding="async" />}
              <div className="menu-item__name">
                {v === undefined ? null : onFind === undefined ? (
                  <>
                    <KoreanText korean={v.korean} reading={v.pronunciation} display={display} />
                    <SpeakButton text={v.korean} />
                  </>
                ) : (
                  <button type="button" className="find-chip" lang="ko" onClick={() => onFind(v.korean)}>
                    <KoreanText korean={v.korean} reading={v.pronunciation} display={display === 'tap' ? 'hide' : display} />
                  </button>
                )}
              </div>
              {showJapanese && v !== undefined && <p className="menu-item__ja">{v.japanese}</p>}
              <p className="menu-item__price">
                <KoreanText korean={price} reading={item.pricePronunciation} display={display} />
              </p>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
