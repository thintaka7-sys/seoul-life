import type { CSSProperties } from 'react'
import { assets } from '../../data'
import type { CompareItem, Figure as FigureData, FigureLabel } from '../../data/types'
import { splitSyllable } from '../../learning/hangul/jamo'
import { assetUrl } from '../scene/assetUrl'
import { SpeakButton } from '../SpeakButton'
import { FINAL_COLORS as C, FINAL_VIEWBOX as V, finalDiagram, isBuiltInFigure, type BuiltInFigure } from './finalDiagram'

/** パッチムで止める位置の図（画面の作りで描く。絵柄は「息の出方」の絵に合わせる） */
function FinalDiagram({ kind }: { kind: BuiltInFigure }) {
  const d = finalDiagram(kind)
  const tooth = (r: { x: number; y: number; w: number; h: number }) => <rect x={r.x} y={r.y} width={r.w} height={r.h} rx={3} fill={C.teeth} stroke={C.line} strokeWidth={2} />
  return (
    <svg className="figure__svg" viewBox={`0 0 ${V.width} ${V.height}`} aria-hidden="true">
      <rect width={V.width} height={V.height} fill={C.background} />
      <path d={d.face} fill={C.skin} stroke={C.line} strokeWidth={3.5} strokeLinejoin="round" />
      <path d={d.cavity} fill={C.cavity} />
      {tooth(d.upperTooth)}
      {tooth(d.lowerTooth)}
      <path d={d.tongue} fill={C.tongue} stroke={C.line} strokeWidth={3} strokeLinejoin="round" />
      <path d={d.palate} fill="none" stroke={C.line} strokeWidth={3} strokeLinecap="round" />
      <path d={d.upperLip} fill={C.lips} stroke={C.line} strokeWidth={2.5} strokeLinejoin="round" />
      <path d={d.lowerLip} fill={C.lips} stroke={C.line} strokeWidth={2.5} strokeLinejoin="round" />
      <circle cx={d.eye.cx} cy={d.eye.cy} r={4} fill={C.line} />
      <circle cx={d.highlight.cx} cy={d.highlight.cy} r={d.highlight.r} fill="none" stroke={C.highlight} strokeWidth={3} strokeDasharray="5 4" />
    </svg>
  )
}

/** 絵のキーの絵（画面の作りで描く図か、加工済みの画像）。どちらもなければ null */
function FigureArt({ image, labels = [] }: { image: string; labels?: readonly FigureLabel[] }) {
  const picture = assets.figures[image]
  const art = isBuiltInFigure(image) ? (
    <FinalDiagram kind={image} />
  ) : picture !== undefined ? (
    <img className="figure__img" src={assetUrl(picture.src)} width={picture.width} height={picture.height} alt="" decoding="async" />
  ) : null
  if (art === null) {
    // 絵がまだないときは、札だけを並べる（CONTENT_FORMAT 23-2）
    return labels.length === 0 ? null : (
      <ul className="figure__label-list">
        {labels.map((l, i) => (
          <li key={i}>{l.textJa}</li>
        ))}
      </ul>
    )
  }
  return (
    <div className="figure__art">
      {art}
      {labels.map((l, i) => (
        <span key={i} className={`figure__label${l.arrow === undefined ? '' : ` figure__label--${l.arrow}`}`} style={{ left: `${l.x}%`, top: `${l.y}%` } as CSSProperties}>
          {l.textJa}
        </span>
      ))}
    </div>
  )
}

/** 部品 → くっついた形（result が null なら「？」。問題で使う） */
export function FormationFigure({ parts, result, resultPronunciation, noteJa }: { parts: readonly string[]; result: string | null; resultPronunciation?: string; noteJa?: string }) {
  return (
    <div className="figure figure--formation">
      <p className="formation" aria-label={`${parts.join(' と ')} をくっつけると ${result ?? '？'}`}>
        {parts.map((p, i) => (
          <span key={i} className="formation__group">
            {i > 0 && (
              <span className="formation__op" aria-hidden="true">
                ＋
              </span>
            )}
            <span className="formation__part" lang="ko">
              {p}
            </span>
          </span>
        ))}
        <span className="formation__op" aria-hidden="true">
          →
        </span>
        <span className={`formation__result${result === null ? ' formation__result--unknown' : ''}`} lang={result === null ? undefined : 'ko'}>
          {result ?? '？'}
        </span>
        {result !== null && <SpeakButton text={result} />}
      </p>
      {resultPronunciation !== undefined && result !== null && <p className="muted small formation__reading">{resultPronunciation}</p>}
      {noteJa !== undefined && <p className="figure__caption">{noteJa}</p>}
    </div>
  )
}

