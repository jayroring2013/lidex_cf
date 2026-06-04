'use client'

import { useRef, useState, useEffect, useId, type ReactNode } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import {
  Star, Calendar, BookOpen, Info, Tags,
  ExternalLink, Share2, Copy, Loader2,
  ArrowLeft, Award, TrendingUp, Globe, ChevronDown, ChevronUp,
  BarChart2, FlaskConical, Users, Film, Layers, BookMarked,
  Languages, BadgeCheck, Building2, AlertTriangle, Search, Image as ImageIcon
} from 'lucide-react'
import { fetchSeries } from '@/lib/api'
import { useLocale } from '@/contexts/LocaleContext'
import RadarChart from '@/components/RadarChart'
import supabase from '@/lib/supabaseClient'
import {
  calculateLiDexScore,
  buildPopulationStats,
  type LiDexScoreBreakdown,
} from '@/lib/lidexScore'

interface Volume {
  volume_number?: number
  price: string | number
}
 
interface TooltipState {
  visible: boolean
  x: number
  y: number
  price: number
  volNumber: number | undefined
}

type FanVotePoint = {
  period: string
  sort: number
  votes: number
  rank: number | null
}

// ── Score helpers ─────────────────────────────────────────────────────────────

function scoreColor(s: number) {
  if (s >= 80) return '#4ade80'
  if (s >= 65) return '#86efac'
  if (s >= 50) return '#fbbf24'
  if (s >= 35) return '#fb923c'
  return '#f87171'
}

function scoreGrade(s: number) {
  if (s >= 85) return 'S'
  if (s >= 75) return 'A'
  if (s >= 60) return 'B'
  if (s >= 45) return 'C'
  if (s >= 30) return 'D'
  return 'F'
}

const COMPONENT_META: { key: keyof LiDexScoreBreakdown; label: string; weight: number }[] = [
  { key: 'community',        label: 'Community Score',    weight: 30 },
  { key: 'popularity',       label: 'Popularity',         weight: 18 },
  { key: 'favourites',       label: 'Favourites',         weight: 17 },
  { key: 'distribution',     label: 'Score Distribution', weight: 13 },
  { key: 'viewerEngagement', label: 'Viewer Engagement',  weight: 12 },
  { key: 'animeStatus',      label: 'Status',             weight:  5 },
  { key: 'studio',           label: 'Studio Rep.',        weight:  5 },
]

// ── Language code → readable label ───────────────────────────────────────────
const LANG_LABELS: Record<string, string> = {
  ja: 'Japanese', ko: 'Korean', zh: 'Chinese',
  vi: 'Vietnamese', th: 'Thai', en: 'English',
}

// ── Demographic → readable label ──────────────────────────────────────────────
const DEMO_LABELS: Record<string, string> = {
  shounen: 'Shounen', shoujo: 'Shoujo',
  seinen: 'Seinen',   josei: 'Josei', none: 'General',
}


// ── LN Dead-or-Alive analytics helpers ───────────────────────────────────────
interface NovelRankingRow {
  id: number
  series_title: string | null
  series_id: string | null
  lidex_series_id: number | null
  series_code: string | null
  number_of_volumes: number | null
  average_price: number | null
  max_release_at: string | null
  average_view_count: number | null
  publisher: string | null
  original_volumes: number | null
  original_status: string | null
  evalution: string | null
  evaluation_basis: string | null
  ln_score: number | null
  trang_thai: string | null
  drop_percent: number | null
  drop_basis: string | null
  average_gap_months: number | null
  months_since_last_release: number | null
  completion_ratio: number | null
  publisher_activity: string | null
  publisher_releases_last_24m: number | null
  score_components: string | null
  drop_components: string | null
  cover_url: string | null
  cover_source_title: string | null
  updated_at?: string | null
}

type NovelRadarAxis = {
  label: string
  value: number
  hint: string
}

