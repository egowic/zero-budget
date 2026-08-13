import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

/**
 * The Supabase client, or null when the app has not been given credentials.
 *
 * A missing backend is a supported state, not an error: the app is fully
 * usable against IndexedDB alone, so an unconfigured build still runs rather
 * than showing a setup screen for something the user cannot fix from a phone.
 */
export const supabase: SupabaseClient | null =
  url && anonKey
    ? createClient(url, anonKey, {
        auth: {
          // The session must survive an app relaunch, and refresh itself
          // without ever putting a login screen in front of the user.
          persistSession: true,
          autoRefreshToken: true,
          storageKey: 'zero.auth',
          // Nothing arrives via redirect — there is no login flow to return
          // from — and leaving this on makes Supabase parse the URL on boot.
          detectSessionInUrl: false,
        },
      })
    : null

export const isSyncConfigured = supabase !== null
