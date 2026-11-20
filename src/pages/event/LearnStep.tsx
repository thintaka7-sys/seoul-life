import { useState } from 'react'
import { useGame, nowIso } from '../../app/GameContext'
import { useFuriganaDisplay } from '../../app/hooks'
import { Button } from '../../components/Button'
import { KoreanText } from '../../components/KoreanText'
import { SpeakButton } from '../../components/SpeakButton'
import { SpeechNotice } from '../../components/SpeechNotice'
import { Translation } from '../../components/Translation'
import { findGrammar, findVocab } from '../../data'
import type { Grammar, Vocab } from '../../data/types'
import type { FuriganaDisplay } from '../../learning/furigana/furigana'

type Card = { kind: 'vocab'; vocab: Vocab } | { kind: 'grammar'; grammar: Grammar }

function VocabCard({ vocab, display }: { vocab: Vocab; display: FuriganaDisplay }) {
  return (
    <article className="card learn-card">
      <p className="learn-card__kind">単語</p>
      <div className="ko-row">
        <KoreanText korean={vocab.korean} reading={vocab.pronunciation} display={display} className="learn-card__word" />
        <SpeakButton text={vocab.korean} />
      </div>
      <p className="learn-card__ja">{vocab.japanese}</p>
      {vocab.example !== undefined && vocab.examplePronunciation !== undefined && (
        <div className="learn-card__example">
          <p className="muted small">例文</p>
          <div className="ko-row">
            <KoreanText korean={vocab.example} reading={vocab.examplePronunciation} display={display} />
            <SpeakButton text={vocab.example} />
          </div>
          {vocab.exampleJapanese !== undefined && <Translation text={vocab.exampleJapanese} className="muted" />}
        </div>
      )}
    </article>
  )
}

function GrammarCard({ grammar, display }: { grammar: Grammar; display: FuriganaDisplay }) {
  return (
    <article className="card learn-card">
      <p className="learn-card__kind">文法</p>
      <h2 className="learn-card__title" lang="ko">
        {grammar.title}
      </h2>
      <p>{grammar.explanation}</p>
      {grammar.connectionJa !== undefined && (
        <div className="learn-card__connection">
          <p className="muted small">つなげ方</p>
          <p>{grammar.connectionJa}</p>
        </div>
      )}
      <ul className="learn-card__examples">
        {grammar.examples.map((ex) => (
          <li key={ex.korean}>
            <div className="ko-row">
              <KoreanText korean={ex.korean} reading={ex.pronunciation} display={display} />
              <SpeakButton text={ex.korean} />
            </div>
            <Translation text={ex.japanese} className="muted" />
          </li>
        ))}
      </ul>
    </article>
  )
}

export function LearnStep({ vocabulary, grammar, chapter }: { vocabulary: readonly string[]; grammar: readonly string[]; chapter: number }) {
  const { dispatch } = useGame()
  const display = useFuriganaDisplay(chapter)
  const [index, setIndex] = useState(0)

  const cards: Card[] = [
    ...vocabulary.flatMap((id): Card[] => {
      const vocab = findVocab(id)
      return vocab === undefined ? [] : [{ kind: 'vocab', vocab }]
    }),
    ...grammar.flatMap((id): Card[] => {
      const g = findGrammar(id)
      return g === undefined ? [] : [{ kind: 'grammar', grammar: g }]
    }),
  ]
  const card = cards[index]
  const last = index >= cards.length - 1

  return (
    <>
      <p className="step-heading">
        覚えよう（{Math.min(index + 1, cards.length)} / {cards.length}）
      </p>
      <SpeechNotice />
      {card?.kind === 'vocab' && <VocabCard key={card.vocab.id} vocab={card.vocab} display={display} />}
      {card?.kind === 'grammar' && <GrammarCard key={card.grammar.id} grammar={card.grammar} display={display} />}
      <div className="nav-row">
        <Button onClick={() => setIndex((i) => Math.max(0, i - 1))} disabled={index === 0}>
          前へ
        </Button>
        {last ? (
          <Button variant="primary" onClick={() => dispatch({ type: 'learnDone', now: nowIso() })}>
            覚えた！
          </Button>
        ) : (
          <Button variant="primary" onClick={() => setIndex((i) => i + 1)}>
            次へ
          </Button>
        )}
      </div>
    </>
  )
}
