import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './client'

export interface AuthSessionState {
  loading: boolean
  session: Session | null
}

/**
 * Supabase persists and refreshes the session in localStorage. This hook only
 * mirrors that durable session into React so the login screen appears on a new
 * device, but not on every app launch.
 */
export function useAuthSession(): AuthSessionState {
  const [state, setState] = useState<AuthSessionState>({
    loading: supabase !== null,
    session: null,
  })

  useEffect(() => {
    if (!supabase) {
      setState({ loading: false, session: null })
      return
    }

    let active = true
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) setState({ loading: false, session })
    })

    void supabase.auth.getSession().then(({ data }) => {
      if (active) setState({ loading: false, session: data.session })
    })

    return () => {
      active = false
      listener.subscription.unsubscribe()
    }
  }, [])

  return state
}
