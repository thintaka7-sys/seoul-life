// 音の扱いを確かめるための記録（開発者向け。Phase 3 のスマホ確認のため）。
// URL に ?debug=audio を付けて開いたときだけ記録し、画面の端に出す（components/AudioDebugPanel.tsx）。ふだんは何も記録せず、何も出さない。
// iPhone のマナーモードで BGM・効果音が鳴ったときに、音を流し始めた時点の audioSession の扱い（type・state）を見るため。
// ここで見えるのは、このページが指定した値だけ。Safari の中で本当に使われている扱い（前のマイクの影響など）は、ページからは見えない。

export interface SessionSnapshot {
  /** audioSession.type。audioSession がない端末では「なし」 */
  type: string
  /** audioSession.state。ない端末では「-」 */
  state: string
}

export interface AudioDebugEntry extends SessionSnapshot {
  /** ページを開いてからの時間（ミリ秒） */
  at: number
  event: string
  /** BGM・効果音を流し始めた（音の出口を動かした）記録 */
  sound: boolean
}

/** 残しておく記録の数（古いものから消す） */
export const AUDIO_DEBUG_LIMIT = 200

/** URL の検索部分（location.search）に debug=audio があるか */
export function isAudioDebugSearch(search: string): boolean {
  return new URLSearchParams(search).getAll('debug').includes('audio')
}

/**
 * 音を流し始めたのに、ふだんの扱い（ambient）でない記録。マナーモードで鳴ってしまう恐れがある。
 * audioSession がない端末（マナーモードの区別がない）では対象外
 */
export function isSuspicious(entry: AudioDebugEntry): boolean {
  return entry.sound && entry.type !== 'ambient' && entry.type !== 'なし'
}

/** 記録の1行（コピー用） */
export function formatEntry(e: AudioDebugEntry): string {
  return `${isSuspicious(e) ? '!! ' : ''}+${e.at}ms type=${e.type} state=${e.state} ${e.event}`
}

export function createAudioDebugLog(enabled: boolean, now: () => number, snapshot: () => SessionSnapshot, limit = AUDIO_DEBUG_LIMIT) {
  let entries: readonly AudioDebugEntry[] = []
  const listeners = new Set<() => void>()
  return {
    enabled,
    /** 記録する（有効なときだけ）。sound：BGM・効果音を流し始めた */
    log(event: string, sound = false) {
      if (!enabled) return
      const next = [...entries, { at: Math.round(now()), event, sound, ...snapshot() }]
      entries = next.length > limit ? next.slice(next.length - limit) : next
      for (const l of listeners) l()
    },
    /** 記録（新しい記録が増えるたびに、別の配列になる） */
    entries: (): readonly AudioDebugEntry[] => entries,
    subscribe(listener: () => void): () => void {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}

interface SessionLike {
  type?: unknown
  state?: unknown
  addEventListener?: (type: string, listener: () => void) => void
}

function browserSession(): SessionLike | undefined {
  if (typeof navigator === 'undefined') return undefined
  return (navigator as Navigator & { audioSession?: SessionLike }).audioSession
}

/** いまの audioSession の扱い */
export function currentSessionSnapshot(): SessionSnapshot {
  const s = browserSession()
  if (s === undefined) return { type: 'なし', state: '-' }
  return { type: typeof s.type === 'string' ? s.type : '?', state: typeof s.state === 'string' ? s.state : '-' }
}

const debugLog = createAudioDebugLog(
  typeof location !== 'undefined' && isAudioDebugSearch(location.search),
  () => (typeof performance === 'undefined' ? Date.now() : performance.now()),
  currentSessionSnapshot,
)

/** ?debug=audio で開いたか */
export function isAudioDebugEnabled(): boolean {
  return debugLog.enabled
}

/** 記録する（?debug=audio のときだけ。ふだんは何もしない）。sound：BGM・効果音を流し始めた */
export function logAudio(event: string, sound = false): void {
  debugLog.log(event, sound)
}

export const audioDebugEntries = debugLog.entries
export const subscribeAudioDebug = debugLog.subscribe

/** 起動時に1回呼ぶ（音の部品より先に）。開いたときの扱いを記録し、audioSession の state の変化も記録する */
export function initAudioDebug(): void {
  if (!debugLog.enabled) return
  logAudio('ページを開いた（かけ直しの前の値）')
  browserSession()?.addEventListener?.('statechange', () => logAudio('audioSession の state が変わった'))
}
