import { useMemo } from 'react'
import { glossSpansOf } from '../app/glossary'
import { assets, findVocab } from '../data'
import type { Menu, MenuItem } from '../data/types'
import type { FuriganaDisplay } from '../learning/furigana/furigana'
import type { GlossSpan } from '../learning/gloss/resolve'
import { formatNumber } from '../learning/reading/reading'
import { KoreanText } from './KoreanText'
import { assetUrl } from './scene/assetUrl'
import { SpeakButton } from './SpeakButton'

interface MenuBoardProps {
  menu: Menu
  display: FuriganaDisplay
  /** 品名の日本語を出すか（読み物では、問題に答え終わるまで出さない。注文では出さない） */
  showJapanese: boolean
  /** 「探して押す」問題の間：品名を押せるようにする */
  onFind?: ((name: string) => void) | undefined
  /** 品名を押すと意味を出す（注文の画面。GAME_SPEC 4-4・4-8）。探す問題の間は使わない */
  onGloss?: ((span: GlossSpan) => void) | undefined
  /** 印を付ける品物（探す問題の答えなど） */
  marked?: { key: string; tone: 'correct' | 'wrong' }[]
}

interface ItemProps {
  item: MenuItem
  currency: string
  display: FuriganaDisplay
  showJapanese: boolean
  onFind: ((name: string) => void) | undefined
  onGloss: ((span: GlossSpan) => void) | undefined
  mark: 'correct' | 'wrong' | undefined
}

/** 品名（探す問題の間は押して答える。注文の画面では押すと意味が出る）と読み上げ */
function ItemName({ item, display, onFind, onGloss }: Pick<ItemProps, 'item' | 'display' | 'onFind' | 'onGloss'>) {
  const v = findVocab(item.vocab)
  const spans = useMemo(() => (v === undefined || onGloss === undefined ? undefined : glossSpansOf(v.korean, [{ text: v.korean, vocab: v.id }])), [v, onGloss])
  if (v === undefined) return null
  if (onFind !== undefined) {
    return (
      <button type="button" className="find-chip" lang="ko" onClick={() => onFind(v.korean)}>
        <KoreanText korean={v.korean} reading={v.pronunciation} display={display === 'tap' ? 'hide' : display} />
      </button>
    )
  }
  return (
    <>
      <KoreanText korean={v.korean} reading={v.pronunciation} display={display} glossSpans={spans} onGloss={onGloss} />
      <SpeakButton text={v.korean} />
    </>
  )
}

function itemPrice(item: MenuItem, currency: string, display: FuriganaDisplay) {
  return <KoreanText korean={`${formatNumber(String(item.price))}${currency}`} reading={item.pricePronunciation} display={display} />
}

function markClass(base: string, mark: ItemProps['mark']) {
  return mark === undefined ? base : `${base} ${base}--${mark}`
}

/** 文字のメニュー（메뉴판）の1行：品名・値段。絵は出さない */
function BoardRow({ item, currency, display, showJapanese, onFind, onGloss, mark }: ItemProps) {
  const v = findVocab(item.vocab)
  return (
    <li className={markClass('menu-row', mark)} data-key={item.key}>
      <div className="menu-row__name">
        <ItemName item={item} display={display} onFind={onFind} onGloss={onGloss} />
      </div>
      <span className="menu-row__leader" aria-hidden="true" />
      <p className="menu-row__price">{itemPrice(item, currency, display)}</p>
      {showJapanese && v !== undefined && <p className="menu-row__ja">{v.japanese}</p>}
    </li>
  )
}

/** ショーケース（쇼케이스）の1品：品物の絵と、品名・値段の札 */
function ShowcaseItem({ item, currency, display, showJapanese, onFind, onGloss, mark }: ItemProps) {
  const v = findVocab(item.vocab)
  const image = item.image === undefined ? undefined : assets.menu[item.image]
  return (
    <li className={markClass('showcase-item', mark)} data-key={item.key}>
      {image !== undefined && <img className="showcase-item__img" src={assetUrl(image.src)} width={image.width} height={image.height} alt="" decoding="async" />}
      <div className="showcase-item__tag">
        <div className="showcase-item__name">
          <ItemName item={item} display={display} onFind={onFind} onGloss={onGloss} />
        </div>
        <p className="showcase-item__price">{itemPrice(item, currency, display)}</p>
        {showJapanese && v !== undefined && <p className="showcase-item__ja">{v.japanese}</p>}
      </div>
    </li>
  )
}

/**
 * 店のメニュー（GAME_SPEC 4-4）。読み物と注文で同じものを使う。実際の店に合わせて、品物ごとに見せ方を分ける：
 * 文字だけのメニュー（메뉴판。品名と値段）と、絵つきのショーケース（쇼케이스。絵と、品名・値段の札）。どちらも教材に書いた順に並べる
 */
export function MenuBoard({ menu, display, showJapanese, onFind, onGloss, marked = [] }: MenuBoardProps) {
  const board = menu.items.filter((i) => i.display === 'board')
  const showcase = menu.items.filter((i) => i.display === 'showcase')
  const props = (item: MenuItem): ItemProps => ({
    item,
    currency: menu.currency.korean,
    display,
    showJapanese,
    onFind,
    onGloss: onFind === undefined ? onGloss : undefined,
    mark: marked.find((m) => m.key === item.key)?.tone,
  })
  return (
    <section className="shop-menu" aria-label={menu.titleJa}>
      {board.length > 0 && (
        <div className="menu-board">
          <p className="menu-board__title">メニュー</p>
          <ul className="menu-board__rows">
            {board.map((item) => (
              <BoardRow key={item.key} {...props(item)} />
            ))}
          </ul>
        </div>
      )}
      {showcase.length > 0 && (
        <div className="showcase">
          <p className="showcase__title">ショーケース</p>
          <ul className="showcase__items">
            {showcase.map((item) => (
              <ShowcaseItem key={item.key} {...props(item)} />
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
