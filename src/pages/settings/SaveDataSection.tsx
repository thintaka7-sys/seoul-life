import { useSyncExternalStore } from 'react'
import { useGame } from '../../app/GameContext'
import { formatDateTime } from '../../app/saveSummary'
import { useExportSave } from '../../app/useExportSave'
import { Button } from '../../components/Button'
import { ImportSave } from '../../components/ImportSave'
import { Notice } from '../../components/Notice'
import { getPersistState, subscribePersist, type PersistState } from '../../storage/persist'

const PERSIST_TEXT: Record<PersistState, string> = {
  persisted: 'このブラウザは、保存データを消さない設定になっています。',
  'not-persisted': 'このブラウザは、空き容量が少ないときなどに保存データを消すことがあります。ときどき書き出しておくと安心です。',
  unsupported: 'このブラウザでは、保存データが消されにくいかどうかを確かめられません。ときどき書き出しておくと安心です。',
  checking: '保存データの状態を確かめています…',
}

/** 設定画面の「セーブデータ」：書き出し・読み込み（GAME_SPEC 3-1 G・10-2） */
export function SaveDataSection() {
  const { state } = useGame()
  const persist = useSyncExternalStore(subscribePersist, getPersistState, getPersistState)
  const { exportSave, message, canExport } = useExportSave()
  const save = state.save

  return (
    <fieldset className="field" aria-label="セーブデータ">
      <legend>セーブデータ</legend>
      <p className="muted small">
        遊んだ記録は、このブラウザの中に保存しています。ファイルに書き出しておくと、ブラウザのデータが消えたときや、別のブラウザ・端末で続きを遊ぶときに読み込めます。
      </p>
      <Button onClick={exportSave} disabled={!canExport}>
        ファイルに書き出す
      </Button>
      <p className="muted small" data-testid="last-export">
        {save === null
          ? 'まだセーブデータがありません。'
          : state.settings.lastExportAt === null
            ? 'まだ書き出していません。'
            : `最後に書き出した日時：${formatDateTime(state.settings.lastExportAt)}`}
      </p>
      {message !== null && <Notice tone={message.tone}>{message.text}</Notice>}
      <ImportSave />
      <p className="muted small">{PERSIST_TEXT[persist]}</p>
    </fieldset>
  )
}
