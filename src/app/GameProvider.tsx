import { useEffect, useReducer, useRef, type ReactNode } from 'react'
import { content } from '../data'
import type { SaveData } from '../storage/saveData'
import { saveGame } from '../storage/saveStore'
import type { BootResult } from './boot'
import { GameContext } from './GameContext'
import { createGameReducer, createInitialState } from './gameState'

const gameReducer = createGameReducer(new Set(content.locations.map((l) => l.id)))

function initState(boot: BootResult) {
  return createInitialState(boot.load, boot.backupKey)
}

export function GameProvider({ boot, children }: { boot: BootResult; children: ReactNode }) {
  const [state, dispatch] = useReducer(gameReducer, boot, initState)

  // 読み込んだままのデータ（移行していないもの）は書き直さない
  const lastSaved = useRef<SaveData | null>(boot.load.kind === 'ok' && boot.load.migratedFrom === null ? boot.load.data : null)

  // セーブデータが変わったら自動で保存する
  useEffect(() => {
    if (state.save === null || state.save === lastSaved.current || boot.storage === null) return
    lastSaved.current = state.save
    const result = saveGame(boot.storage, state.save)
    if (result.ok) dispatch({ type: 'saveSucceeded' })
    else dispatch({ type: 'saveFailed', message: result.detail })
  }, [state.save, boot.storage])

  return <GameContext.Provider value={{ state, dispatch }}>{children}</GameContext.Provider>
}
