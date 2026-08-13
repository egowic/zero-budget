import { supabase } from './client'

/**
 * Identity without a login screen.
 *
 * The app signs in anonymously — Supabase issues a real user with a real row
 * in auth.users, so row-level security works exactly as it would for a normal
 * account, but nothing is ever asked of the person using it. The refresh token
 * lives in localStorage and renews itself, so first launch and every launch
 * after look identical: the app opens.
 *
 * The account is created on first *write*, not on first load. A stranger who
 * opens the URL and leaves therefore costs nothing, and the app is not
 * contacting an auth server before it has anything to protect.
 */

let inFlight: Promise<string | null> | null = null

/** The current user id, or null if no session exists yet. */
export async function currentUserId(): Promise<string | null> {
  if (!supabase) return null
  const { data } = await supabase.auth.getSession()
  return data.session?.user.id ?? null
}

/**
 * Returns a user id, creating an anonymous account if there is not one yet.
 * Returns null when sync is unconfigured or the device is offline — callers
 * treat that as "try again later", never as an error worth showing.
 */
export async function ensureSession(): Promise<string | null> {
  if (!supabase) return null

  const existing = await currentUserId()
  if (existing) return existing

  // Concurrent writes on first launch must not each create an account
  if (inFlight) return inFlight

  inFlight = (async () => {
    try {
      const { data, error } = await supabase!.auth.signInAnonymously()
      if (error) return null
      return data.user?.id ?? null
    } catch {
      return null
    } finally {
      inFlight = null
    }
  })()

  return inFlight
}

/**
 * Attaches an email and password to the anonymous account so a new device can
 * reach this data. Entirely optional and never blocking — the app works
 * forever without it; this only buys recoverability if the phone is lost.
 */
export async function attachRecoveryEmail(
  email: string,
  password: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!supabase) return { ok: false, message: 'Sync is not configured.' }

  const userId = await ensureSession()
  if (!userId) return { ok: false, message: 'No connection. Try again later.' }

  const { error } = await supabase.auth.updateUser({ email, password })
  if (error) return { ok: false, message: error.message }
  return { ok: true }
}

/** Signs a replacement device into an account that has recovery credentials. */
export async function recoverWithEmail(
  email: string,
  password: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!supabase) return { ok: false, message: 'Sync is not configured.' }

  try {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) return { ok: false, message: error.message }
    return { ok: true }
  } catch {
    return { ok: false, message: 'No connection. Try again later.' }
  }
}

/** Whether this account can be recovered on another device. */
export async function hasRecoveryEmail(): Promise<boolean> {
  if (!supabase) return false
  const { data } = await supabase.auth.getUser()
  return Boolean(data.user?.email)
}
