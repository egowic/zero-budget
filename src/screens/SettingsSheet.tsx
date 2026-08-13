import { useEffect, useRef, useState } from 'react'
import { Sheet } from '../components/Sheet'
import { downloadBackup, restoreBackup } from '../sync/backup'
import { isSyncConfigured } from '../sync/client'
import { sync } from '../sync/engine'
import { describeSync, useSyncStatus } from '../sync/useSyncStatus'

interface SettingsSheetProps {
  open: boolean
  onClose: () => void
  accountEmail: string | null
  onOpenCategories: () => void
}

const STATE_DOT: Record<string, string> = {
  idle: 'var(--color-good)',
  syncing: 'var(--color-warn)',
  offline: 'var(--color-faint)',
  error: 'var(--color-over)',
  disabled: 'var(--color-faint)',
}

export function SettingsSheet({
  open,
  onClose,
  accountEmail,
  onOpenCategories,
}: SettingsSheetProps) {
  const status = useSyncStatus()
  const [notice, setNotice] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) setNotice(null)
  }, [open])

  async function handleRestore(file: File) {
    try {
      const result = await restoreBackup(file)
      const total = result.budgets + result.expenses + result.categories
      setNotice(total === 0 ? 'Already up to date.' : `Restored ${total} records.`)
      void sync()
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not read that file.')
    }
  }

  return (
    <Sheet open={open} onClose={onClose}>
      <div className="safe-bottom hide-scrollbar overflow-y-auto px-4 pt-2 pb-4">
        <div className="pb-4 text-center text-[15px] font-medium">Settings</div>

        {/* The existing sync card keeps its original visual treatment. */}
        <div className="rounded-2xl bg-surface-2 px-4 py-3.5">
          <div className="flex items-center gap-2.5">
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ background: STATE_DOT[status.state] }}
            />
            <span className="text-[14.5px]">{describeSync(status)}</span>
            {isSyncConfigured && status.state !== 'syncing' && (
              <button
                type="button"
                onClick={() => void sync()}
                className="ml-auto text-[12.5px] text-faint active:text-muted"
              >
                Sync now
              </button>
            )}
          </div>
          <p className="mt-2 text-[11.5px] leading-relaxed text-faint">
            {isSyncConfigured
              ? 'Everything is saved on this phone first, then copied to your private cloud store in the background.'
              : 'Cloud backup is not set up for this build. Your data lives only on this device — export a backup regularly.'}
          </p>
        </div>

        {accountEmail && (
          <>
            <SectionLabel>Account</SectionLabel>
            <div className="rounded-2xl bg-surface-2 px-4 py-3.5">
              <div className="flex items-center gap-2.5">
                <span className="h-2 w-2 shrink-0 rounded-full bg-good" />
                <div className="min-w-0">
                  <div className="text-[13px] text-muted">Signed in</div>
                  <div className="truncate text-[12px] text-faint">{accountEmail}</div>
                </div>
              </div>
            </div>
          </>
        )}

        <SectionLabel>Spending</SectionLabel>
        <div className="overflow-hidden rounded-2xl bg-surface-2">
          <Row label="Categories" onClick={onOpenCategories} />
        </div>

        <SectionLabel>Backup</SectionLabel>
        <div className="overflow-hidden rounded-2xl bg-surface-2">
          <Row label="Export a backup file" onClick={() => void downloadBackup()} />
          <Row
            label="Restore from a backup"
            onClick={() => fileRef.current?.click()}
            divided
          />
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) void handleRestore(file)
            e.target.value = ''
          }}
        />
        <p className="mt-2 px-1 text-[11.5px] leading-relaxed text-faint">
          A plain JSON file you keep yourself. Restoring merges by date — it never
          overwrites newer entries, and running it twice changes nothing.
        </p>

        {notice && (
          <div className="mt-4 rounded-xl bg-surface-3 px-3.5 py-2.5 text-center text-[12.5px] text-muted">
            {notice}
          </div>
        )}
      </div>
    </Sheet>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-5 mb-2 text-[10.5px] tracking-[0.08em] text-faint uppercase">
      {children}
    </div>
  )
}

function Row({
  label,
  onClick,
  divided,
}: {
  label: string
  onClick: () => void
  divided?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'flex w-full items-center justify-between px-4 py-3.5 text-left text-[14.5px] active:bg-surface-3',
        divided ? 'border-t border-hairline' : '',
      ].join(' ')}
    >
      {label}
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="m9 6 6 6-6 6"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-faint"
        />
      </svg>
    </button>
  )
}
