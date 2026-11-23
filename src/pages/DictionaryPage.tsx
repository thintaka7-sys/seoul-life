import { useState } from 'react'
import { useGame } from '../app/GameContext'
import { useFuriganaDisplay } from '../app/hooks'
import { Button } from '../components/Button'
import { KoreanText } from '../components/KoreanText'
import { ScreenLayout } from '../components/ScreenLayout'
import { SpeakButton } from '../components/SpeakButton'
import { SpeechNotice } from '../components/SpeechNotice'
import { VocabForms } from '../components/VocabForms'
import { content } from '../data'
import { GENRE_LABELS, PART_OF_SPEECH_LABELS, PARTS_OF_SPEECH, VOCAB_GENRES, type PartOfSpeech, type Vocab, type VocabGenre } from '../data/types'
import { isMastered, reviewKey } from '../learning/review/review'

/** 習得状況（GAME_SPEC 7-4）。seen は、おはなしなどでタップして「覚える」を押した単語（見かけた単語。4-8） */
type Status = 'reviewing' | 'mastered' | 'seen'
type StatusFilter = 'all' | Status

const STATUS_LABELS: Record<StatusFilter, string> = { all: 'すべて', reviewing: '復習中', mastered: '覚えた', seen: '見かけた' }

function WordEntry({ vocab, chapter, status }: { vocab: Vocab; chapter: number; status: Status }) {
  const display = useFuriganaDisplay(chapter)
  return (
    <li className="card dict-entry">
      <div className="ko-row">
        <KoreanText korean={vocab.korean} reading={vocab.pronunciation} display={display} className="dict-entry__word" />
        <SpeakButton text={vocab.korean} />
        <span className={`dict-status dict-status--${status}`}>{STATUS_LABELS[status]}</span>
      </div>
      <p className="dict-entry__ja">{vocab.japanese}</p>
      {(vocab.base !== undefined || (vocab.forms?.length ?? 0) > 0) && (
        <details className="dict-entry__forms">
          <summary>形が変わる言葉</summary>
          <VocabForms vocab={vocab} display={display} />
        </details>
      )}
      {vocab.example !== undefined && vocab.examplePronunciation !== undefined && (
        <div className="dict-entry__example">
          <div className="ko-row">
            <KoreanText korean={vocab.example} reading={vocab.examplePronunciation} display={display} />
            <SpeakButton text={vocab.example} />
          </div>
          <p className="muted small">{vocab.exampleJapanese}</p>
        </div>
      )}
    </li>
  )
}

/** 学んだ単語の一覧（図鑑）。ジャンルのタブと、習得状況・品詞で絞り込む。教材ファイルの順に並べる */
export function DictionaryList() {
  const { state } = useGame()
  const words = state.save?.learning.words ?? {}
  const seen = state.save?.learning.seen ?? {}
  const review = state.save?.learning.review ?? {}
  const [genre, setGenre] = useState<'all' | VocabGenre>('all')
  const [status, setStatus] = useState<StatusFilter>('all')
  const [pos, setPos] = useState<'all' | PartOfSpeech>('all')

  const learned = content.vocabulary.flatMap((v) => {
    const record = words[v.id]
    const seenRecord = seen[v.id]
    if (record === undefined && seenRecord === undefined) return []
    const r = review[reviewKey('word', v.id)]
    const s: Status = r !== undefined && isMastered(r, content.balance.review) ? 'mastered' : record === undefined ? 'seen' : 'reviewing'
    return [{ vocab: v, chapter: record?.chapter ?? seenRecord?.chapter ?? 1, status: s }]
  })
  const statuses: Status[] = ['reviewing', 'mastered', ...(learned.some((w) => w.status === 'seen') ? (['seen'] as const) : [])]
  const genres = VOCAB_GENRES.filter((g) => learned.some((w) => w.vocab.genre === g))
  const parts = PARTS_OF_SPEECH.filter((p) => learned.some((w) => w.vocab.partOfSpeech === p))
  const shown = learned.filter((w) => (genre === 'all' || w.vocab.genre === genre) && (status === 'all' || w.status === status) && (pos === 'all' || w.vocab.partOfSpeech === pos))
  const masteredCount = learned.filter((w) => w.status === 'mastered').length
  const seenCount = learned.filter((w) => w.status === 'seen').length

  return (
    <>
      <p className="dict-count">
        学んだ単語：{learned.length - seenCount} / {content.vocabulary.length} 語（覚えた：{masteredCount} 語）{seenCount > 0 && `・見かけた単語：${seenCount} 語`}
      </p>
      <SpeechNotice />
      {learned.length === 0 ? (
        <p>まだ学んだ単語はありません。</p>
      ) : (
        <>
          <div className="panel dict-filters">
            <div className="chips" role="group" aria-label="ジャンル">
              {(['all', ...genres] as const).map((g) => (
                <button key={g} type="button" className="chip" aria-pressed={genre === g} onClick={() => setGenre(g)}>
                  {g === 'all' ? 'すべて' : GENRE_LABELS[g]}
                  <span className="chip__count">{g === 'all' ? learned.length : learned.filter((w) => w.vocab.genre === g).length}</span>
                </button>
              ))}
            </div>
            <div className="dict-filters__row">
              <div className={`mode-tabs mode-tabs--${statuses.length + 1}`} role="group" aria-label="習得状況">
                {(['all', ...statuses] as const).map((s) => (
                  <button key={s} type="button" className="mode-tab" aria-pressed={status === s} onClick={() => setStatus(s)}>
                    {STATUS_LABELS[s]}
                  </button>
                ))}
              </div>
              <label className="dict-filters__select">
                <span className="visually-hidden">品詞</span>
                <select value={pos} onChange={(e) => setPos(e.target.value === 'all' ? 'all' : (parts.find((p) => p === e.target.value) ?? 'all'))}>
                  <option value="all">品詞：すべて</option>
                  {parts.map((p) => (
                    <option key={p} value={p}>
                      {PART_OF_SPEECH_LABELS[p]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
          {shown.length === 0 ? (
            <p className="panel-text">この条件に合う単語はありません。</p>
          ) : (
            <ul className="dict-list">
              {shown.map(({ vocab, chapter, status: s }) => (
                <WordEntry key={vocab.id} vocab={vocab} chapter={chapter} status={s} />
              ))}
            </ul>
          )}
        </>
      )}
    </>
  )
}

export function DictionaryPage() {
  const { dispatch } = useGame()
  return (
    <ScreenLayout title="単語図鑑" footer={<Button onClick={() => dispatch({ type: 'closeDictionary' })}>閉じる</Button>}>
      <DictionaryList />
    </ScreenLayout>
  )
}
