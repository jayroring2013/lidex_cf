'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import {
  Newspaper, BookOpen, Network, Sparkles, Settings, Power,
  User, Bell, Wifi, Battery, ChevronLeft, ChevronRight, Gamepad2, ArrowRight
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

  // Smooth scroll focused element into center view
  useEffect(() => {
    const track = trackRef.current
    if (!track) return
    const children = track.children
    if (children[selectedIndex]) {
      const child = children[selectedIndex] as HTMLElement
      child.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
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
    <div className="fixed inset-0 z-50 bg-[#0b0f19] text-[#f8fafc] flex flex-col justify-between p-4 sm:p-7 font-sans overflow-hidden select-none"
      style={{
        backgroundImage: `
          radial-gradient(circle at 50% 35%, rgba(0, 210, 255, 0.15) 0%, transparent 65%),
          radial-gradient(circle at 10% 85%, rgba(99, 102, 241, 0.12) 0%, transparent 40%),
          radial-gradient(circle at 90% 85%, rgba(168, 85, 247, 0.12) 0%, transparent 40%)
        `
      }}>
      
      {/* 1. Authentic Top Header Bar */}
      <div className="flex items-center justify-between border-b border-white/10 pb-3.5">
        {/* Left User Profile Avatar */}
        <div className="flex items-center gap-3 cursor-pointer group">
          <div className="w-10 h-10 rounded-full bg-slate-800 border-2 border-[#00d2ff] flex items-center justify-center shadow-[0_0_12px_rgba(0,210,255,0.5)] group-hover:scale-105 transition-all">
            <User className="w-6 h-6 text-[#00d2ff]" />
          </div>
          <div>
            <div className="text-xs font-black tracking-wide text-white group-hover:text-[#00d2ff] transition-colors">Alex R.</div>
            <div className="text-[10px] font-bold text-emerald-400 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_#10b981]" />
              Online
            </div>
          </div>
        </div>

        {/* Center Console Brand */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-900/80 border border-white/10 shadow-lg">
            <Gamepad2 className="w-4 h-4 text-[#00d2ff]" />
            <span className="text-sm font-black uppercase tracking-widest bg-gradient-to-r from-white via-cyan-100 to-[#00d2ff] bg-clip-text text-transparent">
              LiDex OS
            </span>
          </div>
        </div>

        {/* Right System Indicators */}
        <div className="flex items-center gap-4 text-xs font-bold text-slate-300">
          <span className="text-sm tracking-wider font-extrabold text-white">{timeStr}</span>
          
          <div className="flex items-center gap-1.5 bg-slate-900/90 px-2.5 py-1 rounded-full border border-white/10">
            <Battery className="w-4 h-4 text-emerald-400" />
            <span className="text-[11px] font-extrabold">89%</span>
          </div>

          <Wifi className="w-4 h-4 text-slate-300" />
          <Bell className="w-4 h-4 text-slate-300 hover:text-white cursor-pointer transition-colors" />

          {onSwitchToClassicView && (
            <button
              onClick={onSwitchToClassicView}
              className="ml-2 px-3 py-1 rounded-full text-[11px] font-extrabold bg-white/10 hover:bg-white/20 text-slate-200 border border-white/15 transition-all flex items-center gap-1.5"
            >
              <Power className="w-3 h-3 text-cyan-400" />
              {vi ? 'Web View (X)' : 'Web View (X)'}
            </button>
          )}
        </div>
      </div>

      {/* 2. Main Game Menu Area */}
      <div className="flex-1 flex flex-col justify-center items-center my-2 relative">
        
        {/* Active Title Header (Glow Text) */}
        <div className="text-center mb-5 max-w-3xl px-4 animate-in fade-in duration-300">
          <h2 className="text-2xl sm:text-4xl font-black uppercase tracking-tight text-white drop-shadow-[0_0_16px_rgba(0,210,255,0.75)] line-clamp-1">
            {currentItem?.title || 'Classroom of the Elite'}
          </h2>
          
          <div className="flex items-center justify-center gap-3 mt-2 text-xs font-extrabold">
            {currentItem?.score && (
              <span className="bg-amber-400/20 text-amber-300 border border-amber-400/40 px-2.5 py-0.5 rounded-full shadow-[0_0_10px_rgba(245,158,11,0.3)]">
                ★ {currentItem.score} pts
              </span>
            )}
            <span className="text-slate-400 uppercase tracking-wider text-[11px]">
              {vi ? 'Đang chọn phát hành' : 'Selected Volume Release'}
            </span>
          </div>
        </div>

        {/* Horizontal Game Cover Tile Carousel */}
        <div className="w-full max-w-6xl relative px-10">
          {/* Nav Controls */}
          <button
            onClick={() => setSelectedIndex(prev => (prev > 0 ? prev - 1 : items.length - 1))}
            className="absolute left-0 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-slate-900/90 border border-white/15 text-white flex items-center justify-center z-20 hover:bg-[#00d2ff]/20 hover:border-[#00d2ff] transition-all shadow-xl"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>

          <button
            onClick={() => setSelectedIndex(prev => (prev < items.length - 1 ? prev + 1 : 0))}
            className="absolute right-0 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-slate-900/90 border border-white/15 text-white flex items-center justify-center z-20 hover:bg-[#00d2ff]/20 hover:border-[#00d2ff] transition-all shadow-xl"
          >
            <ChevronRight className="w-6 h-6" />
          </button>

          <div
            ref={trackRef}
            className="flex items-center gap-4 sm:gap-6 overflow-x-auto py-7 px-4 no-scrollbar scroll-smooth"
          >
            {items.map((item, idx) => {
              const isSelected = idx === selectedIndex
              return (
                <div
                  key={`${item.id}-${idx}`}
                  onClick={() => setSelectedIndex(idx)}
                  className={`relative flex-shrink-0 cursor-pointer rounded-2xl overflow-hidden transition-all duration-300 ${
                    isSelected
                      ? 'w-44 h-64 sm:w-56 sm:h-80 border-[3.5px] border-[#00d2ff] shadow-[0_0_32px_rgba(0,210,255,0.7)] scale-105 z-10'
                      : 'w-36 h-52 sm:w-44 sm:h-64 opacity-55 hover:opacity-85 scale-95 border border-white/10'
                  }`}
                >
                  {item.cover_url ? (
                    <img
                      src={item.cover_url}
                      alt={item.title}
                      className="w-full h-full object-cover block"
                    />
                  ) : (
                    <div className="w-full h-full bg-slate-800 flex items-center justify-center p-3 text-center text-xs font-bold text-slate-400">
                      {item.title}
                    </div>
                  )}

                  {/* Focused Selection Label Overlay */}
                  {isSelected && (
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-950/95 via-transparent to-transparent flex flex-col justify-end p-3.5">
                      <span className="text-[10px] font-black text-[#00d2ff] uppercase tracking-wider">
                        {vi ? 'Nhấn Enter để xem' : 'Press Enter to Launch'}
                      </span>
                      <p className="text-xs font-extrabold text-white line-clamp-1 mt-0.5">{item.title}</p>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* 3. Circular Action Dock (Dark Glass Button Design with Updated Icons) */}
        <div className="flex items-center justify-center gap-4 sm:gap-6 mt-6">
          
          {/* News Button */}
          <Link href="/board" className="group flex flex-col items-center gap-1.5">
            <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-red-500/20 border border-red-500/40 text-red-400 flex items-center justify-center shadow-lg group-hover:scale-110 group-hover:bg-red-500 group-hover:text-white transition-all duration-200">
              <Newspaper className="w-6 h-6 stroke-[2]" />
            </div>
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 group-hover:text-white">News</span>
          </Link>

          {/* Library Button */}
          <Link href="/browse" className="group flex flex-col items-center gap-1.5">
            <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-400 flex items-center justify-center shadow-lg group-hover:scale-110 group-hover:bg-amber-500 group-hover:text-white transition-all duration-200">
              <BookOpen className="w-6 h-6 stroke-[2]" />
            </div>
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 group-hover:text-white">Library</span>
          </Link>

          {/* Network Button */}
          <Link href="/novel-network" className="group flex flex-col items-center gap-1.5">
            <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center shadow-lg group-hover:scale-110 group-hover:bg-emerald-500 group-hover:text-white transition-all duration-200">
              <Network className="w-6 h-6 stroke-[2]" />
            </div>
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 group-hover:text-white">Network</span>
          </Link>

          {/* Predictions Button */}
          <Link href="/license-prediction" className="group flex flex-col items-center gap-1.5">
            <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-cyan-500/20 border border-cyan-500/40 text-cyan-400 flex items-center justify-center shadow-lg group-hover:scale-110 group-hover:bg-cyan-500 group-hover:text-white transition-all duration-200">
              <Sparkles className="w-6 h-6 stroke-[2]" />
            </div>
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 group-hover:text-white">Predictions</span>
          </Link>

          {/* Settings Button */}
          <div className="group flex flex-col items-center gap-1.5 cursor-pointer">
            <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-purple-500/20 border border-purple-500/40 text-purple-400 flex items-center justify-center shadow-lg group-hover:scale-110 group-hover:bg-purple-500 group-hover:text-white transition-all duration-200">
              <Settings className="w-6 h-6 stroke-[2]" />
            </div>
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 group-hover:text-white">Settings</span>
          </div>

          {/* Web Mode Toggle Button */}
          {onSwitchToClassicView && (
            <div onClick={onSwitchToClassicView} className="group flex flex-col items-center gap-1.5 cursor-pointer">
              <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-indigo-500/20 border border-indigo-500/40 text-indigo-400 flex items-center justify-center shadow-lg group-hover:scale-110 group-hover:bg-indigo-500 group-hover:text-white transition-all duration-200">
                <Power className="w-6 h-6 stroke-[2]" />
              </div>
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 group-hover:text-white">Web Mode</span>
            </div>
          )}

        </div>

      </div>

      {/* 4. Footer Controller Hints Bar */}
      <div className="border-t border-white/10 pt-3 flex flex-wrap items-center justify-between text-xs font-bold text-slate-400">
        <div className="flex items-center gap-5">
          <span className="inline-flex items-center gap-1.5 text-white">
            <span className="w-5 h-5 rounded-full border border-white/30 bg-white/10 flex items-center justify-center text-[10px] font-black text-cyan-300">A</span> Select
          </span>
          <span className="inline-flex items-center gap-1.5 text-white">
            <span className="w-5 h-5 rounded-full border border-white/30 bg-white/10 flex items-center justify-center text-[10px] font-black text-cyan-300">B</span> Back
          </span>
          <span className="inline-flex items-center gap-1.5 text-white">
            <span className="w-5 h-5 rounded-full border border-white/30 bg-white/10 flex items-center justify-center text-[10px] font-black text-cyan-300">X</span> Web View
          </span>
          <span className="inline-flex items-center gap-1.5 text-white">
            <span className="w-5 h-5 rounded-full border border-white/30 bg-white/10 flex items-center justify-center text-[10px] font-black text-cyan-300">←/→</span> Scroll
          </span>
        </div>

        <div className="text-[11px] text-slate-500 font-semibold">
          Nintendo Switch Inspired UI &middot; Press A or Enter to launch details
        </div>
      </div>

    </div>
  )
}
