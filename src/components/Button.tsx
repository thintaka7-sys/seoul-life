import type { ButtonHTMLAttributes, MouseEvent, Ref } from 'react'
import { playSfx, type SfxName } from '../audio/sfx'

interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type'> {
  variant?: 'primary' | 'secondary'
  ref?: Ref<HTMLButtonElement>
  /** 押したときの効果音（null で鳴らさない） */
  sound?: SfxName | null
}

export function Button({ variant = 'secondary', className, sound = 'button', onClick, ...rest }: ButtonProps) {
  const classes = ['button', `button--${variant}`, className].filter(Boolean).join(' ')
  function click(e: MouseEvent<HTMLButtonElement>) {
    if (sound !== null) playSfx(sound)
    onClick?.(e)
  }
  return <button type="button" className={classes} onClick={click} {...rest} />
}
