import { useEffect, useRef, useState } from 'react'
import { Sheet } from '../components/Sheet'
import { downloadBackup, restoreBackup } from '../sync/backup'
import { attachRecoveryEmail, hasRecoveryEmail, recoverWithEmail } from '../sync/auth'
import { isSyncConfigured } from '../sync/client'
import { sync } from '../sync/engine'
import { describeSync, useSyncStatus } from '../sync/useSyncStatus'

interface SettingsSheetProps {
  open: boolean
  onClose: () => void
  onOpenCategories: () => void
}

const STATE_DOT: Record<string, string> = {
  idle: 'var(--color-good)',
  syncing: 'var(--color-warn)',
  offline: 'var(--color-faint)',
  error: 'var(--color-over)',
  disabled: 'var(--color-faint)',
}

export function SettingsSheet({ open, onClose, onOpenCategories }: SettingsSheetProps) {
  const status = useSyncStatus()
  const [recovered, setRecovered] = useState<boolean | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [recoveryLoginOpen, setRecoveryLoginOpen] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    setNotice(null)
    setFormOpen(false)
    setRecoveryLoginOpen(false)
    void hasRecoveryEmail().then(setRecovered)
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

        {/* Sync — informational only. There is nothing to configure and no
            account to manage, which is the point. */}
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
              ? 'Everything is saved on this phone first, then copied to your private cloud store in the background. No sign-in, ever.'
              : 'Cloud backup is not set up for this build. Your data lives only on this device — export a backup regularly.'}
          </p>
        </div>

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

        {isSyncConfigured && (
          <>
            <SectionLabel>New phone</SectionLabel>
            {recovered ? (
              <div className="rounded-2xl bg-surface-2 px-4 py-3.5 text-[13px] text-muted">
                Recovery is set up. Signing in with that email on a new device
                brings everything back.
              </div>
            ) : recoveryLoginOpen ? (
              <RecoveryLoginForm
                onCancel={() => setRecoveryLoginOpen(false)}
                onDone={(message) => {
                  setNotice(message)
                  setRecoveryLoginOpen(false)
                  void sync()
                  void hasRecoveryEmail().then(setRecovered)
                }}
              />
            ) : formOpen ? (
              <RecoveryForm
                onDone={(message) => {
                  setNotice(message)
                  setFormOpen(false)
                  void hasRecoveryEmail().then(setRecovered)
                }}
              />
            ) : (
              <>
                <div className="overflow-hidden rounded-2xl bg-surface-2">
                  <Row label="Add a recovery email" onClick={() => setFormOpen(true)} />
                  <Row
                    label="Recover existing data"
                    onClick={() => setRecoveryLoginOpen(true)}
                    divided
                  />
                </div>
                <p className="mt-2 px-1 text-[11.5px] leading-relaxed text-faint">
                  Optional, and you will not be asked again. Without it, deleting the
                  app from your home screen also loses the key to your cloud copy —
                  the exported file above would be the only way back.
                </p>
              </>
            )}
          </>
        )}

        {notice && (
          <div className="mt-4 rounded-xl bg-surface-3 px-3.5 py-2.5 text-center text-[12.5px] text-muted">
            {notice}
          </div>
        )}
      </div>
    </Sheet>
  )
}

function RecoveryLoginForm({
  onCancel,
  onDone,
}: {
  onCancel: () => void
  onDone: (message: string) => void
}) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const valid = /.+@.+\..+/.test(email) && password.length >= 8

  async function submit() {
    if (!valid || busy) return
    setBusy(true)
    setError(null)
    const result = await recoverWithEmail(email, password)
    setBusy(false)
    if (result.ok) {
      onDone('Signed in. Restoring your data now…')
    } else {
      setError(result.message)
    }
  }

  return (
    <div className="space-y-2">
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.com"
        autoComplete="username"
        className="w-full rounded-2xl bg-surface-2 px-4 py-3.5 text-[15px] outline-none placeholder:text-faint"
      />
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Password"
        autoComplete="current-password"
        className="w-full rounded-2xl bg-surface-2 px-4 py-3.5 text-[15px] outline-none placeholder:text-faint"
      />
      {error && <p className="px-1 text-[12px] text-over">{error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="h-[48px] flex-1 rounded-2xl bg-surface-2 text-[15px] text-muted"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={!valid || busy}
          className={[
            'h-[48px] flex-1 rounded-2xl text-[15px] font-medium transition-all',
            valid && !busy ? 'bg-accent text-ink' : 'bg-surface-2 text-faint',
          ].join(' ')}
        >
          {busy ? 'Signing in…' : 'Recover'}
        </button>
      </div>
    </div>
  )
}

function RecoveryForm({ onDone }: { onDone: (message: string) => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const valid = /.+@.+\..+/.test(email) && password.length >= 8

  async function submit() {
    if (!valid || busy) return
    setBusy(true)
    setError(null)
    const result = await attachRecoveryEmail(email, password)
    setBusy(false)
    if (result.ok) {
      onDone('Recovery email added. Check your inbox to confirm it.')
    } else {
      setError(result.message)
    }
  }

  return (
    <div className="space-y-2">
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.com"
        autoComplete="username"
        className="w-full rounded-2xl bg-surface-2 px-4 py-3.5 text-[15px] outline-none placeholder:text-faint"
      />
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Password (at least 8 characters)"
        // Prompts Safari to offer a generated password saved to iCloud Keychain,
        // which is the whole point: a credential the user never has to remember.
        autoComplete="new-password"
        className="w-full rounded-2xl bg-surface-2 px-4 py-3.5 text-[15px] outline-none placeholder:text-faint"
      />
      {error && <p className="px-1 text-[12px] text-over">{error}</p>}
      <button
        type="button"
        onClick={submit}
        disabled={!valid || busy}
        className={[
          'h-[48px] w-full rounded-2xl text-[15px] font-medium transition-all',
          valid && !busy ? 'bg-accent text-ink' : 'bg-surface-2 text-faint',
        ].join(' ')}
      >
        {busy ? 'Saving…' : 'Save'}
      </button>
    </div>
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
