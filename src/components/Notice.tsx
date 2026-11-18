import type { ReactNode } from 'react'

export function Notice({ tone = 'info', children }: { tone?: 'info' | 'warn'; children: ReactNode }) {
  return (
    <div className={`notice notice--${tone}`} role={tone === 'warn' ? 'alert' : 'status'}>
      {children}
    </div>
  )
}
