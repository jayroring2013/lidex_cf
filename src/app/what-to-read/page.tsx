'use client'

import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import Link from 'next/link'
import {
  Sparkles, RefreshCw, Volume2, VolumeX, BookOpen,
  ArrowRight, ExternalLink, Filter, Trophy, Star, ShieldAlert,
  Search, LayoutGrid, List, X
} from 'lucide-react'
import { proxyImg } from '@/lib/imageProxy'
import { CaseAudio, type CaseSound } from '@/lib/caseAudio'

function Card({ children, className = '', style = {} }: { children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <div
      className={`rounded-xl ${className}`}
      style={{
        background: 'var(--ln-card-bg)',
        border: '1px solid var(--card-border)',
        boxShadow: 'var(--ln-card-shadow)',
        ...style,
      }}
    >
      {children}
    </div>
  )
}

export type NovelItem = {
  id: string | number
  title: string
  publisher: string
  volumes: number
  score: number
  votes: number
  compositeScore: number
  dropPct: number
  status: string
  coverUrl: string | null
  description: string | null
  href: string
  rarity: number // 0: Common, 1: Rare, 2: Epic, 3: Legendary, 4: Ancient
}

const RARITY_COLORS = ['#4b69ff', '#8847ff', '#d32ce6', '#eb4b4b', '#e4ae39']
const RARITY_NAMES = ['Thông thường', 'Hiếm', 'Sơ cấp', 'Huyền thoại 🔴', 'Báu vật 👑']

function getHoloLineClass(rarity: number): string {
  if (rarity >= 4) return 'holo-line-ancient'
  if (rarity === 3) return 'holo-line-legendary'
  if (rarity === 2) return 'holo-line-epic'
  if (rarity === 1) return 'holo-line-rare'
  return ''
}

// CS:GO Deceleration Curve
function easeOutQuad(p: number) {
  const t = Math.max(0, Math.min(1, p))
  return 1 - Math.pow(1 - t, 3.2)
}

function pickRandomNovel(pool: NovelItem[], excludeIds: (string | number)[] = []): NovelItem {
  if (!pool.length) return null as any
  const filtered = pool.filter(n => !excludeIds.includes(n.id))
  const candidates = filtered.length > 0 ? filtered : pool
  return candidates[Math.floor(Math.random() * candidates.length)]
}

function resolveReleaseStatus(r: any): string {
  if (r.trang_thai && typeof r.trang_thai === 'string' && r.trang_thai.trim()) {
    return r.trang_thai.trim()
  }
  if (r.evalution === 'Completed') return 'Hoàn thành'
  if (r.evalution === 'Dead') return 'Lâu lắm rồi chưa có tập mới'
  if (r.evalution === 'Dropped') return 'Drop'
  if (r.original_status && typeof r.original_status === 'string' && r.original_status.trim()) {
    return r.original_status.trim()
  }
  return 'Đang phát hành'
}

