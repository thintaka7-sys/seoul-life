// テーマカラーの上に載せる文字の色を決める（読みやすさの基準：WCAG のコントラスト比）。

/** 濃い文字の色（ほぼ黒の焦げ茶） */
export const DARK_TEXT = '#1A1410'
export const LIGHT_TEXT = '#FFFFFF'

function channel(hex: string, start: number): number {
  const v = parseInt(hex.slice(start, start + 2), 16) / 255
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
}

/** 相対輝度（#RRGGBB） */
export function relativeLuminance(hex: string): number {
  return 0.2126 * channel(hex, 1) + 0.7152 * channel(hex, 3) + 0.0722 * channel(hex, 5)
}

/** 2色のコントラスト比（1〜21） */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x)
  return ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05)
}

/** 背景色の上で読みやすい文字の色（白か濃い色のうち、コントラスト比が高い方） */
export function readableTextOn(background: string): string {
  return contrastRatio(background, LIGHT_TEXT) >= contrastRatio(background, DARK_TEXT) ? LIGHT_TEXT : DARK_TEXT
}