function lnNum(value: unknown, fallback = 0) {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function lnDropPercent(value: number | null | undefined) {
  const n = lnNum(value)
  return n <= 1 ? Math.round(n * 100) : Math.round(n)
}

function lnScoreColor(score: number | null | undefined) {
  const s = lnNum(score)
  if (s >= 8) return '#22c55e'
  if (s >= 6) return '#38bdf8'
  if (s >= 4) return '#eab308'
  return '#ef4444'
}

function lnDropColor(drop: number | null | undefined) {
  const p = lnDropPercent(drop)
  if (p <= 25) return '#22c55e'
  if (p <= 55) return '#eab308'
  return '#ef4444'
}

function lnEvalColor(evalution?: string | null) {
  return ({
    Completed: '#38bdf8',
    Good: '#22c55e',
    Limping: '#eab308',
    Dead: '#f97316',
    Dropped: '#ef4444',
  } as Record<string, string>)[evalution || ''] || '#94a3b8'
}

function lnReleaseStatus(row: NovelRankingRow) {
  return row.trang_thai || (
    row.evalution === 'Completed'
      ? 'Hoàn thành'
      : row.evalution === 'Dead'
        ? 'Lâu lắm rồi chưa có tập mới'
        : row.evalution === 'Dropped'
          ? 'Drop'
          : 'Đang phát hành'
  )
}

function lnEvalLabel(evalution?: string | null, isVI = true) {
  const vi = { Completed: 'Hoàn thành', Good: 'Tốt', Limping: 'Cầm chừng', Dead: 'Gần chết', Dropped: 'Đã drop' } as Record<string, string>
  const en = { Completed: 'Completed', Good: 'Good', Limping: 'Limping', Dead: 'Inactive', Dropped: 'Dropped' } as Record<string, string>
  return (isVI ? vi : en)[evalution || ''] || evalution || '—'
}

function lnReleaseStatusLabel(status: string, isVI = true) {
  if (isVI) return status
  return ({
    'Đang phát hành': 'Active',
    'Lâu lắm rồi chưa có tập mới': 'Long inactive',
    Drop: 'Dropped',
    'Đã bắt kịp bản gốc JP': 'Caught up to JP',
    'Hoàn thành': 'Completed',
  } as Record<string, string>)[status] || status
}

function lnClamp10(value: number) {
  return Math.max(0, Math.min(10, Number.isFinite(value) ? value : 0))
}

function lnReleasePaceScore(row: NovelRankingRow) {
  const gap = row.average_gap_months == null ? null : lnNum(row.average_gap_months)
  const months = row.months_since_last_release == null ? null : lnNum(row.months_since_last_release)

  let gapScore = 5
  if (gap !== null) {
    if (gap <= 4) gapScore = 9.5
    else if (gap <= 6) gapScore = 8.5
    else if (gap <= 12) gapScore = 6.5
    else if (gap <= 18) gapScore = 4.5
    else if (gap <= 24) gapScore = 3
    else gapScore = 1.5
  }

  let recencyScore = 5
  if (months !== null) {
    if (months <= 6) recencyScore = 9
    else if (months <= 12) recencyScore = 7
    else if (months <= 18) recencyScore = 5
    else if (months <= 24) recencyScore = 3
    else if (months <= 36) recencyScore = 1.8
    else recencyScore = 1
  }

  return Number((gapScore * 0.6 + recencyScore * 0.4).toFixed(1))
}

function lnCatchUpScore(row: NovelRankingRow) {
  if (row.completion_ratio != null) {
    const r = lnNum(row.completion_ratio)
    return lnClamp10((r > 1 ? r / 100 : r) * 10)
  }
  const original = lnNum(row.original_volumes)
  if (original > 0) return lnClamp10(lnNum(row.number_of_volumes) / original * 10)
  return 5
}

function lnCompletionRatio(row: NovelRankingRow) {
  if (row.completion_ratio != null) {
    const r = lnNum(row.completion_ratio)
    return r > 1 ? r / 100 : r
  }
  const original = lnNum(row.original_volumes)
  if (original > 0) return lnNum(row.number_of_volumes) / original
  return null
}

function lnPercentileScore(rows: NovelRankingRow[], value: number | null | undefined, getter: (row: NovelRankingRow) => number) {
  const sorted = rows.map(getter).filter(Number.isFinite).sort((a, b) => a - b)
  if (value == null || sorted.length <= 1) return 5
  const n = lnNum(value)
  const idx = sorted.findIndex(v => v >= n)
  const rank = idx < 0 ? sorted.length - 1 : idx
  return Number(((rank / (sorted.length - 1)) * 10).toFixed(1))
}

function lnPublisherSupportScore(row: NovelRankingRow) {
  const base = ({ Active: 8, Moderate: 6.5, Low: 4.5, Inactive: 2 } as Record<string, number>)[row.publisher_activity || ''] ?? 5
  return Number(lnClamp10(base + Math.min(lnNum(row.publisher_releases_last_24m) / 50 * 2, 2)).toFixed(1))
}

function lnCompletionSafetyScore(row: NovelRankingRow) {
  if (row.evalution === 'Completed') return 10
  return Number(lnClamp10((1 - lnDropPercent(row.drop_percent) / 100) * 10).toFixed(1))
}

function lnMomentumScore(row: NovelRankingRow) {
  const base = ({ Active: 7.5, Moderate: 6, Low: 4, Inactive: 2 } as Record<string, number>)[row.publisher_activity || ''] ?? 5
  const releases = lnClamp10(lnNum(row.publisher_releases_last_24m) / 40 * 10)
  const months = row.months_since_last_release == null ? null : lnNum(row.months_since_last_release)
  let freshness = 5

  if (months !== null) {
    if (months <= 6) freshness = 8.5
    else if (months <= 12) freshness = 6.5
    else if (months <= 18) freshness = 4.5
    else freshness = 2
  }

  return Number((base * 0.45 + releases * 0.35 + freshness * 0.2).toFixed(1))
}

function buildNovelRadarAxes(row: NovelRankingRow, marketRows: NovelRankingRow[], isVI = true): NovelRadarAxis[] {
  return [
    {
      label: isVI ? 'Nhịp phát hành' : 'Release Pace',
      value: lnReleasePaceScore(row),
      hint: isVI ? 'Dựa trên khoảng cách trung bình giữa các tập và độ mới của tập gần nhất.' : 'Based on average release gap and latest release recency.',
    },
    {
      label: isVI ? 'Bắt kịp' : 'Catch-up',
      value: lnCatchUpScore(row),
      hint: isVI ? 'Tỷ lệ tập VN so với số tập gốc/JP.' : 'Vietnamese volumes compared with original/JP volumes.',
    },
    {
      label: isVI ? 'Nhu cầu' : 'Demand',
      value: lnPercentileScore(marketRows, row.average_view_count, r => lnNum(r.average_view_count)),
      hint: isVI ? 'Phân vị lượt xem trung bình trong toàn bộ watchlist LN.' : 'Average view count percentile across the LN watchlist.',
    },
    {
      label: isVI ? 'Nhà PH' : 'Publisher',
      value: lnPublisherSupportScore(row),
      hint: isVI ? 'Hoạt động nhà phát hành và số tập phát hành trong 24 tháng.' : 'Publisher activity and release output over 24 months.',
    },
    {
      label: isVI ? 'An toàn' : 'Safety',
      value: lnCompletionSafetyScore(row),
      hint: isVI ? 'Nghịch đảo của khả năng drop.' : 'Inverse of drop probability.',
    },
    {
      label: isVI ? 'Đà phát hành' : 'Momentum',
      value: lnMomentumScore(row),
      hint: isVI ? 'Tổng hợp hoạt động nhà phát hành, số tập 24 tháng và độ mới phát hành.' : 'Publisher support, 24M output, and release freshness.',
    },
  ]
}

function lnStableNoise(seed: string) {
  let hash = 2166136261
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  const a = ((hash >>> 0) % 1000) / 1000
  const b = (((hash >>> 8) >>> 0) % 1000) / 1000
  return {
    x: (a - 0.5) * 0.22,
    y: (b - 0.5) * 2.8,
  }
}

function lnFormatDate(value: string | null | undefined, locale: string) {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString(locale === 'vi' ? 'vi-VN' : 'en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}


// ── Component ─────────────────────────────────────────────────────────────────

export default function ContentDetail() {
  const params = useParams()
  const [series,       setSeries]       = useState<any>(null)
  const [loading,      setLoading]      = useState(true)
  const [error,        setError]        = useState<string | null>(null)
  const [imageError,   setImageError]   = useState(false)
  const [coverSrc,     setCoverSrc]     = useState<string | null>(null)   // ← latest volume cover
  const [synopsisExpanded, setSynopsisExpanded] = useState(false)
  const [copied,       setCopied]       = useState(false)
  const [lidexScore,   setLidexScore]   = useState<LiDexScoreBreakdown | null>(null)
  const [scoreLoading, setScoreLoading] = useState(false)
  const [activeTab,    setActiveTab]    = useState<'info' | 'stats' | 'analyze'>('info')

  // Manga-specific enrichment pulled directly from Supabase
  const [mangaMeta,    setMangaMeta]    = useState<any>(null)
  const [latestVolume, setLatestVolume] = useState<any>(null)
  const [volumeCount,  setVolumeCount]  = useState<number | null>(null)
  const [publisherName,setPublisherName]= useState<string | null>(null)
  const [seriesLinks,  setSeriesLinks]  = useState<any[]>([])
  const [allVolumes,   setAllVolumes]   = useState<any[]>([]) // <--- NEW STATE FOR STATS
  const [novelMeta,    setNovelMeta]    = useState<any>(null)
  const [lnRanking,    setLnRanking]    = useState<NovelRankingRow | null>(null)
  const [lnMarketRows, setLnMarketRows] = useState<NovelRankingRow[]>([])
  const [fanVoteHistory, setFanVoteHistory] = useState<FanVotePoint[]>([])
  const [lnStatsLoading, setLnStatsLoading] = useState(false)
  const [lnStatsError, setLnStatsError] = useState<string | null>(null)

  const { locale } = useLocale()
  const isVI       = locale === 'vi'
  const seriesId   = params.id ? parseInt(params.id as string) : undefined
  const bannerImage = series?.banner_url || series?.cover_url

  // ── Load series ──────────────────────────────────────────────────────────────
  useEffect(() => {
    async function loadData() {
      if (!seriesId) { setError('No series ID provided'); setLoading(false); return }
      try {
        const data = await fetchSeries(seriesId)
        setSeries(data)
      } catch (err: any) {
        console.error('Failed to load series:', err)
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [seriesId])

  // ── Manga/Novel-specific: fetch meta + latest volume cover ───────────────────
  useEffect(() => {
    if (!series || !['manga', 'novel'].includes(series.item_type)) return

    async function loadMangaEnrichment() {
      // 1. Metadata. Manga has manga_meta; novel can optionally use novel_meta when available.
      if (series.item_type === 'manga') {
        const { data: meta } = await supabase
          .from('manga_meta')
          .select('series_id, demographic, original_language, vn_licensed, vn_publisher_id, updated_at')
          .eq('series_id', series.id)
          .single()
        if (meta) {
          setMangaMeta(meta)

          // 2. Resolve publisher name from vn_publisher_id
          if (meta.vn_publisher_id) {
            const { data: pub } = await supabase
              .from('publishers')
              .select('name, name_vi')
              .eq('id', meta.vn_publisher_id)
              .single()
            if (pub) setPublisherName(pub.name_vi || pub.name)
          }
        }
      } else if (series.item_type === 'novel') {
        const { data: meta } = await supabase
          .from('novel_meta')
          .select('*')
          .eq('series_id', series.id)
          .maybeSingle()
        if (meta) setNovelMeta(meta)
      }

      // 3. All non-special volumes ordered DESC by volume_number
      const { data: vols } = await supabase
        .from('volumes')
        .select('id, volume_number, release_date, cover_url, price, currency, is_special')
        .eq('series_id', series.id)
        .eq('is_special', false) 
        .not('volume_number', 'is', null)
        .order('volume_number', { ascending: false })

      if (vols && vols.length > 0) {
        setAllVolumes(vols) // <--- SAVE FULL LIST FOR STATS
        setVolumeCount(vols.length)
        // The latest volume is always vols[0] (highest number).
        // For the displayed cover, walk from the latest downward until we find one with a cover_url.
        const withCover = vols.find((v: any) => v.cover_url)
        setLatestVolume(vols[0])
        setCoverSrc(withCover?.cover_url || series.cover_url || null)
      } else {
        setAllVolumes([])
        setCoverSrc(series.cover_url || null)
      }

      // 4. series_links — fetch links for the latest volume only
      const latestVol = vols && vols.length > 0 ? vols[0] : null
      if (latestVol) {
        const { data: links } = await supabase
          .from('series_links')
          .select('link_type, label, url')
          .eq('series_id', series.id)
          .eq('volume_id', latestVol.id)
          .eq('is_active', true)
          .order('sort_order', { ascending: true })
        if (links) setSeriesLinks(links)
      }
    }

    loadMangaEnrichment()
  }, [series])

  // ── Anime/other: set cover from series directly ──────────────────────────────
  useEffect(() => {
    if (!series || ['manga', 'novel'].includes(series.item_type)) return
    setCoverSrc(series.cover_url || null)
  }, [series])

  // ── Anime: fetch series_links ─────────────────────────────────────────────────
  useEffect(() => {
    if (!series || series.item_type !== 'anime') return

    async function loadAnimeLinks() {
      const { data: links } = await supabase
        .from('series_links')
        .select('link_type, label, url')
        .eq('series_id', series.id)
        .eq('is_active', true)
        .order('sort_order', { ascending: true })
      if (links) setSeriesLinks(links)
    }

    loadAnimeLinks()
  }, [series])

  // ── Novel: fetch LN Dead-or-Alive ranking data ───────────────────────────────
  useEffect(() => {
    if (!series || series.item_type !== 'novel') {
      setLnRanking(null)
      setLnMarketRows([])
      setLnStatsError(null)
      return
    }

    async function loadNovelRanking() {
      setLnStatsLoading(true)
      setLnStatsError(null)

      try {
        const { data, error } = await supabase
          .from('ln_series_ranking')
          .select('id, series_title, series_id, lidex_series_id, series_code, number_of_volumes, average_price, max_release_at, average_view_count, publisher, original_volumes, original_status, evalution, evaluation_basis, ln_score, trang_thai, drop_percent, drop_basis, average_gap_months, months_since_last_release, completion_ratio, publisher_activity, publisher_releases_last_24m, score_components, drop_components, cover_url, cover_source_title, updated_at')
          .order('ln_score', { ascending: false })

        if (error) throw error

        const rows = (data || []) as NovelRankingRow[]
        const normalizedTitle = String(series.title || '').trim().toLowerCase()
        const normalizedTitleVI = String(series.title_vi || '').trim().toLowerCase()
        const normalizedNative = String(series.title_native || '').trim().toLowerCase()

        const current = rows.find(row => Number(row.lidex_series_id) === Number(series.id))
          || rows.find(row => {
            const title = String(row.series_title || '').trim().toLowerCase()
            return Boolean(title) && [normalizedTitle, normalizedTitleVI, normalizedNative].filter(Boolean).includes(title)
          })
          || null

        setLnMarketRows(rows)
        setLnRanking(current)
      } catch (err: any) {
        console.error('Failed to load LN ranking data:', err)
        setLnStatsError(err.message || 'Failed to load LN ranking data')
      } finally {
        setLnStatsLoading(false)
      }
    }

    loadNovelRanking()
  }, [series])

  useEffect(() => {
    if (!series || series.item_type !== 'novel') {
      setFanVoteHistory([])
      return
    }

    async function loadFanVoteHistory() {
      const { data, error } = await supabase
        .from('voting_results')
        .select('votes, rank, voting_periods(month, year, label)')
        .eq('series_id', series.id)

      if (error) {
        console.warn('Failed to load fan vote history:', error.message)
        setFanVoteHistory([])
        return
      }

      const history = (data || [])
        .map((row: any) => {
          const periodRaw = row.voting_periods
          const period = Array.isArray(periodRaw) ? periodRaw[0] : periodRaw
          const month = Number(period?.month || 0)
          const year = Number(period?.year || 0)
          return {
            period: period?.label || (month && year ? `${String(month).padStart(2, '0')}/${year}` : '—'),
            sort: year * 100 + month,
            votes: Number(row.votes) || 0,
            rank: row.rank == null ? null : Number(row.rank),
          } as FanVotePoint
        })
        .filter(point => point.sort > 0)
        .sort((a, b) => a.sort - b.sort)

      setFanVoteHistory(history)
    }

    loadFanVoteHistory()
  }, [series])

  // ── Calculate LiDex Score (anime only) ──────────────────────────────────────
  useEffect(() => {
    if (!series || series.item_type !== 'anime' || !series.anime_meta) return

    async function calcScore() {
      setScoreLoading(true)
      try {
        const { data: popData } = await supabase
          .from('anime_meta')
          .select('mean_score, popularity, favourites')
          .limit(3000)

        const { data: studioData } = await supabase
          .from('series')
          .select('studio, anime_meta(mean_score)')
          .eq('item_type', 'anime')
          .not('studio', 'is', null)
          .limit(3000)

        const studioRows = (studioData || []).map((s: any) => ({
          studio:     s.studio,
          mean_score: s.anime_meta?.mean_score ?? null,
          popularity: null,
          favourites: null,
        }))

        const allRows = [
          ...(popData || []).map((r: any) => ({ ...r, studio: null })),
          ...studioRows,
        ]

        const stats = buildPopulationStats(allRows)
        const breakdown = calculateLiDexScore(
          {
            mean_score:          series.anime_meta.mean_score,
            popularity:          series.anime_meta.popularity,
            favourites:          series.anime_meta.favourites,
            status:              series.status,
            score_distribution:  series.anime_meta.score_distribution,
            status_distribution: series.anime_meta.status_distribution,
          },
          series.studio ?? null,
          stats
        )
        setLidexScore(breakdown)
      } catch (e) {
        console.error('LiDex score calc failed:', e)
      } finally {
        setScoreLoading(false)
      }
    }
    calcScore()
  }, [series])

  const handleShare = async () => {
    await navigator.clipboard.writeText(window.location.href)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleShareFacebook = () => {
    const url = encodeURIComponent(window.location.href)
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${url}`, '_blank', 'noopener,noreferrer')
  }

  const formatSynopsis = (text: string) => {
    if (!text) return <p style={{ color: 'var(--foreground-muted)', fontStyle: 'italic' }}>No description available.</p>
    const cleanText = text.replace(/<br\s*\/?>/gi, '\n\n')
    return cleanText.split(/\n\n+/).map((paragraph, i) => (
      <p key={i} className="mb-3 last:mb-0">{paragraph}</p>
    ))
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen" style={{ background: 'var(--background)' }}>
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-10 h-10 text-primary-500 animate-spin" />
          <p className="text-sm animate-pulse" style={{ color: 'var(--foreground-muted)' }}>Loading series…</p>
        </div>
      </div>
    )
  }

  if (error || !series) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4" style={{ background: 'var(--background)' }}>
        <div className="text-center max-w-md">
          <ArrowLeft className="w-16 h-16 text-red-500 mx-auto mb-6" />
          <h1 className="text-2xl font-bold mb-4" style={{ color: 'var(--foreground)' }}>Series Not Found</h1>
          <p className="mb-6" style={{ color: 'var(--foreground-secondary)' }}>{error || "The series you're looking for doesn't exist."}</p>
          <Link href="/dashboard" className="btn-primary inline-flex items-center space-x-2">
            <ArrowLeft className="w-5 h-5" /><span>Back to Dashboard</span>
          </Link>
        </div>
      </div>
    )
  }

  const typeText  = (series.item_type || 'Series').replace('_', ' ').toUpperCase()
  const isOngoing = series.status === 'ongoing' || series.status === 'Ongoing'
  const isAnime   = series.item_type === 'anime'
  const isManga   = series.item_type === 'manga'
  const isNovel   = series.item_type === 'novel'
  const isStatsTab = activeTab === 'stats'

  return (
    <div className="min-h-screen overflow-x-hidden" style={{ background: 'var(--background)' }}>

      {/* ── Hero Banner ── */}
      <div className="relative w-full overflow-hidden">
        <div className="absolute inset-0">
          {bannerImage ? (
            <>
              <img src={bannerImage} alt="" className="w-full h-full object-cover object-center" />
              <div className="absolute inset-0 backdrop-blur-md bg-dark-900/55" />
              <div className="absolute inset-0 bg-gradient-to-t from-dark-900 via-dark-900/40 to-transparent" />
            </>
          ) : (
            <>
              <div className="absolute inset-0 bg-gradient-to-br from-primary-600 via-purple-600 to-pink-600" />
              <div className="absolute inset-0 bg-gradient-to-t from-dark-900 via-dark-900/50 to-transparent" />
            </>
          )}
        </div>

        <div className="relative w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row md:items-start gap-5 md:gap-8 pt-24 sm:pt-28 pb-10 sm:pb-14">

            {/* ── Cover ── */}
            <div className="flex-shrink-0 mx-auto md:mx-0 md:self-start">
              <div className="relative w-36 sm:w-44 md:w-52 lg:w-60 rounded-xl overflow-hidden shadow-2xl border-2 border-white/20 bg-dark-800">
                {coverSrc && !imageError ? (
                  <img
                    src={coverSrc}
                    alt={series.title}
                    className="w-full h-auto block"
                    onError={() => setImageError(true)}
                  />
                ) : (
                  <div className="w-full h-52 sm:h-64 bg-gradient-to-br from-primary-600 to-purple-700 flex items-center justify-center">
                    <BookOpen className="w-16 h-16 sm:w-20 sm:h-20 text-white/50" />
                  </div>
                )}
                {isManga && latestVolume?.volume_number && (
                  <div className="absolute bottom-2 right-2 px-2 py-0.5 rounded-md text-[10px] font-bold text-white"
                    style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(6px)', border: '1px solid rgba(255,255,255,0.15)' }}>
                    Vol.{latestVolume.volume_number}
                  </div>
                )}
              </div>
            </div>

            {/* ── Meta ── */}
            <div className="flex-1 min-w-0 text-center md:text-left">
              <div className="flex flex-wrap items-center justify-center md:justify-start gap-2 mb-3">
                <span className="px-3 py-1 bg-primary-500/90 rounded-full text-xs font-semibold text-white whitespace-nowrap">{typeText}</span>
                <span className={`px-3 py-1 rounded-full text-xs font-semibold text-white whitespace-nowrap ${isOngoing ? 'bg-green-500/90' : 'bg-blue-500/90'}`}>
                  {(series.status || 'Unknown').toUpperCase()}
                </span>
                {series.is_featured && (
                  <span className="px-3 py-1 bg-yellow-500/90 rounded-full text-xs font-semibold text-white flex items-center gap-1 whitespace-nowrap">
                    <Award className="w-3 h-3" /> Featured
                  </span>
                )}
                {isManga && mangaMeta?.vn_licensed && (
                  <span className="px-3 py-1 bg-emerald-500/90 rounded-full text-xs font-semibold text-white flex items-center gap-1 whitespace-nowrap">
                    <BadgeCheck className="w-3 h-3" /> VN Licensed
                  </span>
                )}
              </div>

              <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold text-white mb-2 leading-tight break-words">
                {series.title}
              </h1>

              {(series.title_vi || series.title_native) && (
                <div className="mb-3">
                  {series.title_vi     && <p className="text-base sm:text-lg text-gray-300 mb-0.5 break-words">{series.title_vi}</p>}
                  {series.title_native && <p className="text-sm sm:text-base text-gray-400 break-words">{series.title_native}</p>}
                </div>
              )}

              {series.score && (
                <div className="flex items-center justify-center md:justify-start gap-1.5 mb-4">
                  <Star className="w-4 h-4 sm:w-5 sm:h-5 text-yellow-400 fill-yellow-400" />
                  <span className="text-lg sm:text-xl font-bold text-white">{series.score}</span>
                  <span className="text-xs text-gray-400">/100</span>
                </div>
              )}

              {(series.author || series.studio || series.publisher) && (
                <div className="flex flex-wrap items-center justify-center md:justify-start gap-x-4 gap-y-1 text-xs sm:text-sm text-gray-300 mb-4">
                  {series.author    && <span><span className="text-gray-500 mr-1">Author</span><span className="break-words">{series.author}</span></span>}
                  {series.studio    && <span><span className="text-gray-500 mr-1">Studio</span><span className="break-words">{series.studio}</span></span>}
                  {series.publisher && <span><span className="text-gray-500 mr-1">Publisher</span><span className="break-words">{series.publisher}</span></span>}
                </div>
              )}

              {series.genres && series.genres.length > 0 && (
                <div className="flex flex-wrap items-center justify-center md:justify-start gap-1.5 sm:gap-2">
                  {series.genres.slice(0, 6).map((genre: string, i: number) => (
                    <span key={`genre-${i}`} className="px-2.5 py-1 sm:px-3 sm:py-1.5 bg-white/20 backdrop-blur-sm rounded-full text-xs font-medium text-white hover:bg-white/30 transition-colors whitespace-nowrap">
                      {genre}
                    </span>
                  ))}
                </div>
              )}

              {(series.description || series.description_vi) && (
                <div className="mt-4 max-w-2xl">
                  <div className="relative">
                    <div className={`text-sm sm:text-base leading-relaxed text-gray-300 ${synopsisExpanded ? '' : 'line-clamp-3'}`}>
                      {formatSynopsis(series.description || series.description_vi || '')}
                    </div>
                  </div>
                  <button
                    onClick={() => setSynopsisExpanded(!synopsisExpanded)}
                    className="mt-2 flex items-center gap-1 text-xs font-semibold text-primary-400 hover:text-primary-300 transition-colors"
                  >
                    {synopsisExpanded
                      ? <><ChevronUp   className="w-3.5 h-3.5" /> Thu gọn</>
                      : <><ChevronDown className="w-3.5 h-3.5" /> Xem thêm</>
                    }
                  </button>
                </div>
              )}
            </div>

            {/* ── LiDex Score Box (anime only) ── */}
            {isAnime && (
              <div className="flex-shrink-0 mx-auto md:mx-0 w-52 sm:w-56">
                <div
                  className="rounded-2xl overflow-hidden"
                  style={{ background: 'rgba(15,23,42,0.75)', border: '1px solid rgba(255,255,255,0.12)', backdropFilter: 'blur(12px)' }}
                >
                  <div className="px-4 py-3 flex items-center gap-2" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                    <TrendingUp className="w-4 h-4 text-primary-400 flex-shrink-0" />
                    <span className="text-xs font-bold uppercase tracking-widest text-gray-300">LiDex Score</span>
                  </div>

                  <div className="p-4">
                    {scoreLoading ? (
                      <div className="flex flex-col items-center py-4 gap-2">
                        <Loader2 className="w-6 h-6 text-primary-400 animate-spin" />
                        <span className="text-xs text-gray-500">Calculating…</span>
                      </div>
                    ) : lidexScore ? (
                      <>
                        <div className="flex items-end justify-between mb-4">
                          <div>
                            <span className="text-5xl font-black leading-none" style={{ color: scoreColor(lidexScore.total) }}>
                              {lidexScore.total.toFixed(1)}
                            </span>
                            <span className="text-gray-500 text-sm ml-1">/100</span>
                          </div>
                          <div
                            className="w-10 h-10 rounded-xl flex items-center justify-center text-xl font-black"
                            style={{
                              background: `${scoreColor(lidexScore.total)}22`,
                              color:      scoreColor(lidexScore.total),
                              border:     `2px solid ${scoreColor(lidexScore.total)}66`,
                            }}
                          >
                            {scoreGrade(lidexScore.total)}
                          </div>
                        </div>

                        <div className="space-y-2">
                          {COMPONENT_META.map(({ key, label, weight }) => {
                            const val = lidexScore[key] as number
                            return (
                              <div key={key}>
                                <div className="flex items-center justify-between mb-0.5">
                                  <span className="text-[0.65rem] text-gray-400 truncate flex-1">{label}</span>
                                  <span className="text-[0.65rem] font-bold ml-2 flex-shrink-0" style={{ color: scoreColor(val) }}>
                                    {val.toFixed(0)}
                                  </span>
                                </div>
                                <div className="h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
                                  <div
                                    className="h-full rounded-full transition-all duration-500"
                                    style={{ width: `${val}%`, background: scoreColor(val) }}
                                  />
                                </div>
                              </div>
                            )
                          })}
                        </div>

                        <p className="text-[0.6rem] text-gray-600 text-center mt-3">Composite of 7 signals</p>
                      </>
                    ) : (
                      <p className="text-xs text-gray-500 text-center py-4">Score unavailable</p>
                    )}
                  </div>
                </div>
              </div>
            )}

          </div>
        </div>
      </div>
      {/* ── END Hero ── */}

      {/* ── Main Content ── */}
      <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
        <div className="grid lg:grid-cols-3 gap-6 sm:gap-8 items-start">

          {/* ── Left: Tabs ── */}
          <div className={`${isStatsTab ? 'lg:col-span-3' : 'lg:col-span-2'} min-w-0`}>

            {/* Tab bar */}
            <div className="flex gap-1 p-1 rounded-2xl mb-6" style={{ background: 'var(--glass-bg)', border: '1px solid var(--card-border)' }}>
              {([
                { id: 'info',    labelVI: 'Thông tin chung', labelEN: 'General Info',  icon: Info         },
                { id: 'stats',   labelVI: 'Thông số',        labelEN: 'Stats',         icon: BarChart2    },
                { id: 'analyze', labelVI: 'Phân tích',       labelEN: 'Analysis',      icon: FlaskConical },
              ] as const).map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-sm font-semibold transition-all duration-200"
                  style={activeTab === tab.id
                    ? { background: '#6366f1', color: '#fff', boxShadow: '0 2px 12px #6366f155' }
                    : { color: 'var(--foreground-secondary)' }}
                >
                  <tab.icon className="w-4 h-4 flex-shrink-0" />
                  <span className="hidden sm:block">{isVI ? tab.labelVI : tab.labelEN}</span>
                </button>
              ))}
            </div>

            {/* ── Tab: General Info ── */}
            {activeTab === 'info' && (
              isNovel ? (
                <NovelGeneralInfo
                  series={series}
                  ranking={lnRanking}
                  novelMeta={novelMeta}
                  volumes={allVolumes}
                  latestVolume={latestVolume}
                  publisherName={publisherName}
                  locale={locale}
                />
              ) : (
              <div className="space-y-6 animate-in fade-in duration-200">

                {/* Base info grid */}
                <div className="glass rounded-2xl p-5 sm:p-6">
                  <div className="flex items-center gap-2 mb-5">
                    <Info className="w-5 h-5 text-primary-500 flex-shrink-0" />
                    <h2 className="text-base font-bold" style={{ color: 'var(--foreground)' }}>{isVI ? 'Thông tin' : 'Information'}</h2>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <InfoItem icon={Film}     label={isVI ? 'Thể loại'   : 'Type'}      value={typeText} />
                    <InfoItem icon={Calendar} label={isVI ? 'Trạng thái' : 'Status'}    value={(series.status || '--').toUpperCase()} />
                    {series.source && <InfoItem icon={Globe} label={isVI ? 'Nguồn gốc' : 'Source'} value={series.source} />}
                    {series.author && <InfoItem icon={BookOpen} label={isVI ? 'Tác giả' : 'Author'} value={series.author} />}
                    {(publisherName || series.publisher) && (
                      <InfoItem icon={Award} label={isVI ? 'Nhà xuất bản' : 'Publisher'} value={publisherName || series.publisher} />
                    )}
                    {series.studio && <InfoItem icon={Layers} label="Studio" value={series.studio} />}

                    {/* Anime-specific */}
                    {series.anime_meta?.format       && <InfoItem icon={Film}       label="Format"                       value={series.anime_meta.format} />}
                    {series.anime_meta?.season       && <InfoItem icon={Calendar}   label={isVI ? 'Mùa' : 'Season'}     value={`${series.anime_meta.season} ${series.anime_meta.season_year || ''}`} />}
                    {series.anime_meta?.episodes     && <InfoItem icon={Layers}     label={isVI ? 'Số tập' : 'Episodes'} value={String(series.anime_meta.episodes)} />}
                    {series.anime_meta?.duration_min && <InfoItem icon={TrendingUp} label={isVI ? 'Thời lượng' : 'Duration'} value={`${series.anime_meta.duration_min} ${isVI ? 'phút' : 'min'}`} />}
                  </div>
                </div>

                {/* ── Manga-specific enrichment ── */}
                {isManga && (
                  <div className="glass rounded-2xl p-5 sm:p-6">
                    <div className="flex items-center gap-2 mb-5">
                      <BookMarked className="w-5 h-5 text-primary-500 flex-shrink-0" />
                      <h2 className="text-base font-bold" style={{ color: 'var(--foreground)' }}>
                        {isVI ? 'Chi tiết Manga' : 'Manga Details'}
                      </h2>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      <InfoItem
                        icon={Users}
                        label={isVI ? 'Đối tượng' : 'Demographic'}
                        value={
                          mangaMeta?.demographic && mangaMeta.demographic !== 'none'
                            ? (DEMO_LABELS[mangaMeta.demographic] || mangaMeta.demographic)
                            : '--'
                        }
                      />
                      <InfoItem
                        icon={Languages}
                        label={isVI ? 'Ngôn ngữ gốc' : 'Origin Language'}
                        value={
                          mangaMeta?.original_language
                            ? (LANG_LABELS[mangaMeta.original_language] || mangaMeta.original_language.toUpperCase())
                            : '--'
                        }
                      />
                      <InfoItem
                        icon={BadgeCheck}
                        label={isVI ? 'Bản quyền VN' : 'VN Licensed'}
                        value={
                          mangaMeta?.vn_licensed != null
                            ? (mangaMeta.vn_licensed ? (isVI ? 'Có' : 'Yes') : (isVI ? 'Không' : 'No'))
                            : '--'
                        }
                      />
                      <InfoItem
                        icon={Layers}
                        label={isVI ? 'Số tập (VN)' : 'Volumes (VN)'}
                        value={volumeCount != null ? String(volumeCount) : '--'}
                      />
                      <InfoItem
                        icon={Building2}
                        label={isVI ? 'NXB Việt Nam' : 'VN Publisher'}
                        value={publisherName || '--'}
                      />
                      <InfoItem
                        icon={BookMarked}
                        label={isVI ? 'Tập mới nhất' : 'Latest Vol.'}
                        value={latestVolume?.volume_number != null ? `Vol. ${latestVolume.volume_number}` : '--'}
                      />
                    </div>

                    {/* ── Latest volume detail row ── */}
                    {latestVolume && (
                      <div className="mt-4 pt-4" style={{ borderTop: '1px solid var(--card-border)' }}>
                        <div className="flex items-center gap-2 mb-3">
                          <ImageIcon className="w-4 h-4 text-primary-400 flex-shrink-0" />
                          <span className="text-xs font-semibold" style={{ color: 'var(--foreground-secondary)' }}>
                            {isVI ? 'Thông tin tập mới nhất (VN)' : 'Latest VN Volume'}
                          </span>
                        </div>
                        <div className="flex items-center gap-4 p-3 rounded-xl" style={{ background: 'var(--background-secondary)', border: '1px solid var(--card-border)' }}>
                          {latestVolume.cover_url && (
                            <img
                              src={latestVolume.cover_url}
                              alt={`Vol. ${latestVolume.volume_number}`}
                              className="w-10 h-auto rounded-md flex-shrink-0 shadow"
                            />
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold" style={{ color: 'var(--foreground)' }}>
                              {isVI ? 'Tập' : 'Volume'} {latestVolume.volume_number}
                            </p>
                            <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-0.5">
                              {latestVolume.release_date && (
                                <p className="text-xs" style={{ color: 'var(--foreground-muted)' }}>
                                  {isVI ? 'Phát hành' : 'Released'}:{' '}
                                  {new Date(latestVolume.release_date).toLocaleDateString(
                                    isVI ? 'vi-VN' : 'en-US',
                                    { year: 'numeric', month: 'short', day: 'numeric' }
                                  )}
                                </p>
                              )}
                              {latestVolume.price && (
                                <p className="text-xs font-semibold" style={{ color: 'var(--foreground-secondary)' }}>
                                  {Number(latestVolume.price).toLocaleString('vi-VN')}{' '}
                                  {latestVolume.currency || 'VND'}
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="flex-shrink-0">
                            <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold text-primary-300"
                              style={{ background: 'var(--glass-bg)', border: '1px solid var(--card-border)' }}>
                              {isVI ? 'Bìa đang hiển thị' : 'Cover shown'}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Tags */}
                {series.tags && series.tags.length > 0 && (
                  <div className="glass rounded-2xl p-5 sm:p-6">
                    <div className="flex items-center gap-2 mb-4">
                      <Tags className="w-5 h-5 text-primary-500 flex-shrink-0" />
                      <h2 className="text-base font-bold" style={{ color: 'var(--foreground)' }}>Tags</h2>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {series.tags.map((tag: string, i: number) => (
                        <span key={`tag-${i}`} className="px-2.5 py-1 rounded-lg text-xs transition-colors cursor-pointer"
                          style={{ background: 'var(--background-secondary)', color: 'var(--foreground-secondary)' }}>
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              )
            )}

            {/* ── Tab: Stats ── */}
            {activeTab === 'stats' && (
              <div className="space-y-6 animate-in fade-in duration-200">
                {series.anime_meta ? (
                  /* --- Existing Anime Stats --- */
                  <>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <StatBig label="Điểm trung bình" value={series.anime_meta.mean_score ? `${series.anime_meta.mean_score}` : '—'} sub="/100" color="#fbbf24" />
                      <StatBig label="Độ phổ biến"     value={series.anime_meta.popularity  ? series.anime_meta.popularity.toLocaleString()  : '—'} color="#6366f1" />
                      <StatBig label="Yêu thích"       value={series.anime_meta.favourites  ? fmtBig(series.anime_meta.favourites) : '—'} color="#ec4899" />
                      <StatBig label="Lượt xem"        value={series.anime_meta.average_score ? `${series.anime_meta.average_score}` : '—'} color="#22c55e" />
                    </div>

                    {series.anime_meta.status_distribution && (
                      <div className="glass rounded-2xl p-5 sm:p-6">
                        <div className="flex items-center gap-2 mb-5">
                          <Users className="w-5 h-5 text-primary-500" />
                          <h2 className="text-base font-bold" style={{ color: 'var(--foreground)' }}>{isVI ? 'Phân phối người xem' : 'Viewer Distribution'}</h2>
                        </div>
                        <StatusDistribution data={series.anime_meta.status_distribution} />
                      </div>
                    )}

                    {series.anime_meta.score_distribution && (
                      <div className="glass rounded-2xl p-5 sm:p-6">
                        <div className="flex items-center gap-2 mb-5">
                          <BarChart2 className="w-5 h-5 text-primary-500" />
                          <h2 className="text-base font-bold" style={{ color: 'var(--foreground)' }}>{isVI ? 'Phân phối điểm' : 'Score Distribution'}</h2>
                        </div>
                        <ScoreDistribution data={series.anime_meta.score_distribution} />
                      </div>
                    )}

                    <RadarChart series={series} />
                  </>
                ) : isNovel ? (
                  <NovelDoAStats
                    ranking={lnRanking}
                    marketRows={lnMarketRows}
                    volumes={allVolumes}
                    fanVoteHistory={fanVoteHistory}
                    locale={locale}
                    loading={lnStatsLoading}
                    error={lnStatsError}
                  />
                ) : isManga ? (
                  /* --- Manga Stats Section --- */
                  <MangaStats volumes={allVolumes} locale={locale} />
                ) : (
                  <div className="glass rounded-2xl p-10 flex flex-col items-center gap-3">
                    <BarChart2 className="w-10 h-10 opacity-20 text-primary-500" />
                    <p className="text-sm" style={{ color: 'var(--foreground-muted)' }}>Không có dữ liệu thống kê</p>
                  </div>
                )}
              </div>
            )}

            {/* ── Tab: Analysis ── */}
            {activeTab === 'analyze' && (
              <div className="space-y-6 animate-in fade-in duration-200">
                {isAnime && lidexScore ? (
                  <>
                    <div className="glass rounded-2xl p-6 sm:p-8">
                      <div className="flex items-center gap-2 mb-6">
                        <FlaskConical className="w-5 h-5 text-primary-500" />
                        <h2 className="text-base font-bold" style={{ color: 'var(--foreground)' }}>LiDex Score — Phân tích tổng hợp</h2>
                      </div>

                      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6 mb-8">
                        <div className="flex items-end gap-3">
                          <span className="text-7xl font-black leading-none" style={{ color: scoreColor(lidexScore.total) }}>
                            {lidexScore.total.toFixed(1)}
                          </span>
                          <div className="pb-1">
                            <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-3xl font-black mb-1"
                              style={{ background: `${scoreColor(lidexScore.total)}18`, color: scoreColor(lidexScore.total), border: `2px solid ${scoreColor(lidexScore.total)}44` }}>
                              {scoreGrade(lidexScore.total)}
                            </div>
                            <p className="text-xs text-center" style={{ color: 'var(--foreground-muted)' }}>/100</p>
                          </div>
                        </div>
                        <div className="flex-1">
                          <p className="text-sm mb-1 font-semibold" style={{ color: 'var(--foreground)' }}>Điểm tổng hợp LiDex</p>
                          <p className="text-xs leading-relaxed" style={{ color: 'var(--foreground-secondary)' }}>
                            Dựa trên 7 chỉ số: điểm cộng đồng, độ phổ biến, yêu thích, phân phối điểm, mức độ tương tác người xem, trạng thái phát sóng và uy tín studio.
                          </p>
                        </div>
                      </div>

                      <div className="space-y-4">
                        {COMPONENT_META.map(({ key, label, weight }) => {
                          const val = lidexScore[key] as number
                          return (
                            <div key={key}>
                              <div className="flex items-center justify-between mb-1.5">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-semibold" style={{ color: 'var(--foreground)' }}>{label}</span>
                                  <span className="text-[10px] px-1.5 py-0.5 rounded-md font-bold" style={{ background: 'var(--background-secondary)', color: 'var(--foreground-muted)' }}>
                                    {weight}%
                                  </span>
                                </div>
                                <span className="text-sm font-bold tabular-nums" style={{ color: scoreColor(val) }}>
                                  {val.toFixed(1)}
                                </span>
                              </div>
                              <div className="h-2.5 rounded-full overflow-hidden" style={{ background: 'var(--background-secondary)' }}>
                                <div className="h-full rounded-full transition-all duration-700"
                                  style={{ width: `${val}%`, background: `linear-gradient(90deg, ${scoreColor(val)}, ${scoreColor(val)}bb)` }} />
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>

                    <div className="rounded-2xl p-4 sm:p-5" style={{ background: 'var(--background-secondary)', border: '1px solid var(--card-border)' }}>
                      <p className="text-xs leading-relaxed" style={{ color: 'var(--foreground-muted)' }}>
                        <span className="font-bold" style={{ color: 'var(--foreground-secondary)' }}>Phương pháp:</span>{' '}
                        Điểm cộng đồng (30%) được chuẩn hóa theo phân vị so với toàn bộ cơ sở dữ liệu. Độ phổ biến (18%) và yêu thích (17%) đều được log-scale để tránh sai lệch. Phân phối điểm (13%) phân tích hệ số Gini và tỷ lệ điểm cao. Tương tác người xem (12%) tính từ tỷ lệ hoàn thành và bỏ xem. Studio (5%) dựa trên trung bình lịch sử.
                      </p>
                    </div>
                  </>
                ) : scoreLoading ? (
                  <div className="glass rounded-2xl p-10 flex flex-col items-center gap-3">
                    <Loader2 className="w-8 h-8 text-primary-500 animate-spin" />
                    <p className="text-sm" style={{ color: 'var(--foreground-muted)' }}>Đang tính toán điểm…</p>
                  </div>
                ) : (
                  <div className="glass rounded-2xl p-10 flex flex-col items-center gap-3">
                    <FlaskConical className="w-10 h-10 opacity-20 text-primary-500" />
                    <p className="text-sm" style={{ color: 'var(--foreground-muted)' }}>
                      {isAnime ? 'Không có dữ liệu phân tích' : 'Phân tích chỉ khả dụng cho Anime'}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── Right Sidebar ── */}
          {!isStatsTab && (
          <div className="space-y-4 sm:space-y-5 min-w-0">

            {isNovel && (
              <NovelSideCards
                series={series}
                ranking={lnRanking}
                volumes={allVolumes}
                latestVolume={latestVolume}
                locale={locale}
              />
            )}

            {/* Share */}
            <div className="glass rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <Share2 className="w-4 h-4 text-primary-500 flex-shrink-0" />
                <h3 className="text-sm font-bold" style={{ color: 'var(--foreground)' }}>{isVI ? 'Chia sẻ' : 'Share'}</h3>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={handleShare} className="p-2.5 rounded-lg flex items-center justify-center gap-1.5 transition-colors text-xs font-medium"
                  style={{ background: 'var(--background-secondary)', color: 'var(--foreground-secondary)', border: '1px solid var(--card-border)' }}>
                  <Copy className="w-3.5 h-3.5 flex-shrink-0" />
                  {copied ? 'Đã chép!' : 'Sao chép'}
                </button>
                <button onClick={handleShareFacebook} className="p-2.5 rounded-lg flex items-center justify-center gap-1.5 transition-colors text-xs font-medium hover:text-[#1877f2]"
                  style={{ background: 'var(--background-secondary)', color: 'var(--foreground-secondary)', border: '1px solid var(--card-border)' }}>
                  <Share2 className="w-3.5 h-3.5 flex-shrink-0" />
                  Facebook
                </button>
              </div>
            </div>

            {/* External Links */}
            <div className="glass rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <ExternalLink className="w-4 h-4 text-primary-500 flex-shrink-0" />
                <h3 className="text-sm font-bold" style={{ color: 'var(--foreground)' }}>{isVI ? 'Liên kết ngoài' : 'External Links'}</h3>
              </div>
              <div className="space-y-2">
                {(isManga || isNovel) ? (
                  <>
                    {seriesLinks.length > 0 ? (
                      seriesLinks.map((link: any, i: number) => {
                        const dotColor =
                          link.link_type === 'purchase' ? '#22c55e' :
                          link.link_type === 'official' ? '#6366f1' :
                          link.link_type === 'stream'   ? '#f59e0b' : '#94a3b8'
                        return (
                          <a key={i} href={link.url} target="_blank" rel="noopener noreferrer"
                            className="flex items-center justify-between p-2.5 rounded-lg group transition-colors"
                            style={{ background: 'var(--background-secondary)', border: '1px solid var(--card-border)' }}>
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: dotColor }} />
                              <span className="text-xs font-medium group-hover:text-primary-500 transition-colors truncate" style={{ color: 'var(--foreground-secondary)' }}>
                                {link.label}
                              </span>
                            </div>
                            <ExternalLink className="w-3.5 h-3.5 flex-shrink-0 ml-2 group-hover:text-primary-500" style={{ color: 'var(--foreground-muted)' }} />
                          </a>
                        )
                      })
                    ) : (
                      <p className="text-xs text-center py-2" style={{ color: 'var(--foreground-muted)' }}>
                        {isVI ? 'Không có liên kết' : 'No links'}
                      </p>
                    )}
                  </>
                ) : isAnime ? (
                  <>
                    {seriesLinks.length > 0 ? (
                      seriesLinks.map((link: any, i: number) => {
                        const dotColor =
                          link.link_type === 'anilist'   ? '#02a9ff' :
                          link.link_type === 'stream'   ? '#f59e0b' :
                          link.link_type === 'official' ? '#6366f1' :
                          link.link_type === 'trailer'  ? '#ef4444' :
                          link.link_type === 'purchase' ? '#22c55e' : '#94a3b8'
                        return (
                          <a key={i} href={link.url} target="_blank" rel="noopener noreferrer"
                            className="flex items-center justify-between p-2.5 rounded-lg group transition-colors"
                            style={{ background: 'var(--background-secondary)', border: '1px solid var(--card-border)' }}>
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: dotColor }} />
                              <span className="text-xs font-medium group-hover:text-primary-500 transition-colors truncate" style={{ color: 'var(--foreground-secondary)' }}>
                                {link.label}
                              </span>
                            </div>
                            <ExternalLink className="w-3.5 h-3.5 flex-shrink-0 ml-2 group-hover:text-primary-500" style={{ color: 'var(--foreground-muted)' }} />
                          </a>
                        )
                      })
                    ) : (
                      <p className="text-xs text-center py-2" style={{ color: 'var(--foreground-muted)' }}>
                        {isVI ? 'Không có liên kết' : 'No links'}
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-xs text-center py-2" style={{ color: 'var(--foreground-muted)' }}>
                    {isVI ? 'Không có liên kết' : 'No links'}
                  </p>
                )}
              </div>
            </div>

            {/* Last updated */}
            <div className="glass rounded-2xl p-5">
              <h3 className="text-sm font-bold mb-3" style={{ color: 'var(--foreground)' }}>{isVI ? 'Cập nhật lần cuối' : 'Last Updated'}</h3>
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-primary-500 flex-shrink-0" />
                <span className="text-xs" style={{ color: 'var(--foreground-secondary)' }}>
                  {new Date(series.updated_at).toLocaleDateString('vi-VN', { year: 'numeric', month: 'long', day: 'numeric' })}
                </span>
              </div>
            </div>
          </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────


function formatVnd(value: unknown) {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return '—'
  return `${Math.round(n).toLocaleString('vi-VN')} ₫`
}

function normalizeNovelStatus(status: string | null | undefined, isVI: boolean) {
  if (!status) return '—'
  const s = String(status)
  if (isVI) return s
  return ({
    'Đang phát hành': 'Ongoing',
    'Hoàn thành': 'Completed',
    'Lâu lắm rồi chưa có tập mới': 'Long inactive',
    Drop: 'Dropped',
    'Đã bắt kịp bản gốc JP': 'Caught up to JP',
  } as Record<string, string>)[s] || s
}

function NovelSection({ icon: Icon, title, children }: { icon: any; title: string; children: ReactNode }) {
  return (
    <div className="glass rounded-2xl p-5 sm:p-6">
      <div className="flex items-center gap-2 mb-5">
        <Icon className="w-5 h-5 text-primary-400 flex-shrink-0" />
        <h2 className="text-base font-black" style={{ color: 'var(--foreground)' }}>{title}</h2>
      </div>
      {children}
    </div>
  )
}

function NovelField({ icon: Icon, label, value, accent = '#8b5cf6' }: { icon: any; label: string; value: ReactNode; accent?: string }) {
  return (
    <div
      className="rounded-xl p-3 min-w-0"
      style={{
        background: 'var(--content-detail-tile-bg)',
        border: '1px solid var(--content-detail-tile-border)',
        boxShadow: 'var(--ln-card-shadow)',
      }}
    >
      <div className="flex items-center gap-2 mb-1.5" style={{ color: 'var(--foreground-muted)' }}>
        <Icon className="w-4 h-4 flex-shrink-0" style={{ color: accent }} />
        <span className="text-[10px] font-black truncate">{label}</span>
      </div>
      <div className="text-xs sm:text-sm font-black leading-snug min-w-0 break-words" style={{ color: 'var(--foreground)' }}>
        {value || '—'}
      </div>
    </div>
  )
}

function NovelGeneralInfo({
  series,
  ranking,
  novelMeta,
  volumes,
  latestVolume,
  publisherName,
  locale,
}: {
  series: any
  ranking: NovelRankingRow | null
  novelMeta: any
  volumes: any[]
  latestVolume: any
  publisherName: string | null
  locale: string
}) {
  const isVI = locale === 'vi'
  const sortedVolumes = [...volumes].sort((a, b) => Number(b.volume_number || 0) - Number(a.volume_number || 0))
  const avgPrice = ranking?.average_price || (
    volumes.length
      ? volumes.map(v => Number(v.price || 0)).filter(Boolean).reduce((sum, price) => sum + price, 0) / Math.max(1, volumes.filter(v => Number(v.price || 0)).length)
      : 0
  )
  const releaseStatus = ranking ? lnReleaseStatus(ranking) : (series.status || '—')
  const author = series.author || novelMeta?.author || novelMeta?.writer || '—'
  const artist = novelMeta?.artist || novelMeta?.illustrator || series.artist || '—'
  const translator = novelMeta?.translator || novelMeta?.translator_name || '—'
  const vnPublisher = ranking?.publisher || publisherName || series.publisher || '—'
  const vnVolumes = ranking?.number_of_volumes ?? (volumes.length || null)

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      <NovelSection icon={Info} title={isVI ? 'Thông Tin Chung' : 'General Information'}>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <NovelField icon={Film} label={isVI ? 'Loại' : 'Type'} value="Light Novel" />
          <NovelField icon={Calendar} label={isVI ? 'Trạng thái' : 'Status'} value={normalizeNovelStatus(releaseStatus, isVI)} />
          <NovelField icon={Languages} label={isVI ? 'Dịch giả' : 'Translator'} value={translator} />
          <NovelField icon={Building2} label={isVI ? 'Nhà phát hành' : 'Publisher'} value={vnPublisher} />
          <NovelField icon={Layers} label={isVI ? 'Số tập' : 'Volumes'} value={vnVolumes != null ? String(vnVolumes) : '—'} />
          <NovelField icon={TrendingUp} label={isVI ? 'Khoảng cách TB' : 'Avg Release Gap'} value={ranking?.average_gap_months != null ? `${Number(ranking.average_gap_months).toFixed(1)} ${isVI ? 'tháng' : 'months'}` : '—'} />
          <NovelField icon={Award} label={isVI ? 'Giá TB' : 'Average Price'} value={formatVnd(avgPrice)} />
          <NovelField icon={BookOpen} label={isVI ? 'Tác giả' : 'Author'} value={author} />
          <NovelField icon={ImageIcon} label={isVI ? 'Họa sĩ' : 'Artist'} value={artist} />
        </div>
      </NovelSection>

      <NovelVolumeCarousel volumes={sortedVolumes} latestVolume={latestVolume} locale={locale} />

      {series.tags && series.tags.length > 0 && (
        <NovelSection icon={Tags} title="Tags">
          <div className="flex flex-wrap gap-2">
            {series.tags.map((tag: string, i: number) => (
              <span
                key={`tag-${i}`}
                className="px-2.5 py-1 rounded-lg text-xs transition-colors cursor-pointer"
                style={{ background: 'var(--background-secondary)', color: 'var(--foreground-secondary)', border: '1px solid var(--card-border)' }}
              >
                {tag}
              </span>
            ))}
          </div>
        </NovelSection>
      )}
    </div>
  )
}

function NovelVolumeCarousel({ volumes, latestVolume, locale }: { volumes: any[]; latestVolume: any; locale: string }) {
  const isVI = locale === 'vi'
  const [activeIndex, setActiveIndex] = useState(0)

  if (!volumes.length) {
    return (
      <NovelSection icon={Layers} title={isVI ? 'Danh Sách Tập' : 'Volume List'}>
        <div className="rounded-xl p-8 text-center" style={{ background: 'var(--content-detail-volume-bg)', border: '1px solid var(--card-border)' }}>
          <BookOpen className="w-10 h-10 mx-auto mb-3 opacity-30 text-primary-400" />
          <p className="text-sm" style={{ color: 'var(--foreground-muted)' }}>{isVI ? 'Chưa có dữ liệu tập.' : 'No volume data available.'}</p>
        </div>
      </NovelSection>
    )
  }

  const safeIndex = Math.min(activeIndex, volumes.length - 1)
  const active = volumes[safeIndex]
  const activeCover = active?.cover_url || latestVolume?.cover_url || null
  const prev = () => setActiveIndex(i => (i - 1 + volumes.length) % volumes.length)
  const next = () => setActiveIndex(i => (i + 1) % volumes.length)
  const releaseDate = active?.release_date
    ? new Date(active.release_date).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : '—'

  return (
    <NovelSection icon={Layers} title={isVI ? 'Danh Sách Tập' : 'Volume List'}>
      <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--content-detail-volume-bg)', border: '1px solid var(--card-border)' }}>
        <div className="relative p-4 sm:p-5">
          {activeCover && (
            <img src={activeCover} alt="" className="absolute inset-0 w-full h-full object-cover opacity-[0.06] blur-md scale-110" />
          )}
          <div className="absolute inset-0" style={{ background: 'var(--content-detail-volume-overlay)' }} />

          <div className="relative grid grid-cols-1 sm:grid-cols-[128px_1fr] gap-4 sm:gap-5 items-stretch">
            <div className="relative w-[128px] max-w-full mx-auto sm:mx-0 rounded-xl overflow-hidden shadow-xl self-start" style={{ aspectRatio: '2/3', background: 'var(--background-secondary)', border: '1px solid var(--card-border)' }}>
              {activeCover ? (
                <img src={activeCover} alt={`Vol. ${active.volume_number}`} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <BookOpen className="w-8 h-8 opacity-40 text-primary-400" />
                </div>
              )}
              <div className="absolute left-2 top-2 px-2 py-1 rounded-lg text-[10px] font-black text-white" style={{ background: 'rgba(0,0,0,.64)' }}>
                #{active.volume_number ?? safeIndex + 1}
              </div>
            </div>

            <div className="min-w-0 flex flex-col justify-between">
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-xl sm:text-2xl font-black leading-tight" style={{ color: 'var(--foreground)' }}>
                  {isVI ? 'Tập' : 'Volume'} {active.volume_number ?? '—'}
                </h3>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={prev}
                    className="w-8 h-8 rounded-lg text-sm font-black transition-all hover:scale-105"
                    style={{ background: 'var(--background-secondary)', color: 'var(--foreground-secondary)', border: '1px solid var(--card-border)' }}
                    aria-label={isVI ? 'Tập trước' : 'Previous volume'}
                  >
                    ‹
                  </button>
                  <button
                    type="button"
                    onClick={next}
                    className="w-8 h-8 rounded-lg text-sm font-black transition-all hover:scale-105"
                    style={{ background: 'var(--background-secondary)', color: 'var(--foreground-secondary)', border: '1px solid var(--card-border)' }}
                    aria-label={isVI ? 'Tập sau' : 'Next volume'}
                  >
                    ›
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mt-5 sm:mt-auto">
                <div className="rounded-xl p-3" style={{ background: 'rgba(124,58,237,.12)', border: '1px solid rgba(124,58,237,.24)' }}>
                  <p className="text-[9px] font-black uppercase" style={{ color: 'var(--foreground-muted)' }}>{isVI ? 'Ngày phát hành' : 'Release'}</p>
                  <p className="text-xs font-black mt-1" style={{ color: 'var(--foreground)' }}>{releaseDate}</p>
                </div>
                <div className="rounded-xl p-3" style={{ background: 'rgba(34,197,94,.10)', border: '1px solid rgba(34,197,94,.22)' }}>
                  <p className="text-[9px] font-black uppercase" style={{ color: 'var(--foreground-muted)' }}>{isVI ? 'Giá' : 'Price'}</p>
                  <p className="text-xs font-black mt-1" style={{ color: '#22c55e' }}>{formatVnd(active.price)}</p>
                </div>
                <div className="rounded-xl p-3" style={{ background: 'rgba(56,189,248,.10)', border: '1px solid rgba(56,189,248,.22)' }}>
                  <p className="text-[9px] font-black uppercase" style={{ color: 'var(--foreground-muted)' }}>{isVI ? 'Trang' : 'Pages'}</p>
                  <p className="text-xs font-black mt-1" style={{ color: '#38bdf8' }}>{active.pages ?? active.page_count ?? '—'}</p>
                </div>
                <div className="rounded-xl p-3" style={{ background: 'rgba(251,191,36,.10)', border: '1px solid rgba(251,191,36,.22)' }}>
                  <p className="text-[9px] font-black uppercase" style={{ color: 'var(--foreground-muted)' }}>{isVI ? 'Mới nhất' : 'Latest'}</p>
                  <p className="text-xs font-black mt-1" style={{ color: '#f59e0b' }}>{latestVolume?.id === active.id || safeIndex === 0 ? (isVI ? 'Có' : 'Yes') : '—'}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </NovelSection>
  )
}

function NovelSideCards({
  series,
  ranking,
  volumes,
  latestVolume,
  locale,
}: {
  series: any
  ranking: NovelRankingRow | null
  volumes: any[]
  latestVolume: any
  locale: string
}) {
  const isVI = locale === 'vi'
  const ratio = ranking ? lnCompletionRatio(ranking) : null
  const progress = ratio == null ? 0 : Math.max(0, Math.min(100, ratio * 100))
  const latestDate = latestVolume?.release_date || ranking?.max_release_at || null

  return (
    <>
      <div className="glass rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <BookMarked className="w-4 h-4 text-primary-500 flex-shrink-0" />
            <h3 className="text-sm font-bold" style={{ color: 'var(--foreground)' }}>{isVI ? 'Tình Trạng Phát Hành' : 'Release Status'}</h3>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <div className="flex items-center justify-between text-xs mb-2">
              <span style={{ color: 'var(--foreground-muted)' }}>JP</span>
              <span className="font-semibold" style={{ color: 'var(--foreground-secondary)' }}>
                {ranking?.original_volumes != null ? `${ranking.original_volumes} Vols` : '—'}
              </span>
            </div>
            <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--background-secondary)' }}>
              <div className="h-full rounded-full" style={{ width: '100%', background: 'rgba(124,106,245,.48)' }} />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between text-xs mb-2">
              <span style={{ color: 'var(--foreground-muted)' }}>VN</span>
              <span className="font-semibold" style={{ color: 'var(--foreground-secondary)' }}>
                {ranking ? `${ranking.number_of_volumes ?? volumes.length}` : `${volumes.length}`}
              </span>
            </div>
            <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--background-secondary)' }}>
              <div className="h-full rounded-full" style={{ width: `${progress || 8}%`, background: 'linear-gradient(90deg,#7c3aed,#38bdf8)' }} />
            </div>
          </div>
        </div>
      </div>

      <div className="glass rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="w-4 h-4 text-primary-500 flex-shrink-0" />
          <h3 className="text-sm font-bold" style={{ color: 'var(--foreground)' }}>{isVI ? 'Thông Tin Thị Trường' : 'Market Info'}</h3>
        </div>
        <div className="space-y-3">
          <NovelSidebarMetric icon={Star} label={isVI ? 'Điểm LN' : 'LN Score'} value={ranking?.ln_score != null ? `${Number(ranking.ln_score).toFixed(1)} / 10` : '—'} color={lnScoreColor(ranking?.ln_score)} />
          <NovelSidebarMetric icon={AlertTriangle} label={isVI ? 'Rủi ro drop' : 'Drop Risk'} value={ranking ? `${lnDropPercent(ranking.drop_percent)}%` : '—'} color={lnDropColor(ranking?.drop_percent)} />
          <NovelSidebarMetric icon={Building2} label={isVI ? 'Nhà phát hành' : 'Publisher'} value={ranking?.publisher || series.publisher || '—'} color="#f97316" />
          <NovelSidebarMetric icon={Calendar} label={isVI ? 'Tập mới nhất' : 'Latest Release'} value={lnFormatDate(latestDate, locale)} color="#a78bfa" />
        </div>
      </div>
    </>
  )
}

function NovelSidebarMetric({ icon: Icon, label, value, color }: { icon: any; label: string; value: ReactNode; color: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2 min-w-0">
        <Icon className="w-4 h-4 flex-shrink-0" style={{ color }} />
        <span className="text-xs truncate" style={{ color: 'var(--foreground-muted)' }}>{label}</span>
      </div>
      <span className="text-xs font-black text-right" style={{ color: 'var(--foreground-secondary)' }}>{value}</span>
    </div>
  )
}

function InfoItem({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="p-2.5 sm:p-3 rounded-lg" style={{ background: 'var(--background-secondary)', border: '1px solid var(--card-border)' }}>
      <div className="flex items-center gap-1.5 mb-1" style={{ color: 'var(--foreground-muted)' }}>
        <Icon className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
        <span className="text-[0.65rem] sm:text-xs truncate">{label}</span>
      </div>
      <p className="text-xs sm:text-sm font-semibold truncate" style={{ color: 'var(--foreground)' }}>{value}</p>
    </div>
  )
}

function fmtBig(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000)     return (n / 1_000).toFixed(1) + 'K'
  return n.toLocaleString()
}

function StatBig({ label, value, sub, color }: { label: string; value: string; sub?: string; color: string }) {
  return (
    <div className="glass rounded-2xl p-4 text-center" style={{ border: `1px solid ${color}30` }}>
      <p className="text-2xl sm:text-3xl font-black leading-none mb-0.5" style={{ color }}>
        {value}
        {sub && <span className="text-sm font-semibold ml-0.5" style={{ color: 'var(--foreground-muted)' }}>{sub}</span>}
      </p>
      <p className="text-[10px] sm:text-xs mt-1" style={{ color: 'var(--foreground-muted)' }}>{label}</p>
    </div>
  )
}

function StatusDistribution({ data }: { data: Record<string, number> | string }) {
  const parsed: Record<string, number> = typeof data === 'string'
    ? (() => { try { return JSON.parse(data) } catch { return {} } })()
    : (data ?? {})

  const ORDER  = ['COMPLETED', 'CURRENT', 'PLANNING', 'PAUSED', 'DROPPED'] as const
  const COLORS: Record<string, string> = {
    COMPLETED: '#22c55e', CURRENT: '#6366f1',
    PLANNING:  '#fbbf24', PAUSED:  '#fb923c', DROPPED: '#f87171',
  }
  const LABELS: Record<string, string> = {
    COMPLETED: 'Hoàn thành', CURRENT: 'Đang xem',
    PLANNING:  'Dự định',    PAUSED:  'Tạm dừng', DROPPED: 'Bỏ xem',
  }

  const total = Object.values(parsed).reduce((s, v) => s + v, 0)
  if (!total) return null

  const cells: string[] = []
  for (const key of ORDER) {
    const pct = Math.round(((parsed[key] ?? 0) / total) * 100)
    for (let i = 0; i < pct; i++) cells.push(key)
  }
  while (cells.length < 100) cells.push('EMPTY')

  const [hoveredKey, setHoveredKey] = useState<string | null>(null)

  return (
    <div className="flex flex-col sm:flex-row gap-5 items-start">
      <div
        className="flex-shrink-0"
        style={{ display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)', gap: 3, width: 200 }}
      >
        {cells.map((key, i) => (
          <div
            key={i}
            onMouseEnter={() => setHoveredKey(key === 'EMPTY' ? null : key)}
            onMouseLeave={() => setHoveredKey(null)}
            style={{
              width: 16, height: 16,
              borderRadius: 3,
              background: key === 'EMPTY' ? 'var(--background-secondary)' : COLORS[key],
              opacity: hoveredKey && hoveredKey !== key ? 0.25 : 1,
              transition: 'opacity 0.15s, transform 0.1s',
              transform: hoveredKey === key ? 'scale(1.2)' : 'scale(1)',
              cursor: key === 'EMPTY' ? 'default' : 'pointer',
            }}
          />
        ))}
      </div>
      <div className="flex-1 space-y-2 min-w-0">
        {ORDER.filter(k => (parsed[k] ?? 0) > 0).map(k => {
          const pct     = ((parsed[k] / total) * 100).toFixed(1)
          const isHovered = hoveredKey === k
          return (
            <div
              key={k}
              onMouseEnter={() => setHoveredKey(k)}
              onMouseLeave={() => setHoveredKey(null)}
              className="flex items-center gap-3 p-2.5 rounded-xl cursor-pointer transition-all duration-150"
              style={{
                background: isHovered ? `${COLORS[k]}18` : 'var(--background-secondary)',
                border: `1px solid ${isHovered ? COLORS[k] + '44' : 'transparent'}`,
              }}
            >
              <div className="w-3 h-3 rounded-sm flex-shrink-0" style={{ background: COLORS[k] }} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold" style={{ color: 'var(--foreground)' }}>{LABELS[k]}</span>
                  <span className="text-xs font-bold ml-2" style={{ color: COLORS[k] }}>{pct}%</span>
                </div>
                <div className="h-1 rounded-full mt-1 overflow-hidden" style={{ background: 'var(--card-border)' }}>
                  <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: COLORS[k] }} />
                </div>
                <span className="text-[10px]" style={{ color: 'var(--foreground-muted)' }}>{fmtBig(parsed[k])} người</span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ScoreDistribution({ data }: { data: Record<string, number> | string }) {
  const parsed: Record<string, number> = typeof data === 'string'
    ? (() => { try { return JSON.parse(data) } catch { return {} } })()
    : (data ?? {})

  const buckets  = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100]
  const counts   = buckets.map(b => Number(parsed[String(b)] ?? parsed[b] ?? 0))
  const maxCount = Math.max(...counts, 1)
  const MAX_PX   = 120
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null)

  function barColor(score: number): string {
    if (score >= 80) return '#4ade80'
    if (score >= 60) return '#6366f1'
    if (score >= 40) return '#fbbf24'
    return '#f87171'
  }

  const totalVotes = counts.reduce((s, v) => s + v, 0)

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: MAX_PX + 40 }}>
        {buckets.map((b, i) => {
          const barH  = Math.max(Math.round((counts[i] / maxCount) * MAX_PX), counts[i] > 0 ? 4 : 0)
          const isHov = hoveredIdx === i
          const color = barColor(b)
          const pct   = totalVotes > 0 ? ((counts[i] / totalVotes) * 100).toFixed(1) : '0'

          return (
            <div key={b}
              style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, cursor: counts[i] > 0 ? 'pointer' : 'default' }}
              onMouseEnter={() => counts[i] > 0 && setHoveredIdx(i)}
              onMouseLeave={() => setHoveredIdx(null)}
            >
              <div style={{ fontSize: 10, fontWeight: 700, color, opacity: isHov || counts[i] === maxCount ? 1 : 0, transition: 'opacity 0.15s', whiteSpace: 'nowrap', minHeight: 14 }}>
                {counts[i] > 0 ? fmtBig(counts[i]) : ''}
              </div>
              <div style={{
                width: '100%', height: barH + 'px',
                borderRadius: '4px 4px 0 0',
                background: color,
                opacity: hoveredIdx !== null && !isHov ? 0.35 : 1,
                transform: isHov ? 'scaleY(1.04)' : 'scaleY(1)',
                transformOrigin: 'bottom',
                transition: 'opacity 0.15s, transform 0.1s',
                position: 'relative',
              }}>
                {isHov && (
                  <div style={{
                    position: 'absolute', bottom: 'calc(100% + 6px)', left: '50%',
                    transform: 'translateX(-50%)',
                    background: 'var(--glass-bg)', border: `1px solid ${color}66`,
                    borderRadius: 8, padding: '5px 8px',
                    fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap',
                    color: 'var(--foreground)', zIndex: 20,
                    boxShadow: `0 4px 12px ${color}33`,
                  }}>
                    <span style={{ color }}>★ {b}/100</span>
                    <span style={{ color: 'var(--foreground-muted)', fontWeight: 400 }}> · </span>
                    <span>{fmtBig(counts[i])} votes</span>
                    <span style={{ color: 'var(--foreground-muted)', fontWeight: 400 }}> ({pct}%)</span>
                  </div>
                )}
              </div>
              <span style={{ fontSize: 9, color: isHov ? color : 'var(--foreground-muted)', fontWeight: isHov ? 700 : 400, transition: 'color 0.15s' }}>{b}</span>
            </div>
          )
        })}
      </div>

      {totalVotes > 0 && (
        <div className="flex items-center justify-between mt-3 pt-3" style={{ borderTop: '1px solid var(--card-border)' }}>
          <span className="text-xs" style={{ color: 'var(--foreground-muted)' }}>{fmtBig(totalVotes)} lượt đánh giá</span>
          <span className="text-xs font-semibold" style={{ color: 'var(--foreground-secondary)' }}>
            {hoveredIdx !== null
              ? `★ ${buckets[hoveredIdx]}/100 — ${fmtBig(counts[hoveredIdx])} votes (${((counts[hoveredIdx]/totalVotes)*100).toFixed(1)}%)`
              : 'Hover to see details'
            }
          </span>
        </div>
      )}
    </div>
  )
}


// ── Novel LN Dead-or-Alive Stats ──────────────────────────────────────────────

function NovelDoAStats({
  ranking,
  marketRows,
  volumes,
  fanVoteHistory,
  locale,
  loading,
  error,
}: {
  ranking: NovelRankingRow | null
  marketRows: NovelRankingRow[]
  volumes: any[]
  fanVoteHistory: FanVotePoint[]
  locale: string
  loading: boolean
  error: string | null
}) {
  const isVI = locale === 'vi'

  if (loading) {
    return (
      <div className="glass rounded-2xl p-10 flex flex-col items-center gap-3">
        <Loader2 className="w-8 h-8 text-primary-500 animate-spin" />
        <p className="text-sm" style={{ color: 'var(--foreground-muted)' }}>
          {isVI ? 'Đang tải dữ liệu LN Watchlist…' : 'Loading LN Watchlist analytics…'}
        </p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="glass rounded-2xl p-6">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 mt-0.5 text-amber-400" />
          <div>
            <p className="font-bold" style={{ color: 'var(--foreground)' }}>{isVI ? 'Không tải được dữ liệu LN' : 'LN analytics failed to load'}</p>
            <p className="text-sm mt-1" style={{ color: 'var(--foreground-secondary)' }}>{error}</p>
          </div>
        </div>
      </div>
    )
  }

  if (!ranking) {
    return (
      <div className="space-y-6">
        <div className="glass rounded-2xl p-10 flex flex-col items-center gap-3 text-center">
          <BarChart2 className="w-10 h-10 opacity-20 text-primary-500" />
          <p className="text-sm font-semibold" style={{ color: 'var(--foreground)' }}>
            {isVI ? 'Series này chưa được liên kết với LN Watchlist' : 'This series is not linked to the LN Watchlist yet'}
          </p>
          <p className="text-xs max-w-xl" style={{ color: 'var(--foreground-muted)' }}>
            {isVI
              ? 'Hãy kiểm tra cột lidex_series_id trong public.ln_series_ranking để liên kết series này với bảng Dead-or-Alive.'
              : 'Check the lidex_series_id column in public.ln_series_ranking to link this series to the Dead-or-Alive table.'}
          </p>
        </div>
        <MangaStats volumes={volumes} locale={locale} />
      </div>
    )
  }

  const drop = lnDropPercent(ranking.drop_percent)
  const ratio = lnCompletionRatio(ranking)
  const releaseStatus = lnReleaseStatus(ranking)
  const latestDate = ranking.max_release_at || volumes[0]?.release_date || null
  const avgGap = ranking.average_gap_months == null ? null : Number(ranking.average_gap_months)
  const monthsAgo = ranking.months_since_last_release == null ? null : Number(ranking.months_since_last_release)
  const demand = lnPercentileScore(marketRows, ranking.average_view_count, row => lnNum(row.average_view_count))
  const releasePace = lnReleasePaceScore(ranking)
  const catchUp = lnCatchUpScore(ranking)
  const publisherSupport = lnPublisherSupportScore(ranking)
  const safety = lnCompletionSafetyScore(ranking)

  const scoreRows: LnBreakdownItem[] = [
    {
      label: isVI ? 'Tần suất phát hành' : 'Release pace',
      sub: isVI ? 'Nhịp ra tập và độ mới' : 'Gap and recency',
      value: releasePace * 10,
      delta: `+${(releasePace / 10 * 0.7).toFixed(1)}`,
      color: '#7c6af5',
    },
    {
      label: isVI ? 'Tiến độ bắt kịp JP' : 'Catch-up progress',
      sub: isVI ? 'VN so với bản gốc' : 'VN vs original',
      value: catchUp * 10,
      delta: `+${(catchUp / 10 * 0.8).toFixed(1)}`,
      color: '#a78bfa',
    },
    {
      label: isVI ? 'Nhà phát hành hoạt động' : 'Publisher activity',
      sub: isVI ? 'Sản lượng và hỗ trợ' : 'Output and support',
      value: publisherSupport * 10,
      delta: `+${(publisherSupport / 10 * 0.6).toFixed(1)}`,
      color: '#38bdf8',
    },
    {
      label: isVI ? 'Mức độ quan tâm' : 'Demand',
      sub: isVI ? 'Phân vị lượt xem' : 'View percentile',
      value: demand * 10,
      delta: `+${(demand / 10 * 0.4).toFixed(1)}`,
      color: '#22c55e',
    },
    {
      label: isVI ? 'Độ ổn định' : 'Safety',
      sub: isVI ? 'Nghịch đảo rủi ro drop' : 'Inverse drop risk',
      value: safety * 10,
      delta: `${safety >= 7 ? '+' : ''}${((safety - 5) / 10).toFixed(1)}`,
      color: safety >= 6 ? '#22c55e' : '#f97316',
    },
  ]

  const riskRows: LnBreakdownItem[] = [
    {
      label: isVI ? 'Thời gian chưa có tập mới' : 'Release inactivity',
      sub: isVI ? `${monthsAgo == null ? '—' : monthsAgo.toFixed(1)} tháng` : `${monthsAgo == null ? '—' : monthsAgo.toFixed(1)} months`,
      value: Math.min(100, Math.max(8, (monthsAgo || 0) / 24 * 100)),
      delta: monthsAgo == null ? '—' : `+${Math.min(18, Math.round(monthsAgo / 2))}%`,
      color: '#ef4444',
    },
    {
      label: isVI ? 'Gần bắt kịp JP' : 'Near caught-up',
      sub: isVI ? 'Có thể chậm do thiếu tập gốc' : 'May slow because source is close',
      value: catchUp * 10,
      delta: catchUp >= 8 ? '-5%' : '+2%',
      color: catchUp >= 8 ? '#22c55e' : '#eab308',
    },
    {
      label: isVI ? 'Nhịp phát hành' : 'Release rhythm',
      sub: avgGap == null ? '—' : `${avgGap.toFixed(1)} ${isVI ? 'tháng/tập' : 'months/vol'}`,
      value: Math.max(5, 100 - releasePace * 10),
      delta: releasePace >= 7 ? '-4%' : '+6%',
      color: releasePace >= 7 ? '#22c55e' : '#f97316',
    },
    {
      label: isVI ? 'NXB hoạt động' : 'Publisher activity',
      sub: ranking.publisher_activity || '—',
      value: Math.max(5, 100 - publisherSupport * 10),
      delta: publisherSupport >= 7 ? '-5%' : '+4%',
      color: publisherSupport >= 7 ? '#22c55e' : '#f97316',
    },
    {
      label: isVI ? 'Quan tâm thị trường' : 'Market attention',
      sub: ranking.average_view_count ? fmtBig(Number(ranking.average_view_count)) : '—',
      value: Math.max(5, 100 - demand * 10),
      delta: demand >= 6 ? '-2%' : '+3%',
      color: demand >= 6 ? '#22c55e' : '#eab308',
    },
  ]

  return (
    <div className="space-y-4 sm:space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <LnKpiCard
          label={isVI ? 'Điểm LN' : 'LN Score'}
          value={ranking.ln_score != null ? Number(ranking.ln_score).toFixed(1) : '—'}
          sub="/10"
          helper={isVI ? lnEvalLabel(ranking.evalution, true) : lnEvalLabel(ranking.evalution, false)}
          color={lnScoreColor(ranking.ln_score)}
          progress={(Number(ranking.ln_score || 0) / 10) * 100}
        />
        <LnKpiCard
          label={isVI ? 'Khả năng Drop' : 'Drop Risk'}
          value={`${drop}%`}
          helper={drop <= 25 ? (isVI ? 'Thấp' : 'Low') : drop <= 55 ? (isVI ? 'Trung bình' : 'Medium') : (isVI ? 'Cao' : 'High')}
          color={lnDropColor(ranking.drop_percent)}
          progress={100 - drop}
        />
        <LnKpiCard
          label={isVI ? 'Tiến độ VN' : 'VN Progress'}
          value={`${lnNum(ranking.number_of_volumes)}`}
          sub={`/ ${ranking.original_volumes ?? '—'}`}
          helper={ratio != null ? `${Math.round(ratio * 100)}%` : '—'}
          color="#a78bfa"
          progress={ratio != null ? ratio * 100 : 0}
        />
        <LnKpiCard
          label={isVI ? 'Lượt xem TB' : 'Avg Views'}
          value={ranking.average_view_count ? fmtBig(Number(ranking.average_view_count)) : '—'}
          helper={isVI ? 'Mỗi tập' : 'Per volume'}
          color="#38bdf8"
          progress={demand * 10}
        />
        <LnKpiCard
          label={isVI ? 'Khoảng cách phát hành' : 'Release Gap'}
          value={avgGap != null ? avgGap.toFixed(1) : '—'}
          sub={isVI ? ' tháng' : ' months'}
          helper={isVI ? 'Trung bình' : 'Average'}
          color="#7c6af5"
          progress={releasePace * 10}
        />
        <LnKpiCard
          label={isVI ? 'Lần phát hành gần nhất' : 'Latest Release'}
          value={monthsAgo != null ? monthsAgo.toFixed(0) : '—'}
          sub={isVI ? ' tháng trước' : ' months ago'}
          helper={lnFormatDateDDMM(latestDate)}
          color="#f59e0b"
          progress={Math.max(0, 100 - Math.min(100, (monthsAgo || 0) / 24 * 100))}
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[0.95fr_0.95fr_1.08fr_1.25fr] gap-4">
        <LnBreakdownPanel
          index="1"
          title={isVI ? 'Phân rã Điểm LN' : 'LN Score Breakdown'}
          subtitle={isVI ? 'Các yếu tố chính ảnh hưởng điểm sức khỏe.' : 'Main factors behind the health score.'}
          rows={scoreRows}
          footerLabel={isVI ? 'Tổng điểm' : 'Total score'}
          footerValue={ranking.ln_score != null ? Number(ranking.ln_score).toFixed(1) : '—'}
          footerSub="/10"
          footerColor={lnScoreColor(ranking.ln_score)}
        />
        <LnBreakdownPanel
          index="2"
          title={isVI ? 'Phân rã Rủi ro Drop' : 'Drop Risk Breakdown'}
          subtitle={isVI ? 'Các yếu tố làm tăng hoặc giảm khả năng drop.' : 'Signals increasing or reducing drop risk.'}
          rows={riskRows}
          footerLabel={isVI ? 'Khả năng Drop' : 'Drop risk'}
          footerValue={`${drop}%`}
          footerColor={lnDropColor(ranking.drop_percent)}
        />
        <NovelLNRadar ranking={ranking} marketRows={marketRows} locale={locale} />
        <NovelLNScatter marketRows={marketRows} active={ranking} locale={locale} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-4">
        <LnVolumeAnalytics volumes={volumes} ranking={ranking} locale={locale} />
        <div className="space-y-4">
          <LnProgressTracker ranking={ranking} locale={locale} releaseStatus={releaseStatus} />
          <FanVoteDemandCard history={fanVoteHistory} ranking={ranking} locale={locale} />
        </div>
      </div>

      <SimilarNovelsCarousel active={ranking} marketRows={marketRows} locale={locale} />

    </div>
  )
}


type LnBreakdownItem = {
  label: string
  sub?: string
  value: number
  delta?: string
  color?: string
}

function lnFormatDateDDMM(value: string | null | undefined) {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function LnKpiCard({
  label,
  value,
  sub,
  helper,
  color,
  progress,
}: {
  label: string
  value: string
  sub?: string
  helper?: string
  color: string
  progress: number
}) {
  const width = Math.max(0, Math.min(100, progress || 0))

  return (
    <div className="glass rounded-xl p-3.5 overflow-hidden relative" style={{ border: `1px solid ${color}28` }}>
      <div className="absolute right-0 top-0 w-20 h-20 rounded-full blur-2xl" style={{ background: `${color}18` }} />
      <div className="relative">
        <p className="text-[10px] font-black mb-1" style={{ color: 'var(--foreground-muted)' }}>{label}</p>
        <div className="flex items-end gap-1">
          <p className="text-2xl sm:text-3xl font-black leading-none tabular-nums" style={{ color }}>{value}</p>
          {sub && <span className="text-sm font-bold pb-0.5" style={{ color: 'var(--foreground-secondary)' }}>{sub}</span>}
        </div>
        <div className="h-1.5 rounded-full mt-3 overflow-hidden" style={{ background: 'var(--ln-track-bg)' }}>
          <div className="h-full rounded-full" style={{ width: `${width}%`, background: `linear-gradient(90deg, ${color}, ${color}aa)` }} />
        </div>
        {helper && <p className="text-[10px] mt-1.5 truncate" style={{ color: 'var(--foreground-muted)' }}>{helper}</p>}
      </div>
    </div>
  )
}

function LnBreakdownPanel({
  index,
  title,
  subtitle,
  rows,
  footerLabel,
  footerValue,
  footerSub,
  footerColor,
}: {
  index: string
  title: string
  subtitle: string
  rows: LnBreakdownItem[]
  footerLabel: string
  footerValue: string
  footerSub?: string
  footerColor: string
}) {
  return (
    <div className="glass rounded-2xl p-4 h-full">
      <div className="flex items-start gap-2 mb-3">
        <span className="w-5 h-5 rounded-lg flex items-center justify-center text-[10px] font-black shrink-0" style={{ background: 'rgba(124,106,245,.16)', color: '#a78bfa' }}>{index}</span>
        <div>
          <h2 className="text-sm font-black leading-tight" style={{ color: 'var(--foreground)' }}>{title}</h2>
          <p className="text-[11px] mt-0.5 leading-snug" style={{ color: 'var(--foreground-muted)' }}>{subtitle}</p>
        </div>
      </div>

      <div className="space-y-3">
        {rows.map(row => {
          const color = row.color || footerColor
          const width = Math.max(0, Math.min(100, row.value || 0))
          return (
            <div key={row.label}>
              <div className="flex items-center justify-between gap-2 mb-1">
                <div className="min-w-0">
                  <p className="text-[11px] font-bold truncate" style={{ color: 'var(--foreground-secondary)' }}>{row.label}</p>
                  {row.sub && <p className="text-[9px] truncate" style={{ color: 'var(--foreground-muted)' }}>{row.sub}</p>}
                </div>
                {row.delta && <span className="text-[10px] font-black tabular-nums" style={{ color }}>{row.delta}</span>}
              </div>
              <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--ln-track-bg)' }}>
                <div className="h-full rounded-full" style={{ width: `${width}%`, background: `linear-gradient(90deg, ${color}, ${color}aa)` }} />
              </div>
            </div>
          )
        })}
      </div>

      <div className="mt-5 pt-4 flex items-end justify-between" style={{ borderTop: '1px solid var(--card-border)' }}>
        <span className="text-sm font-black" style={{ color: 'var(--foreground)' }}>{footerLabel}</span>
        <span className="text-3xl font-black leading-none tabular-nums" style={{ color: footerColor }}>
          {footerValue}
          {footerSub && <span className="text-sm ml-1" style={{ color: 'var(--foreground-muted)' }}>{footerSub}</span>}
        </span>
      </div>
    </div>
  )
}

function LnReleaseTimeline({ volumes, ranking, locale }: { volumes: any[]; ranking: NovelRankingRow; locale: string }) {
  const isVI = locale === 'vi'
  const sorted = [...volumes]
    .filter(v => v.release_date || v.volume_number != null)
    .sort((a, b) => {
      const da = a.release_date ? new Date(a.release_date).getTime() : 0
      const db = b.release_date ? new Date(b.release_date).getTime() : 0
      if (da && db && da !== db) return da - db
      return Number(a.volume_number || 0) - Number(b.volume_number || 0)
    })

  if (!sorted.length) {
    return (
      <div className="glass rounded-2xl p-5">
        <h2 className="text-sm font-black" style={{ color: 'var(--foreground)' }}>{isVI ? 'Timeline phát hành' : 'Release Timeline'}</h2>
        <p className="text-xs mt-2" style={{ color: 'var(--foreground-muted)' }}>{isVI ? 'Chưa có dữ liệu tập.' : 'No volume data available.'}</p>
      </div>
    )
  }

  const gaps = sorted.map((v, i) => {
    if (i === 0 || !v.release_date || !sorted[i - 1]?.release_date) return null
    const days = Math.max(0, (new Date(v.release_date).getTime() - new Date(sorted[i - 1].release_date).getTime()) / 86400000)
    return Number((days / 30.4375).toFixed(1))
  })
  const maxGap = Math.max(...gaps.filter((v): v is number => v !== null), 0)

  return (
    <div className="glass rounded-2xl p-4 sm:p-5 overflow-hidden">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <span className="w-5 h-5 rounded-lg flex items-center justify-center text-[10px] font-black" style={{ background: 'rgba(124,106,245,.16)', color: '#a78bfa' }}>5</span>
          <div>
            <h2 className="text-sm font-black" style={{ color: 'var(--foreground)' }}>{isVI ? 'Timeline phát hành (VN)' : 'Release Timeline (VN)'}</h2>
            <p className="text-[11px]" style={{ color: 'var(--foreground-muted)' }}>{isVI ? 'Khoảng cách giữa các tập đã phát hành.' : 'Gap between released Vietnamese volumes.'}</p>
          </div>
        </div>
        <div className="hidden sm:flex items-center gap-4 text-[10px]" style={{ color: 'var(--foreground-muted)' }}>
          <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: '#7c6af5' }} /> {isVI ? 'Đã phát hành' : 'Released'}</span>
          <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full border border-dashed" style={{ borderColor: '#7c6af5' }} /> {isVI ? 'Chưa có ngày' : 'Unknown date'}</span>
        </div>
      </div>

      <div className="overflow-x-auto pb-2">
        <div className="min-w-[720px]">
          <div className="relative h-24">
            <div className="absolute left-4 right-4 top-9 h-1 rounded-full" style={{ background: 'var(--ln-track-bg)' }} />
            {sorted.map((vol, i) => {
              const left = sorted.length === 1 ? 50 : (i / (sorted.length - 1)) * 100
              const hasDate = Boolean(vol.release_date)
              const gap = gaps[i]
              const isLargeGap = gap != null && maxGap > 0 && gap >= Math.max(maxGap * 0.85, 6)
              return (
                <div key={vol.id || `${vol.volume_number}-${i}`} className="absolute top-0 -translate-x-1/2 text-center" style={{ left: `${left}%` }}>
                  <div className="h-9 flex items-end justify-center">
                    <span className="text-[10px] font-black" style={{ color: 'var(--foreground-secondary)' }}>
                      Vol.{vol.volume_number ?? i + 1}
                    </span>
                  </div>
                  <div
                    className="w-4 h-4 rounded-full mx-auto shadow-lg"
                    style={{
                      background: hasDate ? '#7c6af5' : 'transparent',
                      border: hasDate ? '2px solid #a78bfa' : '2px dashed #7c6af5',
                      boxShadow: hasDate ? '0 0 0 4px rgba(124,106,245,.18)' : 'none',
                    }}
                    title={`${isVI ? 'Tập' : 'Volume'} ${vol.volume_number ?? i + 1}: ${lnFormatDateDDMM(vol.release_date)}`}
                  />
                  <p className="text-[10px] mt-2 whitespace-nowrap" style={{ color: 'var(--foreground-muted)' }}>{lnFormatDateDDMM(vol.release_date)}</p>
                  {gap != null && (
                    <p className="text-[10px] mt-3 font-bold whitespace-nowrap" style={{ color: isLargeGap ? '#f59e0b' : 'var(--foreground-muted)' }}>
                      {gap.toFixed(1)} {isVI ? 'tháng' : 'mo'}
                    </p>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <p className="text-[10px] mt-1" style={{ color: 'var(--foreground-muted)' }}>
        {isVI ? 'Tập mới nhất từ watchlist:' : 'Latest watchlist release:'} <span className="font-bold" style={{ color: 'var(--foreground-secondary)' }}>{lnFormatDateDDMM(ranking.max_release_at)}</span>
      </p>
    </div>
  )
}

function LnProgressTracker({ ranking, locale, releaseStatus }: { ranking: NovelRankingRow; locale: string; releaseStatus: string }) {
  const isVI = locale === 'vi'
  const vn = lnNum(ranking.number_of_volumes)
  const original = lnNum(ranking.original_volumes)
  const ratio = original > 0 ? Math.min(100, vn / original * 100) : 0
  const remaining = original > 0 ? Math.max(0, original - vn) : null

  return (
    <div className="glass rounded-2xl p-4 sm:p-5 h-full">
      <div className="flex items-center gap-2 mb-5">
        <span className="w-5 h-5 rounded-lg flex items-center justify-center text-[10px] font-black" style={{ background: 'rgba(124,106,245,.16)', color: '#a78bfa' }}>6</span>
        <h2 className="text-sm font-black" style={{ color: 'var(--foreground)' }}>{isVI ? 'Theo dõi tiến độ' : 'Progress Tracker'}</h2>
      </div>

      <div className="space-y-4">
        <div>
          <p className="text-[11px] font-bold mb-1" style={{ color: 'var(--foreground-muted)' }}>VN Progress</p>
          <div className="flex items-end justify-between">
            <p className="text-3xl font-black tabular-nums" style={{ color: '#c4b5fd' }}>
              {vn}<span className="text-base ml-1" style={{ color: 'var(--foreground-muted)' }}>/ {original || '—'}</span>
            </p>
            <p className="text-lg font-black tabular-nums" style={{ color: 'var(--foreground)' }}>{original ? `${ratio.toFixed(1)}%` : '—'}</p>
          </div>
          <div className="h-2.5 rounded-full mt-3 overflow-hidden" style={{ background: 'var(--ln-track-bg)' }}>
            <div className="h-full rounded-full" style={{ width: `${ratio}%`, background: 'linear-gradient(90deg,#7c6af5,#38bdf8)' }} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <MiniMetric label={isVI ? 'JP Status' : 'JP Status'} value={lnReleaseStatusLabel(releaseStatus, isVI)} />
          <MiniMetric label={isVI ? 'Còn thiếu' : 'Remaining'} value={remaining == null ? '—' : `${remaining} ${isVI ? 'tập' : remaining === 1 ? 'vol' : 'vols'}`} />
          <MiniMetric label={isVI ? 'Nhịp TB' : 'Avg Gap'} value={ranking.average_gap_months != null ? `${Number(ranking.average_gap_months).toFixed(1)}m` : '—'} />
          <MiniMetric label={isVI ? 'Lần mới nhất' : 'Latest'} value={lnFormatDateDDMM(ranking.max_release_at)} />
        </div>
      </div>
    </div>
  )
}

function LnVolumeAnalytics({ volumes, ranking, locale }: { volumes: any[]; ranking: NovelRankingRow; locale: string }) {
  const isVI = locale === 'vi'
  const sorted = [...volumes]
    .filter(v => v.volume_number != null || v.release_date)
    .sort((a, b) => Number(a.volume_number || 0) - Number(b.volume_number || 0))

  if (sorted.length < 2) return null

  const dated = sorted.filter(v => v.release_date)
  const gaps = dated.map((vol, index) => {
    if (index === 0) return null
    const prev = dated[index - 1]
    const months = Math.max(0, (new Date(vol.release_date).getTime() - new Date(prev.release_date).getTime()) / 86400000 / 30.4375)
    return {
      volume: vol,
      months,
      label: `Vol.${vol.volume_number ?? index + 1}`,
    }
  }).filter((item): item is { volume: any; months: number; label: string } => Boolean(item))

  const avgGap = gaps.length ? gaps.reduce((sum, item) => sum + item.months, 0) / gaps.length : Number(ranking.average_gap_months || 0)
  const longestGap = gaps.length ? gaps.reduce((max, item) => Math.max(max, item.months), 0) : 0
  const latestRelease = ranking.max_release_at || sorted[sorted.length - 1]?.release_date || null
  const maxGap = Math.max(1, longestGap)
  const gapPoints = gaps.map((item, index) => {
    const x = gaps.length === 1 ? 50 : (index / (gaps.length - 1)) * 100
    const y = 88 - (item.months / maxGap) * 72
    return { ...item, x, y }
  })
  const gapPath = gapPoints.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(' ')

  return (
    <div className="glass rounded-2xl p-4 sm:p-5">
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3 mb-4">
        <div>
          <h2 className="text-sm font-black" style={{ color: 'var(--foreground)' }}>{isVI ? 'Nhịp phát hành VN' : 'VN Release Cadence'}</h2>
          <p className="text-[11px] mt-0.5" style={{ color: 'var(--foreground-muted)' }}>
            {isVI ? 'Timeline từng tập và xu hướng khoảng cách giữa các lần phát hành.' : 'Volume timeline and month-gap trend between releases.'}
          </p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:w-[560px] gap-2">
          <MiniMetric label={isVI ? 'Gap TB' : 'Avg Gap'} value={avgGap ? `${avgGap.toFixed(1)}m` : '—'} />
          <MiniMetric label={isVI ? 'Gap dài nhất' : 'Longest Gap'} value={longestGap ? `${longestGap.toFixed(1)}m` : '—'} />
          <MiniMetric label={isVI ? 'Số tập VN' : 'VN Volumes'} value={String(sorted.length)} />
          <MiniMetric label={isVI ? 'Mới nhất' : 'Latest'} value={lnFormatDateDDMM(latestRelease)} />
        </div>
      </div>

      <div className="grid grid-cols-1 2xl:grid-cols-[0.95fr_1.05fr] gap-4">
        <div className="rounded-xl p-3" style={{ background: 'var(--background-secondary)', border: '1px solid var(--card-border)' }}>
          <div className="flex items-center justify-between mb-3">
            <p className="text-[11px] font-black uppercase tracking-wide" style={{ color: 'var(--foreground)' }}>{isVI ? 'Release Timeline' : 'Release Timeline'}</p>
            <span className="text-[10px]" style={{ color: 'var(--foreground-muted)' }}>{sorted.length} {isVI ? 'tập' : 'volumes'}</span>
          </div>
          {sorted.length ? (
            <div className="overflow-x-auto pb-1">
              <div className="relative min-w-[620px] h-[170px]">
                <div className="absolute left-5 right-5 top-[76px] h-1.5 rounded-full" style={{ background: 'var(--ln-track-bg)' }} />
                {sorted.map((vol, index) => {
                  const left = sorted.length === 1 ? 50 : (index / (sorted.length - 1)) * 100
                  const hasDate = Boolean(vol.release_date)
                  const date = lnFormatDateDDMM(vol.release_date)
                  return (
                    <div
                      key={vol.id || `${vol.volume_number}-${index}`}
                      className="absolute top-0 -translate-x-1/2 flex flex-col items-center text-center"
                      style={{ left: `${left}%` }}
                    >
                      <span className="text-[10px] font-black mb-2" style={{ color: 'var(--foreground-secondary)' }}>Vol.{vol.volume_number ?? index + 1}</span>
                      <div
                        className="w-5 h-5 rounded-full"
                        style={{
                          marginTop: 48,
                          background: hasDate ? 'linear-gradient(135deg,#7c6af5,#38bdf8)' : 'transparent',
                          border: hasDate ? '2px solid #c4b5fd' : '2px dashed #7c6af5',
                          boxShadow: hasDate ? '0 0 0 5px rgba(124,106,245,.16)' : 'none',
                        }}
                        title={`Vol.${vol.volume_number ?? index + 1}: ${date}`}
                      />
                      <span className="text-[10px] mt-3 whitespace-nowrap" style={{ color: 'var(--foreground-muted)' }}>{date}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : (
            <p className="text-xs py-10 text-center" style={{ color: 'var(--foreground-muted)' }}>{isVI ? 'Chưa có dữ liệu tập.' : 'No volume data available.'}</p>
          )}
        </div>

        <div className="rounded-xl p-3" style={{ background: 'var(--background-secondary)', border: '1px solid var(--card-border)' }}>
          <div className="flex items-center justify-between mb-3">
            <p className="text-[11px] font-black uppercase tracking-wide" style={{ color: 'var(--foreground)' }}>{isVI ? 'Release Gap Trend' : 'Release Gap Trend'}</p>
            <span className="text-[10px]" style={{ color: 'var(--foreground-muted)' }}>{gaps.length} {isVI ? 'khoảng' : 'gaps'}</span>
          </div>
          {gapPoints.length >= 2 ? (
            <div className="relative h-[210px]">
              <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 w-full h-full overflow-visible">
                {[20, 40, 60, 80].map(y => <line key={y} x1="0" x2="100" y1={y} y2={y} stroke="currentColor" strokeWidth="0.35" className="text-slate-400/20" />)}
                <path d={`${gapPath} L 100 100 L 0 100 Z`} fill="rgba(124,106,245,.12)" />
                <path d={gapPath} fill="none" stroke="#7c6af5" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
                {gapPoints.map(point => (
                  <circle key={`${point.label}-${point.volume.id || point.months}`} cx={point.x} cy={point.y} r="2" fill="#7c6af5" stroke="white" strokeWidth="0.8" vectorEffect="non-scaling-stroke">
                    <title>{`${point.label}: ${point.months.toFixed(1)} ${isVI ? 'tháng' : 'months'}`}</title>
                  </circle>
                ))}
              </svg>
              <div className="absolute left-0 top-0 text-[10px] font-bold" style={{ color: 'var(--foreground-muted)' }}>{maxGap.toFixed(1)}m</div>
              <div className="absolute left-0 bottom-0 text-[10px] font-bold" style={{ color: 'var(--foreground-muted)' }}>0m</div>
              <div className="absolute right-0 bottom-0 text-[10px]" style={{ color: 'var(--foreground-muted)' }}>
                {gapPoints[0]?.label} → {gapPoints[gapPoints.length - 1]?.label}
              </div>
            </div>
          ) : (
            <p className="text-xs py-10 text-center" style={{ color: 'var(--foreground-muted)' }}>{isVI ? 'Chưa đủ ngày phát hành để vẽ xu hướng gap.' : 'Not enough release dates to draw a gap trend.'}</p>
          )}
        </div>
      </div>
    </div>
  )
}

function FanVoteDemandCard({ history, ranking, locale }: { history: FanVotePoint[]; ranking: NovelRankingRow; locale: string }) {
  const isVI = locale === 'vi'
  const latest = history[history.length - 1] || null
  const previous = history.length > 1 ? history[history.length - 2] : null
  const bestRank = history.reduce<number | null>((best, point) => {
    if (point.rank == null) return best
    return best == null ? point.rank : Math.min(best, point.rank)
  }, null)
  const rankChange = latest?.rank != null && previous?.rank != null ? previous.rank - latest.rank : null
  const support = lnPublisherSupportScore(ranking) * 10
  const rankDemand = latest?.rank ? Math.max(0, Math.min(100, 105 - latest.rank)) : 0
  const voteMomentum = latest && previous && previous.votes > 0
    ? Math.max(-30, Math.min(30, ((latest.votes - previous.votes) / previous.votes) * 100))
    : 0
  const demand = latest ? Math.max(0, Math.min(100, rankDemand + voteMomentum * 0.35)) : 0
  const demandGap = latest ? Math.round(demand - support) : null

  const validRanks = history.map((point, index) => ({ ...point, index })).filter((point): point is FanVotePoint & { rank: number; index: number } => point.rank != null)
  const sparkPath = (() => {
    if (validRanks.length <= 1) return ''
    const minRank = Math.min(...validRanks.map(point => point.rank))
    const maxRank = Math.max(...validRanks.map(point => point.rank))
    const span = Math.max(1, maxRank - minRank)
    const lastIndex = Math.max(1, history.length - 1)
    return validRanks.map((point, index) => {
      const x = (point.index / lastIndex) * 92 + 4
      const y = 8 + ((point.rank - minRank) / span) * 42
      return `${index === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`
    }).join(' ')
  })()

  return (
    <div className="glass rounded-2xl p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-sm font-black" style={{ color: 'var(--foreground)' }}>{isVI ? 'Fan Vote Demand' : 'Fan Vote Demand'}</h2>
          <p className="text-[11px] mt-0.5" style={{ color: 'var(--foreground-muted)' }}>
            {isVI ? 'Tín hiệu nhu cầu từ BXH LN yêu thích.' : 'Demand signal from favourite LN voting.'}
          </p>
        </div>
        {latest && (
          <span className="rounded-full px-2.5 py-1 text-[10px] font-black" style={{ color: '#f59e0b', background: 'rgba(245,158,11,.12)', border: '1px solid rgba(245,158,11,.28)' }}>
            {latest.period}
          </span>
        )}
      </div>

      {latest ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <MiniMetric label={isVI ? 'Hạng mới nhất' : 'Latest Rank'} value={latest.rank ? `#${latest.rank}` : '—'} />
            <MiniMetric label={isVI ? 'Bình chọn' : 'Votes'} value={latest.votes.toLocaleString('vi-VN')} />
            <MiniMetric label={isVI ? 'Hạng tốt nhất' : 'Best Rank'} value={bestRank ? `#${bestRank}` : '—'} />
            <MiniMetric
              label={isVI ? 'Thay đổi' : 'Change'}
              value={rankChange == null ? '—' : rankChange === 0 ? '0' : `${rankChange > 0 ? '+' : ''}${rankChange}`}
            />
          </div>

          <div className="rounded-xl p-3" style={{ background: 'var(--background-secondary)', border: '1px solid var(--card-border)' }}>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] font-black uppercase tracking-wide" style={{ color: 'var(--foreground)' }}>{isVI ? 'Xu hướng hạng' : 'Rank Trend'}</p>
              <span className="text-[10px]" style={{ color: 'var(--foreground-muted)' }}>{history.length} {isVI ? 'kỳ' : 'periods'}</span>
            </div>
            {sparkPath ? (
              <svg viewBox="0 0 100 60" className="w-full h-[72px]" aria-hidden="true">
                <path d={sparkPath} fill="none" stroke={rankChange != null && rankChange >= 0 ? '#22c55e' : '#ef4444'} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                {validRanks.map(point => {
                  const minRank = Math.min(...validRanks.map(p => p.rank))
                  const maxRank = Math.max(...validRanks.map(p => p.rank))
                  const span = Math.max(1, maxRank - minRank)
                  const lastIndex = Math.max(1, history.length - 1)
                  const x = (point.index / lastIndex) * 92 + 4
                  const y = 8 + ((point.rank - minRank) / span) * 42
                  return <circle key={`${point.period}-${point.rank}`} cx={x} cy={y} r="3" fill="#38bdf8"><title>{`${point.period}: #${point.rank}`}</title></circle>
                })}
              </svg>
            ) : (
              <p className="text-xs py-5 text-center" style={{ color: 'var(--foreground-muted)' }}>{isVI ? 'Cần ít nhất 2 kỳ vote để vẽ xu hướng.' : 'At least 2 voting periods are needed for a trend.'}</p>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-black uppercase tracking-wide" style={{ color: 'var(--foreground-muted)' }}>{isVI ? 'Demand Gap' : 'Demand Gap'}</span>
              <span className="text-xs font-black" style={{ color: demandGap != null && demandGap > 15 ? '#f59e0b' : demandGap != null && demandGap < -15 ? '#38bdf8' : 'var(--foreground-secondary)' }}>
                {demandGap == null ? '—' : `${demandGap > 0 ? '+' : ''}${demandGap}`}
              </span>
            </div>
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
              <div>
                <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--ln-track-bg)' }}>
                  <div className="h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, demand))}%`, background: '#f59e0b' }} />
                </div>
                <p className="text-[9px] mt-1" style={{ color: 'var(--foreground-muted)' }}>{isVI ? 'Nhu cầu' : 'Demand'}</p>
              </div>
              <span className="text-[10px] font-black" style={{ color: 'var(--foreground-muted)' }}>vs</span>
              <div>
                <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--ln-track-bg)' }}>
                  <div className="h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, support))}%`, background: '#38bdf8' }} />
                </div>
                <p className="text-[9px] mt-1 text-right" style={{ color: 'var(--foreground-muted)' }}>{isVI ? 'Hỗ trợ NPH' : 'Support'}</p>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <p className="text-xs py-8 text-center" style={{ color: 'var(--foreground-muted)' }}>
          {isVI ? 'Series này chưa có dữ liệu vote yêu thích.' : 'No favourite voting data for this series yet.'}
        </p>
      )}
    </div>
  )
}

function SimilarNovelsCarousel({ active, marketRows, locale }: { active: NovelRankingRow; marketRows: NovelRankingRow[]; locale: string }) {
  const isVI = locale === 'vi'
  const activeKey = `${active.lidex_series_id || active.series_id || active.id}|${active.series_code || ''}`

  const similar = marketRows
    .filter(row => `${row.lidex_series_id || row.series_id || row.id}|${row.series_code || ''}` !== activeKey)
    .map(row => {
      const scoreDiff = Math.abs(lnNum(row.ln_score) - lnNum(active.ln_score))
      const dropDiff = Math.abs(lnDropPercent(row.drop_percent) - lnDropPercent(active.drop_percent)) / 10
      const samePublisher = row.publisher && active.publisher && row.publisher === active.publisher ? 4 : 0
      const sameEval = row.evalution === active.evalution ? 2 : 0
      const sameStatus = lnReleaseStatus(row) === lnReleaseStatus(active) ? 1.5 : 0
      const volumeDiff = Math.abs(lnNum(row.number_of_volumes) - lnNum(active.number_of_volumes)) / 8
      return { row, score: samePublisher + sameEval + sameStatus - scoreDiff - dropDiff - volumeDiff }
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)
    .map(item => item.row)

  if (!similar.length) return null

  return (
    <div className="glass rounded-2xl p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-sm font-black" style={{ color: 'var(--foreground)' }}>{isVI ? 'Gợi ý Light Novel tương tự' : 'Similar Light Novels'}</h2>
          <p className="text-[11px]" style={{ color: 'var(--foreground-muted)' }}>
            {isVI ? 'Dựa trên NPH, trạng thái, điểm LN và rủi ro drop.' : 'Based on publisher, status, LN score, and drop risk.'}
          </p>
        </div>
      </div>

      <div className="overflow-x-auto pb-1">
        <div className="flex gap-3 min-w-max">
          {similar.map(row => {
            const href = row.lidex_series_id ? `/content/${row.lidex_series_id}` : `/browse?search=${encodeURIComponent(row.series_title || '')}`
            return (
              <Link
                key={`${row.lidex_series_id || row.id}-${row.series_code || ''}`}
                href={href}
                className="group w-[150px] shrink-0 rounded-xl overflow-hidden transition-all hover:-translate-y-1"
                style={{ background: 'var(--content-detail-tile-bg)', border: '1px solid var(--content-detail-tile-border)' }}
              >
                <div className="relative h-[190px]" style={{ background: 'var(--background-secondary)' }}>
                  {row.cover_url ? (
                    <img src={row.cover_url} alt={row.series_title || ''} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <BookOpen className="w-8 h-8 opacity-30 text-primary-400" />
                    </div>
                  )}
                  <div className="absolute left-2 top-2 px-2 py-1 rounded-lg text-[10px] font-black text-white" style={{ background: 'rgba(0,0,0,.58)' }}>
                    {Number(row.ln_score || 0).toFixed(1)} LN
                  </div>
                </div>
                <div className="p-2.5">
                  <p className="text-xs font-black line-clamp-2 min-h-[32px]" style={{ color: 'var(--foreground)' }}>{row.series_title || 'Untitled'}</p>
                  <div className="flex items-center justify-between mt-2 text-[10px]">
                    <span style={{ color: lnDropColor(row.drop_percent) }}>{lnDropPercent(row.drop_percent)}% Drop</span>
                    <span style={{ color: 'var(--foreground-muted)' }}>{row.publisher || '—'}</span>
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl p-3" style={{ background: 'var(--background-secondary)', border: '1px solid var(--card-border)' }}>
      <p className="text-[10px] uppercase tracking-wide font-bold mb-1" style={{ color: 'var(--foreground-muted)' }}>{label}</p>
      <p className="text-sm font-black truncate" style={{ color: 'var(--foreground)' }}>{value}</p>
    </div>
  )
}

function BreakdownCard({ title, accent, body, empty }: { title: string; accent: string; body: string; empty: string }) {
  const lines = body.split('\n').map(line => line.trim()).filter(Boolean)

  return (
    <div className="glass rounded-2xl p-5 sm:p-6">
      <div className="flex items-center gap-2 mb-4">
        <span className="w-2.5 h-2.5 rounded-full" style={{ background: accent, boxShadow: `0 0 16px ${accent}` }} />
        <h2 className="text-base font-bold" style={{ color: 'var(--foreground)' }}>{title}</h2>
      </div>
      {lines.length ? (
        <div className="space-y-2">
          {lines.map((line, i) => (
            <div key={i} className="text-xs leading-relaxed rounded-lg p-2.5" style={{ color: 'var(--foreground-secondary)', background: 'var(--background-secondary)', border: '1px solid var(--card-border)' }}>
              {line}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm" style={{ color: 'var(--foreground-muted)' }}>{empty}</p>
      )}
    </div>
  )
}

function NovelLNScatter({ marketRows, active, locale }: { marketRows: NovelRankingRow[]; active: NovelRankingRow; locale: string }) {
  const isVI = locale === 'vi'
  const rows = marketRows.filter(row => row.ln_score != null && row.drop_percent != null)
  const activeKey = `${active.lidex_series_id || active.series_id || active.id}|${active.series_code || ''}`

  return (
    <div className="glass rounded-2xl p-4 h-full">
      <div className="flex items-start gap-2 mb-3">
        <span className="w-5 h-5 rounded-lg flex items-center justify-center text-[10px] font-black shrink-0" style={{ background: 'rgba(124,106,245,.16)', color: '#a78bfa' }}>4</span>
        <div>
          <h2 className="text-sm font-black leading-tight" style={{ color: 'var(--foreground)' }}>{isVI ? 'Vị thế thị trường LN' : 'LN Market Position'}</h2>
          <p className="text-[11px] mt-0.5" style={{ color: 'var(--foreground-muted)' }}>{isVI ? 'Điểm LN so với khả năng drop.' : 'LN score against drop risk.'}</p>
        </div>
      </div>

      <div className="relative h-[255px] rounded-xl overflow-hidden" style={{ background: 'var(--ln-chart-bg)', border: '1px solid var(--card-border)' }}>
        <div className="absolute inset-x-7 inset-y-7">
          {[0, 25, 50, 75, 100].map(v => (
            <div key={`y-${v}`} className="absolute left-0 right-0 border-t border-dashed" style={{ top: `${100 - v}%`, borderColor: 'var(--ln-chart-grid)' }}>
              <span className="absolute -left-2 -translate-x-full -top-2 text-[9px]" style={{ color: 'var(--foreground-muted)' }}>{v}%</span>
            </div>
          ))}
          {[0, 2, 4, 6, 8, 10].map(v => (
            <div key={`x-${v}`} className="absolute top-0 bottom-0 border-l border-dashed" style={{ left: `${v * 10}%`, borderColor: 'var(--ln-chart-grid)' }}>
              <span className="absolute -bottom-4 -translate-x-1/2 text-[9px]" style={{ color: 'var(--foreground-muted)' }}>{v}</span>
            </div>
          ))}

          <span className="absolute left-2 top-2 text-[9px] font-black uppercase" style={{ color: '#ef4444' }}>HIGH RISK</span>
          <span className="absolute right-2 top-2 text-[9px] font-black uppercase" style={{ color: '#22c55e' }}>HEALTHY</span>
          <span className="absolute left-2 bottom-2 text-[9px] font-black uppercase" style={{ color: '#ef4444' }}>NEAR DROP</span>
          <span className="absolute right-2 bottom-2 text-[9px] font-black uppercase" style={{ color: '#22c55e' }}>LOW RISK</span>

          {rows.map(row => {
            const key = `${row.lidex_series_id || row.series_id || row.id}|${row.series_code || ''}`
            const noise = lnStableNoise(key)
            const x = Math.max(0, Math.min(100, (lnNum(row.ln_score) + noise.x) * 10))
            const y = 100 - Math.max(0, Math.min(100, lnDropPercent(row.drop_percent) + noise.y))
            const selected = key === activeKey
            const status = lnReleaseStatus(row)
            const color = selected ? '#38bdf8' : status === 'Hoàn thành' ? '#94a3b8' : row.evalution === 'Dropped' ? '#ef4444' : row.evalution === 'Dead' ? '#f97316' : row.evalution === 'Limping' ? '#eab308' : '#22c55e'
            const size = selected ? 18 : 7

            return (
              <button
                key={key}
                title={`${row.series_title || 'Untitled'}\\nLN ${Number(row.ln_score || 0).toFixed(1)} · Drop ${lnDropPercent(row.drop_percent)}%`}
                className="absolute rounded-full transition-all hover:scale-150 focus:outline-none focus:ring-2 focus:ring-cyan-300"
                style={{
                  left: `${x}%`,
                  top: `${y}%`,
                  width: size,
                  height: size,
                  background: color,
                  border: selected ? '2px solid #fff' : '1px solid rgba(255,255,255,.35)',
                  boxShadow: selected ? `0 0 0 8px ${color}24, 0 0 22px ${color}` : `0 0 10px ${color}66`,
                  transform: 'translate(-50%, -50%)',
                  zIndex: selected ? 30 : 10,
                }}
              />
            )
          })}
        </div>

        <div className="absolute left-8 bottom-2 text-[9px]" style={{ color: 'var(--foreground-muted)' }}>{isVI ? 'Điểm LN' : 'LN Score'} →</div>
        <div className="absolute left-2 top-1/2 -rotate-90 text-[9px]" style={{ color: 'var(--foreground-muted)' }}>{isVI ? 'Khả năng drop' : 'Drop risk'}</div>
      </div>
    </div>
  )
}

function NovelLNRadar({ ranking, marketRows, locale }: { ranking: NovelRankingRow; marketRows: NovelRankingRow[]; locale: string }) {
  const isVI = locale === 'vi'
  const axes = buildNovelRadarAxes(ranking, marketRows, isVI)
  const size = 238
  const cx = size / 2
  const cy = size / 2
  const maxR = 72
  const points = axes.map((axis, i) => {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / axes.length
    const r = lnClamp10(axis.value) / 10 * maxR
    return `${cx + Math.cos(angle) * r},${cy + Math.sin(angle) * r}`
  }).join(' ')
  const grids = [0.33, 0.66, 1].map(level => axes.map((_, i) => {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / axes.length
    const r = level * maxR
    return `${cx + Math.cos(angle) * r},${cy + Math.sin(angle) * r}`
  }).join(' '))

  return (
    <div className="glass rounded-2xl p-4 h-full">
      <div className="flex items-start gap-2 mb-3">
        <span className="w-5 h-5 rounded-lg flex items-center justify-center text-[10px] font-black shrink-0" style={{ background: 'rgba(124,106,245,.16)', color: '#a78bfa' }}>3</span>
        <div>
          <h2 className="text-sm font-black leading-tight" style={{ color: 'var(--foreground)' }}>{isVI ? 'Radar sức khỏe LN' : 'LN Health Radar'}</h2>
          <p className="text-[11px] mt-0.5" style={{ color: 'var(--foreground-muted)' }}>{isVI ? 'Sức khỏe phát hành và thị trường.' : 'Release and market health.'}</p>
        </div>
      </div>

      <div className="flex justify-center">
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="max-w-full">
          {grids.map((g, i) => <polygon key={i} points={g} fill="none" stroke="var(--ln-chart-grid)" />)}
          {axes.map((axis, i) => {
            const angle = -Math.PI / 2 + (i * 2 * Math.PI) / axes.length
            const x = cx + Math.cos(angle) * (maxR + 26)
            const y = cy + Math.sin(angle) * (maxR + 26)
            const valueX = cx + Math.cos(angle) * (maxR + 12)
            const valueY = cy + Math.sin(angle) * (maxR + 12)
            return (
              <g key={axis.label}>
                <line x1={cx} y1={cy} x2={cx + Math.cos(angle) * maxR} y2={cy + Math.sin(angle) * maxR} stroke="var(--ln-chart-grid)" />
                <text x={x} y={y - 4} textAnchor="middle" dominantBaseline="middle" fontSize="8.5" fontWeight="800" fill="var(--foreground-secondary)">{axis.label}</text>
                <text x={valueX} y={valueY + 8} textAnchor="middle" dominantBaseline="middle" fontSize="8" fontWeight="900" fill="#a78bfa">{axis.value.toFixed(0)}</text>
              </g>
            )
          })}
          <polygon points={points} fill="rgba(124,106,245,.30)" stroke="#a78bfa" strokeWidth="2" />
          {points.split(' ').map((p, i) => {
            const [x, y] = p.split(',').map(Number)
            return <circle key={i} cx={x} cy={y} r="3" fill="#c4b5fd" />
          })}
        </svg>
      </div>

      <div className="grid grid-cols-2 gap-2 mt-1">
        {axes.slice(0, 4).map(axis => (
          <div key={axis.label} title={axis.hint} className="rounded-lg p-2" style={{ background: 'var(--content-detail-tile-bg)', border: '1px solid var(--content-detail-tile-border)' }}>
            <p className="text-[9px] font-black uppercase truncate" style={{ color: 'var(--foreground-muted)' }}>{axis.label}</p>
            <p className="text-sm font-black" style={{ color: '#c4b5fd' }}>{axis.value.toFixed(1)}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── NEW: Manga Stats Component ───────────────────────────────────────────────

function MangaStats({ volumes, locale }: { volumes: any[]; locale: string }) {
  const isVI = locale === 'vi'
  
  // Calculate basic stats
  const prices = volumes.map(v => v.price || 0).filter(p => p > 0)
  const avgPrice = prices.length ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length) : 0
  const maxPrice = prices.length ? Math.max(...prices) : 0
  const minPrice = prices.length ? Math.min(...prices) : 0

  if (volumes.length === 0) {
    return (
      <div className="glass rounded-2xl p-10 flex flex-col items-center gap-3">
        <BookOpen className="w-10 h-10 opacity-20 text-primary-500" />
        <p className="text-sm" style={{ color: 'var(--foreground-muted)' }}>
          {isVI ? 'Chưa có dữ liệu tập' : 'No volume data available'}
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      
      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatBig label={isVI ? 'Tổng tập' : 'Total Vols'} value={String(volumes.length)} color="#6366f1" />
        <StatBig label={isVI ? 'Giá TB' : 'Avg Price'} value={avgPrice ? avgPrice.toLocaleString('vi-VN') : '—'} sub="VND" color="#fbbf24" />
        <StatBig label={isVI ? 'Giá cao nhất' : 'Max Price'} value={maxPrice ? maxPrice.toLocaleString('vi-VN') : '—'} sub="VND" color="#f87171" />
        <StatBig label={isVI ? 'Giá thấp nhất' : 'Min Price'} value={minPrice ? minPrice.toLocaleString('vi-VN') : '—'} sub="VND" color="#4ade80" />
      </div>

      {/* Pricing Chart */}
      <div className="glass rounded-2xl p-5 sm:p-6">
        <div className="flex items-center gap-2 mb-5">
          <TrendingUp className="w-5 h-5 text-primary-500" />
          <h2 className="text-base font-bold" style={{ color: 'var(--foreground)' }}>
            {isVI ? 'Lịch sử giá (VNĐ)' : 'Pricing History (VND)'}
          </h2>
        </div>
        <PricingLineChart volumes={volumes} />
      </div>

      {/* Release Schedule Carousel */}
      <ReleaseSchedule volumes={volumes} locale={locale} />

    </div>
  )
}

// ── Release Schedule Carousel ─────────────────────────────────────────────

function ReleaseSchedule({ volumes, locale }: { volumes: any[]; locale: string }) {
  const isVI = locale === 'vi'
  const sorted = [...volumes].sort((a, b) => (a.volume_number || 0) - (b.volume_number || 0))

  const VISIBLE = 5 // cards shown at once
  const [startIdx, setStartIdx] = useState(0)
  const [activeIdx, setActiveIdx] = useState<number | null>(null)
  const [imgErrors, setImgErrors] = useState<Record<number, boolean>>({})

  const canPrev = startIdx > 0
  const canNext = startIdx + VISIBLE < sorted.length

  const prev = () => setStartIdx(i => Math.max(0, i - 1))
  const next = () => setStartIdx(i => Math.min(sorted.length - VISIBLE, i + 1))

  const visible = sorted.slice(startIdx, startIdx + VISIBLE)

  if (sorted.length === 0) return null

  return (
    <div className="glass rounded-2xl p-5 sm:p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <Calendar className="w-5 h-5 text-primary-500 flex-shrink-0" />
          <h2 className="text-base font-bold" style={{ color: 'var(--foreground)' }}>
            {isVI ? 'Lịch phát hành' : 'Release Schedule'}
          </h2>
          <span
            className="ml-1 text-[11px] px-2 py-0.5 rounded-full font-semibold"
            style={{ background: 'var(--background-secondary)', color: 'var(--foreground-muted)', border: '1px solid var(--card-border)' }}
          >
            {sorted.length} {isVI ? 'tập' : 'vols'}
          </span>
        </div>

        {/* Nav buttons */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={prev}
            disabled={!canPrev}
            className="w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-150 disabled:opacity-30 disabled:cursor-not-allowed"
            style={{
              background: canPrev ? 'var(--background-secondary)' : 'transparent',
              border: '1px solid var(--card-border)',
              color: 'var(--foreground-secondary)',
            }}
            aria-label="Previous volumes"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M9 11L5 7L9 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          <span className="text-xs tabular-nums px-1" style={{ color: 'var(--foreground-muted)', minWidth: 52, textAlign: 'center' }}>
            {startIdx + 1}–{Math.min(startIdx + VISIBLE, sorted.length)} / {sorted.length}
          </span>
          <button
            onClick={next}
            disabled={!canNext}
            className="w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-150 disabled:opacity-30 disabled:cursor-not-allowed"
            style={{
              background: canNext ? 'var(--background-secondary)' : 'transparent',
              border: '1px solid var(--card-border)',
              color: 'var(--foreground-secondary)',
            }}
            aria-label="Next volumes"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M5 3L9 7L5 11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>
      </div>

      {/* Carousel track */}
      <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${VISIBLE}, 1fr)` }}>
        {visible.map((vol, localI) => {
          const globalI = startIdx + localI
          const isActive = activeIdx === globalI
          const hasImg = vol.cover_url && !imgErrors[globalI]
          const date = vol.release_date
            ? new Date(vol.release_date).toLocaleDateString(isVI ? 'vi-VN' : 'en-US', {
                year: 'numeric', month: 'short', day: 'numeric',
              })
            : null

          return (
            <div
              key={vol.id || globalI}
              onClick={() => setActiveIdx(isActive ? null : globalI)}
              className="flex flex-col cursor-pointer group"
              style={{ minWidth: 0 }}
            >
              {/* Cover */}
              <div
                className="relative rounded-xl overflow-hidden mb-2 transition-all duration-200"
                style={{
                  aspectRatio: '2/3',
                  border: isActive
                    ? '2px solid #6366f1'
                    : '1px solid var(--card-border)',
                  boxShadow: isActive ? '0 0 0 3px #6366f125' : 'none',
                  background: 'var(--background-secondary)',
                  transform: isActive ? 'translateY(-2px)' : 'none',
                }}
              >
                {hasImg ? (
                  <img
                    src={vol.cover_url}
                    alt={`Vol. ${vol.volume_number}`}
                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                    onError={() => setImgErrors(prev => ({ ...prev, [globalI]: true }))}
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center gap-1.5"
                    style={{ background: 'linear-gradient(135deg, #6366f115, #818cf815)' }}>
                    <BookOpen className="w-6 h-6 text-primary-400 opacity-60" />
                    <span className="text-[10px] font-bold text-primary-400 opacity-60">
                      Vol.{vol.volume_number}
                    </span>
                  </div>
                )}

                {/* Volume badge overlay */}
                <div
                  className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded-md text-[10px] font-bold text-white"
                  style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
                >
                  #{vol.volume_number}
                </div>

                {/* Hover overlay */}
                <div
                  className="absolute inset-0 transition-opacity duration-200 opacity-0 group-hover:opacity-100"
                  style={{ background: 'rgba(99,102,241,0.08)' }}
                />
              </div>

              {/* Info below card */}
              <div className="px-0.5">
                <p
                  className="text-[11px] font-semibold leading-tight mb-0.5 truncate"
                  style={{ color: isActive ? '#6366f1' : 'var(--foreground)' }}
                >
                  {isVI ? 'Tập' : 'Vol.'} {vol.volume_number}
                </p>
                {date ? (
                  <p className="text-[10px] leading-tight" style={{ color: 'var(--foreground-muted)' }}>
                    {date}
                  </p>
                ) : (
                  <p className="text-[10px] italic" style={{ color: 'var(--foreground-muted)', opacity: 0.5 }}>
                    {isVI ? 'Chưa có ngày' : 'No date'}
                  </p>
                )}
                {vol.price && (
                  <p className="text-[11px] font-bold tabular-nums mt-0.5" style={{ color: 'var(--foreground-secondary)' }}>
                    {Number(vol.price).toLocaleString('vi-VN')} ₫
                  </p>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Dot pagination */}
      {sorted.length > VISIBLE && (
        <div className="flex justify-center gap-1.5 mt-4">
          {Array.from({ length: Math.ceil(sorted.length / VISIBLE) }, (_, pageI) => {
            const isCurrentPage = Math.floor(startIdx / VISIBLE) === pageI
            return (
              <button
                key={pageI}
                onClick={() => setStartIdx(Math.min(pageI * VISIBLE, sorted.length - VISIBLE))}
                className="rounded-full transition-all duration-200"
                style={{
                  width: isCurrentPage ? 20 : 6,
                  height: 6,
                  background: isCurrentPage ? '#6366f1' : 'var(--card-border)',
                }}
                aria-label={`Go to page ${pageI + 1}`}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── UPDATED: Polished Line Chart for Pricing ───────────────────────────────

function PricingLineChart({ volumes }: { volumes: Volume[] }) {
  const svgRef = useRef<SVGSVGElement>(null)
  const lineRef = useRef<SVGPathElement>(null)
  const [tooltip, setTooltip] = useState<TooltipState>({ visible: false, x: 0, y: 0, price: 0, volNumber: 0 })
  const gradId = useId().replace(/:/g, "")
 
  const sorted = [...volumes].sort((a, b) => (a.volume_number ?? 0) - (b.volume_number ?? 0))
  const prices = sorted.map(v => parseFloat(String(v.price)) || 0)
  if (prices.length === 0) return null
 
  const minPrice = Math.min(...prices)
  const maxPrice = Math.max(...prices)
  const avgPrice = prices.reduce((a, b) => a + b, 0) / prices.length
  const priceRange = maxPrice - minPrice
  const firstPrice = prices[0]
  const lastPrice = prices[prices.length - 1]
  const delta = lastPrice - firstPrice
  const deltaPct = firstPrice ? (delta / firstPrice) * 100 : 0
 
  // Smart Y padding: if all prices are identical, pad ±500; otherwise ±25%
  const yPad = priceRange < 1 ? 500 : priceRange * 0.25
  const yMin = minPrice - yPad
  const yMax = maxPrice + yPad
  const yRange = yMax - yMin
 
  const W = 680
  const H = 220
  const pad = { top: 24, right: 32, bottom: 36, left: 72 }
  const cW = W - pad.left - pad.right
  const cH = H - pad.top - pad.bottom
 
  const xOf = (i: number) =>
    pad.left + (sorted.length > 1 ? (i / (sorted.length - 1)) * cW : cW / 2)
  const yOf = (v: number) =>
    pad.top + cH - ((v - yMin) / yRange) * cH
 
  const points = sorted.map((vol, i) => ({
    x: xOf(i),
    y: yOf(parseFloat(String(vol.price))),
    price: parseFloat(String(vol.price)),
    vol,
  }))
 
  const lineD = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ")
  const areaD =
    lineD +
    ` L${points[points.length - 1].x},${pad.top + cH} L${pad.left},${pad.top + cH} Z`
 
  const NUM_TICKS = 5
  const yTicks = Array.from({ length: NUM_TICKS + 1 }, (_, i) => ({
    v: yMin + (yRange * i) / NUM_TICKS,
    y: yOf(yMin + (yRange * i) / NUM_TICKS),
  }))
 
  // Show at most 6 x-axis labels, always including first and last
  const xStep = Math.max(1, Math.floor(sorted.length / 6))
  const showXLabel = (i: number) =>
    i === 0 || i === sorted.length - 1 || i % xStep === 0
 
  const minIdx = prices.indexOf(minPrice)
  const maxIdx = prices.indexOf(maxPrice)
 
  const fmt = (v: number) => Math.round(v).toLocaleString("vi-VN")
 
  // Line draw animation on mount
  useEffect(() => {
    const line = lineRef.current
    if (!line) return
    const len = line.getTotalLength()
    line.style.strokeDasharray = String(len)
    line.style.strokeDashoffset = String(len)
    requestAnimationFrame(() => {
      line.style.transition = "stroke-dashoffset 1s cubic-bezier(0.4,0,0.2,1)"
      line.style.strokeDashoffset = "0"
    })
  }, [lineD])
 
  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current
    if (!svg) return
    const rect = svg.getBoundingClientRect()
    const mx = ((e.clientX - rect.left) / rect.width) * W
    let closest = 0
    let minD = Infinity
    points.forEach((p, i) => {
      const d = Math.abs(p.x - mx)
      if (d < minD) { minD = d; closest = i }
    })
    const p = points[closest]
    setTooltip({
      visible: true,
      x: (p.x / W) * 100,
      y: (p.y / H) * 100,
      price: p.price,
      volNumber: sorted[closest].volume_number,
    })
  }
 
  const deltaLabel =
    Math.abs(deltaPct) < 0.001
      ? "Không đổi"
      : `${delta > 0 ? "+" : ""}${deltaPct.toFixed(2)}%`
 
  const badgeClass =
    Math.abs(deltaPct) < 0.001
      ? "bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400"
      : delta > 0
      ? "bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400"
      : "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400"
 
  const trendIcon =
    Math.abs(deltaPct) < 0.001 ? "▸" : delta > 0 ? "▲" : "▼"
 
  return (
    <div className="w-full">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-neutral-400 dark:text-neutral-500 mb-1">
            Lịch sử giá (VNĐ)
          </p>
          <p className="text-xl font-medium text-neutral-900 dark:text-neutral-100 tabular-nums">
            {fmt(minPrice)}
            {priceRange > 0 && (
              <span className="text-neutral-400 dark:text-neutral-600 mx-2">–</span>
            )}
            {priceRange > 0 && fmt(maxPrice)}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${badgeClass}`}>
            {trendIcon} {deltaLabel}
          </span>
          <span className="text-xs text-neutral-400 dark:text-neutral-600">
            Vol.{sorted[0]?.volume_number} → Vol.{sorted[sorted.length - 1]?.volume_number}
          </span>
        </div>
      </div>
 
      {/* Chart */}
      <div className="relative w-full">
        {/* Tooltip */}
        {tooltip.visible && (
          <div
            className="absolute pointer-events-none z-10 rounded-lg px-3 py-2 text-xs -translate-y-full -translate-x-1/2"
            style={{
              left: `${Math.min(tooltip.x, 80)}%`,
              top: `${tooltip.y}%`,
              background: 'var(--background-secondary)',
              border: '1px solid var(--card-border)',
            }}
          >
            <div className="mb-0.5" style={{ color: 'var(--foreground-muted)' }}>Vol.{tooltip.volNumber}</div>
            <div className="font-medium text-sm tabular-nums" style={{ color: 'var(--foreground)' }}>
              {fmt(tooltip.price)} ₫
            </div>
          </div>
        )}
 
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          className="w-full h-auto overflow-visible"
          preserveAspectRatio="xMidYMid meet"
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setTooltip(t => ({ ...t, visible: false }))}
        >
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.3" />
              <stop offset="90%" stopColor="#3b82f6" stopOpacity="0" />
            </linearGradient>
          </defs>
 
          {/* Grid lines */}
          {yTicks.map((tick, i) => (
            <line
              key={i}
              x1={pad.left} y1={tick.y}
              x2={W - pad.right} y2={tick.y}
              stroke="currentColor"
              strokeWidth="1"
              className="text-neutral-100 dark:text-neutral-800"
            />
          ))}
 
          {/* Y-axis labels */}
          {yTicks.map((tick, i) => (
            <text
              key={i}
              x={pad.left - 10}
              y={tick.y + 4}
              textAnchor="end"
              fontSize="11"
              fontFamily="monospace"
              className="fill-neutral-400 dark:fill-neutral-600"
            >
              {fmt(tick.v)}
            </text>
          ))}
 
          {/* Area */}
          <path d={areaD} fill={`url(#${gradId})`} />
 
          {/* Line */}
          <path
            ref={lineRef}
            d={lineD}
            fill="none"
            stroke="#3b82f6"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
 
          {/* Data points */}
          {points.map((p, i) => {
            const isMin = i === minIdx && priceRange > 0
            const isMax = i === maxIdx && priceRange > 0
            const color = isMin ? "#ef4444" : isMax ? "#22c55e" : "#3b82f6"
            const r = isMin || isMax ? 6 : 5
            return (
              <g key={i}>
                {/* Invisible hit area */}
                <circle cx={p.x} cy={p.y} r={12} fill="transparent" />
                <circle
                  cx={p.x} cy={p.y} r={r}
                  fill="white"
                  className="fill-white dark:fill-neutral-950"
                  stroke={color}
                  strokeWidth="2.5"
                  style={{ pointerEvents: "none" }}
                />
                {isMin && (
                  <text x={p.x} y={p.y + 18} textAnchor="middle" fontSize="10" fill="#ef4444" fontWeight="500">
                    ▼ min
                  </text>
                )}
                {isMax && (
                  <text x={p.x} y={p.y - 10} textAnchor="middle" fontSize="10" fill="#22c55e" fontWeight="500">
                    ▲ max
                  </text>
                )}
              </g>
            )
          })}
 
          {/* X-axis labels */}
          {sorted.map((vol, i) =>
            showXLabel(i) ? (
              <text
                key={i}
                x={xOf(i)}
                y={H - 8}
                textAnchor="middle"
                fontSize="11"
                className="fill-neutral-400 dark:fill-neutral-600"
              >
                Vol.{vol.volume_number}
              </text>
            ) : null
          )}
        </svg>
      </div>
    </div>
  )
}
