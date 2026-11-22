// BGM のつなぎ方の数値と判定（画面なしでテストできる純粋な関数）。

/** 曲の終わりで、次の回（同じ曲の始め）と重ねる長さ（秒） */
export const LOOP_CROSSFADE_SEC = 2.5
/** 場面が変わって曲を切り替えるときに重ねる長さ（秒） */
export const SWITCH_FADE_SEC = 1.2
/** 学習画面では、曲を小さめに流す（読み上げを聞き取りやすくするため。計画 Q10） */
export const STUDY_VOLUME = 0.4
/** 読み上げの間は、BGM をさらに下げる（計画 Q10） */
export const DUCK_VOLUME = 0.35

/** 曲の終わりが近づき、次の回を重ねて始める時刻になったか */
export function loopDue(currentTime: number, duration: number, crossfade = LOOP_CROSSFADE_SEC): boolean {
  return duration > crossfade * 2 && currentTime >= duration - crossfade
}
