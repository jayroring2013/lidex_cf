'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import {
  Newspaper, BookOpen, Network, Sparkles, Settings, Power,
  User, Bell, Wifi, Battery, ChevronLeft, ChevronRight, Gamepad2
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
  onSwitchToClassicView?: () => void
}

export default function SwitchHomeView({ items, onSwitchToClassicView }: SwitchHomeViewProps) {
  const { locale } = useLocale()
  const vi = locale === 'vi'

  const [selectedIndex, setSelectedIndex] = useState(0)
  const [timeStr, setTimeStr] = useState('20:16')
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

  const currentItem = items[selectedIndex] || items[0]

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
  }, [selectedIndex])

  // Keyboard Navigation: Left/Right arrows, Enter for Launch, X for Classic View
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') {
        e.preventDefault()
        setSelectedIndex(prev => (prev < items.length - 1 ? prev + 1 : 0))
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        setSelectedIndex(prev => (prev > 0 ? prev - 1 : items.length - 1))
      } else if (e.key === 'Enter' && currentItem?.href) {
        window.location.href = currentItem.href
      } else if ((e.key === 'x' || e.key === 'X') && onSwitchToClassicView) {
        onSwitchToClassicView()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [items, currentItem, onSwitchToClassicView])

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
        {/* Left User Profile Avatar */}
        <div className="flex items-center gap-2 sm:gap-3 cursor-pointer group">
          <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-slate-800 border-2 border-[#00d2ff] flex items-center justify-center shadow-[0_0_12px_rgba(0,210,255,0.5)] group-hover:scale-105 transition-all">
            <User className="w-5 h-5 sm:w-6 sm:h-6 text-[#00d2ff]" />
          </div>
          <div>
            <div className="text-xs sm:text-sm font-black tracking-wide text-white group-hover:text-[#00d2ff] transition-colors">Alex R.</div>
            <div className="text-[9px] sm:text-[10px] font-bold text-emerald-400 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_#10b981]" />
              Online
            </div>
          </div>
        </div>

        {/* Center Console Brand */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-2.5 py-1 sm:px-3 sm:py-1 rounded-full bg-slate-900/90 border border-white/10 shadow-lg">
            <Gamepad2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#00d2ff]" />
            <span className="text-xs sm:text-sm font-black uppercase tracking-widest bg-gradient-to-r from-white via-cyan-100 to-[#00d2ff] bg-clip-text text-transparent">
              LiDex OS
            </span>
          </div>
        </div>

        {/* Right System Indicators */}
        <div className="flex items-center gap-2 sm:gap-4 text-xs font-bold text-slate-300">
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
        
        {/* Active Title Header (Glow Text with Natural Casing) */}
        <div className="text-center mb-3 sm:mb-5 max-w-3xl px-4 animate-in fade-in duration-300">
          <h2 className="text-xl sm:text-3xl md:text-4xl font-black tracking-tight text-white drop-shadow-[0_0_16px_rgba(0,210,255,0.75)] line-clamp-1">
            {currentItem?.title || 'Classroom of the Elite'}
          </h2>
          
          <div className="flex items-center justify-center gap-2 sm:gap-3 mt-1.5 text-xs font-extrabold">
            {currentItem?.score && (
              <span className="bg-amber-400/20 text-amber-300 border border-amber-400/40 px-2.5 py-0.5 rounded-full shadow-[0_0_10px_rgba(245,158,11,0.3)]">
                ★ {currentItem.score} pts
              </span>
            )}
            <span className="text-slate-400 tracking-wider text-[10px] sm:text-[11px]">
              {vi ? 'Đang chọn phát hành' : 'Selected Volume Release'}
            </span>
          </div>
        </div>

        {/* Horizontal Game Cover Tile Carousel */}
        <div className="w-full max-w-6xl relative px-4 sm:px-12">
          {/* Nav Controls */}
          <button
            onClick={() => setSelectedIndex(prev => (prev > 0 ? prev - 1 : items.length - 1))}
            className="absolute left-1 sm:left-2 top-1/2 -translate-y-1/2 w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-slate-900/90 border border-white/15 text-white flex items-center justify-center z-20 hover:bg-[#00d2ff]/20 hover:border-[#00d2ff] transition-all shadow-xl"
          >
            <ChevronLeft className="w-5 h-5 sm:w-6 sm:h-6" />
          </button>

          <button
            onClick={() => setSelectedIndex(prev => (prev < items.length - 1 ? prev + 1 : 0))}
            className="absolute right-1 sm:right-2 top-1/2 -translate-y-1/2 w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-slate-900/90 border border-white/15 text-white flex items-center justify-center z-20 hover:bg-[#00d2ff]/20 hover:border-[#00d2ff] transition-all shadow-xl"
          >
            <ChevronRight className="w-5 h-5 sm:w-6 sm:h-6" />
          </button>

          {/* Carousel Track with CONSTANT Card Outer Dimensions to Eliminate Jitter */}
          <div
            ref={trackRef}
            className="flex items-center gap-3 sm:gap-6 overflow-x-auto py-6 px-2 sm:px-4 no-scrollbar"
          >
            {items.map((item, idx) => {
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
        <div className="flex flex-wrap items-center gap-4 sm:gap-6 text-slate-200">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-5 h-5 rounded-full bg-cyan-500/20 text-[#00d2ff] border border-cyan-400/50 flex items-center justify-center text-[10px] font-black shadow-[0_0_8px_rgba(0,210,255,0.4)]">A</span>
            <span className="text-white font-extrabold">Select</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-5 h-5 rounded-full bg-cyan-500/20 text-[#00d2ff] border border-cyan-400/50 flex items-center justify-center text-[10px] font-black shadow-[0_0_8px_rgba(0,210,255,0.4)]">B</span>
            <span className="text-white font-extrabold">Back</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-5 h-5 rounded-full bg-cyan-500/20 text-[#00d2ff] border border-cyan-400/50 flex items-center justify-center text-[10px] font-black shadow-[0_0_8px_rgba(0,210,255,0.4)]">X</span>
            <span className="text-white font-extrabold">Web View</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-5 h-5 rounded-full bg-cyan-500/20 text-[#00d2ff] border border-cyan-400/50 flex items-center justify-center text-[10px] font-black shadow-[0_0_8px_rgba(0,210,255,0.4)]">←/→</span>
            <span className="text-white font-extrabold">Scroll</span>
          </span>
        </div>

        <div className="text-[10px] sm:text-[11px] text-slate-400 font-semibold tracking-wide">
          Nintendo Switch Inspired UI &middot; Press A or Enter to launch details
        </div>
      </div>

    </div>
  )
}
