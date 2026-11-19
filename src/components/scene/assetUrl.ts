/** 画像の一覧の src（public/ からの相対パス）を、公開先のURLにする（GitHub Pages では /seoul-life/ の下） */
export function assetUrl(src: string): string {
  return `${import.meta.env.BASE_URL}${src}`
}
