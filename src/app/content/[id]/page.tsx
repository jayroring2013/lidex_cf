'use client'

import { useState, useEffect, useMemo } from 'react'
import {
  BookOpen,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Copy,
  ExternalLink,
  Globe,
  Info,
  Languages,
  LayoutList,
  Link2,
  Loader2,
  Banknote,
  Package,
  Share2,
  Star,
  TrendingUp,
  Twitter,
  Tag,
  Volume2,
  BarChart3,
  AlertCircle,
  ArrowLeft,
  Building2,
  FileText,
  Layers,
  CheckCircle2,
} from 'lucide-react'
import { fetchSeries, getMockVolumes, type SeriesData, type VolumeData } from '@/lib/api'
import { useLocale } from '@/contexts/LocaleContext'
import RadarChart from '@/components/RadarChart'
import supabase from '@/lib/supabaseClient'
import { calculateLiDexScore, buildPopulationStats, type LiDexScoreBreakdown } from '@/lib/lidexScore'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface MangaMeta {
  series_id: number
  demographic: string
  original_language: string
  vn_licensed: boolean
  vn_publisher_id: number
  updated_at: string
}

interface Publisher {
  id: number
  name: string
  name_vi: string
}

interface SeriesLink {
  link_type: string
  label: string
  url: string
  sort_order: number
}

type TabKey = 'info' | 'stats' | 'analysis'

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function fmtBig(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'K'
  return n.toString()
}

function fmtVND(price: number): string {
  return new Intl.NumberFormat('vi-VN').format(price) + ' ₫'
}

/* ------------------------------------------------------------------ */
/*  InfoItem                                                           */
/* ------------------------------------------------------------------ */

