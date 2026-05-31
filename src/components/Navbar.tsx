'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { BarChart3, Github, Menu, Moon, Sun, ChevronDown } from 'lucide-react'
import { useState, useEffect, useRef } from 'react'
import { useLocale } from '@/contexts/LocaleContext'

export default function Navbar() {
  const pathname = usePathname()
  const { locale, setLocale, t } = useLocale()
  const [isDark, setIsDark] = useState(true)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [chartsOpen, setChartsOpen] = useState(false)
  const chartsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const isDarkMode = document.documentElement.classList.contains('dark')
    setIsDark(isDarkMode)
  }, [])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!chartsRef.current?.contains(e.target as Node)) setChartsOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const toggleTheme = () => {
    document.documentElement.classList.toggle('dark')
    setIsDark(!isDark)
  }

  const isChartsActive =
    pathname === '/charts' ||
    pathname === '/compare' ||
    pathname === '/table' ||
    pathname === '/genre-matrix' ||
    pathname === '/studio' ||
    pathname === '/leaderboard'

  const flatLinks = [
    { href: '/',          label: t('nav_home')      },
    { href: '/dashboard', label: t('nav_dashboard') },
    { href: '/browse',    label: t('nav_browse')    },
  ]

  const chartsChildren = [
    { href: '/charts',       label: t('nav_scatter')      },
    { href: '/compare',      label: t('nav_compare')      },
    { href: '/table',        label: t('nav_table')        },
    { href: '/leaderboard',  label: t('nav_leaderboard')  },
    { href: '/genre-matrix', label: t('nav_genre_matrix') },
    { href: '/studio',       label: t('nav_studio')       },
  ]

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 glass border-b border-gray-200 dark:border-dark-700">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">

          {/* Logo */}
          <Link href="/" className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-gradient-to-br from-primary-500 to-purple-600 rounded-lg flex items-center justify-center">
              <BarChart3 className="w-6 h-6 text-white" />
            </div>
            <span className="text-xl font-bold gradient-text">LiDex</span>
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

            {/* Charts dropdown */}
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

            <a
              href="https://github.com/jayroring2013"
              target="_blank"
              rel="noopener noreferrer"
              className="text-secondary hover:text-primary transition-colors"
            >
              <Github className="w-5 h-5" />
            </a>
          </div>

          {/* Right side: language toggle + theme + mobile menu */}
          <div className="flex items-center space-x-3">

            {/* VI / EN pill toggle */}
            <div
              className="flex rounded-lg overflow-hidden text-xs font-bold"
              style={{ border: '1px solid var(--card-border)' }}
            >
              <button
                onClick={() => setLocale('vi')}
                className="px-2.5 py-1.5 transition-colors"
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
                className="px-2.5 py-1.5 transition-colors"
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
              className="theme-toggle p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-dark-800 transition-colors"
            >
              {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>

            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden theme-toggle p-2"
            >
              <Menu className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div className="md:hidden glass border-t border-gray-200 dark:border-dark-700">
          <div className="px-4 py-4 space-y-4">
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
          </div>
        </div>
      )}
    </nav>
  )
}
