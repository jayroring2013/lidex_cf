'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import {
  Globe, BookOpen, Network, Sparkles, Settings, User,
  Bell, Wifi, Battery, ChevronLeft, ChevronRight, Play, ExternalLink
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
  onCloseSwitchMode?: () => void
}

export default function SwitchHomeView({ items, onCloseSwitchMode }: SwitchHomeViewProps) {
  const { locale } = useLocale()
  const vi = locale === 'vi'

  const [selectedIndex, setSelectedIndex] = useState(0)
  const [timeStr, setTimeStr] = useState('14:38')
  const trackRef = useRef<HTMLDivElement>(null)

  // Real-time clock update
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

  // Scroll active item into view
  useEffect(() => {
    const track = trackRef.current
    if (!track) return
    const children = track.children
    if (children[selectedIndex]) {
      const child = children[selectedIndex] as HTMLElement
      child.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
    }
  }, [selectedIndex])

  // Keyboard navigation handler
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
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [items, currentItem])

  return (
    <div className="fixed inset-0 z-50 bg-[#090d16] text-[#f8fafc] flex flex-col justify-between p-4 sm:p-8 font-sans overflow-hidden select-none"
      style={{
        backgroundImage: `
          radial-gradient(circle at 50% 30%, rgba(6, 182, 212, 0.15) 0%, transparent 60%),
          radial-gradient(circle at 15% 85%, rgba(99, 102, 241, 0.12) 0%, transparent 40%),
          radial-gradient(circle at 85% 85%, rgba(168, 85, 247, 0.12) 0%, transparent 40%)
        `
      }}>
      
      {/* Top Header Bar */}
      <div className="flex items-center justify-between border-b border-white/10 pb-4">
        {/* Left Profile Avatar */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-slate-800 border-2 border-cyan-400 overflow-hidden flex items-center justify-center shadow-[0_0_12px_rgba(6,182,212,0.4)]">
            <User className="w-6 h-6 text-cyan-400" />
          </div>
          <div>
            <div className="text-xs font-black tracking-wide text-white">LiDex User</div>
            <div className="text-[10px] font-bold text-emerald-400">Online</div>
          </div>
        </div>

        {/* Center Switch Brand Logo */}
        <div className="flex items-center gap-2">
          <span className="text-xl font-black uppercase tracking-widest bg-gradient-to-r from-white via-cyan-200 to-cyan-400 bg-clip-text text-transparent">
            LiDex <span className="text-cyan-400 text-xs px-2 py-0.5 rounded-full border border-cyan-400/40 bg-cyan-400/10">Switch Mode</span>
          </span>
        </div>

        {/* Right Status Indicators */}
        <div className="flex items-center gap-4 text-xs font-bold text-slate-300">
          <span>{timeStr}</span>
          <div className="flex items-center gap-1.5 bg-slate-900/80 px-2.5 py-1 rounded-full border border-white/10">
            <Battery className="w-4 h-4 text-emerald-400" />
            <span>89%</span>
          </div>
          <Wifi className="w-4 h-4 text-slate-400" />
          <Bell className="w-4 h-4 text-slate-400 cursor-pointer hover:text-white" />
          
          {onCloseSwitchMode && (
            <button
              onClick={onCloseSwitchMode}
              className="ml-2 px-3 py-1 rounded-full text-[11px] font-extrabold bg-white/10 hover:bg-white/20 text-slate-300 border border-white/10 transition-all"
            >
              ✕ {vi ? 'Thoát Switch Mode' : 'Exit Switch Mode'}
            </button>
          )}
        </div>
      </div>

      {/* Main Center Area */}
      <div className="flex-1 flex flex-col justify-center items-center my-4 relative">
        
        {/* Dynamic Hero Active Title */}
        <div className="text-center mb-6 max-w-2xl px-4 animate-in fade-in duration-300">
          <span className="text-[10px] font-extrabold uppercase tracking-widest text-cyan-400 bg-cyan-500/10 px-3 py-1 rounded-full border border-cyan-500/30">
            {vi ? 'Đang chọn' : 'Now Focused'}
          </span>
          <h2 className="text-2xl sm:text-4xl font-black uppercase tracking-tight text-white mt-2 drop-shadow-[0_0_15px_rgba(6,182,212,0.5)] line-clamp-1">
            {currentItem?.title || 'Selected Title'}
          </h2>
          {currentItem?.score && (
            <div className="text-xs font-bold text-amber-400 mt-1">
              ★ {currentItem.score} {vi ? 'điểm đánh giá' : 'rating score'}
            </div>
          )}
        </div>

        {/* Horizontal Game Cover Carousel */}
        <div className="w-full max-w-6xl relative px-12">
          {/* Scroll Prev / Next Buttons */}
          <button
            onClick={() => setSelectedIndex(prev => (prev > 0 ? prev - 1 : items.length - 1))}
            className="absolute left-0 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-slate-900/80 border border-white/10 text-white flex items-center justify-center z-20 hover:bg-cyan-500/20 hover:border-cyan-400 transition-all"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>

          <button
            onClick={() => setSelectedIndex(prev => (prev < items.length - 1 ? prev + 1 : 0))}
            className="absolute right-0 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-slate-900/80 border border-white/10 text-white flex items-center justify-center z-20 hover:bg-cyan-500/20 hover:border-cyan-400 transition-all"
          >
            <ChevronRight className="w-6 h-6" />
          </button>

          <div
            ref={trackRef}
            className="flex items-center gap-5 overflow-x-auto py-6 px-4 no-scrollbar scroll-smooth"
          >
            {items.map((item, idx) => {
              const isSelected = idx === selectedIndex
              return (
                <div
                  key={`${item.id}-${idx}`}
                  onClick={() => setSelectedIndex(idx)}
                  className={`relative flex-shrink-0 cursor-pointer rounded-2xl overflow-hidden transition-all duration-300 ${
                    isSelected
                      ? 'w-44 h-64 sm:w-52 sm:h-76 ring-4 ring-cyan-400 shadow-[0_0_30px_rgba(6,182,212,0.6)] scale-105 z-10'
                      : 'w-36 h-52 sm:w-40 sm:h-60 opacity-60 hover:opacity-90 scale-95 border border-white/10'
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

                  {/* Focused Card Glow Overlay */}
                  {isSelected && (
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-transparent to-transparent flex flex-col justify-end p-3">
                      <span className="text-[10px] font-black text-cyan-400 uppercase tracking-wider">Vol Release</span>
                      <p className="text-xs font-bold text-white line-clamp-1">{item.title}</p>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Floating Circular Action Dock */}
        <div className="flex items-center justify-center gap-4 sm:gap-6 mt-6">
          <Link href="/board" className="group flex flex-col items-center gap-1.5">
            <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-red-500/20 border border-red-500/40 text-red-400 flex items-center justify-center shadow-lg group-hover:scale-110 group-hover:bg-red-500 group-hover:text-white transition-all duration-200">
              <Globe className="w-6 h-6" />
            </div>
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 group-hover:text-white">News</span>
          </Link>

          <Link href="/browse" className="group flex flex-col items-center gap-1.5">
            <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-blue-500/20 border border-blue-500/40 text-blue-400 flex items-center justify-center shadow-lg group-hover:scale-110 group-hover:bg-blue-500 group-hover:text-white transition-all duration-200">
              <BookOpen className="w-6 h-6" />
            </div>
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 group-hover:text-white">Library</span>
          </Link>

          <Link href="/novel-network" className="group flex flex-col items-center gap-1.5">
            <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center shadow-lg group-hover:scale-110 group-hover:bg-emerald-500 group-hover:text-white transition-all duration-200">
              <Network className="w-6 h-6" />
            </div>
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 group-hover:text-white">Network</span>
          </Link>

          <Link href="/license-prediction" className="group flex flex-col items-center gap-1.5">
            <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-400 flex items-center justify-center shadow-lg group-hover:scale-110 group-hover:bg-amber-500 group-hover:text-white transition-all duration-200">
              <Sparkles className="w-6 h-6" />
            </div>
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 group-hover:text-white">Predictions</span>
          </Link>

          <div className="group flex flex-col items-center gap-1.5 cursor-pointer">
            <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-purple-500/20 border border-purple-500/40 text-purple-400 flex items-center justify-center shadow-lg group-hover:scale-110 group-hover:bg-purple-500 group-hover:text-white transition-all duration-200">
              <Settings className="w-6 h-6" />
            </div>
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 group-hover:text-white">Settings</span>
          </div>
        </div>

      </div>

      {/* Footer Controls & Shortcut Hints */}
      <div className="border-t border-white/10 pt-3 flex flex-wrap items-center justify-between text-xs font-bold text-slate-400">
        <div className="flex items-center gap-4">
          <span className="inline-flex items-center gap-1 text-white">
            <span className="w-5 h-5 rounded-full border border-white/30 bg-white/10 flex items-center justify-center text-[10px] font-black">A</span> Select
          </span>
          <span className="inline-flex items-center gap-1 text-white">
            <span className="w-5 h-5 rounded-full border border-white/30 bg-white/10 flex items-center justify-center text-[10px] font-black">B</span> Back
          </span>
          <span className="inline-flex items-center gap-1 text-white">
            <span className="w-5 h-5 rounded-full border border-white/30 bg-white/10 flex items-center justify-center text-[10px] font-black">←/→</span> Scroll
          </span>
        </div>

        <div className="text-[11px] text-slate-500 font-medium">
          LiDex OS v2.4 &middot; Press Enter or Click A to open highlighted title
        </div>
      </div>

    </div>
  )
}
