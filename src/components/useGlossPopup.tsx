import { useCallback, useState, type ReactNode } from 'react'
import type { GlossSpan } from '../learning/gloss/resolve'
import { GlossPopup } from './GlossPopup'

/** 語句のタップと、意味の窓を出すためのフック */
export function useGlossPopup(chapter: number): { onGloss: (span: GlossSpan) => void; popup: ReactNode } {
  const [open, setOpen] = useState<GlossSpan | null>(null)
  const onGloss = useCallback((span: GlossSpan) => setOpen(span), [])
  const close = useCallback(() => setOpen(null), [])
  return { onGloss, popup: open === null ? null : <GlossPopup span={open} chapter={chapter} onClose={close} /> }
}
