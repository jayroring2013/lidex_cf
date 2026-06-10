'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { BarChart3, Menu, Moon, Sun, ChevronDown, LogIn, LogOut, UserCircle, X } from 'lucide-react'
import { useState, useEffect, useRef, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { useLocale } from '@/contexts/LocaleContext'
import supabase from '@/lib/supabaseClient'
import type { User } from '@supabase/supabase-js'

export default function Navbar() {
  const pathname = usePathname()
  const { locale, setLocale, t } = useLocale()
  const [isDark, setIsDark] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [chartsOpen, setChartsOpen] = useState(false)
  const [authOpen, setAuthOpen] = useState(false)
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin')
  const [authEmail, setAuthEmail] = useState('')
  const [authPassword, setAuthPassword] = useState('')
  const [authLoading, setAuthLoading] = useState(false)
  const [authMessage, setAuthMessage] = useState<string | null>(null)
  const [authError, setAuthError] = useState<string | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const chartsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const savedTheme = localStorage.getItem('lidex-theme')
    const shouldUseDark = savedTheme === 'dark'
    document.documentElement.classList.toggle('dark', shouldUseDark)
    document.documentElement.style.colorScheme = shouldUseDark ? 'dark' : 'light'
    setIsDark(shouldUseDark)
  }, [])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!chartsRef.current?.contains(e.target as Node)) setChartsOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => {
    let mounted = true

    supabase.auth.getSession().then(({ data }) => {
      if (mounted) setUser(data.session?.user ?? null)
    })

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      if (session?.user) {
        setAuthOpen(false)
        setAuthError(null)
        setAuthMessage(null)
      }
    })

    return () => {
      mounted = false
      authListener.subscription.unsubscribe()
    }
  }, [])

  const displayName =
    user?.user_metadata?.full_name ||
    user?.user_metadata?.name ||
    user?.email?.split('@')[0] ||
    ''

  const openAuth = (mode: 'signin' | 'signup' = 'signin') => {
    setAuthMode(mode)
    setAuthOpen(true)
    setAuthError(null)
    setAuthMessage(null)
  }

  const handleGoogleAuth = async () => {
    setAuthLoading(true)
    setAuthError(null)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    })
    if (error) {
      setAuthError(error.message)
      setAuthLoading(false)
    }
  }

  const handleEmailAuth = async (e: FormEvent) => {
    e.preventDefault()
    setAuthLoading(true)
    setAuthError(null)
    setAuthMessage(null)

    const credentials = {
      email: authEmail.trim(),
      password: authPassword,
      options: { emailRedirectTo: window.location.origin },
    }

    const { error } = authMode === 'signup'
      ? await supabase.auth.signUp(credentials)
      : await supabase.auth.signInWithPassword({ email: credentials.email, password: credentials.password })

    if (error) {
      setAuthError(error.message)
    } else if (authMode === 'signup') {
      setAuthMessage(locale === 'vi' ? 'Kiểm tra email để xác nhận tài khoản.' : 'Check your email to confirm your account.')
    } else {
      setAuthOpen(false)
    }

    setAuthLoading(false)
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    setUser(null)
    setMobileMenuOpen(false)
  }

  const toggleTheme = () => {
    const nextIsDark = !isDark
    document.documentElement.classList.toggle('dark', nextIsDark)
    document.documentElement.style.colorScheme = nextIsDark ? 'dark' : 'light'
    localStorage.setItem('lidex-theme', nextIsDark ? 'dark' : 'light')
    setIsDark(nextIsDark)
  }

  const isChartsActive =
    pathname === '/leaderboard'

  const flatLinks = [
    { href: '/',          label: t('nav_home')      },
    { href: '/dashboard', label: t('nav_dashboard') },
    { href: '/browse',    label: t('nav_browse')    },
  ]

  const chartsChildren = [
    { href: '/leaderboard',  label: t('nav_leaderboard')  },
  ]

  return (
    <>
    <nav
      className="fixed top-0 left-0 right-0 z-50 glass border-b"
      style={{ borderColor: 'var(--card-border)' }}
    >
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">

          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 sm:gap-3 min-w-0">
            <div className="w-9 h-9 sm:w-10 sm:h-10 bg-gradient-to-br from-primary-500 to-purple-600 rounded-lg flex items-center justify-center flex-shrink-0">
              <BarChart3 className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
            </div>
            <span className="text-lg sm:text-xl font-bold gradient-text">LiDex</span>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center space-x-8">
            {flatLinks.map(link => (
              <Link
                key={link.href}
                href={link.href}
                className={`nav-link ${pathname === link.href ? 'active' : ''}`}
              >
                {link.label}
              </Link>
            ))}

            <div className="relative" ref={chartsRef}>
              <button
                onClick={() => setChartsOpen(o => !o)}
                className={`nav-link flex items-center gap-1 ${isChartsActive ? 'active' : ''}`}
              >
                {t('nav_charts')}
                <ChevronDown
                  className="w-3.5 h-3.5 transition-transform"
                  style={{ transform: chartsOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
                />
              </button>

              {chartsOpen && (
                <div
                  className="absolute top-full left-1/2 -translate-x-1/2 mt-3 w-40 rounded-xl overflow-hidden shadow-xl z-50"
                  style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}
                >
                  <div
                    className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-3 h-3 rotate-45"
                    style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderBottom: 'none', borderRight: 'none' }}
                  />
                  {chartsChildren.map((child, i) => (
                    <Link
                      key={child.href}
                      href={child.href}
                      onClick={() => setChartsOpen(false)}
                      className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors"
                      style={{
                        color:        pathname === child.href ? '#6366f1' : 'var(--foreground-secondary)',
                        borderBottom: i < chartsChildren.length - 1 ? '1px solid var(--card-border)' : 'none',
                        background:   pathname === child.href ? 'var(--background-secondary)' : 'transparent',
                      }}
                      onMouseEnter={e => { if (pathname !== child.href) e.currentTarget.style.background = 'var(--background-secondary)' }}
                      onMouseLeave={e => { if (pathname !== child.href) e.currentTarget.style.background = 'transparent' }}
                    >
                      {pathname === child.href && (
                        <span className="w-1.5 h-1.5 rounded-full bg-primary-500 flex-shrink-0" />
                      )}
                      {child.label}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right side: language toggle + theme + mobile menu */}
          <div className="flex items-center gap-1.5 sm:gap-3">

            {/* VI / EN pill toggle */}
            <div
              className="flex rounded-lg overflow-hidden text-xs font-bold"
              style={{ border: '1px solid var(--card-border)' }}
            >
              <button
                onClick={() => setLocale('vi')}
                className="px-2 py-1.5 sm:px-2.5 transition-colors"
                style={locale === 'vi'
                  ? { background: '#6366f1', color: '#fff' }
                  : { background: 'var(--background-secondary)', color: 'var(--foreground-secondary)' }
                }
                title="Tiếng Việt"
              >
                VI
              </button>
              <button
                onClick={() => setLocale('en')}
                className="px-2 py-1.5 sm:px-2.5 transition-colors"
                style={locale === 'en'
                  ? { background: '#6366f1', color: '#fff' }
                  : { background: 'var(--background-secondary)', color: 'var(--foreground-secondary)' }
                }
                title="English"
              >
                EN
              </button>
            </div>

            <button
              onClick={toggleTheme}
              className="theme-toggle p-2 rounded-lg transition-colors"
              style={{ color: 'var(--foreground)' }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--background-secondary)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
              aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>

            {user ? (
              <div className="hidden sm:flex items-center gap-2">
                <div
                  className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-bold"
                  style={{ background: 'var(--background-secondary)', color: 'var(--foreground)', border: '1px solid var(--card-border)' }}
                >
                  <UserCircle className="w-4 h-4 text-primary-500" />
                  <span className="max-w-[88px] lg:max-w-[120px] truncate">{displayName}</span>
                </div>
                <button
                  onClick={handleLogout}
                  className="p-2 rounded-lg transition-colors"
                  style={{ color: 'var(--foreground-secondary)', border: '1px solid var(--card-border)' }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--background-secondary)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                  aria-label={locale === 'vi' ? 'Đăng xuất' : 'Log out'}
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => openAuth('signin')}
                className="hidden sm:flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-bold transition-colors"
                style={{ background: '#6366f1', color: '#fff' }}
              >
                <LogIn className="w-4 h-4" />
                {locale === 'vi' ? 'Đăng nhập' : 'Login'}
              </button>
            )}

            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden theme-toggle p-2 rounded-lg"
              style={{ color: 'var(--foreground)' }}
              aria-label="Toggle navigation menu"
            >
              <Menu className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div
          className="md:hidden glass border-t"
          style={{ borderColor: 'var(--card-border)', background: 'var(--card-bg)' }}
        >
          <div className="px-4 py-4 space-y-4 max-h-[calc(100svh-4rem)] overflow-y-auto">
            {flatLinks.map(link => (
              <Link
                key={link.href}
                href={link.href}
                className="nav-link block"
                onClick={() => setMobileMenuOpen(false)}
              >
                {link.label}
              </Link>
            ))}
            <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--foreground-muted)' }}>
              {t('nav_charts')}
            </p>
            {chartsChildren.map(child => (
              <Link
                key={child.href}
                href={child.href}
                className="nav-link block pl-3"
                onClick={() => setMobileMenuOpen(false)}
                style={{ color: pathname === child.href ? '#6366f1' : undefined }}
              >
                {child.label}
              </Link>
            ))}
            <div className="pt-3" style={{ borderTop: '1px solid var(--card-border)' }}>
              {user ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm font-bold" style={{ color: 'var(--foreground)' }}>
                    <UserCircle className="w-5 h-5 text-primary-500" />
                    <span className="truncate">{displayName}</span>
                  </div>
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold"
                    style={{ background: 'var(--background-secondary)', color: 'var(--foreground)', border: '1px solid var(--card-border)' }}
                  >
                    <LogOut className="w-4 h-4" />
                    {locale === 'vi' ? 'Đăng xuất' : 'Log out'}
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => {
                    setMobileMenuOpen(false)
                    openAuth('signin')
                  }}
                  className="w-full flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold"
                  style={{ background: '#6366f1', color: '#fff' }}
                >
                  <LogIn className="w-4 h-4" />
                  {locale === 'vi' ? 'Đăng nhập' : 'Login'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

    </nav>

      {authOpen && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[999] flex items-center justify-center overflow-y-auto px-3 py-4 sm:px-4 sm:py-6" style={{ background: 'rgba(2,6,23,.64)' }}>
          <div
            className="w-full max-w-[420px] max-h-[calc(100svh-2rem)] overflow-y-auto rounded-2xl p-4 shadow-2xl sm:p-5"
            style={{
              background: 'var(--card-bg)',
              color: 'var(--foreground)',
              border: '1px solid var(--card-border)',
              boxShadow: '0 28px 80px rgba(2,6,23,.34)',
            }}
          >
            <div className="flex items-start justify-between gap-3 mb-5">
              <div>
                <h2 className="text-xl font-black">
                  {authMode === 'signin'
                    ? (locale === 'vi' ? 'Đăng nhập' : 'Login')
                    : (locale === 'vi' ? 'Tạo tài khoản' : 'Create account')}
                </h2>
                <p className="text-sm mt-1" style={{ color: 'var(--foreground-muted)' }}>
                  {locale === 'vi' ? 'Dùng Google hoặc email để lưu đánh giá của bạn.' : 'Use Google or email to save your ratings.'}
                </p>
              </div>
              <button
                onClick={() => setAuthOpen(false)}
                className="p-2 rounded-lg min-h-11 min-w-11 flex items-center justify-center"
                style={{ color: 'var(--foreground-secondary)' }}
                aria-label="Close login dialog"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <button
              onClick={handleGoogleAuth}
              disabled={authLoading}
              className="w-full min-h-11 rounded-xl px-4 py-3 text-sm font-black disabled:opacity-60"
              style={{ background: 'var(--background-secondary)', color: 'var(--foreground)', border: '1px solid var(--card-border)' }}
            >
              {locale === 'vi' ? 'Tiếp tục với Google' : 'Continue with Google'}
            </button>

            <div className="my-4 flex items-center gap-3">
              <div className="h-px flex-1" style={{ background: 'var(--card-border)' }} />
              <span className="text-xs font-bold" style={{ color: 'var(--foreground-muted)' }}>EMAIL</span>
              <div className="h-px flex-1" style={{ background: 'var(--card-border)' }} />
            </div>

            <form onSubmit={handleEmailAuth} className="space-y-3">
              <input
                type="email"
                value={authEmail}
                onChange={e => setAuthEmail(e.target.value)}
                placeholder={locale === 'vi' ? 'Email' : 'Email'}
                required
                className="w-full min-h-11 rounded-xl px-4 py-3 text-base outline-none sm:text-sm"
                style={{ background: 'var(--background-secondary)', color: 'var(--foreground)', border: '1px solid var(--card-border)' }}
              />
              <input
                type="password"
                value={authPassword}
                onChange={e => setAuthPassword(e.target.value)}
                placeholder={locale === 'vi' ? 'Mật khẩu' : 'Password'}
                required
                minLength={6}
                className="w-full min-h-11 rounded-xl px-4 py-3 text-base outline-none sm:text-sm"
                style={{ background: 'var(--background-secondary)', color: 'var(--foreground)', border: '1px solid var(--card-border)' }}
              />
              <button
                type="submit"
                disabled={authLoading}
                className="w-full min-h-11 rounded-xl px-4 py-3 text-sm font-black disabled:opacity-60"
                style={{ background: '#6366f1', color: '#fff' }}
              >
                {authLoading
                  ? (locale === 'vi' ? 'Đang xử lý...' : 'Working...')
                  : authMode === 'signin'
                    ? (locale === 'vi' ? 'Đăng nhập bằng email' : 'Login with email')
                    : (locale === 'vi' ? 'Đăng ký bằng email' : 'Sign up with email')}
              </button>
            </form>

            {authError && <p className="text-xs mt-3" style={{ color: '#ef4444' }}>{authError}</p>}
            {authMessage && <p className="text-xs mt-3" style={{ color: '#22c55e' }}>{authMessage}</p>}

            <button
              onClick={() => {
                setAuthMode(authMode === 'signin' ? 'signup' : 'signin')
                setAuthError(null)
                setAuthMessage(null)
              }}
              className="w-full mt-4 min-h-11 text-sm font-bold"
              style={{ color: '#6366f1' }}
            >
              {authMode === 'signin'
                ? (locale === 'vi' ? 'Chưa có tài khoản? Đăng ký' : 'No account? Sign up')
                : (locale === 'vi' ? 'Đã có tài khoản? Đăng nhập' : 'Already have an account? Login')}
            </button>
          </div>
        </div>
      )}
    </nav>
  )
}
