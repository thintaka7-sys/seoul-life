// パッチムで止める位置の図（舌の奥・舌先・唇）の形。顔を右向きに切った断面（口の中が見える）を、SVG の線で描く。
// 絵柄は「息の出方」の絵（docs/ART_GUIDE.md 4-3）に合わせる：太めのなめらかな線、影なし、やわらかい色。
// Gemini の絵では舌や歯の形が正しくならなかったため、画像を使わずに描く（2026-11-23 の開発者の指示）。

/** 画面の作りで描く図の絵のキー（図の image に書ける。画像のファイルはいらない） */
export const BUILT_IN_FIGURES = ['final_back', 'final_tip', 'final_lips'] as const
export type BuiltInFigure = (typeof BUILT_IN_FIGURES)[number]

export function isBuiltInFigure(key: string): key is BuiltInFigure {
  return BUILT_IN_FIGURES.some((k) => k === key)
}

export const FINAL_VIEWBOX = { width: 300, height: 240 }

export const FINAL_COLORS = {
  background: '#FFF4E0',
  line: '#5b4636',
  skin: '#fde3cf',
  cavity: '#9c5a5e',
  tongue: '#ef9d9d',
  lips: '#e9918c',
  teeth: '#ffffff',
  highlight: '#e0553a',
}

export interface FinalDiagramShape {
  /** 顔（頭の断面）の外形 */
  face: string
  /** 口の中（上あご・のどの奥・口の底で囲んだところ） */
  cavity: string
  tongue: string
  upperLip: string
  lowerLip: string
  /** 上の歯・下の歯（x, y, 幅, 高さ） */
  upperTooth: { x: number; y: number; w: number; h: number }
  lowerTooth: { x: number; y: number; w: number; h: number }
  /** 上あごの線（口の中との境目をはっきりさせる） */
  palate: string
  /** 止める位置の印（点線の丸） */
  highlight: { cx: number; cy: number; r: number }
  eye: { cx: number; cy: number }
}

/** 上あご（上の歯の裏 → 硬口蓋 → 軟口蓋 → のどびこ） */
const PALATE = 'M238,118 C226,98 192,94 162,99 C142,102 126,108 120,124 C119,129 121,133 124,134'

/** 舌の形（上の面 → 舌の根 → 口の底）。口の底は共通 */
const TONGUE_FLOOR = 'L128,240 L150,240 L150,206 C176,196 214,182 236,152'
const TONGUES: Record<BuiltInFigure, string> = {
  // 舌の奥を上あごの奥（軟口蓋）に付ける。舌先は下の歯の裏
  final_back: `M236,152 C232,142 216,134 197,128 C178,121 162,106 146,103 C132,103 124,118 122,140 C119,166 121,196 128,240 ${TONGUE_FLOOR} Z`,
  // 舌先を上の歯の裏の歯ぐきに付ける
  final_tip: `M231,110 C223,113 205,122 185,126 C160,130 136,131 126,146 C119,162 121,194 128,240 ${TONGUE_FLOOR} C239,140 237,120 231,110 Z`,
  // 舌は休めたまま、唇を閉じる
  final_lips: `M236,152 C232,140 216,130 191,128 C162,126 137,130 127,146 C119,162 121,194 128,240 ${TONGUE_FLOOR} Z`,
}

const HIGHLIGHTS: Record<BuiltInFigure, { cx: number; cy: number; r: number }> = {
  final_back: { cx: 146, cy: 103, r: 16 },
  final_tip: { cx: 232, cy: 110, r: 14 },
  final_lips: { cx: 256, cy: 129, r: 15 },
}

/** 図の形。唇を閉じる図だけ、唇のすき間をなくす */
export function finalDiagram(kind: BuiltInFigure): FinalDiagramShape {
  const gap = kind === 'final_lips' ? 0 : 8
  const lower = (y: number) => y + gap
  const face = [
    'M60,18 C110,4 180,4 215,12',
    'C228,30 246,56 260,78',
    'C259,86 252,91 245,92',
    'C252,100 260,108 258,116',
    'C258,121 256,125 251,127',
    ...(gap === 0 ? [] : ['L247,128', `L247,${lower(128)}`]),
    `L251,${lower(129)}`,
    `C258,${lower(132)} 261,${lower(141)} 247,${lower(151)}`,
    `C251,${lower(162)} 257,${lower(176)} 248,${lower(188)}`,
    'C232,198 206,200 190,200',
    'C182,212 178,226 176,240',
    'L40,240 C22,200 14,140 22,90 C30,50 40,28 60,18 Z',
  ].join(' ')
  return {
    face,
    cavity: `M238,118 C226,98 192,94 162,99 C142,102 120,102 106,106 L106,240 L150,240 L150,206 C176,196 214,182 236,152 L248,${lower(130)} L248,126 Z`,
    tongue: TONGUES[kind],
    upperLip: 'M246,100 C254,104 259,111 258,117 C257,122 254,126 249,127 L240,127 Z',
    lowerLip: `M240,${lower(129)} L249,${lower(129)} C256,${lower(131)} 260,${lower(138)} 257,${lower(144)} C253,${lower(149)} 246,${lower(150)} 240,${lower(148)} Z`,
    upperTooth: { x: 229, y: 110, w: 11, h: 17 },
    lowerTooth: { x: 228, y: lower(130), w: 11, h: 15 },
    palate: PALATE,
    highlight: HIGHLIGHTS[kind],
    eye: { cx: 214, cy: 52 },
  }
}
