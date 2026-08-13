import { supabase } from './client'

/** The current user id, or null if no session exists yet. */
export async function currentUserId(): Promise<string | null> {
  if (!supabase) return null
  const { data } = await supabase.auth.getSession()
  return data.session?.user.id ?? null
}

/** Signs in to the single account whose rows are protected by Supabase RLS. */
export async function signInWithEmail(
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