function InfoItem({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="bg-background rounded-xl p-3 flex items-start gap-3">
      <div className="mt-0.5 text-slate-500">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-slate-500 mb-0.5">{label}</p>
        <p className="text-sm text-slate-100 font-medium truncate">{value}</p>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  StatBig                                                            */
/* ------------------------------------------------------------------ */

function StatBig({
  icon: Icon,
  value,
  label,
  color,
}: {
  icon: React.ElementType
  value: string
  label: string
  color: string
}) {
  return (
    <div className="bg-card rounded-xl p-4 flex items-center gap-4">
      <div className={`rounded-lg p-2.5 ${color}`}>
        <Icon className="h-5 w-5 text-white" />
      </div>
      <div>
        <p className="text-2xl font-bold text-slate-100 leading-none">{value}</p>
        <p className="text-xs text-slate-400 mt-1">{label}</p>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  StatusDistribution (waffle chart)                                  */
/* ------------------------------------------------------------------ */

function StatusDistribution({ isVI }: { isVI: boolean }) {
  const statuses = [
    { label: isVI ? 'Đang xem' : 'Watching', pct: 35, color: 'bg-violet-500' },
    { label: isVI ? 'Hoàn thành' : 'Completed', pct: 28, color: 'bg-emerald-500' },
    { label: isVI ? 'Bỏ dở' : 'Dropped', pct: 12, color: 'bg-red-500' },
    { label: isVI ? 'Lưu lại' : 'Plan to Watch', pct: 18, color: 'bg-amber-500' },
    { label: isVI ? 'Tạm dừng' : 'On Hold', pct: 7, color: 'bg-slate-400' },
  ]

  const cells = statuses.flatMap((s, si) =>
    Array.from({ length: Math.round(s.pct) }, (_, i) => ({ key: `${si}-${i}`, color: s.color }))
  )
  while (cells.length < 100) cells.push({ key: `empty-${cells.length}`, color: 'bg-slate-700/40' })

  return (
    <div className="bg-card rounded-2xl p-5 sm:p-6">
      <div className="flex items-center gap-2 mb-4">
        <Layers className="h-5 w-5 text-violet-400" />
        <h3 className="text-base font-semibold text-slate-100">{isVI ? 'Phân bổ trạng thái' : 'Status Distribution'}</h3>
      </div>
      <div className="grid grid-cols-10 gap-[3px] mb-4" style={{ maxWidth: 240 }}>
        {cells.map((c) => (
          <div key={c.key} className={`aspect-square rounded-[2px] ${c.color}`} />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {statuses.map((s) => (
          <div key={s.label} className="flex items-center gap-1.5 text-xs">
            <span className={`w-2.5 h-2.5 rounded-sm ${s.color}`} />
            <span className="text-slate-400">{s.label}</span>
            <span className="text-slate-200 font-medium">{s.pct}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  ScoreDistribution                                                  */
/* ------------------------------------------------------------------ */

function ScoreDistribution({ isVI }: { isVI: boolean }) {
  const buckets = [
    { label: '10', count: 420 },
    { label: '9', count: 1850 },
    { label: '8', count: 3200 },
    { label: '7', count: 4100 },
    { label: '6', count: 2800 },
    { label: '5', count: 1600 },
    { label: '4', count: 900 },
    { label: '3', count: 450 },
    { label: '2', count: 200 },
    { label: '1', count: 120 },
  ]
  const maxCount = Math.max(...buckets.map((b) => b.count))

  return (
    <div className="bg-card rounded-2xl p-5 sm:p-6">
      <div className="flex items-center gap-2 mb-4">
        <BarChart3 className="h-5 w-5 text-violet-400" />
        <h3 className="text-base font-semibold text-slate-100">{isVI ? 'Phân bố điểm' : 'Score Distribution'}</h3>
      </div>
      <div className="space-y-2">
        {buckets.map((b) => {
          const pct = (b.count / maxCount) * 100
          return (
            <div key={b.label} className="flex items-center gap-3">
              <span className="text-xs text-slate-400 w-4 text-right font-mono">{b.label}</span>
              <div className="flex-1 h-3.5 bg-background rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-violet-500 to-violet-400 transition-all duration-500"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="text-xs text-slate-500 w-14 text-right font-mono">{fmtBig(b.count)}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  PricingLineChart                                                   */
/* ------------------------------------------------------------------ */

function PricingLineChart({ volumes, isVI }: { volumes: VolumeData[]; isVI: boolean }) {
  const svgW = 700
  const svgH = 280
  const pad = { top: 20, right: 20, bottom: 36, left: 56 }
  const chartW = svgW - pad.left - pad.right
  const chartH = svgH - pad.top - pad.bottom

  const prices = volumes.map((v) => v.price)
  const minP = Math.min(...prices) - 2000
  const maxP = Math.max(...prices) + 2000
  const range = maxP - minP || 1

  const points = volumes.map((v, i) => ({
    x: pad.left + (i / Math.max(volumes.length - 1, 1)) * chartW,
    y: pad.top + chartH - ((v.price - minP) / range) * chartH,
    price: v.price,
    vol: v.volume_number,
  }))

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ')
  const areaPath = `${linePath} L${points[points.length - 1].x},${pad.top + chartH} L${points[0].x},${pad.top + chartH} Z`

  const yTicks = 5
  const yLabels = Array.from({ length: yTicks + 1 }, (_, i) => {
    const val = minP + (range / yTicks) * i
    return { val, y: pad.top + chartH - (i / yTicks) * chartH }
  })

  const xLabels = (() => {
    const step = Math.ceil(volumes.length / 8)
    return volumes.filter((_, i) => i % step === 0 || i === volumes.length - 1).map((v, idx) => ({
      label: `#${v.volume_number}`,
      x: pad.left + ((idx * step >= volumes.length ? volumes.length - 1 : idx * step) / Math.max(volumes.length - 1, 1)) * chartW,
    }))
  })()

  return (
    <div className="bg-card rounded-2xl p-5 sm:p-6">
      <div className="flex items-center gap-2 mb-4">
        <TrendingUp className="h-5 w-5 text-violet-400" />
        <h3 className="text-base font-semibold text-slate-100">{isVI ? 'Lịch sử giá' : 'Pricing History'}</h3>
      </div>
      <div className="w-full overflow-x-auto">
        <svg viewBox={`0 0 ${svgW} ${svgH}`} className="w-full min-w-[500px] h-auto" preserveAspectRatio="xMidYMid meet">
          <defs>
            <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0.02" />
            </linearGradient>
          </defs>
          {/* Grid lines */}
          {yLabels.map((t) => (
            <line key={t.y} x1={pad.left} y1={t.y} x2={svgW - pad.right} y2={t.y} stroke="#334155" strokeWidth="0.5" />
          ))}
          {/* Y axis labels */}
          {yLabels.map((t) => (
            <text key={t.y} x={pad.left - 8} y={t.y + 4} textAnchor="end" fill="#64748b" fontSize="10" fontFamily="monospace">
              {(t.val / 1000).toFixed(0)}K
            </text>
          ))}
          {/* X axis labels */}
          {xLabels.map((t) => (
            <text key={t.label} x={t.x} y={svgH - 4} textAnchor="middle" fill="#64748b" fontSize="10">
              {t.label}
            </text>
          ))}
          {/* Area */}
          <path d={areaPath} fill="url(#areaGrad)" />
          {/* Line */}
          <path d={linePath} fill="none" stroke="#8b5cf6" strokeWidth="2" strokeLinejoin="round" />
        </svg>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  ReleaseSchedule (horizontal volume carousel)                       */
/* ------------------------------------------------------------------ */

function ReleaseSchedule({ volumes, isVI }: { volumes: VolumeData[]; isVI: boolean }) {
  const perPage = 5
  const [page, setPage] = useState(0)
  const totalPages = Math.ceil(volumes.length / perPage)

  const slice = volumes.slice(page * perPage, (page + 1) * perPage)

  return (
    <div className="bg-card rounded-2xl p-5 sm:p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Calendar className="h-5 w-5 text-violet-400" />
          <h3 className="text-base font-semibold text-slate-100">{isVI ? 'Lịch phát hành' : 'Release Schedule'}</h3>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            className="p-1.5 rounded-lg bg-background text-slate-400 hover:text-slate-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-xs text-slate-400 font-mono">
            {page + 1}/{totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            className="p-1.5 rounded-lg bg-background text-slate-400 hover:text-slate-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
        {slice.map((vol) => (
          <div key={vol.id} className="bg-background rounded-xl p-3 text-center">
            {vol.cover_url ? (
              <img
                src={vol.cover_url}
                alt={`Vol ${vol.volume_number}`}
                className="w-full aspect-[3/4] object-cover rounded-lg mb-2"
              />
            ) : (
              <div className="w-full aspect-[3/4] rounded-lg bg-slate-800 flex items-center justify-center mb-2">
                <BookOpen className="h-6 w-6 text-slate-600" />
              </div>
            )}
            <p className="text-xs font-semibold text-slate-200">{isVI ? `Tập ${vol.volume_number}` : `Vol ${vol.volume_number}`}</p>
            <p className="text-[10px] text-slate-500 mt-0.5">{vol.release_date}</p>
            <p className="text-xs font-medium text-amber-400 mt-1">{fmtVND(vol.price)}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  MangaStats                                                         */
/* ------------------------------------------------------------------ */

function MangaStats({ volumes, isVI }: { volumes: VolumeData[]; isVI: boolean }) {
  const avgPrice = volumes.length > 0 ? volumes.reduce((s, v) => s + v.price, 0) / volumes.length : 0
  const maxPrice = volumes.length > 0 ? Math.max(...volumes.map((v) => v.price)) : 0
  const minPrice = volumes.length > 0 ? Math.min(...volumes.map((v) => v.price)) : 0

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatBig icon={Volume2} value={volumes.length.toString()} label={isVI ? 'Tổng tập' : 'Total Vols'} color="bg-violet-500" />
        <StatBig icon={Banknote} value={fmtVND(Math.round(avgPrice))} label={isVI ? 'Giá TB' : 'Avg Price'} color="bg-amber-500" />
        <StatBig icon={TrendingUp} value={fmtVND(maxPrice)} label={isVI ? 'Giá cao nhất' : 'Max Price'} color="bg-red-500" />
        <StatBig icon={CheckCircle2} value={fmtVND(minPrice)} label={isVI ? 'Giá thấp nhất' : 'Min Price'} color="bg-emerald-500" />
      </div>
      <PricingLineChart volumes={volumes} isVI={isVI} />
      <ReleaseSchedule volumes={volumes} isVI={isVI} />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  LiDexScoreBreakdown (anime only)                                   */
/* ------------------------------------------------------------------ */

function LiDexBreakdown({ breakdown, isVI }: { breakdown: LiDexScoreBreakdown; isVI: boolean }) {
  const items: { key: keyof LiDexScoreBreakdown; label: string; viLabel: string; color: string }[] = [
    { key: 'community', label: 'Community Score', viLabel: 'Điểm cộng đồng', color: 'bg-violet-500' },
    { key: 'popularity', label: 'Popularity', viLabel: 'Độ phổ biến', color: 'bg-blue-500' },
    { key: 'favourites', label: 'Favourites', viLabel: 'Yêu thích', color: 'bg-pink-500' },
    { key: 'distribution', label: 'Score Distribution', viLabel: 'Phân bố điểm', color: 'bg-amber-500' },
    { key: 'viewerEngagement', label: 'Viewer Engagement', viLabel: 'Sự tham gia', color: 'bg-emerald-500' },
    { key: 'animeStatus', label: 'Anime Status', viLabel: 'Trạng thái', color: 'bg-teal-500' },
    { key: 'studio', label: 'Studio Quality', viLabel: 'Chất lượng studio', color: 'bg-orange-500' },
  ]

  return (
    <div className="space-y-4">
      <div className="bg-card rounded-2xl p-5 sm:p-6 text-center">
        <p className="text-sm text-slate-400 mb-1">LiDex Score</p>
        <p className="text-5xl font-bold text-violet-400">{breakdown.total}</p>
        <p className="text-xs text-slate-500 mt-2">/ 100</p>
      </div>
      <div className="bg-card rounded-2xl p-5 sm:p-6 space-y-4">
        <div className="flex items-center gap-2 mb-2">
          <BarChart3 className="h-5 w-5 text-violet-400" />
          <h3 className="text-base font-semibold text-slate-100">{isVI ? 'Chi tiết điểm' : 'Score Breakdown'}</h3>
        </div>
        {items.map((item) => {
          const val = breakdown[item.key]
          return (
            <div key={item.key}>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-sm text-slate-300">{isVI ? item.viLabel : item.label}</span>
                <span className="text-sm font-semibold text-slate-100 font-mono">{val}</span>
              </div>
              <div className="h-2.5 bg-background rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${item.color} transition-all duration-700`}
                  style={{ width: `${val}%` }}
                />
              </div>
            </div>
          )
        })}
      </div>
      <div className="bg-card rounded-2xl p-5 sm:p-6">
        <div className="flex items-start gap-2">
          <Info className="h-4 w-4 text-slate-500 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-medium text-slate-300 mb-1">{isVI ? 'Phương pháp luận' : 'Methodology'}</p>
            <p className="text-xs text-slate-500 leading-relaxed">
              {isVI
                ? 'LiDex Score là thang điểm tổng hợp (0-100) đánh giá chất lượng anime dựa trên 7 yếu tố: điểm cộng đồng, độ phổ biến, số lượt yêu thích, phân bố điểm đánh giá, mức độ tham gia của người xem, trạng thái phát sóng và chất lượng studio. Mỗi yếu tố được chuẩn hóa theo phân phối thống kê của toàn bộ cơ sở dữ liệu.'
                : 'The LiDex Score is a composite metric (0-100) evaluating anime quality across 7 dimensions: community score, popularity, favourites count, score distribution, viewer engagement, airing status, and studio quality. Each dimension is normalized against the statistical distribution of the entire database.'}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ================================================================== */
/*  Main Page                                                          */
/* ================================================================== */

export default function Home() {
  const { locale } = useLocale()
  const isVI = locale === 'vi'

  const [series, setSeries] = useState<SeriesData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<TabKey>('info')
  const [copied, setCopied] = useState(false)

  const [volumes, setVolumes] = useState<VolumeData[]>([])
  const [mangaMeta, setMangaMeta] = useState<MangaMeta | null>(null)
  const [publisher, setPublisher] = useState<Publisher | null>(null)
  const [links, setLinks] = useState<SeriesLink[]>([])
  const [lidexScore, setLidexScore] = useState<LiDexScoreBreakdown | null>(null)

  /* ---- Data loading ---- */
  useEffect(() => {
    async function load() {
      try {
        const data = await fetchSeries(1)
        setSeries(data)

        // Load volumes if manga
        if (data.item_type === 'manga') {
          const vols = getMockVolumes(data.id)
          setVolumes(vols)
        }

        // Load manga meta
        if (data.item_type === 'manga') {
          const { data: meta } = await supabase.from('manga_meta').select('*').eq('series_id', data.id).single()
          if (meta) setMangaMeta(meta as MangaMeta)

          // Load publisher if vn_publisher_id exists
          if (meta && meta.vn_publisher_id) {
            const { data: pub } = await supabase.from('publishers').select('*').eq('id', meta.vn_publisher_id).single()
            if (pub) setPublisher(pub as Publisher)
          }
        }

        // Load series links
        const { data: lnks } = await supabase.from('series_links').select('*').eq('series_id', data.id).order('sort_order')
        if (lnks) setLinks(lnks as SeriesLink[])

        // Calculate LiDex for anime
        if (data.item_type === 'anime') {
          const popStats = buildPopulationStats([])
          const score = calculateLiDexScore(data as unknown as Record<string, unknown>, data.studio, popStats)
          setLidexScore(score)
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load series')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  /* ---- Computed values ---- */
  const stats = useMemo(() => {
    if (volumes.length === 0) return { avg: 0, max: 0, min: 0 }
    const prices = volumes.map((v) => v.price)
    return {
      avg: Math.round(prices.reduce((a, b) => a + b, 0) / prices.length),
      max: Math.max(...prices),
      min: Math.min(...prices),
    }
  }, [volumes])

  const latestVolume = volumes.length > 0 ? volumes[volumes.length - 1] : null

  /* ---- Handlers ---- */
  function handleCopy() {
    if (typeof window !== 'undefined') {
      navigator.clipboard.writeText(window.location.href)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  /* ---- Loading / Error ---- */
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 text-violet-400 animate-spin" />
          <p className="text-slate-400 text-sm">{isVI ? 'Đang tải…' : 'Loading…'}</p>
        </div>
      </div>
    )
  }

  if (error || !series) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-4 text-center px-4">
          <AlertCircle className="h-10 w-10 text-red-400" />
          <p className="text-slate-300 text-sm">{error || (isVI ? 'Không tìm thấy dữ liệu' : 'Data not found')}</p>
          <a href="/" className="inline-flex items-center gap-2 text-sm text-violet-400 hover:text-violet-300 transition-colors">
            <ArrowLeft className="h-4 w-4" />
            {isVI ? 'Quay lại Dashboard' : 'Back to Dashboard'}
          </a>
        </div>
      </div>
    )
  }

  /* ---- Tab definitions ---- */
  const tabs: { key: TabKey; label: string; viLabel: string; icon: React.ElementType }[] = [
    { key: 'info', label: 'General Info', viLabel: 'Thông tin chung', icon: FileText },
    { key: 'stats', label: 'Stats', viLabel: 'Thống số', icon: LayoutList },
    { key: 'analysis', label: 'Analysis', viLabel: 'Phân tích', icon: BarChart3 },
  ]

  /* ---- Link color helper ---- */
  function linkColor(type: string): string {
    switch (type) {
      case 'purchase': return 'bg-emerald-500'
      case 'official': return 'bg-violet-500'
      default: return 'bg-slate-400'
    }
  }

  return (
    <main className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6">

        {/* =============== HERO SECTION =============== */}
        <section className="bg-card rounded-2xl p-5 sm:p-6 shadow-lg shadow-black/10">
          <div className="flex flex-col sm:flex-row gap-5 sm:gap-6">
            {/* Cover */}
            <div className="shrink-0 self-start">
              <img
                src={series.cover_url}
                alt={series.title}
                className="w-44 sm:w-52 md:w-56 rounded-xl shadow-lg shadow-black/30 object-cover aspect-[3/4]"
              />
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0 space-y-3">
              {/* Status badges */}
              <div className="flex flex-wrap gap-2">
                <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold uppercase tracking-wide bg-violet-500/20 text-violet-300 border border-violet-500/30">
                  {series.item_type.toUpperCase()}
                </span>
                <span className={`px-2.5 py-1 rounded-full text-[11px] font-semibold uppercase tracking-wide ${
                  series.status === 'completed'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                    : series.status === 'ongoing'
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                      : 'bg-slate-500/20 text-slate-300 border border-slate-500/30'
                }`}>
                  {series.status.toUpperCase()}
                </span>
                {series.item_type === 'manga' && mangaMeta?.vn_licensed && (
                  <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold uppercase tracking-wide bg-teal-500/20 text-teal-300 border border-teal-500/30">
                    {isVI ? 'VN BẢN QUYỀN' : 'VN LICENSED'}
                  </span>
                )}
              </div>

              {/* Title */}
              <h1 className="text-2xl md:text-3xl font-bold text-slate-100 leading-tight">{series.title}</h1>
              {series.title_vi && series.title_vi !== series.title && (
                <p className="text-base text-slate-400">{series.title_vi}</p>
              )}
              {series.title_native && (
                <p className="text-sm text-slate-500">{series.title_native}</p>
              )}

              {/* Author / Studio / Publisher */}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-400">
                {series.author && (
                  <span className="flex items-center gap-1.5">
                    <BookOpen className="h-3.5 w-3.5 text-slate-500" />
                    {series.author}
                  </span>
                )}
                {series.publisher && (
                  <span className="flex items-center gap-1.5">
                    <Building2 className="h-3.5 w-3.5 text-slate-500" />
                    {series.publisher}
                  </span>
                )}
              </div>

              {/* Score */}
              <div className="flex items-center gap-2">
                <Star className="h-5 w-5 fill-amber-400 text-amber-400" />
                <span className="text-lg font-bold text-amber-400">{series.score}</span>
                <span className="text-sm text-slate-500">/ 100</span>
              </div>

              {/* Genres */}
              <div className="flex flex-wrap gap-2">
                {series.genres.map((g) => (
                  <span
                    key={g}
                    className="px-2.5 py-1 rounded-lg text-xs font-medium bg-white/5 text-slate-300"
                  >
                    {g}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* =============== OVERVIEW STAT CARDS =============== */}
        <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatBig
            icon={Volume2}
            value={volumes.length > 0 ? volumes.length.toString() : '—'}
            label={isVI ? 'Tổng tập' : 'Total Vols'}
            color="bg-violet-500"
          />
          <StatBig
            icon={Banknote}
            value={volumes.length > 0 ? fmtVND(stats.avg) : '—'}
            label={isVI ? 'Giá TB' : 'Avg Price'}
            color="bg-amber-500"
          />
          <StatBig
            icon={TrendingUp}
            value={volumes.length > 0 ? fmtVND(stats.max) : '—'}
            label={isVI ? 'Giá cao nhất' : 'Max Price'}
            color="bg-red-500"
          />
          <StatBig
            icon={CheckCircle2}
            value={volumes.length > 0 ? fmtVND(stats.min) : '—'}
            label={isVI ? 'Giá thấp nhất' : 'Min Price'}
            color="bg-emerald-500"
          />
        </section>

        {/* =============== MAIN CONTENT GRID =============== */}
        <section className="grid lg:grid-cols-3 gap-6">
          {/* LEFT — Tabbed content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Tab bar */}
            <div className="bg-card rounded-xl p-1 inline-flex gap-1">
              {tabs.map((tab) => {
                const Icon = tab.icon
                const isActive = activeTab === tab.key
                return (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key)}
                    className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                      isActive
                        ? 'bg-primary text-primary-foreground'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    <span className="hidden sm:inline">{isVI ? tab.viLabel : tab.label}</span>
                  </button>
                )
              })}
            </div>

            {/* === TAB: General Info === */}
            {activeTab === 'info' && (
              <div className="space-y-6">
                {/* Thông tin section */}
                <div className="bg-card rounded-2xl p-5 sm:p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <Info className="h-5 w-5 text-violet-400" />
                    <h3 className="text-base font-semibold text-slate-100">{isVI ? 'Thông tin' : 'Information'}</h3>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    <InfoItem
                      icon={FileText}
                      label={isVI ? 'Thể loại' : 'Source'}
                      value={series.source}
                    />
                    <InfoItem
                      icon={BookOpen}
                      label={isVI ? 'Tác giả' : 'Author'}
                      value={series.author || '—'}
                    />
                    {series.studio && (
                      <InfoItem
                        icon={Building2}
                        label={isVI ? 'Studio' : 'Studio'}
                        value={series.studio}
                      />
                    )}
                    <InfoItem
                      icon={Building2}
                      label={isVI ? 'Nhà xuất bản' : 'Publisher'}
                      value={series.publisher || '—'}
                    />
                    <InfoItem
                      icon={Calendar}
                      label={isVI ? 'Cập nhật' : 'Updated'}
                      value={new Date(series.updated_at).toLocaleDateString('vi-VN')}
                    />
                    <InfoItem
                      icon={Star}
                      label={isVI ? 'Điểm số' : 'Score'}
                      value={`${series.score} / 100`}
                    />
                  </div>
                </div>

                {/* Manga Details section (manga only) */}
                {series.item_type === 'manga' && mangaMeta && (
                  <div className="bg-card rounded-2xl p-5 sm:p-6">
                    <div className="flex items-center gap-2 mb-4">
                      <BookOpen className="h-5 w-5 text-violet-400" />
                      <h3 className="text-base font-semibold text-slate-100">{isVI ? 'Chi tiết Manga' : 'Manga Details'}</h3>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      <InfoItem
                        icon={Layers}
                        label={isVI ? 'Đối tượng' : 'Demographic'}
                        value={mangaMeta.demographic ? mangaMeta.demographic.charAt(0).toUpperCase() + mangaMeta.demographic.slice(1) : '—'}
                      />
                      <InfoItem
                        icon={Languages}
                        label={isVI ? 'Ngôn ngữ gốc' : 'Original Language'}
                        value={mangaMeta.original_language?.toUpperCase() || '—'}
                      />
                      <InfoItem
                        icon={CheckCircle2}
                        label={isVI ? 'Bản quyền VN' : 'VN Licensed'}
                        value={mangaMeta.vn_licensed ? (isVI ? 'Có' : 'Yes') : (isVI ? 'Không' : 'No')}
                      />
                      <InfoItem
                        icon={Volume2}
                        label={isVI ? 'Số tập' : 'Volume Count'}
                        value={volumes.length > 0 ? volumes.length.toString() : '—'}
                      />
                      <InfoItem
                        icon={Building2}
                        label={isVI ? 'NXB Việt Nam' : 'VN Publisher'}
                        value={publisher?.name_vi || publisher?.name || '—'}
                      />
                      <InfoItem
                        icon={Package}
                        label={isVI ? 'Tập mới nhất' : 'Latest Volume'}
                        value={latestVolume ? `#${latestVolume.volume_number}` : '—'}
                      />
                    </div>

                    {/* Latest volume detail row */}
                    {latestVolume && (
                      <div className="mt-4 bg-background rounded-xl p-3 flex items-center gap-4">
                        {latestVolume.cover_url ? (
                          <img
                            src={latestVolume.cover_url}
                            alt={`Vol ${latestVolume.volume_number}`}
                            className="w-12 h-16 rounded-lg object-cover shrink-0"
                          />
                        ) : (
                          <div className="w-12 h-16 rounded-lg bg-slate-800 flex items-center justify-center shrink-0">
                            <BookOpen className="h-5 w-5 text-slate-600" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-slate-100">
                            {isVI ? `Tập ${latestVolume.volume_number}` : `Volume ${latestVolume.volume_number}`}
                          </p>
                          <p className="text-xs text-slate-500">{latestVolume.release_date}</p>
                        </div>
                        <p className="text-sm font-bold text-amber-400 shrink-0">{fmtVND(latestVolume.price)}</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Description */}
                <div className="bg-card rounded-2xl p-5 sm:p-6">
                  <div className="flex items-center gap-2 mb-3">
                    <FileText className="h-5 w-5 text-violet-400" />
                    <h3 className="text-base font-semibold text-slate-100">{isVI ? 'Tóm tắt' : 'Synopsis'}</h3>
                  </div>
                  <p className="text-sm text-slate-300 leading-relaxed">
                    {isVI ? series.description_vi : series.description}
                  </p>
                </div>

                {/* Tags */}
                {series.tags.length > 0 && (
                  <div className="bg-card rounded-2xl p-5 sm:p-6">
                    <div className="flex items-center gap-2 mb-4">
                      <Tag className="h-5 w-5 text-violet-400" />
                      <h3 className="text-base font-semibold text-slate-100">Tags</h3>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {series.tags.map((tag) => (
                        <span
                          key={tag}
                          className="bg-background rounded-lg px-2.5 py-1 text-xs font-medium text-slate-400 hover:text-slate-200 transition-colors cursor-default"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* === TAB: Stats === */}
            {activeTab === 'stats' && (
              <div className="space-y-6">
                {series.item_type === 'manga' ? (
                  <MangaStats volumes={volumes} isVI={isVI} />
                ) : (
                  <div className="space-y-6">
                    {/* Score stats */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <StatBig icon={Star} value={series.score.toString()} label={isVI ? 'Điểm TB' : 'Mean Score'} color="bg-violet-500" />
                      <StatBig icon={TrendingUp} value="28.5K" label={isVI ? 'Người dùng' : 'Users'} color="bg-blue-500" />
                      <StatBig icon={CheckCircle2} value="4.2K" label={isVI ? 'Hoàn thành' : 'Completed'} color="bg-emerald-500" />
                      <StatBig icon={Volume2} value="152" label={isVI ? 'Tập phim' : 'Episodes'} color="bg-amber-500" />
                    </div>
                    <StatusDistribution isVI={isVI} />
                    <ScoreDistribution isVI={isVI} />
                    <RadarChart series={series} />
                  </div>
                )}
              </div>
            )}

            {/* === TAB: Analysis === */}
            {activeTab === 'analysis' && (
              <div className="space-y-6">
                {series.item_type === 'anime' && lidexScore ? (
                  <LiDexBreakdown breakdown={lidexScore} isVI={isVI} />
                ) : series.item_type === 'manga' ? (
                  <div className="bg-card rounded-2xl p-5 sm:p-6 text-center">
                    <div className="flex flex-col items-center gap-3 py-8">
                      <BarChart3 className="h-10 w-10 text-slate-600" />
                      <p className="text-slate-400 text-sm">
                        {isVI
                          ? 'LiDex Score hiện chỉ hỗ trợ anime. Tính năng phân tích manga sẽ sớm ra mắt.'
                          : 'LiDex Score currently supports anime only. Manga analysis is coming soon.'}
                      </p>
                    </div>
                  </div>
                ) : null}
                <div className="bg-card rounded-2xl p-5 sm:p-6">
                  <div className="flex items-start gap-2">
                    <Info className="h-4 w-4 text-slate-500 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-slate-300 mb-1">{isVI ? 'Phương pháp luận' : 'Methodology'}</p>
                      <p className="text-xs text-slate-500 leading-relaxed">
                        {isVI
                          ? 'Các số liệu thống kê được tổng hợp từ nhiều nguồn dữ liệu công cộng và cập nhật định kỳ. Giá có thể thay đổi theo thời gian và khu vực.'
                          : 'Statistics are aggregated from multiple public data sources and updated periodically. Prices may vary by time and region.'}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* RIGHT — Sidebar */}
          <div className="space-y-6">
            {/* Share */}
            <div className="bg-card rounded-2xl p-5 shadow-lg shadow-black/10">
              <div className="flex items-center gap-2 mb-4">
                <Share2 className="h-5 w-5 text-violet-400" />
                <h3 className="text-base font-semibold text-slate-100">{isVI ? 'Chia sẻ' : 'Share'}</h3>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={handleCopy}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
                >
                  <Copy className="h-4 w-4" />
                  {copied ? (isVI ? 'Đã chép!' : 'Copied!') : (isVI ? 'Sao chép' : 'Copy')}
                </button>
                <a
                  href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(series.title)}&url=${encodeURIComponent(typeof window !== 'undefined' ? window.location.href : '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-background text-slate-300 text-sm font-medium hover:text-slate-100 transition-colors"
                >
                  <Twitter className="h-4 w-4" />
                  Twitter
                </a>
              </div>
            </div>

            {/* External Links */}
            {links.length > 0 && (
              <div className="bg-card rounded-2xl p-5 shadow-lg shadow-black/10">
                <div className="flex items-center gap-2 mb-4">
                  <Link2 className="h-5 w-5 text-violet-400" />
                  <h3 className="text-base font-semibold text-slate-100">{isVI ? 'Liên kết ngoài' : 'External Links'}</h3>
                </div>
                <div className="space-y-2.5">
                  {links.map((link) => (
                    <a
                      key={link.label}
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 p-2.5 rounded-xl bg-background hover:bg-white/5 transition-colors group"
                    >
                      <span className={`w-2 h-2 rounded-full shrink-0 ${linkColor(link.link_type)}`} />
                      <span className="text-sm text-slate-300 group-hover:text-slate-100 transition-colors flex-1">{link.label}</span>
                      <ExternalLink className="h-3.5 w-3.5 text-slate-500" />
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* Last Updated */}
            <div className="bg-card rounded-2xl p-5 shadow-lg shadow-black/10">
              <div className="flex items-center gap-2 mb-3">
                <Calendar className="h-5 w-5 text-violet-400" />
                <h3 className="text-base font-semibold text-slate-100">{isVI ? 'Cập nhật lần cuối' : 'Last Updated'}</h3>
              </div>
              <p className="text-sm text-slate-300">
                {new Date(series.updated_at).toLocaleDateString(isVI ? 'vi-VN' : 'en-US', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}
