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
          // Login is required only when this device has no session. After that,
          // the session survives app relaunches and refreshes in the background.
          persistSession: true,
          autoRefreshToken: true,
          storageKey: 'zero.auth',
          // Password login has no redirect for Supabase to parse on boot.
          detectSessionInUrl: false,
        },
      })
    : null

export const isSyncConfigured = supabase !== null
