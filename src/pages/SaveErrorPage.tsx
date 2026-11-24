import { useGame, nowIso } from '../app/GameContext'
import { Button } from '../components/Button'
import { ImportSave } from '../components/ImportSave'
import { Notice } from '../components/Notice'
import { ScreenLayout } from '../components/ScreenLayout'
import type { CorruptReason } from '../storage/saveStore'

const REASON_TEXT: Record<CorruptReason, string> = {
  parse_error: 'セーブデータが壊れていて読めません。',
  invalid_shape: 'セーブデータの形が正しくありません。',
  newer_version: 'このゲームより新しいバージョンで保存されたデータです。ページを再読み込みすると、新しいバージョンで開ける場合があります。',
  migration_failed: '古いセーブデータを、新しい形式に変換できませんでした。',
}

interface SaveErrorPageProps {
  reason: CorruptReason
  detail: string
  backupKey: string | null
}

export function SaveErrorPage({ reason, detail, backupKey }: SaveErrorPageProps) {
  const { dispatch } = useGame()

  function startNew() {
    if (backupKey === null && !window.confirm('元のデータを残せていません。新しく始めると、元のデータは上書きされて消えます。よろしいですか？')) return
    dispatch({ type: 'startNew', now: nowIso() })
  }

  return (
    <ScreenLayout
      title="セーブデータを読み込めませんでした"
      footer={
        <>
          <Button variant="primary" onClick={startNew}>
            新しく始める
          </Button>
          <Button onClick={() => dispatch({ type: 'backToTitle' })}>タイトルへ</Button>
        </>
      }
    >
      <p>{REASON_TEXT[reason]}</p>
      <p className="muted small">詳しい理由：{detail}</p>
      {backupKey !== null ? (
        <Notice>
          元のデータは、このブラウザの保存領域に「<code className="break">{backupKey}</code>」という名前で残してあります。新しく始めても消えません。
        </Notice>
      ) : (
        <Notice tone="warn">元のデータを別の場所に残せませんでした（保存容量が足りない可能性があります）。新しく始めると、元のデータは上書きされます。</Notice>
      )}
      <section className="panel" aria-label="書き出したファイルから読み込む">
        <p className="small">セーブデータをファイルに書き出していれば、そのファイルから続きを遊べます。</p>
        <ImportSave />
      </section>
    </ScreenLayout>
  )
}
