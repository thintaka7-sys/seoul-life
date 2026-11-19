import { findCharacter } from '../../data'
import { PLAYER_SPEAKER_ID } from '../../data/types'
import type { FuriganaDisplay } from '../../learning/furigana/furigana'
import { KoreanText } from '../KoreanText'

/** 話す人の名前の札。名前のあるキャラクターは韓国語の名前（フリガナつき）と役割、主人公は「あなた」 */
export function NamePlate({ speaker, display }: { speaker: string; display: FuriganaDisplay }) {
  if (speaker === PLAYER_SPEAKER_ID) return <p className="nameplate nameplate--player">あなた</p>
  const c = findCharacter(speaker)
  if (c?.name === undefined) return <p className="nameplate">{c?.roleJa ?? speaker}</p>
  return (
    <p className="nameplate">
      <KoreanText korean={c.name.korean} reading={c.name.pronunciation} display={display} className="nameplate__name" />
      <span className="nameplate__role">{c.roleJa}</span>
    </p>
  )
}
