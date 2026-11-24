// 書き出したセーブデータをファイルとして渡す・選んだファイルを読む（ブラウザの機能。GAME_SPEC 10-2）。
// スマホ（指で操作する端末）では共有シートを出す（iPhone の「ファイルに保存」・AirDrop など）。使えなければダウンロードする。
// 共有は操作の最中にしか出せないので、ボタンを押してから共有を呼ぶまでに await をはさまない。

export type DeliverOutcome = 'shared' | 'downloaded' | 'cancelled' | 'failed'

function download(file: File): DeliverOutcome {
  try {
    const url = URL.createObjectURL(file)
    const a = document.createElement('a')
    a.href = url
    a.download = file.name
    a.rel = 'noopener'
    document.body.append(a)
    a.click()
    a.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 30000)
    return 'downloaded'
  } catch {
    return 'failed'
  }
}

/** ファイルを渡す。共有シートで閉じたら cancelled */
export async function deliverFile(text: string, fileName: string): Promise<DeliverOutcome> {
  const file = new File([text], fileName, { type: 'application/json' })
  const touch = window.matchMedia?.('(pointer: coarse)').matches ?? false
  if (touch && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: fileName })
      return 'shared'
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') return 'cancelled'
      // 共有できなかったときは、ダウンロードを試す
    }
  }
  return download(file)
}

/** 選んだファイルの中身を読む。読めなければ null */
export async function readFileText(file: Blob): Promise<string | null> {
  try {
    return await file.text()
  } catch {
    return null
  }
}
