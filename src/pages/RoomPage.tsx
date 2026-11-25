import { useMemo, useState } from 'react'
import { useGame, nowIso } from '../app/GameContext'
import { glossSpansOf } from '../app/glossary'
import { useFuriganaDisplay } from '../app/hooks'
import { formatDateTime } from '../app/saveSummary'
import { Button } from '../components/Button'
import { KoreanText } from '../components/KoreanText'
import { Notice } from '../components/Notice'
import { RoomScene } from '../components/scene/RoomScene'
import { ScreenLayout } from '../components/ScreenLayout'
import { SpeakButton } from '../components/SpeakButton'
import { useGlossPopup } from '../components/useGlossPopup'
import { backgroundImage, content, findVocab } from '../data'
import type { Furniture, RoomSlot } from '../data/types'
import { nextEvent } from '../game/events/events'
import { placedFurniture, purchaseState, type PurchaseState } from '../game/home/home'
import { levelOf } from '../game/progression/level'
import type { GlossSpan } from '../learning/gloss/resolve'
import type { SaveData } from '../storage/saveData'

type Tab = 'decorate' | 'catalog' | 'items'

const TABS: readonly { id: Tab; label: string }[] = [
  { id: 'decorate', label: '飾る' },
  { id: 'catalog', label: 'カタログ' },
  { id: 'items', label: '持ち物' },
]

function slotName(id: string): string {
  return content.balance.room.slots.find((s) => s.id === id)?.nameJa ?? id
}

/** 家具の韓国語の名前（単語があるものだけ。押すと意味が出て「覚える」で見かけた単語に入る） */
function FurnitureKorean({ item, chapter, onGloss }: { item: Furniture; chapter: number; onGloss: (span: GlossSpan) => void }) {
  const display = useFuriganaDisplay(chapter)
  const v = item.vocab === null ? undefined : findVocab(item.vocab)
  const spans = useMemo(() => (v === undefined ? undefined : glossSpansOf(v.korean, [{ text: v.korean, vocab: v.id }])), [v])
  if (v === undefined) return null
  return (
    <span className="furniture__korean" lang="ko">
      <KoreanText korean={v.korean} reading={v.pronunciation} display={display} glossSpans={spans} onGloss={onGloss} />
      <SpeakButton text={v.korean} />
    </span>
  )
}

function stateText(state: PurchaseState): string {
  switch (state.kind) {
    case 'owned':
      return '持っています'
    case 'milestone':
      return `スタンプ${state.days}個の節目でもらえます`
    case 'level':
      return `Lv.${state.level} で買えます`
    case 'coins':
      return `コインが、あと ${state.short} 枚 足りません`
    case 'available':
      return `${state.price} コイン`
  }
}

interface PanelProps {
  save: SaveData
  chapter: number
  onGloss: (span: GlossSpan) => void
}

/** 飾る：場所を選んで、持っている家具を置く・外す */
function DecoratePanel({ save, slot, onSlot, onCatalog }: PanelProps & { slot: RoomSlot; onSlot: (id: string) => void; onCatalog: () => void }) {
  const { dispatch } = useGame()
  const room = content.balance.room
  const owned = content.furniture.filter((f) => f.slot === slot.id && save.home.owned[f.id] !== undefined)
  const current = save.home.placement[slot.id]
  return (
    <>
      <section className="panel" aria-label="場所">
        <h2 className="section-title">場所を選ぶ</h2>
        <div className="slot-tabs" role="group" aria-label="家具を置く場所">
          {room.slots.map((s, i) => {
            const placed = content.furniture.find((f) => f.id === save.home.placement[s.id])
            return (
              <button key={s.id} type="button" className="slot-tab" aria-pressed={s.id === slot.id} data-slot={s.id} onClick={() => onSlot(s.id)}>
                <span className="slot-tab__name">
                  {i + 1}. {s.nameJa}
                </span>
                <span className="slot-tab__item">{placed?.nameJa ?? 'なし'}</span>
              </button>
            )
          })}
        </div>
      </section>
      <section className="panel" aria-label={`${slot.nameJa}に置く家具`}>
        <h2 className="section-title">{slot.nameJa}に置く</h2>
        {owned.length === 0 ? (
          <>
            <p>この場所に置ける家具を、まだ持っていません。</p>
            <Button onClick={onCatalog}>カタログを見る</Button>
          </>
        ) : (
          <div className="furniture-choices">
            {owned.map((f) => (
              <Button
                key={f.id}
                className="furniture-choice"
                aria-pressed={current === f.id}
                data-furniture={f.id}
                onClick={() => dispatch({ type: 'placeFurniture', slot: slot.id, furnitureId: f.id, now: nowIso() })}
              >
                {current === f.id ? '✓ ' : ''}
                {f.nameJa}
              </Button>
            ))}
            <Button disabled={current === undefined} onClick={() => dispatch({ type: 'placeFurniture', slot: slot.id, furnitureId: null, now: nowIso() })}>
              何も置かない
            </Button>
          </div>
        )}
      </section>
    </>
  )
}

