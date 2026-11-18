// セーブデータのバージョン移行。
// MIGRATIONS[n] は「バージョン n のデータ」を「バージョン n+1 のデータ」に変換する。
// 形式を変えるたびに1つずつ追加し、古いものは消さない（何世代前のデータからでも順に移行できるようにする）。

export type SaveObject = Record<string, unknown>
export type Migration = (data: SaveObject) => SaveObject
export type MigrationTable = Readonly<Record<number, Migration>>

function isObj(v: unknown): v is SaveObject {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** 本番の移行表 */
export const MIGRATIONS: MigrationTable = {
  // v1（Phase 0）→ v2（Phase 1）：いた場所だけを引き継ぎ、進行・学習記録・経験値は空から始める
  1: (d) => {
    const progress = isObj(d['progress']) ? d['progress'] : {}
    return {
      version: 2,
      createdAt: d['createdAt'],
      updatedAt: d['updatedAt'],
      progress: {
        currentLocationId: progress['currentLocationId'] ?? null,
        completedEvents: [],
        activeEvent: null,
      },
      learning: { words: {}, grammar: {}, conversations: {} },
      stats: { xp: 0 },
    }
  },
}

export type MigrateResult =
  | { ok: true; data: SaveObject; from: number }
  | { ok: false; reason: 'invalid_shape' | 'newer_version' | 'migration_failed'; detail: string }

function readVersion(data: SaveObject): number | null {
  const v = data['version']
  return typeof v === 'number' && Number.isInteger(v) && v >= 1 ? v : null
}

/** version を見て、targetVersion まで順に移行する。例外は投げない */
export function migrate(data: SaveObject, table: MigrationTable, targetVersion: number): MigrateResult {
  const from = readVersion(data)
  if (from === null) return { ok: false, reason: 'invalid_shape', detail: 'version がないか、正しい数値ではありません' }
  if (from > targetVersion) {
    return { ok: false, reason: 'newer_version', detail: `新しいバージョン（v${from}）のセーブデータです。このゲームが読めるのは v${targetVersion} までです` }
  }

  let current = data
  for (let v = from; v < targetVersion; v++) {
    const step = table[v]
    if (step === undefined) return { ok: false, reason: 'migration_failed', detail: `v${v} から v${v + 1} への移行処理がありません` }
    try {
      current = step(current)
    } catch (e) {
      return { ok: false, reason: 'migration_failed', detail: `v${v} から v${v + 1} への移行中にエラー：${String(e)}` }
    }
    if (readVersion(current) !== v + 1) {
      return { ok: false, reason: 'migration_failed', detail: `v${v} からの移行結果のバージョンが v${v + 1} になっていません` }
    }
  }
  return { ok: true, data: current, from }
}
