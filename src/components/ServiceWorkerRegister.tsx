'use client'

import { useEffect } from 'react'

export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      const register = async () => {
        try {
          await navigator.serviceWorker.register('/sw.js', { scope: '/' })
        } catch {
          // Non-fatal on unsupported or restricted environments
        }
      }

      if (document.readyState === 'complete') {
        register()
      } else {
        window.addEventListener('load', register, { once: true })
      }
    }
  }, [])

  return null
}
