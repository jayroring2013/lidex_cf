'use client'

import { createContext, useContext, useState, useEffect, ReactNode, useCallback, useRef } from 'react'
import supabase from '@/lib/supabaseClient'

interface AvatarContextValue {
  avatarUrl: string | null
  setAvatarUrl: (url: string | null) => void
  refreshAvatar: () => Promise<void>
}

const AvatarContext = createContext<AvatarContextValue>({
  avatarUrl: null,
  setAvatarUrl: () => {},
  refreshAvatar: async () => {},
})

export function AvatarProvider({ children }: { children: ReactNode }) {
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  // Track last-fetched userId to avoid redundant DB hits on token refreshes
  const lastFetchedUserId = useRef<string | null>(null)

  const fetchAvatar = useCallback(async (userId: string) => {
    // Skip if we already fetched for this user (prevents double-call from getSession + onAuthStateChange)
    if (lastFetchedUserId.current === userId) return
    lastFetchedUserId.current = userId

    const { data } = await supabase
      .from('user_profiles')
      .select('avatar_url')
      .eq('user_id', userId)
      .maybeSingle()
    setAvatarUrl(data?.avatar_url || null)
  }, [])

  const refreshAvatar = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (session?.user.id) {
      lastFetchedUserId.current = null // Force re-fetch on explicit refresh
      await fetchAvatar(session.user.id)
    }
  }, [fetchAvatar])

  useEffect(() => {
    let mounted = true

    // Use onAuthStateChange only — it fires with INITIAL_SESSION on mount,
    // which covers the getSession() case without a redundant extra call.
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return
      const userId = session?.user.id
      if (userId) {
        fetchAvatar(userId)
      } else {
        lastFetchedUserId.current = null
        setAvatarUrl(null)
      }
    })

    return () => {
      mounted = false
      listener.subscription.unsubscribe()
    }
  }, [fetchAvatar])

  return (
    <AvatarContext.Provider value={{ avatarUrl, setAvatarUrl, refreshAvatar }}>
      {children}
    </AvatarContext.Provider>
  )
}

export function useAvatar() {
  return useContext(AvatarContext)
}
