import { useRef, useState, type ChangeEvent } from 'react'
import { useGame } from '../app/GameContext'
import { readFileText } from '../app/saveFile'
import { formatDateTime, summarizeSave } from '../app/saveSummary'
import { content } from '../data'
import { backupCurrentSave } from '../storage/saveStore'
import { parseExport, type ImportFailure, type ImportResult } from '../storage/saveTransfer'
import { Button } from './Button'
import { Notice } from './Notice'

const NEWER = '新しい版のゲームで書き出したファイルです。ページを読み直して（「新しい版があります」が出ていれば「更新する」を押して）から、もう一度お試しください。'

const FAILURE_TEXT: Record<ImportFailure, string> = {
  parse_error: 'ファイルが壊れていて読めません。',
  not_export: 'このゲームで書き出したファイルではないようです。',
  newer_export: NEWER,
  newer_version: NEWER,
  invalid_shape: 'セーブデータの形が正しくありません。',
  migration_failed: '古いセーブデータを、新しい形式に変換できませんでした。',
}

type Ready = Extract<ImportResult, { ok: true }>

/**
 * 書き出したファイルからセーブデータを読み込む（GAME_SPEC 10-2）。
 * ファイルを選ぶと中身を確かめて要約を出し、「上書きする」で置き換える。上書きの前に、いまのデータをこのブラウザに退避する
 */
export function ImportSave() {
  const { state, dispatch, storage } = useGame()
  const input = useRef<HTMLInputElement>(null)
  const [ready, setReady] = useState<Ready | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    // 同じファイルを選び直しても、もう一度読めるように
    e.target.value = ''
    if (file === undefined) return
    setReady(null)
    const text = await readFileText(file)
    if (text === null) {
      setError('ファイルを読めませんでした。')
      return
    }
    const result = parseExport(text, state.settings)
    if (!result.ok) {
      setError(`${FAILURE_TEXT[result.reason]}（${result.detail}）`)
      return
    }
    setError(null)
    setReady(result)
  }

  function overwrite() {
    if (ready === null) return
    if (storage !== null) {
      const backup = backupCurrentSave(storage, new Date())
      const message = 'いまのセーブデータを、このブラウザに残せませんでした（保存容量が足りない可能性があります）。上書きすると、いまのデータは消えます。よろしいですか？'
      if (backup.existed && backup.key === null && !window.confirm(message)) return
    }
    dispatch({ type: 'importSave', save: ready.save, settings: ready.settings, exportedAt: ready.exportedAt })
  }

  const summary = ready === null ? null : summarizeSave(ready.save, content.chapters, content.events)

  return (
    <div className="import-save">
      <input
        ref={input}
        type="file"
        accept="application/json,.json"
        className="visually-hidden"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => void onFile(e)}
        data-testid="import-file"
      />
      <Button onClick={() => input.current?.click()}>ファイルから読み込む</Button>
      {error !== null && <Notice tone="warn">{error}</Notice>}
      {ready !== null && summary !== null && (
        <div className="import-save__confirm" role="group" aria-label="読み込むデータ">
          <p>このデータを読み込みますか？</p>
          <dl className="import-save__summary">
            <dt>書き出した日時</dt>
            <dd>{formatDateTime(ready.exportedAt)}</dd>
            <dt>終えた章</dt>
            <dd>{summary.lastChapter === null ? 'まだありません' : `第${summary.lastChapter.chapter}章「${summary.lastChapter.titleJa}」まで`}</dd>
            <dt>覚えた単語</dt>
            <dd>{summary.words}語</dd>
            <dt>経験値</dt>
            <dd>{summary.xp}</dd>
            <dt>スタンプ</dt>
            <dd>{summary.stamps}個</dd>
          </dl>
          <p className="muted small">
            {state.save === null ? 'このデータで遊び始めます。' : 'いまのセーブデータは、このデータで上書きされます（念のため、いまのデータはこのブラウザの中に残しておきます）。'}
            設定も、書き出したときのものになります（「ゆっくり」の速さなど、この端末で決めた値はそのままです）。
          </p>
          {!state.storageAvailable && <Notice tone="warn">このブラウザでは保存できないため、読み込んでも、ページを閉じると消えます。</Notice>}
          <div className="import-save__buttons">
            <Button variant="primary" onClick={overwrite}>
              {state.save === null ? 'このデータで始める' : 'このデータで上書きする'}
            </Button>
            <Button onClick={() => setReady(null)}>やめる</Button>
          </div>
        </div>
      )}
    </div>
  )
}
