import type { ReactNode } from 'react'

interface ScreenLayoutProps {
  title: ReactNode
  /** タイトルの上に出す小さな見出し（例：施設名の上の「施設」） */
  eyebrow?: string
  children: ReactNode
  /** 画面の下に並べるボタン */
  footer?: ReactNode
}

export function ScreenLayout({ title, eyebrow, children, footer }: ScreenLayoutProps) {
  return (
    <main className="screen">
      <header className="screen__header">
        {eyebrow && <p className="screen__eyebrow">{eyebrow}</p>}
        <h1 className="screen__title">{title}</h1>
      </header>
      <div className="screen__body">{children}</div>
      {footer && <footer className="screen__footer">{footer}</footer>}
    </main>
  )
}