/** カタログ：コインで家具を買う。節目専用の家具も、もらえる節目を見せる */
function CatalogPanel({ save, chapter, onGloss }: PanelProps) {
  const { dispatch } = useGame()
  const [message, setMessage] = useState<string | null>(null)
  const levels = content.balance.levels
  const sold = content.furniture.filter((f) => f.milestone === null).sort((a, b) => (a.level ?? 0) - (b.level ?? 0))
  const gifts = content.furniture.filter((f) => f.milestone !== null).sort((a, b) => (a.milestone ?? 0) - (b.milestone ?? 0))

  function buy(item: Furniture) {
    const placeNow = save.home.placement[item.slot] === undefined
    dispatch({ type: 'buyFurniture', furnitureId: item.id, now: nowIso() })
    setMessage(placeNow ? `「${item.nameJa}」を買って、${slotName(item.slot)}に置きました。` : `「${item.nameJa}」を買いました。「飾る」で、${slotName(item.slot)}の家具と入れかえられます。`)
  }

  const row = (f: Furniture) => {
    const state = purchaseState(f, save, levels)
    return (
      <li key={f.id} className={`catalog-item catalog-item--${state.kind}`} data-id={f.id}>
        <div className="catalog-item__body">
          <p className="catalog-item__name">{f.nameJa}</p>
          <FurnitureKorean item={f} chapter={chapter} onGloss={onGloss} />
          <p className="catalog-item__meta">
            {slotName(f.slot)}
            {f.price !== null && `・${f.price} コイン`}
          </p>
        </div>
        <div className="catalog-item__action">
          {state.kind === 'available' ? (
            <Button variant="primary" onClick={() => buy(f)}>
              買う
            </Button>
          ) : (
            <span className="catalog-item__state">{stateText(state)}</span>
          )}
        </div>
      </li>
    )
  }

  return (
    <>
      {message !== null && (
        <Notice tone="info">
          <p role="status">{message}</p>
        </Notice>
      )}
      <section className="panel" aria-label="カタログ">
        <h2 className="section-title">カタログ（コインで買う）</h2>
        <ul className="catalog-list">{sold.map(row)}</ul>
      </section>
      <section className="panel" aria-label="節目のごほうびの家具">
        <h2 className="section-title">スタンプの節目でもらえる家具</h2>
        <ul className="catalog-list">{gifts.map(row)}</ul>
        <p className="muted small">集めたスタンプの合計が節目の数になると、もらえます（スタンプカード）。</p>
      </section>
    </>
  )
}

/** 持ち物：持っている家具（GAME_SPEC 6-3 のアイテムの確認） */
function ItemsPanel({ save, chapter, onGloss }: PanelProps) {
  const owned = content.furniture.filter((f) => save.home.owned[f.id] !== undefined)
  return (
    <section className="panel" aria-label="持ち物">
      <h2 className="section-title">
        持っている家具：{owned.length} / {content.furniture.length}
      </h2>
      {owned.length === 0 ? (
        <p>まだ家具を持っていません。カタログで買うか、スタンプの節目でもらえます。</p>
      ) : (
        <ul className="catalog-list">
          {owned.map((f) => {
            const placed = save.home.placement[f.slot] === f.id
            const at = save.home.owned[f.id]?.at
            return (
              <li key={f.id} className="catalog-item" data-id={f.id}>
                <div className="catalog-item__body">
                  <p className="catalog-item__name">{f.nameJa}</p>
                  <FurnitureKorean item={f} chapter={chapter} onGloss={onGloss} />
                  <p className="catalog-item__meta">
                    {placed ? `${slotName(f.slot)}に置いています` : `しまってあります（${slotName(f.slot)}に置けます）`}
                    {at !== undefined && `・${formatDateTime(at)} に手に入れた`}
                  </p>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

/** 部屋を飾る（GAME_SPEC 6-3。Phase 4）：部屋の絵と、飾る・カタログ・持ち物 */
export function RoomPage() {
  const { state, dispatch } = useGame()
  const room = content.balance.room
  const [tab, setTab] = useState<Tab>('decorate')
  const [slotId, setSlotId] = useState(room.slots[0]?.id ?? '')
  const save = state.save
  const chapter = save === null ? 1 : (nextEvent(content.events, save.progress)?.chapter ?? content.chapters.at(-1)?.chapter ?? 1)
  const gloss = useGlossPopup(chapter)
  if (save === null) return null
  const image = backgroundImage('home')
  const placed = placedFurniture(save, room, content.furniture)
  const slot = room.slots.find((s) => s.id === slotId) ?? room.slots[0]
  const level = levelOf(save.stats.xp, content.balance.levels)
  const props: PanelProps = { save, chapter, onGloss: gloss.onGloss }

  return (
    <ScreenLayout eyebrow="自宅" title="部屋を飾る" footer={<Button onClick={() => dispatch({ type: 'closeStudyScene' })}>戻る</Button>}>
      <p className="panel room-status">
        <span>Lv.{level}</span>
        <span>
          コイン <strong className="room-status__coins">{save.stats.coins}</strong>
        </span>
      </p>
      <div className="room-view">
        {image === undefined ? (
          <p className="muted">部屋の絵がまだありません。</p>
        ) : (
          <RoomScene image={image} placed={placed} slots={tab === 'decorate' ? room.slots : undefined} selected={tab === 'decorate' ? (slot?.id ?? null) : null} />
        )}
      </div>
      <div className="mode-tabs mode-tabs--3" role="group" aria-label="表示">
        {TABS.map((t) => (
          <button key={t.id} type="button" className="mode-tab" aria-pressed={tab === t.id} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'decorate' && slot !== undefined && <DecoratePanel {...props} slot={slot} onSlot={setSlotId} onCatalog={() => setTab('catalog')} />}
      {tab === 'catalog' && <CatalogPanel {...props} />}
      {tab === 'items' && <ItemsPanel {...props} />}
      {gloss.popup}
    </ScreenLayout>
  )
}
