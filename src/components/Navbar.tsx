'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { BarChart3, Menu, Moon, Sun } from 'lucide-react'
import { useState, useEffect } from 'react'
import { useLocale } from '@/contexts/LocaleContext'

export default function Navbar() {
  const pathname = usePathname()
  const { locale, setLocale, t } = useLocale()
  const [isDark, setIsDark] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  useEffect(() => {
    const savedTheme = localStorage.getItem('lidex-theme')
    const shouldUseDark = savedTheme === 'dark'
    document.documentElement.classList.toggle('dark', shouldUseDark)
    setIsDark(shouldUseDark)
  }, [])

  const toggleTheme = () => {
    const nextIsDark = !isDark
    document.documentElement.classList.toggle('dark', nextIsDark)
    localStorage.setItem('lidex-theme', nextIsDark ? 'dark' : 'light')
    setIsDark(nextIsDark)
  }

  const isChartsActive =
    pathname === '/leaderboard'

  const chartsChildren = [
    { href: '/leaderboard',  label: t('nav_leaderboard')  },
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
            <Link href="/leaderboard" className={`nav-link ${isChartsActive ? 'active' : ''}`}>
              {t('nav_leaderboard')}
            </Link>
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
