import { useState } from 'react'
import { useGame } from '../app/GameContext'
import { useExportSave } from '../app/useExportSave'
import { isExportReminderDue } from '../storage/saveTransfer'
import { Button } from './Button'
import { Notice } from './Notice'

/** 「あとで」を押したら、ページを開き直すまで出さない（保存しない） */
let snoozed = false

/**
 * 書き出しの案内（GAME_SPEC 10-2。Phase 4 計画 Q9）。自宅に出す。
 * 進んだデータがあり、最後に書き出してから（まだなら遊び始めてから）14日以上たったとき
 */
export function ExportReminder() {
  const { state } = useGame()
  const { exportSave, message } = useExportSave()
  const [hidden, setHidden] = useState(snoozed)
  // 案内するかは、画面を開いたときの時刻で決める（描画のたびに時刻を読まない）
  const [openedAt] = useState(() => new Date())
  const save = state.save
  if (message !== null) return <Notice tone={message.tone}>{message.text}</Notice>
  if (hidden || save === null || !isExportReminderDue(save, state.settings.lastExportAt, openedAt)) return null

  return (
    <Notice tone="info">
      <p>
        {state.settings.lastExportAt === null ? 'セーブデータを、まだファイルに書き出していません。' : '最後にセーブデータを書き出してから、2週間以上たちました。'}
        ブラウザのデータが消えたときのために、書き出しておきませんか？
      </p>
      <div className="notice__buttons">
        <Button variant="primary" onClick={exportSave}>
          書き出す
        </Button>
        <Button
          onClick={() => {
            snoozed = true
            setHidden(true)
          }}
        >
          あとで
        </Button>
      </div>
    </Notice>
  )
}
