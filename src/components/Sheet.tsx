import { useEffect, type ReactNode } from 'react'

interface SheetProps {
  open: boolean
  onClose: () => void
  children: ReactNode
  /** Sheets that own the whole screen (the keypad) skip the drag affordance. */
  full?: boolean
}

/**
 * Bottom sheet. Deliberately not a <dialog> — Safari on iOS mishandles focus
 * and scroll locking inside dialogs presented over a standalone web app, and
 * the result is a sheet you cannot scroll.
 */
export function Sheet({ open, onClose, children, full = false }: SheetProps) {
  useEffect(() => {
    if (!open) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = previous
      window.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <button
        aria-label="Kapat"
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in"
      />
      <div
        role="dialog"
        aria-modal="true"
        className={[
          'relative animate-sheet-in bg-surface',
          'rounded-t-[28px] border-t border-hairline',
          'shadow-[0_-8px_40px_rgba(0,0,0,0.6)]',
          full ? 'h-[92vh]' : 'max-h-[88vh]',
        ].join(' ')}
      >
        {!full && (
          <div className="flex justify-center pt-3 pb-1">
            <div className="h-1 w-9 rounded-full bg-hairline-strong" />
          </div>
        )}
        {children}
      </div>
    </div>
  )
}
