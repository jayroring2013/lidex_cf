'use client'

import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import Link from 'next/link'
import {
  Sparkles, RefreshCw, Volume2, VolumeX, BookOpen,
  ArrowRight, ExternalLink, Filter, Trophy, Star, ShieldAlert
} from 'lucide-react'
import { Card } from '@/components/PublisherFocusView'
import { proxyImg } from '@/lib/imageProxy'

export type NovelItem = {
  id: string | number
  title: string
  publisher: string
  volumes: number
  score: number
  dropPct: number
  status: string
  coverUrl: string | null
  description: string | null
  href: string
  rarity: number // 0: Common, 1: Rare, 2: Epic, 3: Legendary, 4: Ancient
}

const RARITY_COLORS = ['#4b69ff', '#8847ff', '#d32ce6', '#eb4b4b', '#e4ae39']
const RARITY_NAMES = ['Thông thường', 'Hiếm', 'Sơ cấp', 'Huyền thoại', 'Báu vật 👑']

function calculateRarity(score: number): number {
  if (score >= 8.5) return 4
  if (score >= 7.8) return 3
  if (score >= 7.0) return 2
  if (score >= 6.0) return 1
  return 0
}

// ── Web Audio Synth Ticker ───────────────────────────────────────────────────
class WebAudioSynth {
  ctx: AudioContext | null = null
  muted: boolean = false

  init() {
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext
      if (AudioCtx) this.ctx = new AudioCtx()
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {})
    }
  }

  playTick() {
    if (this.muted) return
    this.init()
    if (!this.ctx) return
    try {
      const osc = this.ctx.createOscillator()
      const gain = this.ctx.createGain()
      osc.type = 'triangle'
      osc.frequency.setValueAtTime(440, this.ctx.currentTime)
      osc.frequency.exponentialRampToValueAtTime(120, this.ctx.currentTime + 0.04)
      gain.gain.setValueAtTime(0.15, this.ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.04)
      osc.connect(gain)
      gain.connect(this.ctx.destination)
      osc.start()
      osc.stop(this.ctx.currentTime + 0.04)
    } catch {}
  }

  playWin() {
    if (this.muted) return
    this.init()
    if (!this.ctx) return
    try {
      const now = this.ctx.currentTime
      const notes = [523.25, 659.25, 783.99, 1046.50]
      notes.forEach((freq, i) => {
        const osc = this.ctx!.createOscillator()
        const gain = this.ctx!.createGain()
        osc.type = 'sine'
        osc.frequency.setValueAtTime(freq, now + i * 0.08)
        gain.gain.setValueAtTime(0.2, now + i * 0.08)
        gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.08 + 0.3)
        osc.connect(gain)
        gain.connect(this.ctx!.destination)
        osc.start(now + i * 0.08)
        osc.stop(now + i * 0.08 + 0.3)
      })
    } catch {}
  }
}

const audioSynth = new WebAudioSynth()

// CS:GO Deceleration Curve
function easeOutQuad(p: number) {
  const t = Math.max(0, Math.min(1, p))
  return 1 - Math.pow(1 - t, 3.2)
}

