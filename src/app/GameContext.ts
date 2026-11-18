import { createContext, useContext, type Dispatch } from 'react'
import type { GameAction, GameState } from './gameState'

export interface GameContextValue {
  state: GameState
  dispatch: Dispatch<GameAction>
}

export const GameContext = createContext<GameContextValue | null>(null)

export function useGame(): GameContextValue {
  const value = useContext(GameContext)
  if (value === null) throw new Error('useGame は GameProvider の中で使ってください')
  return value
}

/** 画面のイベントから reducer に渡す現在時刻 */
export function nowIso(): string {
  return new Date().toISOString()
}
