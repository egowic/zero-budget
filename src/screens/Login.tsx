import { useState, type FormEvent } from 'react'
import { signInWithEmail } from '../sync/auth'

export function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const valid = /.+@.+\..+/.test(email.trim()) && password.length >= 8

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!valid || busy) return

    setBusy(true)
    setError(null)
    const result = await signInWithEmail(email.trim(), password)
    setBusy(false)
    if (!result.ok) setError(result.message)
  }

  return (
    <main className="safe-top safe-bottom flex min-h-[100dvh] flex-col px-6 py-6">
      <div className="my-auto w-full max-w-sm self-center">
        <div className="mb-9 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-accent text-[30px] font-light text-ink">
            0
          </div>
          <h1 className="mt-5 text-[24px] font-medium tracking-tight">Welcome back</h1>
          <p className="mx-auto mt-2 max-w-[280px] text-[13px] leading-relaxed text-faint">
            Sign in once. Zero stays signed in and keeps your private cloud copy up
            to date.
          </p>
        </div>

        <form onSubmit={submit} className="space-y-3">
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="Email"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            className="h-[52px] w-full rounded-2xl bg-surface-2 px-4 text-[15px] outline-none placeholder:text-faint focus:bg-surface-3"
          />
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Password"
            autoComplete="current-password"
            className="h-[52px] w-full rounded-2xl bg-surface-2 px-4 text-[15px] outline-none placeholder:text-faint focus:bg-surface-3"
          />

          {error && (
            <p role="alert" className="px-1 text-[12.5px] leading-relaxed text-over">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={!valid || busy}
            className={[
              'h-[52px] w-full rounded-2xl text-[15px] font-medium transition-all',
              valid && !busy
                ? 'bg-accent text-ink active:scale-[0.98]'
                : 'bg-surface-2 text-faint',
            ].join(' ')}
          >
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>

      <p className="mx-auto max-w-[300px] pb-2 text-center text-[11.5px] leading-relaxed text-faint">
        Your data is still saved on this phone first, so normal use remains fast
        and local-first.
      </p>
    </main>
  )
}
