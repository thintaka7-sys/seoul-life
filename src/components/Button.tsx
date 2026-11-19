import type { ButtonHTMLAttributes, Ref } from 'react'

interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type'> {
  variant?: 'primary' | 'secondary'
  ref?: Ref<HTMLButtonElement>
}

export function Button({ variant = 'secondary', className, ...rest }: ButtonProps) {
  const classes = ['button', `button--${variant}`, className].filter(Boolean).join(' ')
  return <button type="button" className={classes} {...rest} />
}
