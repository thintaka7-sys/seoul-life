// PWA の状態（GAME_SPEC 10-6。Phase 4）：新しい版があるか・ホーム画面に追加できるか。
// 登録（Service Worker）は register.ts。ここはブラウザの外でもテストできるように、状態と判断だけを持つ。

export type InstallGuide =
  /** ホーム画面から開いている */
  | 'standalone'
  /** iPhone・iPad：共有ボタンから「ホーム画面に追加」（ボタンでは追加できない） */
  | 'ios'
  /** ブラウザが追加の確認を出せる（Android の Chrome など）。「ホーム画面に追加」のボタンを出す */
  | 'prompt'
  /** そのほか：ブラウザのメニューから */
  | 'other'

export interface DeviceInfo {
  standalone: boolean
  userAgent: string
  platform: string
  maxTouchPoints: number
  canPrompt: boolean
}

/** iPhone・iPad か（iPad は Mac と名乗ることがあるので、指で操作できるかでも見分ける） */
export function isIos(d: Pick<DeviceInfo, 'userAgent' | 'platform' | 'maxTouchPoints'>): boolean {
  return /iPhone|iPad|iPod/.test(d.userAgent) || (d.platform === 'MacIntel' && d.maxTouchPoints > 1)
}

export function installGuide(d: DeviceInfo): InstallGuide {
  if (d.standalone) return 'standalone'
  if (isIos(d)) return 'ios'
  return d.canPrompt ? 'prompt' : 'other'
}

/** ブラウザの「ホーム画面に追加」の確認（beforeinstallprompt の event） */
export interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

interface PwaState {
  /** 新しい版を受け取り、更新を待っている */
  updateReady: boolean
  /** ブラウザが追加の確認を出せる */
  canPrompt: boolean
}

let state: PwaState = { updateReady: false, canPrompt: false }
let applyUpdateFn: (() => void) | null = null
let installEvent: InstallPromptEvent | null = null
const listeners = new Set<() => void>()

function set(next: Partial<PwaState>) {
  state = { ...state, ...next }
  for (const l of listeners) l()
}

export function getPwaState(): PwaState {
  return state
}

export function subscribePwa(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** 新しい版を受け取った（register.ts から）。apply は、更新して読み直す関数 */
export function markUpdateReady(apply: () => void): void {
  applyUpdateFn = apply
  set({ updateReady: true })
}

/** 「更新する」：新しい版に切り替えて読み直す */
export function applyUpdate(): void {
  applyUpdateFn?.()
}

/** ブラウザの追加の確認を受け取った（register.ts から） */
export function setInstallPrompt(event: InstallPromptEvent | null): void {
  installEvent = event
  set({ canPrompt: event !== null })
}

/** 「ホーム画面に追加」：ブラウザの確認を出す。一度しか使えない */
export async function promptInstall(): Promise<boolean> {
  const event = installEvent
  if (event === null) return false
  setInstallPrompt(null)
  await event.prompt()
  return (await event.userChoice).outcome === 'accepted'
}

/** テスト用：状態を最初に戻す */
export function resetPwaStateForTest(): void {
  state = { updateReady: false, canPrompt: false }
  applyUpdateFn = null
  installEvent = null
}

/** ホーム画面から開いているか（ブラウザの外では false） */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  const media = window.matchMedia?.('(display-mode: standalone)').matches ?? false
  return media || (navigator as Navigator & { standalone?: boolean }).standalone === true
}
