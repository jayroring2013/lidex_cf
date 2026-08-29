'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import Link from 'next/link'
import {
  Newspaper, BookOpen, Network, Sparkles, Settings, Power,
  User, Bell, Wifi, Battery, ChevronLeft, ChevronRight, Gamepad2, Search
} from 'lucide-react'
import { useLocale } from '@/contexts/LocaleContext'

interface CarouselItem {
  id: string | number
  title: string
  cover_url: string | null
  score: number | null
  href: string
  subtitle?: string
}

interface SwitchHomeViewProps {
  items: CarouselItem[]
  user?: any
  authLoading?: boolean
  onSwitchToClassicView?: () => void
}

export default function SwitchHomeView({ items, user, authLoading, onSwitchToClassicView }: SwitchHomeViewProps) {
  const { locale } = useLocale()
  const vi = locale === 'vi'

  const [selectedIndex, setSelectedIndex] = useState(0)
  const [timeStr, setTimeStr] = useState('20:16')
  const [searchQuery, setSearchQuery] = useState('')
  const [showSearchInput, setShowSearchInput] = useState(false)
  const trackRef = useRef<HTMLDivElement>(null)

  // Real-time digital clock
  useEffect(() => {
    const updateTime = () => {
      const d = new Date()
      const hh = String(d.getHours()).padStart(2, '0')
      const mm = String(d.getMinutes()).padStart(2, '0')
      setTimeStr(`${hh}:${mm}`)
    }
    updateTime()
    const timer = setInterval(updateTime, 10000)
    return () => clearInterval(timer)
  }, [])

  // Filter items dynamically based on header search input
  const displayItems = useMemo(() => {
    if (!searchQuery.trim()) return items
    const q = searchQuery.toLowerCase().trim()
    const filtered = items.filter(item => item.title.toLowerCase().includes(q))
    return filtered.length > 0 ? filtered : items
  }, [items, searchQuery])

  // Reset selected carousel index when query changes
  useEffect(() => {
    setSelectedIndex(0)
  }, [searchQuery])

  const currentItem = displayItems[selectedIndex] || displayItems[0]

  const displayName = user
    ? (user.user_metadata?.display_name || user.user_metadata?.full_name || user.email?.split('@')[0] || 'User')
    : null

  // Smooth centered scrolling WITHOUT layout shifts or shaking
  useEffect(() => {
    const track = trackRef.current
    if (!track) return
    const child = track.children[selectedIndex] as HTMLElement
    if (child) {
      const trackCenter = track.clientWidth / 2
      const childCenter = child.offsetLeft + child.clientWidth / 2
      track.scrollTo({
        left: childCenter - trackCenter,
        behavior: 'smooth'
      })
    }
  }, [selectedIndex, displayItems])

  // Keyboard Navigation: Left/Right arrows, Enter for Launch, X for Classic View
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') {
        e.preventDefault()
        setSelectedIndex(prev => (prev < displayItems.length - 1 ? prev + 1 : 0))
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        setSelectedIndex(prev => (prev > 0 ? prev - 1 : displayItems.length - 1))
      } else if (e.key === 'Enter' && currentItem?.href) {
        window.location.href = currentItem.href
      } else if ((e.key === 'x' || e.key === 'X') && onSwitchToClassicView) {
        onSwitchToClassicView()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [displayItems, currentItem, onSwitchToClassicView])

  return (
    <div className="fixed inset-0 z-50 bg-[#0b0f19] text-[#f8fafc] flex flex-col justify-between font-sans overflow-y-auto sm:overflow-hidden select-none"
      style={{
        backgroundImage: `
          radial-gradient(circle at 50% 30%, rgba(0, 210, 255, 0.15) 0%, transparent 65%),
          radial-gradient(circle at 10% 85%, rgba(99, 102, 241, 0.12) 0%, transparent 40%),
          radial-gradient(circle at 90% 85%, rgba(168, 85, 247, 0.12) 0%, transparent 40%)
        `
      }}>
      
      {/* 1. Header Bar (Responsive Mobile & PC) */}
      <div className="p-3 sm:p-5 flex flex-wrap items-center justify-between border-b border-white/10 gap-2 bg-slate-950/40 backdrop-blur-md">
        {/* Left User Profile Avatar / Auth State */}
        {authLoading ? (
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-slate-800 animate-pulse border border-white/10" />
            <div className="w-20 h-4 bg-slate-800 rounded animate-pulse" />
          </div>
        ) : user ? (
          <Link href="/user" className="flex items-center gap-2 sm:gap-3 cursor-pointer group">
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-slate-800 border-2 border-[#00d2ff] flex items-center justify-center overflow-hidden shadow-[0_0_12px_rgba(0,210,255,0.5)] group-hover:scale-105 transition-all">
              {user.user_metadata?.avatar_url ? (
                <img src={user.user_metadata.avatar_url} alt="Profile" className="w-full h-full object-cover" />
              ) : (
                <User className="w-5 h-5 sm:w-6 sm:h-6 text-[#00d2ff]" />
              )}
            </div>
            <div>
              <div className="text-xs sm:text-sm font-black tracking-wide text-white group-hover:text-[#00d2ff] transition-colors line-clamp-1">
                {displayName}
              </div>
              <div className="text-[9px] sm:text-[10px] font-bold text-emerald-400 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_#10b981]" />
                Online
              </div>
            </div>
          </Link>
        ) : (
          <button
            onClick={() => window.dispatchEvent(new CustomEvent('trigger-auth-modal', { detail: { mode: 'signup' } }))}
            className="flex items-center gap-2 group cursor-pointer"
            title={vi ? 'Đăng nhập / Đăng ký' : 'Sign in / Sign up'}
          >
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-slate-900 border-2 border-slate-700 group-hover:border-[#00d2ff] flex items-center justify-center text-slate-400 group-hover:text-[#00d2ff] shadow-md transition-all">
              <User className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div className="text-left hidden xs:block">
              <div className="text-xs sm:text-sm font-extrabold text-slate-200 group-hover:text-[#00d2ff] transition-colors">
                {vi ? 'Đăng ký' : 'Sign up'}
              </div>
              <div className="text-[9px] sm:text-[10px] font-semibold text-slate-400">
                {vi ? 'Tài khoản' : 'Account'}
              </div>
            </div>
          </button>
        )}

        {/* Center Console Brand */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-2.5 py-1 sm:px-3 sm:py-1 rounded-full bg-slate-900/90 border border-white/10 shadow-lg">
            <Gamepad2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#00d2ff]" />
            <span className="text-xs sm:text-sm font-black uppercase tracking-widest bg-gradient-to-r from-white via-cyan-100 to-[#00d2ff] bg-clip-text text-transparent">
              LiDex OS
            </span>
          </div>
        </div>

        {/* Right System Indicators & Search Bar */}
        <div className="flex items-center gap-2 sm:gap-4 text-xs font-bold text-slate-300">
          
          {/* Header Search Bar / Button Pill */}
          <div className="relative flex items-center">
            {showSearchInput ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  if (searchQuery.trim()) {
                    window.location.href = `/browse?q=${encodeURIComponent(searchQuery.trim())}`
                  }
                }}
                className="flex items-center gap-1.5 bg-slate-900/90 border border-cyan-400/60 rounded-full px-3 py-1 text-xs shadow-[0_0_12px_rgba(0,210,255,0.3)] animate-in fade-in zoom-in-95 duration-200"
              >
                <Search className="w-3.5 h-3.5 text-cyan-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={vi ? "Tìm kiếm..." : "Search..."}
                  className="bg-transparent text-white placeholder-slate-400 focus:outline-none text-xs w-28 sm:w-40"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShowSearchInput(false)}
                  className="text-slate-400 hover:text-white text-xs px-1"
                >
                  ✕
                </button>
              </form>
            ) : (
              <button
                onClick={() => setShowSearchInput(true)}
                title={vi ? "Tìm kiếm" : "Search"}
                className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-slate-900/80 border border-white/15 text-slate-300 hover:text-white hover:border-cyan-400 hover:bg-slate-800/90 flex items-center justify-center transition-all shadow-md group"
              >
                <Search className="w-4 h-4 group-hover:scale-110 transition-transform" />
              </button>
            )}
          </div>

          <span className="text-xs sm:text-sm tracking-wider font-extrabold text-white">{timeStr}</span>
          
          <div className="hidden sm:flex items-center gap-1.5 bg-slate-900/90 px-2.5 py-1 rounded-full border border-white/10">
            <Battery className="w-4 h-4 text-emerald-400" />
            <span className="text-[11px] font-extrabold">89%</span>
          </div>

          <Wifi className="hidden sm:block w-4 h-4 text-slate-300" />
          <Bell className="hidden sm:block w-4 h-4 text-slate-300 hover:text-white cursor-pointer transition-colors" />

          {onSwitchToClassicView && (
            <button
              onClick={onSwitchToClassicView}
              className="px-2.5 py-1 sm:px-3 sm:py-1 rounded-full text-[10px] sm:text-[11px] font-extrabold bg-white/10 hover:bg-white/20 text-slate-200 border border-white/15 transition-all flex items-center gap-1.5"
            >
              <Power className="w-3 h-3 text-cyan-400" />
              <span>{vi ? 'Web View (X)' : 'Web View (X)'}</span>
            </button>
          )}
        </div>
      </div>

      {/* 2. Main Game Menu Area */}
      <div className="flex-1 flex flex-col justify-center items-center py-2 relative">
        
        {/* Active Title Header (Glow Text with Natural Casing & Ample Line-Height for Tone Marks) */}
        <div className="text-center mb-3 sm:mb-5 max-w-3xl px-4 animate-in fade-in duration-300">
          <h2 className="text-xl sm:text-3xl md:text-4xl font-black tracking-normal leading-normal sm:leading-relaxed text-white drop-shadow-[0_0_16px_rgba(0,210,255,0.75)] line-clamp-1 py-1">
            {currentItem?.title || 'Classroom of the Elite'}
          </h2>
          
          <div className="flex items-center justify-center gap-2 sm:gap-3 mt-1 text-xs font-extrabold">
            {currentItem?.score && (
              <span className="bg-amber-400/20 text-amber-300 border border-amber-400/40 px-2.5 py-0.5 rounded-full shadow-[0_0_10px_rgba(245,158,11,0.3)]">
                ★ {currentItem.score} pts
              </span>
            )}
            <span className="text-slate-400 tracking-wide text-[10px] sm:text-[11px]">
              {vi ? 'Đang chọn phát hành' : 'Selected Volume Release'}
            </span>
          </div>
        </div>

        {/* Horizontal Game Cover Tile Carousel */}
        <div className="w-full max-w-6xl relative px-4 sm:px-12">
          {/* Nav Controls */}
          <button
            onClick={() => setSelectedIndex(prev => (prev > 0 ? prev - 1 : displayItems.length - 1))}
            className="absolute left-1 sm:left-2 top-1/2 -translate-y-1/2 w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-slate-900/90 border border-white/15 text-white flex items-center justify-center z-20 hover:bg-[#00d2ff]/20 hover:border-[#00d2ff] transition-all shadow-xl"
          >
            <ChevronLeft className="w-5 h-5 sm:w-6 sm:h-6" />
          </button>

          <button
            onClick={() => setSelectedIndex(prev => (prev < displayItems.length - 1 ? prev + 1 : 0))}
            className="absolute right-1 sm:right-2 top-1/2 -translate-y-1/2 w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-slate-900/90 border border-white/15 text-white flex items-center justify-center z-20 hover:bg-[#00d2ff]/20 hover:border-[#00d2ff] transition-all shadow-xl"
          >
            <ChevronRight className="w-5 h-5 sm:w-6 sm:h-6" />
          </button>

          {/* Carousel Track with Hiddens Scrollbar */}
          <div
            ref={trackRef}
            className="flex items-center gap-3 sm:gap-6 overflow-x-auto py-6 px-2 sm:px-4 no-scrollbar"
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
          >
            {displayItems.map((item, idx) => {
              const isSelected = idx === selectedIndex
              return (
                <div
                  key={`${item.id}-${idx}`}
                  onClick={() => setSelectedIndex(idx)}
                  className="w-36 sm:w-48 h-52 sm:h-72 flex-shrink-0 relative cursor-pointer"
                >
                  <div
                    className={`w-full h-full rounded-2xl overflow-hidden transform-gpu transition-transform duration-200 ${
                      isSelected
                        ? 'scale-105 border-[3.5px] border-[#00d2ff] shadow-[0_0_32px_rgba(0,210,255,0.7)] z-10'
                        : 'scale-95 opacity-55 hover:opacity-85 border border-white/10'
                    }`}
                  >
                    {item.cover_url ? (
                      <img
                        src={item.cover_url}
                        alt={item.title}
                        className="w-full h-full object-cover block pointer-events-none"
                      />
                    ) : (
                      <div className="w-full h-full bg-slate-800 flex items-center justify-center p-3 text-center text-xs font-bold text-slate-400">
                        {item.title}
                      </div>
                    )}

                    {/* Focused Selection Label Overlay */}
                    {isSelected && (
                      <div className="absolute inset-0 bg-gradient-to-t from-slate-950/95 via-transparent to-transparent flex flex-col justify-end p-3">
                        <span className="text-[9px] sm:text-[10px] font-black text-[#00d2ff] uppercase tracking-wider">
                          {vi ? 'Nhấn Enter để xem' : 'Press Enter to Launch'}
                        </span>
                        <p className="text-xs font-extrabold text-white line-clamp-1 mt-0.5">{item.title}</p>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* 3. Circular Action Dock (Dark Minimal Monochrome Design matching reference UI) */}
        <div className="flex items-center justify-center gap-3 sm:gap-6 mt-4 sm:mt-6 px-2 flex-wrap sm:flex-nowrap">
          
          {/* News Button (With Active Orange Tint + Notification Dot) */}
          <Link href="/board" className="group flex flex-col items-center gap-1.5">
            <div className="relative w-11 h-11 sm:w-13 sm:h-13 rounded-full bg-orange-500/10 border border-orange-500/70 text-orange-400 flex items-center justify-center shadow-lg group-hover:scale-110 group-hover:bg-orange-500/25 group-hover:border-orange-400 transition-all duration-200">
              <Newspaper className="w-5 h-5 sm:w-6 sm:h-6 stroke-[1.6]" />
              <span className="absolute top-0.5 right-0.5 w-2 h-2 rounded-full bg-orange-500 ring-2 ring-[#0b0f19] animate-pulse" />
            </div>
            <span className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-slate-300 group-hover:text-orange-400 transition-colors">News</span>
          </Link>

          {/* Library Button */}
          <Link href="/browse" className="group flex flex-col items-center gap-1.5">
            <div className="w-11 h-11 sm:w-13 sm:h-13 rounded-full bg-[#181d28] border border-white/10 text-slate-300 flex items-center justify-center shadow-lg group-hover:scale-110 group-hover:border-cyan-400/60 group-hover:text-white group-hover:bg-slate-800 transition-all duration-200">
              <BookOpen className="w-5 h-5 sm:w-6 sm:h-6 stroke-[1.6]" />
            </div>
            <span className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-slate-400 group-hover:text-slate-200 transition-colors">Library</span>
          </Link>

          {/* Network Button */}
          <Link href="/novel-network" className="group flex flex-col items-center gap-1.5">
            <div className="w-11 h-11 sm:w-13 sm:h-13 rounded-full bg-[#181d28] border border-white/10 text-slate-300 flex items-center justify-center shadow-lg group-hover:scale-110 group-hover:border-cyan-400/60 group-hover:text-white group-hover:bg-slate-800 transition-all duration-200">
              <Network className="w-5 h-5 sm:w-6 sm:h-6 stroke-[1.6]" />
            </div>
            <span className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-slate-400 group-hover:text-slate-200 transition-colors">Network</span>
          </Link>

          {/* Predictions Button */}
          <Link href="/license-prediction" className="group flex flex-col items-center gap-1.5">
            <div className="w-11 h-11 sm:w-13 sm:h-13 rounded-full bg-[#181d28] border border-white/10 text-slate-300 flex items-center justify-center shadow-lg group-hover:scale-110 group-hover:border-cyan-400/60 group-hover:text-white group-hover:bg-slate-800 transition-all duration-200">
              <Sparkles className="w-5 h-5 sm:w-6 sm:h-6 stroke-[1.6]" />
            </div>
            <span className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-slate-400 group-hover:text-slate-200 transition-colors">Predictions</span>
          </Link>

          {/* Settings Button */}
          <div className="group flex flex-col items-center gap-1.5 cursor-pointer">
            <div className="w-11 h-11 sm:w-13 sm:h-13 rounded-full bg-[#181d28] border border-white/10 text-slate-300 flex items-center justify-center shadow-lg group-hover:scale-110 group-hover:border-cyan-400/60 group-hover:text-white group-hover:bg-slate-800 transition-all duration-200">
              <Settings className="w-5 h-5 sm:w-6 sm:h-6 stroke-[1.6]" />
            </div>
            <span className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-slate-400 group-hover:text-slate-200 transition-colors">Settings</span>
          </div>

          {/* Web Mode Toggle Button */}
          {onSwitchToClassicView && (
            <div onClick={onSwitchToClassicView} className="group flex flex-col items-center gap-1.5 cursor-pointer">
              <div className="w-11 h-11 sm:w-13 sm:h-13 rounded-full bg-[#181d28] border border-white/10 text-slate-300 flex items-center justify-center shadow-lg group-hover:scale-110 group-hover:border-cyan-400/60 group-hover:text-white group-hover:bg-slate-800 transition-all duration-200">
                <Power className="w-5 h-5 sm:w-6 sm:h-6 stroke-[1.6]" />
              </div>
              <span className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-slate-400 group-hover:text-slate-200 transition-colors">Web Mode</span>
            </div>
          )}

        </div>

      </div>

      {/* 4. High-Contrast Elevated Glass Footer Bar */}
      <div className="w-full bg-slate-900/90 backdrop-blur-xl border-t border-white/15 px-4 py-3 sm:px-8 flex flex-wrap items-center justify-between gap-2.5 text-xs font-bold shadow-[0_-10px_30px_rgba(0,0,0,0.6)]">
        {/* Left Side: Social Media Icons (Discord & Facebook) */}
        <div className="flex items-center gap-3">
          {/* Discord Icon */}
          <a
            href="https://discord.gg"
            target="_blank"
            rel="noopener noreferrer"
            title="Discord Community"
            className="w-8 h-8 rounded-full bg-indigo-500/20 border border-indigo-500/40 text-indigo-400 flex items-center justify-center hover:bg-indigo-500 hover:text-white hover:scale-110 transition-all shadow-md group"
          >
            <svg className="w-4 h-4 fill-current group-hover:drop-shadow-[0_0_8px_rgba(99,102,241,0.8)]" viewBox="0 0 24 24">
              <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994.021-.041.001-.09-.041-.106a13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.126-.093.252-.19.372-.287a.075.075 0 0 1 .078-.01c3.927 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .079.009c.12.098.245.195.372.288a.077.077 0 0 1-.006.128c-.598.344-1.22.645-1.873.892a.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
            </svg>
          </a>

          {/* Facebook Icon */}
          <a
            href="https://facebook.com"
            target="_blank"
            rel="noopener noreferrer"
            title="Facebook Page"
            className="w-8 h-8 rounded-full bg-blue-500/20 border border-blue-500/40 text-blue-400 flex items-center justify-center hover:bg-blue-500 hover:text-white hover:scale-110 transition-all shadow-md group"
          >
            <svg className="w-4 h-4 fill-current group-hover:drop-shadow-[0_0_8px_rgba(59,130,246,0.8)]" viewBox="0 0 24 24">
              <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
            </svg>
          </a>
        </div>

        <div className="text-[10px] sm:text-[11px] text-slate-400 font-semibold tracking-wide">
          Nintendo Switch Inspired UI &middot; Press A or Enter to launch details
        </div>
      </div>

    </div>
  )
}
