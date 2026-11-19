import { useEffect, useRef } from 'react'
import type { Character } from '../../data/types'
import type { FuriganaDisplay } from '../../learning/furigana/furigana'
import { Button } from '../Button'
import { KoreanText } from '../KoreanText'
import { Portrait } from '../scene/Portrait'
import { SpeakButton } from '../SpeakButton'
import { characterColors } from './characterColors'

/** 初めて会ったキャラクターの紹介（名前・役割・人となり） */
export function ProfileCard({ character, display, onClose }: { character: Character; display: FuriganaDisplay; onClose: () => void }) {
  const startRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    startRef.current?.focus()
  }, [])

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="profile-title">
      <div className="overlay__panel profile-card" style={characterColors(character.id)}>
        <p className="profile-card__label">はじめて会う人</p>
        <div className="profile-card__portrait">
          <Portrait characterId={character.id} expression="smile" />
        </div>
        <h2 id="profile-title" className="profile-card__name">
          {character.name !== undefined ? (
            <span className="ko-row">
              <KoreanText korean={character.name.korean} reading={character.name.pronunciation} display={display} />
              <SpeakButton text={character.name.korean} />
            </span>
          ) : (
            character.roleJa
          )}
        </h2>
        {character.name !== undefined && <p className="profile-card__role">{character.roleJa}</p>}
        {character.profileJa !== undefined && <p className="profile-card__text">{character.profileJa}</p>}
        <Button ref={startRef} variant="primary" onClick={onClose}>
          会話をはじめる
        </Button>
      </div>
    </div>
  )
}
