import { useGame } from '../app/GameContext'
import { useFuriganaDisplay } from '../app/hooks'
import { Button } from '../components/Button'
import { KoreanText } from '../components/KoreanText'
import { ScreenLayout } from '../components/ScreenLayout'
import { SpeakButton } from '../components/SpeakButton'
import { SpeechNotice } from '../components/SpeechNotice'
import { content } from '../data'
import type { Vocab } from '../data/types'

function WordEntry({ vocab, chapter }: { vocab: Vocab; chapter: number }) {
  const display = useFuriganaDisplay(chapter)
  return (
    <li className="card dict-entry">
      <div className="ko-row">
        <KoreanText korean={vocab.korean} reading={vocab.pronunciation} display={display} className="dict-entry__word" />
        <SpeakButton text={vocab.korean} />
      </div>
      <p className="dict-entry__ja">{vocab.japanese}</p>
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

/** 覚えた単語の一覧（図鑑）。教材ファイルの順に並べる */
export function DictionaryList() {
  const { state } = useGame()
  const words = state.save?.learning.words ?? {}
  const learned = content.vocabulary.flatMap((v) => {
    const record = words[v.id]
    return record === undefined ? [] : [{ vocab: v, chapter: record.chapter }]
  })

  return (
    <>
      <p className="dict-count">
        覚えた単語：{learned.length} / {content.vocabulary.length} 語
      </p>
      <SpeechNotice />
      {learned.length === 0 ? (
        <p>まだ覚えた単語はありません。</p>
      ) : (
        <ul className="dict-list">
          {learned.map(({ vocab, chapter }) => (
            <WordEntry key={vocab.id} vocab={vocab} chapter={chapter} />
          ))}
        </ul>
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
