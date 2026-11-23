import { useGame } from '../app/GameContext'
import { Button } from '../components/Button'
import { content, findLocation } from '../data'
import { OrderStep } from './event/OrderStep'

/** 施設の画面から、もう一度注文する（GAME_SPEC 4-4。何度でも。経験値は初めて注文できたときだけ） */
export function OrderPage({ orderId }: { orderId: string }) {
  const { dispatch } = useGame()
  const order = content.orders.find((o) => o.id === orderId)
  const close = () => dispatch({ type: 'closeStudyScene' })
  return (
    <main className="screen">
      <header className="screen__header event-header">
        <div>
          <p className="screen__eyebrow">{findLocation(order?.location ?? null)?.nameJa ?? ''}</p>
          <h1 className="screen__title">注文する</h1>
        </div>
        <div className="event-header__actions">
          <button type="button" className="link-button" onClick={close}>
            やめる
          </button>
        </div>
      </header>
      <div className="screen__body">
        {order === undefined ? (
          <div className="panel">
            <p>注文の教材が見つかりませんでした。</p>
            <Button onClick={close}>戻る</Button>
          </div>
        ) : (
          <OrderStep order={order} onDone={close} doneLabel="店を出る" />
        )}
      </div>
    </main>
  )
}
