// セーブデータをファイルに書き出す（設定画面と、自宅の書き出しの案内から使う。GAME_SPEC 10-2）

import { useState } from 'react'
import { createExport, exportFileName, serializeExport } from '../storage/saveTransfer'
import { nowIso, useGame } from './GameContext'
import { deliverFile } from './saveFile'

export interface ExportMessage {
  tone: 'info' | 'warn'
  text: string
}

export function useExportSave(): { exportSave: () => void; message: ExportMessage | null; canExport: boolean } {
  const { state, dispatch } = useGame()
  const [message, setMessage] = useState<ExportMessage | null>(null)
  const save = state.save
  const settings = state.settings

  function exportSave() {
    if (save === null) return
    const now = new Date()
    const text = serializeExport(createExport(save, settings, now.toISOString()))
    // 共有シートは操作の最中にしか出せないので、await をはさまずに deliverFile を呼ぶ
    void deliverFile(text, exportFileName(now)).then((outcome) => {
      if (outcome === 'cancelled') {
        setMessage(null)
        return
      }
      if (outcome === 'failed') {
        setMessage({ tone: 'warn', text: 'ファイルを作れませんでした。' })
        return
      }
      dispatch({ type: 'changeSettings', settings: { ...settings, lastExportAt: nowIso() } })
      setMessage({
        tone: 'info',
        text:
          outcome === 'shared'
            ? '書き出しました。保存した場所（「ファイル」アプリなど）を覚えておいてください。'
            : '書き出しました。ダウンロードしたファイルを、なくさない場所に移しておいてください。',
      })
    })
  }

  return { exportSave, message, canExport: save !== null }
}
