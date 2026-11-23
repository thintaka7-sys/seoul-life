import { FORM_KIND_LABELS, type Vocab } from '../data/types'
import { FormationFigure } from './figures/Figure'
import { KoreanText } from './KoreanText'
import { SpeakButton } from './SpeakButton'
import type { FuriganaDisplay } from '../learning/furigana/furigana'

/**
 * 形が変わる言葉（GAME_SPEC 4-3）：元の形と、よく出る形を「部品 → くっついた形」の図で並べる。
 * 単語カードと図鑑で使う。base も forms もなければ何も出さない
 */
export function VocabForms({ vocab, display }: { vocab: Vocab; display: FuriganaDisplay }) {
  const forms = vocab.forms ?? []
  if (vocab.base === undefined && forms.length === 0) return null
  return (
    <section className="vocab-forms" aria-label="形が変わる言葉">
      {vocab.base !== undefined && (
        <div className="vocab-forms__base">
          <p className="muted small">元の形（辞書の形）</p>
          <div className="ko-row">
            <KoreanText korean={vocab.base.korean} reading={vocab.base.pronunciation} display={display} />
            <SpeakButton text={vocab.base.korean} />
            {vocab.base.japanese !== undefined && <span className="muted small">＝{vocab.base.japanese}</span>}
          </div>
        </div>
      )}
      {forms.length > 0 && (
        <ul className="vocab-forms__list">
          {forms.map((f) => (
            <li key={f.korean}>
              <p className="muted small">{FORM_KIND_LABELS[f.kind]}</p>
              <FormationFigure parts={f.parts} result={f.korean} resultPronunciation={f.pronunciation} {...(f.noteJa === undefined ? {} : { noteJa: f.noteJa })} />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