export default function WhatToReadPage() {
  const [novels, setNovels] = useState<NovelItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [imgErrorMap, setImgErrorMap] = useState<Record<string, boolean>>({})

  // Filters
  const [selectedPublisher, setSelectedPublisher] = useState<string>('all')
  const [selectedStatus, setSelectedStatus] = useState<string>('all')
  const [scoreFilter, setScoreFilter] = useState<string>('all')
  const [muted, setMuted] = useState(false)

  // Showcase filters & view mode
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedRarity, setSelectedRarity] = useState<number | null>(null)
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')

  // Wheel State
  const [spinning, setSpinning] = useState(false)
  const [result, setResult] = useState<NovelItem | null>(null)
  const [revealed, setRevealed] = useState(false)
  const [spinCount, setSpinCount] = useState<number>(0)
  const [globalRolls, setGlobalRolls] = useState<number>(0)

  // Reel DOM & Positioning
  const [reel, setReel] = useState<{ id: number; novel: NovelItem }[]>([])
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const trackRef = useRef<HTMLDivElement | null>(null)
  const animFrameRef = useRef<number>(0)
  const busyRef = useRef(false)

  // Audio Engine Ref
  const caseAudioRef = useRef<CaseAudio | null>(null)

  useEffect(() => {
    const audio = new CaseAudio('')
    caseAudioRef.current = audio
    audio.preload()

    const handleVisibility = () => {
      if (document.hidden) audio.pause()
      else audio.recover()
    }
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility)
      audio.dispose()
      caseAudioRef.current = null
    }
  }, [])

  const markImgError = (key: string | number) => {
    setImgErrorMap(prev => ({ ...prev, [String(key)]: true }))
  }

  // Load spin counter & global StatTrak rolls
  useEffect(() => {
    try {
      const saved = localStorage.getItem('lidex_what_to_read_spin_count')
      if (saved) setSpinCount(Number(saved) || 0)
    } catch {}

    fetch('/api/rolls')
      .then(res => res.json())
      .then(d => {
        if (d && typeof d.totalRolls === 'number') setGlobalRolls(d.totalRolls)
      })
      .catch(() => {})
  }, [])

  // Load Novels Data
  async function loadData() {
    setLoading(true)
    setError(null)
    setImgErrorMap({})
    try {
      const res = await fetch('/api/dashboard?mode=watchlist&v=2', { cache: 'no-store' })
      if (!res.ok) throw new Error('Không tải được dữ liệu Light Novel')
      const data = await res.json()
      if (!data || !data.rankingRows) throw new Error('Dữ liệu không hợp lệ')

      // Map fan vote data by series_id
      const voteMap = new Map<number, number>()
      if (Array.isArray(data.voteRows)) {
        for (const v of data.voteRows) {
          const sid = Number(v.series_id)
          if (sid) {
            voteMap.set(sid, Math.max(Number(v.total_votes) || 0, Number(v.votes) || 0))
          }
        }
      }

      // Step 1: Filter 0-volume series and map raw attributes
      const rawNovels = data.rankingRows
        .filter((r: any) => (Number(r.number_of_volumes) || 0) > 0)
        .map((r: any, idx: number) => {
          const targetId = r.lidex_series_id || r.series_id || r.series_code || r.series_key || `id-${idx}`
          const sid = Number(r.lidex_series_id || r.series_id)
          const votes = sid ? (voteMap.get(sid) || 0) : 0
          const score = Number(r.ln_score) || 0

          return {
            id: targetId,
            seriesId: sid,
            title: r.series_title || 'Chưa có tên',
            publisher: r.publisher || 'Không xác định',
            volumes: Math.max(0, Number(r.number_of_volumes) || 0),
            score: score,
            votes: votes,
            dropPct: Number(r.drop_percent) || 0,
            status: resolveReleaseStatus(r),
            coverUrl: proxyImg(r.cover_url),
            description: r.description || null,
            href: `/content/${encodeURIComponent(targetId)}`,
            compositeScore: 0,
            rarity: 0,
          }
        })

      // Step 2: Compute composite score combining LN Score + Fan Vote Popularity
      const maxVotes = Math.max(...rawNovels.map((n: any) => n.votes), 1)

      const novelsWithScore = rawNovels.map((n: any) => {
        // Vote score 0..10 normalized with sqrt curve to avoid extreme outliers
        const voteScore = n.votes > 0 ? 10 * Math.sqrt(n.votes / maxVotes) : 0
        // Composite score: 55% LN score + 45% Fan Popularity score
        const compositeScore = (n.score * 0.55) + (voteScore * 0.45)
        return {
          ...n,
          compositeScore: compositeScore,
        }
      })

      // Step 3: Sort descending by compositeScore (fallback to LN score, then votes)
      novelsWithScore.sort((a: any, b: any) => {
        if (b.compositeScore !== a.compositeScore) return b.compositeScore - a.compositeScore
        if (b.score !== a.score) return b.score - a.score
        return b.votes - a.votes
      })

      // Step 4: Assign dynamic rarity tiers based on composite rank order:
      // Index 0..9 (Top 10): Rarity 4 (👑 Báu vật - Gold, strictly max 10)
      // Index 10..29 (Next 20): Rarity 3 (🔴 Huyền thoại - Red, strictly max 20)
      // Index 30..59 (Next 30): Rarity 2 (🟣 Sơ cấp - Magenta)
      // Index 60..99 (Next 40): Rarity 1 (💜 Hiếm - Purple)
      // Index 100+: Rarity 0 (💙 Thông thường - Blue)
      const mapped: NovelItem[] = novelsWithScore.map((n: any, rankIdx: number) => {
        let rarity = 0
        if (rankIdx < 10) rarity = 4      // Max 10 Báu vật 👑
        else if (rankIdx < 30) rarity = 3 // Max 20 Huyền thoại 🔴
        else if (rankIdx < 60) rarity = 2 // Sơ cấp 🟣
        else if (rankIdx < 100) rarity = 1 // Hiếm 💜
        else rarity = 0                   // Thông thường 💙

        return {
          ...n,
          rarity,
        }
      })

      setNovels(mapped)
      setLoading(false)
    } catch (e: any) {
      console.error('[WhatToRead] fetch failed:', e)
      setError('Không tải được danh sách Light Novel')
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  // Publishers List
  const publishers = useMemo(() => {
    const set = new Set<string>()
    novels.forEach(n => {
      if (n.publisher) set.add(n.publisher)
    })
    return Array.from(set).sort()
  }, [novels])

  // Statuses List (dynamically extracted from all loaded novels)
  const statuses = useMemo(() => {
    const map = new Map<string, number>()
    novels.forEach(n => {
      const s = n.status?.trim()
      if (s) {
        map.set(s, (map.get(s) || 0) + 1)
      }
    })
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([status]) => status)
  }, [novels])

  // Filtered Eligible Novels Pool
  const eligiblePool = useMemo(() => {
    return novels.filter(n => {
      if (selectedPublisher !== 'all' && n.publisher !== selectedPublisher) return false
      if (selectedStatus !== 'all' && n.status.toLowerCase().trim() !== selectedStatus.toLowerCase().trim()) return false
      if (scoreFilter === 'gte_8' && n.score < 8.0) return false
      if (scoreFilter === 'gte_7' && n.score < 7.0) return false
      if (scoreFilter === 'gte_6' && n.score < 6.0) return false
      if (scoreFilter === 'gte_5' && n.score < 5.0) return false
      if (scoreFilter === 'gte_4' && n.score < 4.0) return false
      if (scoreFilter === 'lt_6' && n.score >= 6.0) return false
      return true
    })
  }, [novels, selectedPublisher, selectedStatus, scoreFilter])

  // Count by rarity for quick filter pills
  const rarityCounts = useMemo(() => {
    const counts = [0, 0, 0, 0, 0]
    eligiblePool.forEach(n => {
      if (counts[n.rarity] !== undefined) counts[n.rarity]++
    })
    return counts
  }, [eligiblePool])

  // Displayed pool filtered by search query and rarity tab
  const displayedPool = useMemo(() => {
    let list = eligiblePool
    if (selectedRarity !== null) {
      list = list.filter(n => n.rarity === selectedRarity)
    }
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase()
      list = list.filter(n =>
        n.title.toLowerCase().includes(q) ||
        n.publisher.toLowerCase().includes(q)
      )
    }
    return list
  }, [eligiblePool, selectedRarity, searchQuery])

  // Reset reel whenever pool changes (randomized series across all slots, no adjacent duplicates)
  useEffect(() => {
    if (spinning || !eligiblePool.length) return
    const initialReel: { id: number; novel: NovelItem }[] = []
    let lastId: string | number | null = null
    for (let i = -10; i <= 50; i++) {
      const novel = pickRandomNovel(eligiblePool, lastId !== null ? [lastId] : [])
      initialReel.push({ id: i, novel })
      lastId = novel.id
    }
    setReel(initialReel)

    // Position track at center of index 0 with resize listener and layout fallback
    const updatePosition = () => {
      if (trackRef.current && viewportRef.current && !spinning) {
        const vw = viewportRef.current.clientWidth || (typeof window !== 'undefined' ? window.innerWidth : 1000)
        const initPos = vw / 2 - 105
        trackRef.current.style.transform = `translate3d(${initPos}px, 0, 0)`
      }
    }

    updatePosition()
    const rafId = requestAnimationFrame(updatePosition)
    window.addEventListener('resize', updatePosition)

    return () => {
      cancelAnimationFrame(rafId)
      window.removeEventListener('resize', updatePosition)
    }
  }, [eligiblePool, spinning])

  const toggleSound = () => {
    const nextMuted = !muted
    setMuted(nextMuted)
    caseAudioRef.current?.setMuted(nextMuted)
  }

  // ── Spin Case Handler ───────────────────────────────────────────────────────
  const spinCase = useCallback(() => {
    if (busyRef.current || !eligiblePool.length || !viewportRef.current || !trackRef.current) return
    busyRef.current = true

    // Unlock audio context on user gesture
    caseAudioRef.current?.unlock()
    caseAudioRef.current?.play('csgo_ui_crate_open')

    // Increment StatTrak global roll count
    fetch('/api/rolls', { method: 'POST' })
      .then(res => res.json())
      .then(d => {
        if (d && typeof d.totalRolls === 'number') setGlobalRolls(d.totalRolls)
      })
      .catch(() => {
        setGlobalRolls(g => g + 1)
      })

    // 1. Select Winner from eligible pool
    const winner = eligiblePool[Math.floor(Math.random() * eligiblePool.length)]

    // 2. Build complete card reel (Slots -10 to 50 total)
    const cardStep = 222 // 210px width + 12px gap
    const winnerIndex = 32 // target landing index
    const minSlot = -10
    const maxSlot = 50

    const newCards: { id: number; novel: NovelItem }[] = []
    let lastId: string | number | null = null
    for (let i = minSlot; i <= maxSlot; i++) {
      if (i === winnerIndex) {
        newCards.push({ id: i, novel: winner })
        lastId = winner.id
      } else {
        const exclude = lastId !== null ? [lastId] : []
        if (i === winnerIndex - 1) exclude.push(winner.id)
        const randItem = pickRandomNovel(eligiblePool, exclude)
        newCards.push({ id: i, novel: randItem })
        lastId = randItem.id
      }
    }

    setReel(newCards)
    setSpinning(true)
    setResult(null)

    const vw = viewportRef.current.clientWidth
    const startPos = vw / 2 - 105 // centered on card 0
    const subCardOffset = (Math.random() - 0.5) * 110 // random alignment inside winning card
    const targetCenter = winnerIndex * cardStep + 105
    const endPos = vw / 2 - targetCenter + subCardOffset

    // Initial positioning reset
    trackRef.current.style.transform = `translate3d(${startPos}px, 0, 0)`

    const duration = 5500 // 5.5s spin duration
    const startTime = performance.now()
    let lastCell = 0

    const animate = (now: number) => {
      const progress = Math.max(0, Math.min(1, (now - startTime) / duration))
      const currentPos = startPos + (endPos - startPos) * easeOutQuad(progress)

      if (trackRef.current) {
        trackRef.current.style.transform = `translate3d(${currentPos}px, 0, 0)`
      }

      // Audio Ticking on card border pass (CS2 Crate Item Scroll Sound)
      const currentCell = Math.floor((-currentPos + vw / 2) / cardStep)
      if (currentCell !== lastCell) {
        caseAudioRef.current?.play('csgo_ui_crate_item_scroll')
        lastCell = currentCell
      }

      if (progress < 1) {
        animFrameRef.current = requestAnimationFrame(animate)
        return
      }

      // ── Complete Spin ──────────────────────────────────────────────────────
      busyRef.current = false
      setSpinning(false)
      setResult(winner)
      setRevealed(true)

      // Play rarity reveal sound effect
      const revealSounds: CaseSound[] = [
        'item_reveal3_rare',
        'item_reveal3_rare',
        'item_reveal4_mythical',
        'item_reveal5_legendary',
        'item_reveal6_ancient',
      ]
      caseAudioRef.current?.play(revealSounds[winner.rarity] || 'item_reveal6_ancient')

      // Increment spin count
      setSpinCount(c => {
        const next = c + 1
        try {
          localStorage.setItem('lidex_what_to_read_spin_count', String(next))
        } catch {}
        return next
      })
    }

    animFrameRef.current = requestAnimationFrame(animate)
  }, [eligiblePool])

  useEffect(() => {
    return () => cancelAnimationFrame(animFrameRef.current)
  }, [])

  return (
    <div className="min-h-screen relative overflow-hidden text-slate-100" style={{ background: 'var(--background)' }}>
      {/* Background Ambient Glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-40 left-1/4 w-96 h-96 rounded-full blur-3xl" style={{ background: 'rgba(124,106,245,.12)' }} />
        <div className="absolute top-60 right-1/4 w-96 h-96 rounded-full blur-3xl" style={{ background: 'rgba(236,72,153,.08)' }} />
      </div>

      <div className="relative max-w-[1440px] mx-auto px-3 sm:px-4 lg:px-6 py-5 space-y-6">
        
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800/80 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-2xl">🎁</span>
              <h1 className="text-2xl sm:text-3xl font-black gradient-text">Hôm Nay Đọc Gì?</h1>
            </div>
            <p className="text-xs sm:text-sm text-slate-400 mt-1">
              Hòm quay ngẫu nhiên Light Novel theo cơ chế CS:GO Case Opening dựa trên kho dữ liệu LiDex.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* CS:GO StatTrak™ Global Roll Counter Badge */}
            <div className="flex items-center gap-2.5 px-3.5 py-1.5 rounded-2xl bg-slate-950/90 border border-orange-500/50 shadow-[0_0_20px_rgba(249,115,22,0.25)] hover:border-orange-400 transition-all">
              <span className="text-[10px] font-black tracking-widest text-orange-500 font-mono uppercase bg-orange-950/80 px-2 py-0.5 rounded-md border border-orange-500/40">
                StatTrak™
              </span>
              <div className="flex flex-col">
                <span className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Tổng Lần Mở Case</span>
                <span className="font-mono text-base sm:text-lg font-black text-amber-400 tracking-widest drop-shadow-[0_0_8px_rgba(245,158,11,0.8)] leading-none">
                  {String(globalRolls).padStart(6, '0')}
                </span>
              </div>
            </div>

            <button
              onClick={toggleSound}
              className="px-3 py-2 rounded-xl text-xs font-bold bg-slate-800/80 hover:bg-slate-700 border border-slate-700 flex items-center gap-1.5 transition-all"
            >
              {muted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4 text-emerald-400" />}
              <span>{muted ? 'Tắt âm' : 'Bật âm'}</span>
            </button>

            <button
              onClick={loadData}
              className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 border border-slate-700 transition-all"
              title="Làm mới dữ liệu"
            >
              <RefreshCw className="w-4 h-4 text-slate-300" />
            </button>
          </div>
        </div>

        {/* Filters Bar */}
        <Card className="p-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3 text-xs">
              <div className="flex items-center gap-1.5 text-slate-400 font-bold">
                <Filter className="w-4 h-4" />
                <span>Bộ lọc:</span>
              </div>

              {/* Publisher Filter */}
              <select
                value={selectedPublisher}
                onChange={e => setSelectedPublisher(e.target.value)}
                disabled={spinning}
                className="bg-slate-800 text-slate-200 px-3 py-2 rounded-xl border border-slate-700 font-bold outline-none cursor-pointer"
              >
                <option value="all">Tất cả Nhà xuất bản ({novels.length})</option>
                {publishers.map(p => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>

              {/* Status Filter */}
              <select
                value={selectedStatus}
                onChange={e => setSelectedStatus(e.target.value)}
                disabled={spinning}
                className="bg-slate-800 text-slate-200 px-3 py-2 rounded-xl border border-slate-700 font-bold outline-none cursor-pointer"
              >
                <option value="all">Tất cả Trạng thái</option>
                {statuses.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>

              {/* Score Filter */}
              <select
                value={scoreFilter}
                onChange={e => setScoreFilter(e.target.value)}
                disabled={spinning}
                className="bg-slate-800 text-slate-200 px-3 py-2 rounded-xl border border-slate-700 font-bold outline-none cursor-pointer"
              >
                <option value="all">Tất cả điểm số</option>
                <option value="gte_8">★ ≥ 8.0</option>
                <option value="gte_7">★ ≥ 7.0</option>
                <option value="gte_6">★ ≥ 6.0</option>
                <option value="gte_5">★ ≥ 5.0</option>
                <option value="gte_4">★ ≥ 4.0</option>
                <option value="lt_6">★ &lt; 6.0</option>
              </select>
            </div>

            {/* Counter info */}
            <div className="text-xs font-bold text-slate-400 flex flex-wrap items-center gap-3">
              <span>Cá nhân: <strong className="text-cyan-400 text-sm">{spinCount}</strong> lần</span>
              <span>•</span>
              <span>Pool: <strong className="text-emerald-400 text-sm">{eligiblePool.length}</strong> bộ</span>
            </div>
          </div>
        </Card>

        {/* ── CS:GO REEL CASE WINDOW ────────────────────────────────────────── */}
        <div className="relative rounded-3xl p-6 bg-slate-900/90 border border-slate-700/80 shadow-2xl overflow-hidden">
          {/* Top Ticker Needle Indicator */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 z-30 flex flex-col items-center">
            <div className="w-0.5 h-6 bg-cyan-400 shadow-[0_0_12px_#38bdf8]" />
            <div className="w-3 h-3 rotate-45 bg-cyan-400 -mt-1.5 shadow-[0_0_12px_#38bdf8]" />
          </div>

          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 z-30 flex flex-col items-center">
            <div className="w-3 h-3 rotate-45 bg-cyan-400 -mb-1.5 shadow-[0_0_12px_#38bdf8]" />
            <div className="w-0.5 h-6 bg-cyan-400 shadow-[0_0_12px_#38bdf8]" />
          </div>

          {/* Reel Window Container */}
          <div
            ref={viewportRef}
            className="relative h-64 overflow-hidden rounded-2xl bg-slate-950/80 border border-slate-800"
          >
            {/* Left & Right Fades */}
            <div className="absolute left-0 top-0 bottom-0 w-24 bg-gradient-to-r from-slate-950 to-transparent z-20 pointer-events-none" />
            <div className="absolute right-0 top-0 bottom-0 w-24 bg-gradient-to-l from-slate-950 to-transparent z-20 pointer-events-none" />

            {/* Reel Track Container (Absolute SLOTTED positioning) */}
            <div
              ref={trackRef}
              className="absolute top-4 left-0 h-[220px] will-change-transform"
            >
              {reel.map(({ id, novel }) => {
                const color = RARITY_COLORS[novel.rarity]
                const hasImgErr = imgErrorMap[`reel-${id}`]

                return (
                  <div
                    key={id}
                    className="w-[210px] h-[220px] rounded-2xl p-3 shrink-0 flex flex-col justify-between absolute top-0 overflow-hidden transition-all shadow-xl group border border-slate-700/60"
                    style={{
                      left: `${id * 222}px`,
                      background: `linear-gradient(180deg, rgba(30,41,59,0.92) 0%, rgba(15,23,42,0.98) 100%)`,
                    }}
                  >
                    {/* Novel Cover Preview */}
                    <div className="my-auto flex justify-center pt-1">
                      <div className="w-[96px] h-[136px] rounded-xl overflow-hidden shadow-lg border border-slate-700/80 bg-slate-800 flex items-center justify-center relative shrink-0">
                        {novel.coverUrl && !hasImgErr ? (
                          <img
                            src={novel.coverUrl}
                            alt={novel.title}
                            className="w-full h-full object-cover"
                            onError={() => markImgError(`reel-${id}`)}
                          />
                        ) : (
                          <div className="w-full h-full flex flex-col items-center justify-center p-1 text-center bg-slate-800 text-slate-400">
                            <BookOpen className="w-7 h-7 mb-1 text-sky-400 opacity-60" />
                            <span className="text-[9px] font-bold leading-tight line-clamp-2">{novel.title}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Novel Info */}
                    <div className="pb-1 text-center">
                      <h4 className="text-xs font-black text-white truncate">{novel.title}</h4>
                      <p className="text-[10px] text-slate-400 truncate mt-0.5">{novel.publisher}</p>
                    </div>

                    {/* Bottom Color / Holo Line */}
                    <div
                      className={`absolute bottom-0 inset-x-0 h-1.5 ${getHoloLineClass(novel.rarity)}`}
                      style={{ background: getHoloLineClass(novel.rarity) ? undefined : color }}
                    />
                  </div>
                )
              })}
            </div>
          </div>

          {/* Action Spin Button */}
          <div className="flex justify-center mt-6">
            <button
              onClick={spinCase}
              disabled={spinning || !eligiblePool.length}
              className={`px-8 py-3.5 rounded-2xl text-sm font-black transition-all flex items-center gap-2 shadow-2xl ${
                spinning || !eligiblePool.length
                  ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
                  : 'bg-gradient-to-r from-sky-500 via-indigo-500 to-purple-600 hover:scale-105 active:scale-95 text-white shadow-indigo-500/30'
              }`}
            >
              <Sparkles className={`w-5 h-5 ${spinning ? 'animate-spin' : ''}`} />
              <span>{spinning ? 'Đang mở hòm Light Novel...' : result ? 'Quay lại hòm' : 'Mở hòm ngẫu nhiên'}</span>
            </button>
          </div>
        </div>

        {/* ── UNBOXING REVEAL MODAL ────────────────────────────────────────── */}
        {revealed && result && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
            <div
              className="relative max-w-lg w-full rounded-3xl p-6 shadow-2xl border-2 space-y-5 bg-slate-900 text-slate-100"
              style={{
                borderColor: RARITY_COLORS[result.rarity],
                boxShadow: `0 0 50px ${RARITY_COLORS[result.rarity]}44`,
              }}
            >
              {/* Header Badge */}
              <div className="flex items-center justify-between">
                <span
                  className="text-xs font-black uppercase px-3 py-1 rounded-full text-white"
                  style={{ background: `${RARITY_COLORS[result.rarity]}44`, border: `1px solid ${RARITY_COLORS[result.rarity]}` }}
                >
                  🎉 {RARITY_NAMES[result.rarity]}
                </span>
                <button
                  onClick={() => setRevealed(false)}
                  className="text-xs font-bold text-slate-400 hover:text-white px-2 py-1"
                >
                  Đóng ✕
                </button>
              </div>

              {/* Cover & Info Grid */}
              <div className="flex flex-col sm:flex-row gap-5 items-center">
                <div className="w-32 h-48 rounded-2xl overflow-hidden shrink-0 shadow-2xl border-2 border-white/20 relative bg-slate-800">
                  {result.coverUrl && !imgErrorMap[`result-${result.id}`] ? (
                    <img
                      src={result.coverUrl}
                      alt={result.title}
                      className="w-full h-full object-cover"
                      onError={() => markImgError(`result-${result.id}`)}
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center p-3 text-center bg-slate-800 text-slate-400">
                      <BookOpen className="w-10 h-10 mb-2 text-sky-400 opacity-60" />
                      <span className="text-xs font-bold leading-tight">{result.title}</span>
                    </div>
                  )}
                </div>

                <div className="space-y-2 flex-1 min-w-0 text-center sm:text-left">
                  <h3 className="text-xl font-black text-white leading-tight">{result.title}</h3>
                  <p className="text-xs font-bold text-slate-300">Nhà phát hành: <strong className="text-cyan-400">{result.publisher}</strong></p>
                  
                  <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 pt-1">
                    <span className="bg-emerald-500/20 text-emerald-400 text-xs font-bold px-2.5 py-0.5 rounded-full border border-emerald-500/30">
                      ★ {result.score.toFixed(1)} Điểm LN
                    </span>
                    <span className="bg-sky-500/20 text-sky-400 text-xs font-bold px-2.5 py-0.5 rounded-full border border-sky-500/30">
                      {result.volumes} Tập
                    </span>
                  </div>

                  <p className="text-xs text-slate-400 line-clamp-3 pt-1">
                    {result.description || 'Chưa có mô tả cho series này.'}
                  </p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-3 pt-2">
                <Link
                  href={result.href}
                  onClick={() => setRevealed(false)}
                  className="flex-1 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black text-xs py-3 rounded-xl transition-all text-center flex items-center justify-center gap-1.5 shadow-lg"
                >
                  <span>Đọc ngay / Xem thông số</span>
                  <ArrowRight className="w-4 h-4" />
                </Link>

                <button
                  onClick={() => {
                    setRevealed(false)
                    spinCase()
                  }}
                  className="px-4 py-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl text-xs font-black text-slate-200 transition-all"
                >
                  Quay lại
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── INVENTORY POOL SHOWCASE ──────────────────────────────────────── */}
        <Card className="p-4 sm:p-6 space-y-5">
          {/* Header & Controls Bar */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b" style={{ borderColor: 'var(--card-border)' }}>
            <div className="space-y-1">
              <h3 className="text-base sm:text-lg font-black uppercase tracking-wider flex items-center gap-2" style={{ color: 'var(--foreground)' }}>
                <Trophy className="w-5 h-5 text-amber-400" />
                <span>Danh mục Light Novel trong Hòm ({displayedPool.length}/{eligiblePool.length})</span>
              </h3>
              <p className="text-xs" style={{ color: 'var(--foreground-muted)' }}>
                Bìa sắc nét tỷ lệ 2:3, phân loại theo phẩm cấp và độ phổ biến trên thị trường
              </p>
            </div>

            {/* View Mode Toggle */}
            <div className="flex items-center gap-2 shrink-0">
              <div
                className="flex items-center p-1 rounded-xl border text-xs font-bold"
                style={{ background: 'var(--background-secondary)', borderColor: 'var(--card-border)' }}
              >
                <button
                  type="button"
                  onClick={() => setViewMode('grid')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all ${
                    viewMode === 'grid'
                      ? 'bg-indigo-600 text-white shadow'
                      : 'hover:text-primary-500'
                  }`}
                  style={{ color: viewMode === 'grid' ? '#fff' : 'var(--foreground-secondary)' }}
                  title="Dạng lưới bìa sách (Poster Grid)"
                >
                  <LayoutGrid className="w-4 h-4" />
                  <span className="hidden sm:inline">Lưới bìa sách</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('list')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all ${
                    viewMode === 'list'
                      ? 'bg-indigo-600 text-white shadow'
                      : 'hover:text-primary-500'
                  }`}
                  style={{ color: viewMode === 'list' ? '#fff' : 'var(--foreground-secondary)' }}
                  title="Dạng danh sách chi tiết (List View)"
                >
                  <List className="w-4 h-4" />
                  <span className="hidden sm:inline">Danh sách</span>
                </button>
              </div>
            </div>
          </div>

          {/* Search Bar & Rarity Filter Pills */}
          <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
            {/* Search Input */}
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--foreground-muted)' }} />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Tìm tên truyện, nhà phát hành..."
                className="w-full pl-9 pr-8 py-2 text-xs sm:text-sm rounded-xl border transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
                style={{
                  background: 'var(--background-secondary)',
                  borderColor: 'var(--card-border)',
                  color: 'var(--foreground)',
                }}
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded-full hover:bg-slate-500/20"
                  style={{ color: 'var(--foreground-muted)' }}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Rarity Tabs */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 max-w-full scrollbar-none">
              <button
                type="button"
                onClick={() => setSelectedRarity(null)}
                className="px-3 py-1.5 rounded-xl text-xs font-bold transition-all border shrink-0"
                style={{
                  background: selectedRarity === null ? 'var(--foreground)' : 'var(--background-secondary)',
                  color: selectedRarity === null ? 'var(--background)' : 'var(--foreground-secondary)',
                  borderColor: selectedRarity === null ? 'var(--foreground)' : 'var(--card-border)',
                }}
              >
                Tất cả ({eligiblePool.length})
              </button>

              {RARITY_NAMES.map((name, i) => {
                const isSelected = selectedRarity === i
                const color = RARITY_COLORS[i]
                return (
                  <button
                    key={name}
                    type="button"
                    onClick={() => setSelectedRarity(isSelected ? null : i)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all border shrink-0"
                    style={{
                      background: isSelected ? `${color}22` : 'var(--background-secondary)',
                      color: isSelected ? color : 'var(--foreground-secondary)',
                      borderColor: isSelected ? color : 'var(--card-border)',
                      boxShadow: isSelected ? `0 0 14px ${color}33` : undefined,
                    }}
                  >
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color }} />
                    <span>{name}</span>
                    <span
                      className="px-1.5 py-0.2 rounded-md text-[10px] font-black"
                      style={{
                        background: isSelected ? `${color}44` : 'var(--card-border)',
                        color: isSelected ? color : 'var(--foreground-muted)',
                      }}
                    >
                      {rarityCounts[i]}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Grid View vs List View */}
          {displayedPool.length === 0 ? (
            <div className="py-12 text-center space-y-2">
              <BookOpen className="w-10 h-10 mx-auto text-slate-400 opacity-50" />
              <p className="text-sm font-bold" style={{ color: 'var(--foreground)' }}>Không tìm thấy truyện phù hợp</p>
              <p className="text-xs" style={{ color: 'var(--foreground-muted)' }}>Thử xóa từ khóa tìm kiếm hoặc chọn lại phẩm cấp</p>
            </div>
          ) : viewMode === 'grid' ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3.5 sm:gap-4">
              {displayedPool.map(n => {
                const hasImgErr = imgErrorMap[`inv-${n.id}`]
                const color = RARITY_COLORS[n.rarity]
                return (
                  <Link
                    key={n.id}
                    href={n.href}
                    className="group rounded-2xl overflow-hidden flex flex-col border transition-all duration-200 shadow-sm hover:shadow-xl hover:-translate-y-1 relative"
                    style={{
                      background: 'var(--card-bg)',
                      borderColor: 'var(--card-border)',
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.borderColor = color
                      e.currentTarget.style.boxShadow = `0 12px 24px -6px ${color}40`
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.borderColor = 'var(--card-border)'
                      e.currentTarget.style.boxShadow = 'none'
                    }}
                  >
                    {/* Cover Container - Standard 2:3 book ratio */}
                    <div className="relative aspect-[2/3] w-full overflow-hidden bg-slate-900/10 dark:bg-slate-950 flex items-center justify-center">
                      {n.coverUrl && !hasImgErr ? (
                        <img
                          src={n.coverUrl}
                          alt={n.title}
                          loading="lazy"
                          decoding="async"
                          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                          onError={() => markImgError(`inv-${n.id}`)}
                        />
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center p-3 text-center bg-slate-800 text-slate-400">
                          <BookOpen className="w-8 h-8 mb-1.5 text-sky-400 opacity-60" />
                          <span className="text-[10px] font-bold leading-tight line-clamp-3">{n.title}</span>
                        </div>
                      )}

                      {/* Top Badges Overlay */}
                      <div className="absolute top-2 inset-x-2 flex items-center justify-between gap-1 pointer-events-none">
                        <span
                          className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider text-white shadow-md backdrop-blur-md truncate max-w-[65%]"
                          style={{ background: `${color}e6` }}
                        >
                          {RARITY_NAMES[n.rarity]}
                        </span>
                        <span className="px-1.5 py-0.5 rounded-md text-[10px] font-black text-amber-300 bg-black/75 backdrop-blur-md shadow flex items-center gap-0.5 shrink-0">
                          ★ {n.score.toFixed(1)}
                        </span>
                      </div>

                      {/* Bottom Gradient Overlay on Image */}
                      <div
                        className="absolute bottom-0 inset-x-0 pt-6 pb-2 px-2.5 flex items-center justify-between text-white pointer-events-none"
                        style={{
                          background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.4) 65%, transparent 100%)',
                        }}
                      >
                        <span className="text-[11px] font-bold text-white/90 truncate max-w-[70%]">{n.publisher}</span>
                        <span className="text-[10px] font-black text-white/80 shrink-0">{n.volumes} tập</span>
                      </div>

                      {/* Color accent line */}
                      <div
                        className={`absolute bottom-0 inset-x-0 h-1 sm:h-1.5 ${getHoloLineClass(n.rarity)}`}
                        style={{ background: getHoloLineClass(n.rarity) ? undefined : color }}
                      />
                    </div>

                    {/* Card Body */}
                    <div className="p-3 flex-1 flex flex-col justify-between gap-2">
                      <h4
                        className="text-xs sm:text-sm font-bold line-clamp-2 leading-snug group-hover:text-indigo-500 transition-colors"
                        style={{ color: 'var(--foreground)' }}
                        title={n.title}
                      >
                        {n.title}
                      </h4>
                      <div className="flex items-center justify-between text-[11px] pt-1 border-t" style={{ borderColor: 'var(--card-border)' }}>
                        <span className="truncate max-w-[60%]" style={{ color: 'var(--foreground-muted)' }}>
                          {n.status}
                        </span>
                        <span className="font-bold text-indigo-500 group-hover:translate-x-0.5 transition-transform shrink-0 flex items-center gap-0.5">
                          Chi tiết →
                        </span>
                      </div>
                    </div>
                  </Link>
                )
              })}
            </div>
          ) : (
            /* List View */
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {displayedPool.map(n => {
                const hasImgErr = imgErrorMap[`inv-${n.id}`]
                const color = RARITY_COLORS[n.rarity]
                return (
                  <Link
                    key={n.id}
                    href={n.href}
                    className="p-3 rounded-2xl border transition-all duration-200 flex items-center gap-3.5 group shadow-sm hover:shadow-lg hover:-translate-y-0.5 relative overflow-hidden"
                    style={{
                      background: 'var(--card-bg)',
                      borderColor: 'var(--card-border)',
                    }}
                  >
                    {/* Left Holo / Color bar */}
                    <div
                      className={`w-1.5 self-stretch rounded-full shrink-0 -my-0.5 ${getHoloLineClass(n.rarity)}`}
                      style={{ background: getHoloLineClass(n.rarity) ? undefined : color }}
                    />
                    {/* Cover Thumbnail - w-16 h-24 */}
                    <div className="w-16 h-24 sm:w-20 sm:h-28 rounded-xl overflow-hidden shrink-0 bg-slate-900/10 dark:bg-slate-950 border relative shadow flex items-center justify-center" style={{ borderColor: 'var(--card-border)' }}>
                      {n.coverUrl && !hasImgErr ? (
                        <img
                          src={n.coverUrl}
                          alt={n.title}
                          loading="lazy"
                          decoding="async"
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          onError={() => markImgError(`inv-${n.id}`)}
                        />
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center p-1 text-center bg-slate-800 text-slate-400">
                          <BookOpen className="w-6 h-6 mb-1 text-sky-400 opacity-60" />
                          <span className="text-[9px] font-bold leading-tight line-clamp-2">{n.title}</span>
                        </div>
                      )}
                      <div className="absolute top-1 right-1 px-1 py-0.2 rounded text-[9px] font-black text-amber-300 bg-black/75">
                        ★ {n.score.toFixed(1)}
                      </div>
                    </div>

                    {/* Novel Details */}
                    <div className="flex-1 min-w-0 space-y-1.5">
                      <div className="flex items-center justify-between gap-1 text-xs">
                        <span className="font-bold truncate" style={{ color: 'var(--foreground-muted)' }}>{n.publisher}</span>
                        <span className="text-[11px] font-bold shrink-0" style={{ color: 'var(--foreground-muted)' }}>{n.volumes} tập</span>
                      </div>
                      <h4
                        className="text-sm font-bold line-clamp-2 leading-snug group-hover:text-indigo-500 transition-colors"
                        style={{ color: 'var(--foreground)' }}
                        title={n.title}
                      >
                        {n.title}
                      </h4>
                      <div className="flex items-center justify-between text-xs pt-1">
                        <span
                          className="px-2 py-0.5 rounded-md text-[10px] font-black text-white shrink-0"
                          style={{ background: color }}
                        >
                          {RARITY_NAMES[n.rarity]}
                        </span>
                        <span className="font-bold text-indigo-500 group-hover:translate-x-0.5 transition-transform flex items-center gap-0.5 text-xs">
                          Xem chi tiết →
                        </span>
                      </div>
                    </div>
                  </Link>
                )
              })}
            </div>
          )}
        </Card>

      </div>
    </div>
  )
}