export default function WhatToReadPage() {
  const [novels, setNovels] = useState<NovelItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [imgErrorMap, setImgErrorMap] = useState<Record<string, boolean>>({})

  // Filters
  const [selectedPublisher, setSelectedPublisher] = useState<string>('all')
  const [selectedStatus, setSelectedStatus] = useState<string>('all')
  const [minScore, setMinScore] = useState<number>(0)
  const [muted, setMuted] = useState(false)

  // Wheel State
  const [spinning, setSpinning] = useState(false)
  const [result, setResult] = useState<NovelItem | null>(null)
  const [revealed, setRevealed] = useState(false)
  const [spinCount, setSpinCount] = useState<number>(0)

  // Reel DOM & Positioning
  const [reel, setReel] = useState<{ id: number; novel: NovelItem }[]>([])
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const trackRef = useRef<HTMLDivElement | null>(null)
  const animFrameRef = useRef<number>(0)
  const busyRef = useRef(false)

  const markImgError = (key: string | number) => {
    setImgErrorMap(prev => ({ ...prev, [String(key)]: true }))
  }

  // Load spin counter
  useEffect(() => {
    try {
      const saved = localStorage.getItem('lidex_what_to_read_spin_count')
      if (saved) setSpinCount(Number(saved) || 0)
    } catch {}
  }, [])

  // Load Novels Data
  async function loadData() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/dashboard?mode=watchlist')
      if (!res.ok) throw new Error('Không tải được dữ liệu Light Novel')
      const data = await res.json()
      if (!data || !data.rankingRows) throw new Error('Dữ liệu không hợp lệ')

      const mapped: NovelItem[] = data.rankingRows.map((r: any, idx: number) => {
        const score = Number(r.ln_score) || 0
        const targetId = r.lidex_series_id || r.series_id || r.series_code || r.series_key || `id-${idx}`
        return {
          id: targetId,
          title: r.series_title || 'Chưa có tên',
          publisher: r.publisher || 'Không xác định',
          volumes: Math.max(0, Number(r.number_of_volumes) || 0),
          score: score,
          dropPct: Number(r.drop_percent) || 0,
          status: r.trang_thai || r.evalution || 'Đang phát hành',
          coverUrl: proxyImg(r.cover_url),
          description: r.description || null,
          href: `/content/${encodeURIComponent(targetId)}`,
          rarity: calculateRarity(score),
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

  // Filtered Eligible Novels Pool
  const eligiblePool = useMemo(() => {
    return novels.filter(n => {
      if (selectedPublisher !== 'all' && n.publisher !== selectedPublisher) return false
      if (selectedStatus !== 'all' && !n.status.toLowerCase().includes(selectedStatus.toLowerCase())) return false
      if (n.score < minScore) return false
      return true
    })
  }, [novels, selectedPublisher, selectedStatus, minScore])

  // Reset reel whenever pool changes
  useEffect(() => {
    if (spinning || !eligiblePool.length) return
    const initialReel = Array.from({ length: 45 }, (_, i) => ({
      id: i,
      novel: eligiblePool[i % eligiblePool.length],
    }))
    setReel(initialReel)

    // Position track at center of index 0
    if (trackRef.current && viewportRef.current) {
      const vw = viewportRef.current.clientWidth
      const initPos = vw / 2 - 105
      trackRef.current.style.transform = `translate3d(${initPos}px, 0, 0)`
    }
  }, [eligiblePool, spinning])

  const toggleSound = () => {
    audioSynth.muted = !muted
    setMuted(!muted)
  }

  // ── Spin Case Handler ───────────────────────────────────────────────────────
  const spinCase = useCallback(() => {
    if (busyRef.current || !eligiblePool.length || !viewportRef.current || !trackRef.current) return
    busyRef.current = true
    audioSynth.init()

    // 1. Select Winner from eligible pool
    const winner = eligiblePool[Math.floor(Math.random() * eligiblePool.length)]

    // 2. Build complete card reel (50 cards total)
    const cardStep = 222 // 210px width + 12px gap
    const winnerIndex = 32 // target landing index
    const totalCards = 50

    const newCards: { id: number; novel: NovelItem }[] = []
    for (let i = 0; i < totalCards; i++) {
      if (i === winnerIndex) {
        newCards.push({ id: i, novel: winner })
      } else {
        const randItem = eligiblePool[Math.floor(Math.random() * eligiblePool.length)]
        newCards.push({ id: i, novel: randItem })
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

      // Audio Ticking on card border pass
      const currentCell = Math.floor((-currentPos + vw / 2) / cardStep)
      if (currentCell !== lastCell) {
        audioSynth.playTick()
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
      audioSynth.playWin()

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

          <div className="flex items-center gap-3">
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
                <option value="phát hành">Đang phát hành</option>
                <option value="hoàn thành">Hoàn thành</option>
                <option value="bắt kịp">Đã bắt kịp JP</option>
              </select>

              {/* Min Score Filter */}
              <select
                value={minScore}
                onChange={e => setMinScore(Number(e.target.value))}
                disabled={spinning}
                className="bg-slate-800 text-slate-200 px-3 py-2 rounded-xl border border-slate-700 font-bold outline-none cursor-pointer"
              >
                <option value={0}>Tất cả điểm số</option>
                <option value={8.0}>★ ≥ 8.0 (Kiệt tác / Masterpiece)</option>
                <option value={7.0}>★ ≥ 7.0 (Chất lượng cao)</option>
                <option value={6.0}>★ ≥ 6.0 (Khá tốt)</option>
              </select>
            </div>

            {/* Counter info */}
            <div className="text-xs font-bold text-slate-400 flex items-center gap-2">
              <span>Đã quay: <strong className="text-cyan-400 text-sm">{spinCount}</strong> lần</span>
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

            {/* Reel Track */}
            <div
              ref={trackRef}
              className="absolute top-4 left-0 flex items-center gap-3 will-change-transform"
            >
              {reel.map(({ id, novel }) => {
                const color = RARITY_COLORS[novel.rarity]
                const hasImgErr = imgErrorMap[`reel-${id}`] || imgErrorMap[novel.id]

                return (
                  <div
                    key={id}
                    className="w-[210px] h-[220px] rounded-2xl p-3 shrink-0 flex flex-col justify-between relative overflow-hidden transition-all shadow-xl group border border-slate-700/60"
                    style={{
                      background: `linear-gradient(180deg, rgba(30,41,59,0.9) 0%, rgba(15,23,42,0.95) 100%)`,
                      borderBottom: `4px solid ${color}`,
                    }}
                  >
                    {/* Top Rarity Badge */}
                    <div className="flex items-center justify-between text-[10px] font-black uppercase">
                      <span className="px-2 py-0.5 rounded-full text-white" style={{ background: `${color}44`, border: `1px solid ${color}88` }}>
                        {RARITY_NAMES[novel.rarity]}
                      </span>
                      <span className="text-emerald-400">★ {novel.score.toFixed(1)}</span>
                    </div>

                    {/* Novel Cover Preview */}
                    <div className="my-auto flex justify-center">
                      <div className="w-20 h-28 rounded-xl overflow-hidden shadow-lg border border-slate-700 bg-slate-800 flex items-center justify-center relative">
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
                    <div>
                      <h4 className="text-xs font-black text-white truncate text-center">{novel.title}</h4>
                      <p className="text-[10px] text-slate-400 text-center truncate mt-0.5">{novel.publisher}</p>
                    </div>
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
              <span>{spinning ? 'Đang mở hòm Light Novel...' : result ? 'Quay lại hòm 🎲' : 'Mở Hòm Ngẫu Nhiên 🎲'}</span>
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
                  Quay lại 🎲
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── INVENTORY POOL SHOWCASE ──────────────────────────────────────── */}
        <Card className="p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-black uppercase tracking-wider text-slate-200 flex items-center gap-2">
              <Trophy className="w-4 h-4 text-amber-400" />
              <span>Danh mục Light Novel trong Hòm ({eligiblePool.length})</span>
            </h3>
            <div className="flex items-center gap-3 text-xs font-bold text-slate-400">
              {RARITY_NAMES.map((name, i) => (
                <span key={name} className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: RARITY_COLORS[i] }} />
                  <span>{name}</span>
                </span>
              ))}
            </div>
          </div>

          {/* Inventory Grid with Small Cover Image Thumbnail */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {eligiblePool.map(n => {
              const hasImgErr = imgErrorMap[`inv-${n.id}`] || imgErrorMap[n.id]
              return (
                <Link
                  key={n.id}
                  href={n.href}
                  className="p-2.5 rounded-xl bg-slate-900/60 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 transition-all flex items-center gap-3 group overflow-hidden"
                  style={{ borderLeft: `4px solid ${RARITY_COLORS[n.rarity]}` }}
                >
                  {/* Small Cover Image Thumbnail */}
                  <div className="w-11 h-16 rounded-lg overflow-hidden shrink-0 bg-slate-800 border border-slate-700 flex items-center justify-center relative">
                    {n.coverUrl && !hasImgErr ? (
                      <img
                        src={n.coverUrl}
                        alt={n.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                        onError={() => markImgError(`inv-${n.id}`)}
                      />
                    ) : (
                      <BookOpen className="w-5 h-5 text-sky-400 opacity-60" />
                    )}
                  </div>

                  {/* Novel Details */}
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center justify-between text-[10px] font-bold text-slate-400">
                      <span className="truncate max-w-[85px]">{n.publisher}</span>
                      <span className="text-emerald-400">★ {n.score.toFixed(1)}</span>
                    </div>
                    <h5 className="text-xs font-black text-slate-200 group-hover:text-white truncate leading-tight">{n.title}</h5>
                    <div className="flex items-center justify-between text-[10px] text-slate-400 font-bold">
                      <span>{n.volumes} tập</span>
                      <span className="text-indigo-400 group-hover:translate-x-0.5 transition-transform">Xem →</span>
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        </Card>

      </div>
    </div>
  )
}
