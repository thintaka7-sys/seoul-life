import { useGame, nowIso } from '../../app/GameContext'
import { useFuriganaDisplay } from '../../app/hooks'
import { Button } from '../../components/Button'
import { KoreanText } from '../../components/KoreanText'
import { SpeakButton } from '../../components/SpeakButton'
import { Translation } from '../../components/Translation'
import type { Column } from '../../data/types'

/** コラム（韓国生活の小ネタ）を読む段階。経験値は付けない */
export function ColumnStep({ column }: { column: Column }) {
  const { dispatch } = useGame()
  const display = useFuriganaDisplay(column.chapter)
  return (
    <article className="column-card">
      <p className="column-card__label">韓国生活の小ネタ</p>
      <h2 className="column-card__title">{column.titleJa}</h2>
      {column.blocks.map((block, i) =>
        block.type === 'text' ? (
          <p key={i} className="column-card__text">
            {block.textJa}
          </p>
        ) : (
          <div key={i} className="column-card__korean">
            <div className="ko-row">
              <KoreanText korean={block.korean} reading={block.pronunciation} display={display} />
              <SpeakButton text={block.korean} />
            </div>
            <Translation text={block.japanese} className="column-card__ja" />
          </div>
        ),
      )}
      <Button variant="primary" onClick={() => dispatch({ type: 'stepDone', now: nowIso() })}>
        次へ
      </Button>
    </article>
  )
}
