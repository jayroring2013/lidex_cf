'use client'

import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react'
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

  const fetchAvatar = useCallback(async (userId: string) => {
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
      await fetchAvatar(session.user.id)
    }
  }, [fetchAvatar])

  useEffect(() => {
    let mounted = true

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return
      const userId = data.session?.user.id
      if (userId) {
        fetchAvatar(userId)
      } else {
        setAvatarUrl(null)
      }
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return
      const userId = session?.user.id
      if (userId) {
        fetchAvatar(userId)
      } else {
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