/** 1音節を、子音・母音・パッチムのマスに分けて見せる（並び方は、母音の形で決める） */
function SyllableFigure({ korean, noteJa }: { korean: string; noteJa?: string }) {
  const s = splitSyllable(korean)
  if (s === null) return null
  // 縦長の母音（ㅏ など）は子音の右、横長の母音（ㅗ など）は子音の下、組み合わせた母音（ㅘ など）は両方
  const VERTICAL = 'ㅏㅐㅑㅒㅓㅔㅕㅖㅣ'
  const HORIZONTAL = 'ㅗㅛㅜㅠㅡ'
  const layout = VERTICAL.includes(s.medial) ? 'side' : HORIZONTAL.includes(s.medial) ? 'below' : 'both'
  return (
    <div className="figure figure--syllable">
      <div className="syllable-figure">
        <span className="syllable-figure__whole" lang="ko">
          {korean}
        </span>
        <span className="formation__op" aria-hidden="true">
          ＝
        </span>
        <div className={`syllable-grid syllable-grid--${layout}${s.final === null ? '' : ' syllable-grid--final'}`}>
          <span className="syllable-grid__cell syllable-grid__cell--initial" lang="ko">
            {s.initial}
          </span>
          <span className="syllable-grid__cell syllable-grid__cell--medial" lang="ko">
            {s.medial}
          </span>
          {s.final !== null && (
            <span className="syllable-grid__cell syllable-grid__cell--final" lang="ko">
              {s.final}
            </span>
          )}
        </div>
        <SpeakButton text={korean} />
      </div>
      <ul className="syllable-figure__legend">
        <li className="syllable-figure__key syllable-figure__key--initial">
          子音 <span lang="ko">{s.initial}</span>
        </li>
        <li className="syllable-figure__key syllable-figure__key--medial">
          母音 <span lang="ko">{s.medial}</span>
        </li>
        {s.final !== null && (
          <li className="syllable-figure__key syllable-figure__key--final">
            パッチム <span lang="ko">{s.final}</span>
          </li>
        )}
      </ul>
      {noteJa !== undefined && <p className="figure__caption">{noteJa}</p>}
    </div>
  )
}

function CompareFigure({ items, captionJa }: { items: readonly CompareItem[]; captionJa?: string }) {
  return (
    <div className="figure figure--compare">
      <ul className={`compare compare--${items.length}`}>
        {items.map((item, i) => (
          <li key={i} className={`compare__item${item.image === undefined ? '' : ' compare__item--art'}`}>
            {item.image !== undefined && <FigureArt image={item.image} />}
            <p className="compare__word">
              <span lang="ko">{item.korean}</span>
              <SpeakButton text={item.korean} />
            </p>
            <p className="muted small">{item.pronunciation}</p>
            {item.noteJa !== undefined && <p className="compare__note">{item.noteJa}</p>}
          </li>
        ))}
      </ul>
      {captionJa !== undefined && <p className="figure__caption">{captionJa}</p>}
    </div>
  )
}

/** 図や絵（GAME_SPEC 4-11）。文字・矢印・ハングルは画面の作りで描く */
export function Figure({ figure }: { figure: FigureData }) {
  switch (figure.type) {
    case 'image':
      return (
        <div className="figure figure--image">
          <FigureArt image={figure.image} {...(figure.labels === undefined ? {} : { labels: figure.labels })} />
          {figure.captionJa !== undefined && <p className="figure__caption">{figure.captionJa}</p>}
        </div>
      )
    case 'formation':
      return (
        <FormationFigure
          parts={figure.parts}
          result={figure.result}
          {...(figure.resultPronunciation === undefined ? {} : { resultPronunciation: figure.resultPronunciation })}
          {...(figure.noteJa === undefined ? {} : { noteJa: figure.noteJa })}
        />
      )
    case 'syllable':
      return <SyllableFigure korean={figure.korean} {...(figure.noteJa === undefined ? {} : { noteJa: figure.noteJa })} />
    case 'compare':
      return <CompareFigure items={figure.items} {...(figure.captionJa === undefined ? {} : { captionJa: figure.captionJa })} />
  }
}

/** 図を書いた順に並べる（なければ何も出さない） */
export function Figures({ figures }: { figures: readonly FigureData[] | undefined }) {
  if (figures === undefined || figures.length === 0) return null
  return (
    <div className="figures">
      {figures.map((f, i) => (
        <Figure key={i} figure={f} />
      ))}
    </div>
  )
}
