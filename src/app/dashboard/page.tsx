'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import Link from 'next/link'
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  BookOpen,
  Building2,
  CheckCircle2,
  Gauge,
  LayoutDashboard,
  ListFilter,
  Loader2,
  RefreshCw,
  Search,
  ShieldCheck,
  TrendingUp,
} from 'lucide-react'
import supabase from '@/lib/supabaseClient'
import { useLocale } from '@/contexts/LocaleContext'

type Mode = 'dashboard' | 'watchlist' | 'publisher'

type RawRankingRow = {
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
  updated_at: string | null
}

type LNRow = {
  raw_rank: number
  source_row_id: number
  series_key: string
  series_title: string
  series_id: string | null
  lidex_series_id: number | null
  series_code: string | null
  number_of_volumes: number
  average_price: number
  max_release_at: string | null
  average_view_count: number
  publisher: string | null
  original_volumes: number
  original_status: string | null
  evalution: string | null
  evaluation_basis: string | null
  ln_score: number
  trang_thai: string | null
  drop_percent: number
  drop_basis: string | null
  average_gap_months: number | null
  months_since_last_release: number | null
  completion_ratio: number | null
  publisher_activity: string | null
  publisher_releases_last_24m: number
  score_components: string | null
  drop_components: string | null
  cover_url: string | null
  cover_source_title: string | null
  description: string | null
  fan_vote_rank: number | null
  fan_vote_votes: number | null
  fan_vote_period: string | null
  fan_vote_year: number | null

  release_pace_score: number
  catch_up_score: number
  demand_score: number
  publisher_support_score: number
  completion_safety_score: number
  momentum_score: number
}

type VolumeReleaseRow = {
  series_id: number
  publisher: string
  release_date: string
}

type PublisherAgg = {
  publisher: string
  releases24: number
  seriesCount: number
  avgScore: number
  avgDrop: number
  marketShare: number
}

type PublisherLogoMap = Record<string, string>

type GrowthRow = {
  year: number
  volumes: number
}

type HeatmapRow = {
  publisher: string
  monthKey: string
  monthLabel: string
  count: number
}

function releaseYear(row: LNRow) {
  if (!row.max_release_at) return null
  const year = new Date(row.max_release_at).getFullYear()
  return Number.isFinite(year) ? year : null
}

function volumeReleaseYear(row: VolumeReleaseRow) {
  const year = new Date(row.release_date).getFullYear()
  return Number.isFinite(year) ? year : null
}

function availableReleaseYears(rows: Array<LNRow | VolumeReleaseRow>) {
  return Array.from(new Set(rows.map(row => 'release_date' in row ? volumeReleaseYear(row) : releaseYear(row)).filter((year): year is number => year !== null))).sort((a, b) => a - b)
}

function filterVolumeRowsByYears(rows: VolumeReleaseRow[], selectedYears: number[]) {
  if (selectedYears.length === 0) return rows
  const allowed = new Set(selectedYears)
  return rows.filter(row => {
    const year = volumeReleaseYear(row)
    return year !== null && allowed.has(year)
  })
}


function CompactYearSelect({
  years,
  selectedYear,
  setSelectedYear,
  vi,
}: {
  years: number[]
  selectedYear: number | null
  setSelectedYear: (year: number | null) => void
  vi: boolean
}) {
  const displayYears = [...years].sort((a, b) => b - a)

  return (
    <select
      value={selectedYear ?? ''}
      onChange={e => setSelectedYear(e.target.value ? Number(e.target.value) : null)}
      className="px-2.5 py-1.5 rounded-lg text-[10px] font-black outline-none min-w-[92px]"
      style={{ background: selectedYear === null ? '#7c6af5' : 'var(--ln-control-bg)', color: selectedYear === null ? '#fff' : 'var(--foreground-secondary)', border: '1px solid var(--card-border)' }}
    >
      <option value="">{vi ? 'Tất cả năm' : 'All years'}</option>
      {displayYears.map(year => (
        <option key={year} value={year}>{year}</option>
      ))}
    </select>
  )
}

function filterVolumeRowsBySingleYear(rows: VolumeReleaseRow[], selectedYear: number | null) {
  if (selectedYear === null) return rows
  return rows.filter(row => volumeReleaseYear(row) === selectedYear)
}
const RELEASE_STATUS_ORDER: Record<string, number> = {
  'Đang phát hành': 0,
  'Lâu lắm rồi chưa có tập mới': 1,
  Drop: 2,
  'Đã bắt kịp bản gốc JP': 3,
  'Hoàn thành': 4,
}

const EVAL_ORDER = ['Completed', 'Good', 'Limping', 'Dead', 'Dropped']

const statusColors: Record<string, string> = {
  Completed: '#38bdf8',
  Good: '#22c55e',
  Limping: '#eab308',
  Dead: '#f97316',
  Dropped: '#ef4444',
}

function num(v: unknown, fallback = 0) {
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

function fmtNum(value: number | null | undefined, digits = 1) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—'
  return Number(value).toLocaleString('vi-VN', { maximumFractionDigits: digits })
}

function fmtDate(value: string | null | undefined) {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('vi-VN', { year: 'numeric', month: '2-digit', day: '2-digit' })
}

function fmtScore(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—'
  return Number(value).toFixed(1)
}

function pctValue(raw: number | null | undefined) {
  const x = Number(raw || 0)
  return x <= 1 ? Math.round(x * 100) : Math.round(x)
}

function fmtPercent(raw: number | null | undefined) {
  return `${pctValue(raw)}%`
}

function evalLabel(s?: string | null, vi = true) {
  const viMap = { Completed: 'Hoàn thành', Good: 'Tốt', Limping: 'Cầm chừng', Dead: 'Gần chết', Dropped: 'Đã drop' } as Record<string, string>
  const enMap = { Completed: 'Completed', Good: 'Good', Limping: 'Limping', Dead: 'Inactive', Dropped: 'Dropped' } as Record<string, string>
  return (vi ? viMap : enMap)[s || ''] || s || '—'
}

function releaseStatusLabel(status: string, vi = true) {
  if (vi) return status
  return ({
    'Đang phát hành': 'Active',
    'Lâu lắm rồi chưa có tập mới': 'Long inactive',
    Drop: 'Dropped',
    'Đã bắt kịp bản gốc JP': 'Caught up to JP',
    'Hoàn thành': 'Completed',
  } as Record<string, string>)[status] || status
}

function releaseStatus(row: LNRow) {
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

function releaseStatusPriority(row: LNRow) {
  return RELEASE_STATUS_ORDER[releaseStatus(row)] ?? 99
}

function releaseStatusStyle(row: LNRow) {
  const rs = releaseStatus(row)
  if (rs === 'Hoàn thành') return { color: '#7dd3fc', bg: 'rgba(56,189,248,.12)', border: 'rgba(56,189,248,.22)' }
  if (rs === 'Drop') return { color: '#fca5a5', bg: 'rgba(239,68,68,.12)', border: 'rgba(239,68,68,.22)' }
  if (rs === 'Lâu lắm rồi chưa có tập mới') return { color: '#fb923c', bg: 'rgba(249,115,22,.12)', border: 'rgba(249,115,22,.22)' }
  if (rs === 'Đã bắt kịp bản gốc JP') return { color: '#a78bfa', bg: 'rgba(124,106,245,.15)', border: 'rgba(124,106,245,.28)' }
  return { color: '#4ade80', bg: 'rgba(34,197,94,.12)', border: 'rgba(34,197,94,.22)' }
}

function scoreColor(score: number) {
  if (score >= 8) return '#22c55e'
  if (score >= 6) return '#38bdf8'
  if (score >= 4) return '#eab308'
  return '#ef4444'
}

function dropColor(drop: number) {
  const p = pctValue(drop)
  if (p <= 25) return '#22c55e'
  if (p <= 55) return '#eab308'
  return '#ef4444'
}

function proxyImg(url: string | null) {
  if (!url) return null
  try {
    const h = new URL(url).hostname
    if (!h.includes('supabase') && !h.includes('localhost') && !url.startsWith('/')) {
      return `/api/image-proxy?url=${encodeURIComponent(url)}`
    }
  } catch {}
  return url
}

function publisherKey(name: string | null | undefined) {
  return String(name || '').trim().toLowerCase()
}

function detailHref(row: LNRow | null) {
  if (!row) return '/browse'
  if (row.lidex_series_id) return `/content/${row.lidex_series_id}`
  return `/browse?search=${encodeURIComponent(row.series_title)}`
}

function clamp10(v: number) {
  return Math.max(0, Math.min(10, Number.isFinite(v) ? v : 0))
}

function scatterStableNoise(seed: string) {
  let hash = 2166136261
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  const a = ((hash >>> 0) % 1000) / 1000
  const b = (((hash >>> 8) >>> 0) % 1000) / 1000
  return {
    x: (a - 0.5) * 0.28,
    y: (b - 0.5) * 3.2,
  }
}

function releasePaceScore(avgGap: number | null, monthsSince: number | null) {
  let gap = 5
  if (avgGap != null) {
    if (avgGap <= 4) gap = 9.5
    else if (avgGap <= 6) gap = 8.5
    else if (avgGap <= 12) gap = 6.5
    else if (avgGap <= 18) gap = 4.5
    else if (avgGap <= 24) gap = 3
    else gap = 1.5
  }

  let recency = 5
  if (monthsSince != null) {
    if (monthsSince <= 6) recency = 9
    else if (monthsSince <= 12) recency = 7
    else if (monthsSince <= 18) recency = 5
    else if (monthsSince <= 24) recency = 3
    else if (monthsSince <= 36) recency = 1.8
    else recency = 1
  }

  return Number((gap * 0.6 + recency * 0.4).toFixed(1))
}

function catchUpScore(row: RawRankingRow) {
  if (row.completion_ratio != null) {
    const r = num(row.completion_ratio)
    return clamp10((r > 1 ? r / 100 : r) * 10)
  }
  const jp = num(row.original_volumes)
  if (jp > 0) return clamp10(num(row.number_of_volumes) / jp * 10)
  return 5
}

function percentileFn(values: number[]) {
  const sorted = values.filter(v => Number.isFinite(v)).sort((a, b) => a - b)
  return (value: number) => {
    if (sorted.length <= 1) return 5
    const idx = sorted.findIndex(v => v >= value)
    const rank = idx < 0 ? sorted.length - 1 : idx
    return Number(((rank / (sorted.length - 1)) * 10).toFixed(1))
  }
}

function publisherSupport(activity: string | null, releases24: number) {
  const base = ({ Active: 8, Moderate: 6.5, Low: 4.5, Inactive: 2 } as Record<string, number>)[activity || ''] ?? 5
  return Number(clamp10(base + Math.min(releases24 / 50 * 2, 2)).toFixed(1))
}

function safetyScore(evalution: string | null, drop: number) {
  if (evalution === 'Completed') return 10
  const p = pctValue(drop) / 100
  return Number(clamp10((1 - p) * 10).toFixed(1))
}

function momentumScore(activity: string | null, releases24: number, monthsSince: number | null) {
  const base = ({ Active: 7.5, Moderate: 6, Low: 4, Inactive: 2 } as Record<string, number>)[activity || ''] ?? 5
  const releaseScore = clamp10(releases24 / 40 * 10)
  let freshness = 5
  if (monthsSince != null) {
    if (monthsSince <= 6) freshness = 8.5
    else if (monthsSince <= 12) freshness = 6.5
    else if (monthsSince <= 18) freshness = 4.5
    else freshness = 2
  }
  return Number((base * 0.45 + releaseScore * 0.35 + freshness * 0.2).toFixed(1))
}

function mapRows(raw: RawRankingRow[]) {
  const demand = percentileFn(raw.map(r => num(r.average_view_count)))
  return raw.map((r, i): LNRow => {
    const monthsSince = r.months_since_last_release == null ? null : num(r.months_since_last_release)
    const avgGap = r.average_gap_months == null ? null : num(r.average_gap_months)
    const releases24 = num(r.publisher_releases_last_24m)
    const drop = num(r.drop_percent)
    return {
      raw_rank: i + 1,
      source_row_id: r.id,
      series_key: `${r.lidex_series_id || r.series_id || r.id}|${r.series_code || ''}`,
      series_title: r.series_title || 'Untitled',
      series_id: r.series_id,
      lidex_series_id: r.lidex_series_id == null ? null : num(r.lidex_series_id),
      series_code: r.series_code,
      number_of_volumes: num(r.number_of_volumes),
      average_price: num(r.average_price),
      max_release_at: r.max_release_at ? String(r.max_release_at).slice(0, 10) : null,
      average_view_count: num(r.average_view_count),
      publisher: r.publisher,
      original_volumes: num(r.original_volumes),
      original_status: r.original_status,
      evalution: r.evalution,
      evaluation_basis: r.evaluation_basis,
      ln_score: num(r.ln_score),
      trang_thai: r.trang_thai,
      drop_percent: drop,
      drop_basis: r.drop_basis,
      average_gap_months: avgGap,
      months_since_last_release: monthsSince,
      completion_ratio: r.completion_ratio == null ? null : num(r.completion_ratio),
      publisher_activity: r.publisher_activity,
      publisher_releases_last_24m: releases24,
      score_components: r.score_components,
      drop_components: r.drop_components,
      cover_url: r.cover_url,
      cover_source_title: r.cover_source_title,
      description: null,
      fan_vote_rank: null,
      fan_vote_votes: null,
      fan_vote_period: null,
      fan_vote_year: null,
      release_pace_score: releasePaceScore(avgGap, monthsSince),
      catch_up_score: catchUpScore(r),
      demand_score: demand(num(r.average_view_count)),
      publisher_support_score: publisherSupport(r.publisher_activity, releases24),
      completion_safety_score: safetyScore(r.evalution, drop),
      momentum_score: momentumScore(r.publisher_activity, releases24, monthsSince),
    }
  })
}

async function hydrateRowsWithCanonicalSeries(rows: LNRow[]): Promise<LNRow[]> {
  const ids = Array.from(new Set(rows.map(row => row.lidex_series_id).filter((id): id is number => Boolean(id))))
  if (ids.length === 0) return rows

  const canonical = new Map<number, { title?: string | null; cover_url?: string | null; description?: string | null }>()
  const batchSize = 200

  for (let i = 0; i < ids.length; i += batchSize) {
    const chunk = ids.slice(i, i + batchSize)
    const { data, error } = await supabase
      .from('series')
      .select('id, title, cover_url, description, description_vi')
      .in('id', chunk)

    if (error) {
      console.warn('[Dashboard] canonical series fetch failed:', error.message)
      continue
    }

    for (const series of data || []) {
      canonical.set(Number((series as any).id), {
        title: (series as any).title,
        cover_url: (series as any).cover_url,
        description: String((series as any).description_vi || (series as any).description || '').trim() || null,
      })
    }
  }

  return rows.map(row => {
    const meta = row.lidex_series_id ? canonical.get(row.lidex_series_id) : null
    if (!meta) return row
    return {
      ...row,
      // Keep the evaluated ranking title unless it is missing, but use canonical cover/description as fallback.
      series_title: row.series_title || meta.title || row.series_title,
      cover_url: row.cover_url || meta.cover_url || row.cover_url,
      description: row.description || meta.description || row.description,
    }
  })
}

async function hydrateRowsWithFanVotes(rows: LNRow[]): Promise<LNRow[]> {
  const ids = Array.from(new Set(rows.map(row => row.lidex_series_id).filter((id): id is number => Boolean(id))))
  if (ids.length === 0) return rows

  const latestBySeries = new Map<number, { votes: number; rank: number | null; period: string | null; year: number | null; sort: number }>()
  const batchSize = 200

  for (let i = 0; i < ids.length; i += batchSize) {
    const chunk = ids.slice(i, i + batchSize)
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await supabase
        .from('voting_results')
        .select('series_id, votes, rank, voting_periods(month, year, label)')
        .in('series_id', chunk)
        .range(offset, offset + 999)

      if (error) {
        console.warn('[Dashboard] fan vote fetch failed:', error.message)
        break
      }

      for (const vote of data || []) {
        const seriesId = Number((vote as any).series_id)
        const periodRaw = (vote as any).voting_periods
        const period = Array.isArray(periodRaw) ? periodRaw[0] : periodRaw
        const month = Number(period?.month || 0)
        const year = Number(period?.year || 0)
        const sort = year * 100 + month
        const current = latestBySeries.get(seriesId)
        if (current && current.sort > sort) continue
        latestBySeries.set(seriesId, {
          votes: num((vote as any).votes),
          rank: (vote as any).rank == null ? null : num((vote as any).rank),
          period: period?.label || (month && year ? `${String(month).padStart(2, '0')}/${year}` : null),
          year: year || null,
          sort,
        })
      }

      if (!data || data.length < 1000) break
    }
  }

  return rows.map(row => {
    const fan = row.lidex_series_id ? latestBySeries.get(row.lidex_series_id) : null
    if (!fan) return row
    return {
      ...row,
      fan_vote_rank: fan.rank,
      fan_vote_votes: fan.votes,
      fan_vote_period: fan.period,
      fan_vote_year: fan.year,
    }
  })
}

function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-xl ${className}`}
      style={{
        background: 'var(--ln-card-bg)',
        border: '1px solid var(--card-border)',
        boxShadow: 'var(--ln-card-shadow)',
      }}
    >
      {children}
    </div>
  )
}

function KpiStrip({ rows, vi }: { rows: LNRow[]; vi: boolean }) {
  const avgScore = rows.length ? rows.reduce((s, r) => s + r.ln_score, 0) / rows.length : 0
  const avgDrop = rows.length ? rows.reduce((s, r) => s + pctValue(r.drop_percent), 0) / rows.length : 0
  const active = rows.filter(r => ['Đang phát hành', 'Đã bắt kịp bản gốc JP', 'Lâu lắm rồi chưa có tập mới'].includes(releaseStatus(r))).length
  const completed = rows.filter(r => r.evalution === 'Completed' || releaseStatus(r) === 'Hoàn thành').length
  const activePublishers = new Set(rows.filter(r => r.publisher_activity === 'Active').map(r => r.publisher).filter(Boolean)).size
  const linked = rows.filter(r => Boolean(r.lidex_series_id)).length

  const items = [
    { label: vi ? 'Đã cấp phép' : 'Licensed', value: rows.length.toLocaleString('vi-VN'), icon: BookOpen, color: '#818cf8' },
    { label: vi ? 'Liên kết ID' : 'Linked IDs', value: `${linked}/${rows.length}`, icon: ShieldCheck, color: linked === rows.length ? '#22c55e' : '#f97316' },
    { label: vi ? 'Đang hoạt động' : 'Active', value: active.toLocaleString('vi-VN'), icon: Activity, color: '#22c55e' },
    { label: vi ? 'Hoàn thành' : 'Completed', value: completed.toLocaleString('vi-VN'), icon: CheckCircle2, color: '#38bdf8' },
    { label: vi ? 'Điểm TB' : 'Avg Score', value: avgScore.toFixed(1), icon: Gauge, color: '#eab308' },
    { label: vi ? 'Drop TB' : 'Avg Drop', value: `${avgDrop.toFixed(1)}%`, icon: AlertTriangle, color: '#fb7185' },
    { label: vi ? 'Nhà PH hoạt động' : 'Active Pubs', value: activePublishers.toLocaleString('vi-VN'), icon: Building2, color: '#a78bfa' },
  ]

  return (
    <Card className="p-2.5">
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-7 gap-2">
        {items.map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="rounded-lg px-3 py-2.5 relative overflow-hidden" style={{ background: 'var(--ln-panel-bg)', border: '1px solid var(--card-border)' }}>
            <div className="absolute right-0 top-0 w-16 h-16 rounded-full blur-2xl" style={{ background: `${color}22` }} />
            <div className="relative flex items-start justify-between gap-2">
              <div>
                <p className="text-[9px] font-black uppercase tracking-[.15em]" style={{ color: 'var(--foreground-muted)' }}>{label}</p>
                <p className="text-xl font-black mt-1 leading-none" style={{ color: 'var(--foreground)' }}>{value}</p>
              </div>
              <Icon className="w-4 h-4" style={{ color }} />
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}

function ModeSwitch({ mode, setMode, vi }: { mode: Mode; setMode: (m: Mode) => void; vi: boolean }) {
  const items = [
    { id: 'dashboard' as Mode, icon: LayoutDashboard, label: vi ? 'Bảng điều khiển' : 'Dashboard', color: '#7c6af5', text: '#fff' },
    { id: 'publisher' as Mode, icon: Building2, label: vi ? 'Nhà phát hành' : 'Publishers', color: '#38bdf8', text: '#03111d' },
    { id: 'watchlist' as Mode, icon: ListFilter, label: vi ? 'Watchlist LN' : 'LN Watchlist', color: '#22c55e', text: '#03150a' },
  ]

  return (
    <div className="flex items-center gap-1 p-1 rounded-xl overflow-x-auto" style={{ background: 'var(--ln-panel-bg-strong)', border: '1px solid var(--card-border)' }}>
      {items.map(item => {
        const Icon = item.icon
        const active = mode === item.id
        return (
          <button
            key={item.id}
            onClick={() => setMode(item.id)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap"
            style={active ? { background: item.color, color: item.text } : { color: 'var(--foreground-secondary)' }}
          >
            <Icon className="w-3.5 h-3.5" />
            {item.label}
          </button>
        )
      })}
    </div>
  )
}

function ScatterPlot({ rows, selectedKey, onSelect, vi }: { rows: LNRow[]; selectedKey: string | null; onSelect: (row: LNRow) => void; vi: boolean }) {
  const [zoom, setZoom] = useState(1)
  const [query, setQuery] = useState('')
  const [hoveredKey, setHoveredKey] = useState<string | null>(null)

  const plotRows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return rows.filter(row => {
      const rs = releaseStatus(row)
      const searchable = `${row.series_title} ${row.series_id || ''} ${row.series_code || ''}`.toLowerCase()

      return !q || searchable.includes(q)
    })
  }, [rows, query])

  const selectedRow = useMemo(() => plotRows.find(row => row.series_key === selectedKey) || null, [plotRows, selectedKey])
  const zoomCenterX = selectedRow ? selectedRow.ln_score : 5
  const zoomCenterY = selectedRow ? pctValue(selectedRow.drop_percent) : 50

  function transformPoint(row: LNRow) {
    const jitter = scatterStableNoise(row.series_key)
    const rawX = Math.max(0, Math.min(10, row.ln_score + jitter.x))
    const rawY = Math.max(0, Math.min(100, pctValue(row.drop_percent) + jitter.y))

    const zx = zoomCenterX + (rawX - zoomCenterX) * zoom
    const zy = zoomCenterY + (rawY - zoomCenterY) * zoom

    return {
      x: Math.max(0, Math.min(100, zx * 10)),
      y: 100 - Math.max(0, Math.min(100, zy)),
      visible: zx >= 0 && zx <= 10 && zy >= 0 && zy <= 100,
    }
  }

  return (
    <Card className="p-3.5">
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-2 mb-2">
        <div>
          <p className="text-xs font-black uppercase tracking-wide" style={{ color: 'var(--foreground)' }}>{vi ? 'Điểm LN vs Rủi ro Drop' : 'LN Score vs Drop Risk'}</p>
          <p className="text-[11px]" style={{ color: 'var(--foreground-muted)' }}>
            {vi ? 'Ẩn series đã hoàn thành và đã bắt kịp JP; điểm được tách nhẹ để dễ bấm.' : 'Completed and caught-up series are hidden; points are lightly separated for clicking.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3" style={{ color: 'var(--foreground-muted)' }} />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={vi ? 'Tìm tên / ID...' : 'Search title / ID...'}
              className="pl-7 pr-2 py-1.5 rounded-lg text-[10px] font-semibold outline-none w-[150px] sm:w-[180px]"
              style={{ background: 'var(--ln-control-bg)', color: 'var(--foreground)', border: '1px solid var(--card-border)' }}
            />
          </div>

          <div className="flex items-center rounded-lg overflow-hidden" style={{ border: '1px solid var(--card-border)' }}>
            <button
              type="button"
              onClick={() => setZoom(z => Math.max(1, Number((z - 0.35).toFixed(2))))}
              className="px-2 py-1.5 text-[10px] font-black"
              style={{ background: 'var(--ln-control-bg)', color: 'var(--foreground-secondary)' }}
            >
              −
            </button>
            <button
              type="button"
              onClick={() => setZoom(1)}
              className="px-2 py-1.5 text-[10px] font-black"
              style={{ background: zoom === 1 ? '#7c6af5' : 'var(--ln-control-bg)', color: zoom === 1 ? '#fff' : 'var(--foreground-secondary)' }}
            >
              {zoom.toFixed(1)}x
            </button>
            <button
              type="button"
              onClick={() => setZoom(z => Math.min(3.5, Number((z + 0.35).toFixed(2))))}
              className="px-2 py-1.5 text-[10px] font-black"
              style={{ background: 'var(--ln-control-bg)', color: 'var(--foreground-secondary)' }}
            >
              +
            </button>
          </div>

          <div className="hidden sm:flex flex-wrap gap-2">
            {['Good', 'Limping', 'Dead', 'Dropped'].map(s => (
              <span key={s} className="text-[10px] font-bold flex items-center gap-1" style={{ color: 'var(--foreground-secondary)' }}>
                <span className="w-2 h-2 rounded-full" style={{ background: statusColors[s] }} />
                {evalLabel(s, vi)}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="relative h-[300px] sm:h-[350px] rounded-lg overflow-hidden" style={{ background: 'var(--ln-chart-bg)', border: '1px solid var(--card-border)' }}>
        <div className="absolute inset-0 opacity-50 pointer-events-none">
          <div className="absolute left-0 top-0 w-1/2 h-1/2" style={{ background: 'linear-gradient(135deg, rgba(239,68,68,.08), transparent)' }} />
          <div className="absolute right-0 bottom-0 w-1/2 h-1/2" style={{ background: 'linear-gradient(315deg, rgba(34,197,94,.08), transparent)' }} />
        </div>

        <div className="absolute inset-x-8 inset-y-7 sm:inset-x-9 sm:inset-y-8">
          {[0, 25, 50, 75, 100].map(v => (
            <div key={`y-${v}`} className="absolute left-0 right-0 border-t border-dashed" style={{ top: `${100 - v}%`, borderColor: 'rgba(136,146,170,.16)' }}>
              <span className="absolute -left-2 -translate-x-full -top-2 text-[9px]" style={{ color: 'var(--foreground-muted)' }}>{v}%</span>
            </div>
          ))}
          {[0, 2, 4, 6, 8, 10].map(v => (
            <div key={`x-${v}`} className="absolute top-0 bottom-0 border-l border-dashed" style={{ left: `${v * 10}%`, borderColor: 'rgba(136,146,170,.10)' }}>
              <span className="absolute -bottom-4 -translate-x-1/2 text-[9px]" style={{ color: 'var(--foreground-muted)' }}>{v}</span>
            </div>
          ))}

          <span className="absolute left-2 top-2 text-[10px] font-black uppercase pointer-events-none" style={{ color: '#ef4444' }}>{vi ? 'Rủi ro cao' : 'High Risk'}</span>
          <span className="absolute right-2 top-2 text-[10px] font-black uppercase pointer-events-none" style={{ color: '#eab308' }}>{vi ? 'Khỏe mạnh nhưng rủi ro' : 'Popular Risk'}</span>
          <span className="absolute left-2 bottom-2 text-[10px] font-black uppercase pointer-events-none" style={{ color: '#a78bfa' }}>{vi ? 'Đình trệ' : 'Stalled'}</span>
          <span className="absolute right-2 bottom-2 text-[10px] font-black uppercase pointer-events-none" style={{ color: '#22c55e' }}>{vi ? 'Khỏe mạnh' : 'Healthy'}</span>

          {plotRows.map(row => {
            const point = transformPoint(row)
            if (!point.visible) return null

            const active = row.series_key === selectedKey
            const hovered = row.series_key === hoveredKey
            const color = statusColors[row.evalution || ''] || scoreColor(row.ln_score)
            const size = active ? 18 : hovered ? 16 : Math.max(10, Math.min(16, 8 + row.demand_score * 0.75))

            return (
              <button
                key={row.series_key}
                onClick={() => { setHoveredKey(row.series_key); onSelect(row) }}
                onMouseEnter={() => setHoveredKey(row.series_key)}
                onMouseLeave={() => setHoveredKey(null)}
                onFocus={() => setHoveredKey(row.series_key)}
                onBlur={() => setHoveredKey(null)}
                title={`${row.series_title}\nID ${row.series_id || '—'} · ${row.series_code || '—'}\nLN ${row.ln_score.toFixed(1)} · Drop ${fmtPercent(row.drop_percent)}`}
                className="absolute rounded-full transition-all hover:scale-125 focus:outline-none focus:ring-2 focus:ring-cyan-300"
                style={{
                  left: `${point.x}%`,
                  top: `${point.y}%`,
                  width: size,
                  height: size,
                  background: color,
                  border: active ? '2px solid #fff' : '1px solid rgba(255,255,255,.45)',
                  boxShadow: active ? `0 0 0 8px ${color}26, 0 0 26px ${color}` : hovered ? `0 0 0 6px ${color}25, 0 0 22px ${color}` : `0 0 12px ${color}66`,
                  transform: 'translate(-50%, -50%)',
                  zIndex: active || hovered ? 30 : 10,
                }}
              />
            )
          })}
          {hoveredRow && hoveredPoint && hoveredPoint.visible && (
            <div
              className="absolute pointer-events-none rounded-lg px-2.5 py-2 text-[10px] shadow-xl"
              style={{
                left: `clamp(6px, ${hoveredPoint.x}%, calc(100% - 190px))`,
                top: `clamp(6px, ${hoveredPoint.y}%, calc(100% - 76px))`,
                transform: 'translate(10px, -50%)',
                background: 'rgba(15,23,42,.94)',
                border: '1px solid rgba(136,146,170,.28)',
                color: 'var(--foreground-secondary)',
                zIndex: 50,
                width: 184,
              }}
            >
              <p className="truncate font-black mb-1" style={{ color: 'var(--foreground)' }}>{hoveredRow.series_title}</p>
              <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 tabular-nums">
                <span>LN</span><span className="text-right font-bold">{hoveredRow.ln_score.toFixed(1)}</span>
                <span>{vi ? 'Drop' : 'Drop'}</span><span className="text-right font-bold">{fmtPercent(hoveredRow.drop_percent)}</span>
                <span>{vi ? 'Tập' : 'Volumes'}</span><span className="text-right font-bold">{fmtNum(hoveredRow.number_of_volumes, 0)}</span>
                <span>{vi ? 'Trạng thái' : 'Status'}</span><span className="text-right font-bold truncate">{releaseStatusLabel(releaseStatus(hoveredRow), vi)}</span>
              </div>
            </div>
          )}
        </div>

        <div className="absolute left-10 bottom-2 text-[10px]" style={{ color: 'var(--foreground-muted)' }}>LN Score →</div>
        <div className="absolute left-3 top-1/2 -rotate-90 text-[10px]" style={{ color: 'var(--foreground-muted)' }}>{vi ? 'Khả năng drop' : 'Drop Probability'}</div>

        <div className="absolute right-3 bottom-2 text-[10px]" style={{ color: 'var(--foreground-muted)' }}>
          {plotRows.length.toLocaleString('vi-VN')} series
        </div>
      </div>
    </Card>
  )
}

function RadarChart({ row, vi }: { row: LNRow | null; vi: boolean }) {
  const axes = row ? [
    [vi ? 'Nhịp phát hành' : 'Release Pace', row.release_pace_score, vi ? 'Khoảng cách trung bình + độ mới của tập gần nhất' : 'Average gap + latest release recency'],
    [vi ? 'Bắt kịp' : 'Catch-up', row.catch_up_score, vi ? 'Tiến độ bản Việt so với số tập gốc' : 'VN volumes compared with original volumes'],
    [vi ? 'Nhu cầu' : 'Demand', row.demand_score, vi ? 'Percentile lượt xem trung bình' : 'Average view count percentile'],
    [vi ? 'Nhà PH' : 'Publisher', row.publisher_support_score, vi ? 'Hoạt động nhà phát hành + số tập 24 tháng' : 'Publisher activity + 24M release output'],
    [vi ? 'An toàn' : 'Safety', row.completion_safety_score, vi ? 'Nghịch đảo của khả năng drop' : 'Inverse of drop probability'],
    [vi ? 'Đà phát hành' : 'Momentum', row.momentum_score, vi ? 'Hỗ trợ nhà phát hành + độ mới phát hành' : 'Publisher support + recent release recency'],
  ] as const : []

  const size = 210
  const cx = size / 2
  const cy = size / 2
  const maxR = 68
  const points = axes.map(([, value], i) => {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / axes.length
    const r = clamp10(value) / 10 * maxR
    return `${cx + Math.cos(angle) * r},${cy + Math.sin(angle) * r}`
  }).join(' ')
  const grids = [0.33, 0.66, 1].map(level => axes.map(([,], i) => {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / axes.length
    const r = level * maxR
    return `${cx + Math.cos(angle) * r},${cy + Math.sin(angle) * r}`
  }).join(' '))

  if (!row) {
    return (
      <Card className="p-4 h-full flex items-center justify-center text-sm">
        <span style={{ color: 'var(--foreground-muted)' }}>{vi ? 'Chọn một series' : 'Select a series'}</span>
      </Card>
    )
  }

  const rsStyle = releaseStatusStyle(row)

  return (
    <Card className="p-3.5 h-full">
      <div className="flex gap-3">
        {row.cover_url ? (
          <img src={proxyImg(row.cover_url) || ''} alt="" className="w-[78px] h-[112px] sm:w-[88px] sm:h-[126px] object-cover rounded-lg shadow-lg shrink-0" />
        ) : (
          <div className="w-[78px] h-[112px] sm:w-[88px] sm:h-[126px] rounded-lg shrink-0" style={{ background: 'rgba(124,106,245,.14)' }} />
        )}
        <div className="min-w-0 flex-1">
          <h2 className="text-base sm:text-lg font-black leading-snug line-clamp-3" style={{ color: 'var(--foreground)' }}>{row.series_title}</h2>
          <div className="flex items-center justify-between gap-3 mt-1 text-[11px] font-semibold" style={{ color: 'var(--foreground-muted)' }}>
            <span>{vi ? 'Số tập' : 'Volumes'}: <span style={{ color: 'var(--foreground-secondary)' }}>{fmtNum(row.number_of_volumes, 0)}</span></span>
            <span className="text-right">{vi ? 'Mới nhất' : 'Latest'}: <span style={{ color: 'var(--foreground-secondary)' }}>{fmtDate(row.max_release_at)}</span></span>
          </div>
          <div className="flex flex-wrap gap-1.5 mt-2">
            <span className="rounded-full px-2 py-0.5 text-[10px] font-black" style={{ color: rsStyle.color, background: rsStyle.bg, border: `1px solid ${rsStyle.border}` }}>{releaseStatusLabel(releaseStatus(row), vi)}</span>
            <span className="rounded-full px-2 py-0.5 text-[10px] font-black" style={{ color: 'var(--foreground-muted)', background: 'var(--ln-muted-bg)' }}>{row.publisher || '—'}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 mt-3">
        <div className="rounded-lg px-2.5 py-2 flex items-center justify-between gap-2" style={{ background: 'rgba(34,197,94,.10)' }}>
          <p className="text-[9px] uppercase font-black" style={{ color: 'var(--foreground-muted)' }}>LN Score</p>
          <p className="text-lg font-black leading-none" style={{ color: scoreColor(row.ln_score) }}>{fmtScore(row.ln_score)}</p>
        </div>
        <div className="rounded-lg px-2.5 py-2 flex items-center justify-between gap-2" style={{ background: 'rgba(239,68,68,.10)' }}>
          <p className="text-[9px] uppercase font-black" style={{ color: 'var(--foreground-muted)' }}>Drop</p>
          <p className="text-lg font-black leading-none" style={{ color: dropColor(row.drop_percent) }}>{fmtPercent(row.drop_percent)}</p>
        </div>
        <Link href={detailHref(row)} className="rounded-lg px-2.5 py-2 flex items-center justify-center gap-1 text-xs font-black transition-all hover:scale-[1.02]" style={{ background: 'rgba(124,106,245,.18)', color: '#c4b5fd', border: '1px solid rgba(124,106,245,.28)' }}>
          Open
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-[210px_1fr] xl:grid-cols-[210px_1fr] gap-2 mt-2 items-center">
        <div className="flex justify-start">
          <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="max-w-full">
            {grids.map((g, i) => <polygon key={i} points={g} fill="none" stroke="rgba(136,146,170,.18)" />)}
            {axes.map(([label], i) => {
              const angle = -Math.PI / 2 + (i * 2 * Math.PI) / axes.length
              const x = cx + Math.cos(angle) * (maxR + 20)
              const y = cy + Math.sin(angle) * (maxR + 20)
              return (
                <g key={label}>
                  <line x1={cx} y1={cy} x2={cx + Math.cos(angle) * maxR} y2={cy + Math.sin(angle) * maxR} stroke="rgba(136,146,170,.14)" />
                  <text x={x} y={y} textAnchor="middle" dominantBaseline="middle" fontSize="8.5" fill="rgba(232,236,244,.72)">{label}</text>
                </g>
              )
            })}
            <polygon points={points} fill="rgba(124,106,245,.34)" stroke="#a78bfa" strokeWidth="2" />
            {points.split(' ').map((p, i) => {
              const [x, y] = p.split(',').map(Number)
              return <circle key={i} cx={x} cy={y} r="3" fill="#c4b5fd" />
            })}
          </svg>
        </div>

        <div className="grid grid-cols-2 xl:grid-cols-1 gap-1.5">
          {axes.map(([label, value, source]) => (
            <div key={label} title={source} className="rounded-lg px-2 py-1.5" style={{ background: 'var(--ln-panel-bg)', border: '1px solid var(--card-border)' }}>
              <p className="text-[9px] uppercase font-black" style={{ color: 'var(--foreground-muted)' }}>{label}</p>
              <p className="text-xs font-black" style={{ color: '#c4b5fd' }}>{fmtScore(value)}</p>
            </div>
          ))}
        </div>
      </div>
    </Card>
  )
}

function buildPublishers(rows: LNRow[], volumeRows?: VolumeReleaseRow[]) {
  const groups = new Map<string, LNRow[]>()
  for (const row of rows) {
    const key = row.publisher || 'Unknown'
    groups.set(key, [...(groups.get(key) || []), row])
  }
  const volumeCounts = new Map<string, number>()
  for (const row of volumeRows || []) {
    const key = row.publisher || 'Unknown'
    volumeCounts.set(key, (volumeCounts.get(key) || 0) + 1)
    if (!groups.has(key)) groups.set(key, [])
  }
  const totalReleases = Array.from(volumeCounts.values()).reduce((sum, count) => sum + count, 0) || 1
  return Array.from(groups.entries()).map(([publisher, items]): PublisherAgg => {
    const releases24 = volumeRows ? (volumeCounts.get(publisher) || 0) : Math.max(...items.map(i => i.publisher_releases_last_24m), 0)
    return {
      publisher,
      releases24,
      seriesCount: items.length,
      avgScore: items.length ? items.reduce((s, i) => s + i.ln_score, 0) / items.length : 0,
      avgDrop: items.length ? items.reduce((s, i) => s + pctValue(i.drop_percent), 0) / items.length : 0,
      marketShare: releases24 / totalReleases * 100,
    }
  }).sort((a, b) => b.releases24 - a.releases24 || b.seriesCount - a.seriesCount)
}

function PublisherLeaderboard({ rows, volumeRows, vi, onSelectPublisher }: { rows: LNRow[]; volumeRows: VolumeReleaseRow[]; vi: boolean; onSelectPublisher?: (publisher: string) => void }) {
  const [selectedYear, setSelectedYear] = useState<number | null>(null)
  const years = availableReleaseYears(volumeRows)
  const filteredVolumes = filterVolumeRowsBySingleYear(volumeRows, selectedYear)
  const publishers = buildPublishers(rows, filteredVolumes).filter(p => p.releases24 > 0)
  const max = Math.max(...publishers.map(p => p.releases24), 1)

  return (
    <Card className="p-3 h-[230px] overflow-hidden">
      <div className="flex items-center justify-between mb-2">
        <div>
          <p className="text-[11px] font-black uppercase tracking-wide" style={{ color: 'var(--foreground)' }}>{vi ? 'Hoạt động nhà phát hành' : 'Publishers Activity'}</p>
          <p className="text-[10px]" style={{ color: 'var(--foreground-muted)' }}>{vi ? 'Bấm nhà phát hành để mở dashboard riêng.' : 'Click a publisher to open its profile dashboard.'}</p>
        </div>
        <div className="flex items-center gap-2 min-w-0">
          <CompactYearSelect years={years} selectedYear={selectedYear} setSelectedYear={setSelectedYear} vi={vi} />
          <Building2 className="w-4 h-4 shrink-0" style={{ color: '#38bdf8' }} />
        </div>
      </div>

      <div className="grid grid-cols-[1.05fr_0.9fr_0.55fr_0.6fr] gap-2 px-1 pb-1 text-[9px] font-black uppercase tracking-wide" style={{ color: 'var(--foreground-muted)' }}>
        <span>{vi ? 'Nhà PH' : 'Publisher'}</span>
        <span>{vi ? 'Tập' : 'Releases'}</span>
        <span className="text-right">{vi ? 'Điểm' : 'Score'}</span>
        <span className="text-right">{vi ? 'An toàn' : 'Safe'}</span>
      </div>

      <div className="space-y-1.5 overflow-y-auto pr-1" style={{ maxHeight: '198px', scrollbarGutter: 'stable' }}>
        {publishers.map((p, i) => {
          const width = (p.releases24 / max) * 100
          const completionProxy = Math.max(0, Math.min(100, 100 - p.avgDrop))
          return (
            <button
              key={p.publisher}
              type="button"
              onClick={() => onSelectPublisher?.(p.publisher)}
              className="w-full grid grid-cols-[1.05fr_0.9fr_0.55fr_0.6fr] gap-2 items-center rounded-lg px-1 py-0.5 text-left transition-all hover:bg-white/[0.04]"
              style={{ cursor: onSelectPublisher ? 'pointer' : 'default' }}
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-black shrink-0" style={{ background: 'rgba(56,189,248,.16)', color: '#38bdf8' }}>{i + 1}</span>
                <span className="font-bold truncate text-[11px]" style={{ color: 'var(--foreground)' }}>{p.publisher}</span>
              </div>

              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <div className="h-2 rounded-full overflow-hidden flex-1" style={{ background: 'var(--ln-track-bg)' }}>
                    <div className="h-full rounded-full" style={{ width: `${width}%`, background: 'linear-gradient(90deg,#7c6af5,#38bdf8)' }} />
                  </div>
                  <span className="text-[10px] tabular-nums shrink-0" style={{ color: 'var(--foreground-secondary)' }}>{p.releases24}</span>
                </div>
              </div>

              <div className="text-right text-[11px] font-bold tabular-nums" style={{ color: 'var(--foreground-secondary)' }}>
                {p.avgScore.toFixed(2)}
              </div>

              <div className="text-right text-[11px] font-bold tabular-nums" style={{ color: 'var(--foreground-secondary)' }}>
                {completionProxy.toFixed(0)}%
              </div>
            </button>
          )
        })}
      </div>
    </Card>
  )
}

function buildGrowth(rows: VolumeReleaseRow[]) {
  const map = new Map<number, GrowthRow>()
  for (const row of rows) {
    const year = volumeReleaseYear(row)
    if (year === null) continue
    const prev = map.get(year) || { year, volumes: 0 }
    prev.volumes += 1
    map.set(year, prev)
  }
  return Array.from(map.values()).sort((a, b) => a.year - b.year)
}

function GrowthChart({ volumeRows, vi }: { volumeRows: VolumeReleaseRow[]; vi: boolean }) {
  const data = buildGrowth(volumeRows)
  const w = 760
  const h = 184
  const padL = 38
  const padR = 14
  const padT = 14
  const padB = 30
  const maxY = Math.max(...data.map(d => d.volumes), 1)
  const roundedMax = Math.max(5, Math.ceil(maxY / 10) * 10)
  const yTicks = [roundedMax, Math.round(roundedMax * 0.66), Math.round(roundedMax * 0.33), 0]
    .filter((tick, index, arr) => arr.indexOf(tick) === index)
  const labelIndexes = Array.from(new Set([
    0,
    Math.floor((data.length - 1) * 0.33),
    Math.floor((data.length - 1) * 0.66),
    data.length - 1,
  ])).filter(index => index >= 0 && index < data.length)
  const points = data.map((d, i) => {
    const x = padL + i / Math.max(1, data.length - 1) * (w - padL - padR)
    const y = h - padB - d.volumes / roundedMax * (h - padT - padB)
    return { x, y, d }
  })
  const line = points.map(p => `${p.x},${p.y}`).join(' ')

  return (
    <Card className="p-3 h-[220px] overflow-hidden">
      <div className="flex items-center justify-between mb-1">
        <div>
          <p className="text-[12px] font-black uppercase tracking-wide" style={{ color: 'var(--foreground)' }}>{vi ? 'Tăng trưởng thị trường LN Việt Nam' : 'Vietnamese LN Market Growth'}</p>
          <p className="text-[11px]" style={{ color: 'var(--foreground-muted)' }}>{vi ? 'Số tập phát hành theo năm từ bảng volumes.' : 'Released volumes by year from volume data.'}</p>
        </div>
        <TrendingUp className="w-4 h-4" style={{ color: '#22c55e' }} />
      </div>

      <div className="overflow-hidden">
        <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-[172px]" preserveAspectRatio="none">
          {yTicks.map((tick, i) => {
            const y = h - padB - tick / roundedMax * (h - padT - padB)
            return (
              <g key={`${tick}-${i}`}>
                <line x1={padL} x2={w - padR} y1={y} y2={y} stroke="rgba(136,146,170,.14)" strokeDasharray="5 5" />
                <text x={padL - 8} y={y + 4} textAnchor="end" fontSize="11" fontWeight="700" fill="rgba(147,164,193,.88)">
                  {tick.toLocaleString('vi-VN', { notation: tick >= 1000 ? 'compact' : 'standard' })}
                </text>
              </g>
            )
          })}

          <polyline points={line} fill="none" stroke="#22c55e" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />

          {points.map((p, i) => (
            <g key={p.d.year}>
              <title>{`${p.d.year}: ${p.d.volumes.toLocaleString('vi-VN')} ${vi ? 'tập' : 'volumes'}`}</title>
              <circle cx={p.x} cy={p.y} r="3.5" fill="#bbf7d0" stroke="#22c55e" strokeWidth="1.8" vectorEffect="non-scaling-stroke" />
              {labelIndexes.includes(i) && (
                <text x={p.x} y={h - 9} textAnchor="middle" fontSize="11" fontWeight="700" fill="rgba(232,236,244,.70)">
                  {p.d.year}
                </text>
              )}
            </g>
          ))}
        </svg>
      </div>
    </Card>
  )
}

function buildHeatmap(rows: VolumeReleaseRow[]) {
  const map = new Map<string, HeatmapRow>()
  for (const row of rows) {
    const d = new Date(row.release_date)
    if (Number.isNaN(d.getTime())) continue
    const monthKey = String(d.getMonth()).padStart(2, '0')
    const monthLabel = d.toLocaleString('en-US', { month: 'short' })
    const publisher = row.publisher || 'Unknown'
    const key = `${publisher}|${monthKey}`
    const prev = map.get(key) || { publisher, monthKey, monthLabel, count: 0 }
    prev.count += 1
    map.set(key, prev)
  }
  return Array.from(map.values()).sort((a, b) => a.monthKey.localeCompare(b.monthKey) || a.publisher.localeCompare(b.publisher))
}

function Heatmap({ rows, volumeRows, vi }: { rows: LNRow[]; volumeRows: VolumeReleaseRow[]; vi: boolean }) {
  const [selectedYear, setSelectedYear] = useState<number | null>(null)
  const years = availableReleaseYears(volumeRows)
  const filteredVolumes = filterVolumeRowsBySingleYear(volumeRows, selectedYear)
  const data = buildHeatmap(filteredVolumes)
  const months = Array.from({ length: 12 }, (_, month) => [
    String(month).padStart(2, '0'),
    new Date(2020, month, 1).toLocaleString('en-US', { month: 'short' }),
  ] as const)
  const max = Math.max(...data.map(d => d.count), 1)
  const selectedPublisher = rows[0]?.publisher || filteredVolumes[0]?.publisher || 'Unknown'
  const lookup = new Map(data.map(d => [`${d.publisher}|${d.monthKey}`, d.count]))

  return (
    <Card className="p-3 min-h-[150px] overflow-hidden">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div>
          <p className="text-[12px] font-black uppercase tracking-wide" style={{ color: 'var(--foreground)' }}>{vi ? 'Hoạt động phát hành' : 'Release Activity'}</p>
          <p className="text-[11px]" style={{ color: 'var(--foreground-muted)' }}>{vi ? 'Số tập theo tháng/năm đã chọn.' : 'Volume count by selected month/year.'}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <CompactYearSelect years={years} selectedYear={selectedYear} setSelectedYear={setSelectedYear} vi={vi} />
          <BarChart3 className="w-4 h-4 shrink-0" style={{ color: '#ec4899' }} />
        </div>
      </div>

      <div>
        <div className="grid gap-1.5 mb-1.5" style={{ gridTemplateColumns: 'repeat(12, minmax(0, 1fr))' }}>
          {months.map(([key, label]) => (
            <div key={key} className="text-[10px] font-bold text-center" style={{ color: 'var(--foreground-muted)' }}>{label}</div>
          ))}
        </div>

        <div className="grid gap-1.5" style={{ gridTemplateColumns: 'repeat(12, minmax(0, 1fr))' }}>
          {months.map(([key]) => {
            const v = lookup.get(`${selectedPublisher}|${key}`) || 0
            const alpha = v === 0 ? .10 : .22 + v / max * .76
            return (
              <div
                key={key}
                title={`${selectedPublisher}: ${v.toLocaleString('vi-VN')} ${vi ? 'tập' : 'volumes'}`}
                className="relative h-7 rounded-md transition-all duration-150 hover:ring-2 hover:ring-cyan-300/70 hover:brightness-125 hover:scale-105"
                style={{ background: `rgba(124,106,245,${alpha})`, border: '1px solid rgba(255,255,255,.06)' }}
              >
                {v > 0 && (
                  <span className="absolute inset-0 flex items-center justify-center text-[10px] font-black text-white/90">
                    {v}
                  </span>
                )}
              </div>
            )
          })}
        </div>

        <div className="flex items-center gap-2 mt-2">
          <span className="text-[10px] font-bold" style={{ color: 'var(--foreground-muted)' }}>0</span>
          <div className="h-2 flex-1 rounded-full" style={{ background: 'linear-gradient(90deg,rgba(124,106,245,.18),#3b82f6,#22c5b8)' }} />
          <span className="text-[10px] font-bold" style={{ color: 'var(--foreground-muted)' }}>{max}+</span>
        </div>
      </div>
    </Card>
  )
}

function publisherScoreColor(value: number) {
  if (value >= 80) return '#22c55e'
  if (value >= 65) return '#38bdf8'
  if (value >= 45) return '#eab308'
  return '#ef4444'
}

function avgValue(rows: LNRow[], fn: (row: LNRow) => number) {
  if (rows.length === 0) return 0
  return rows.reduce((sum, row) => sum + fn(row), 0) / rows.length
}

function PublisherDNARadar({ publisher, rows, vi }: { publisher: PublisherAgg; rows: LNRow[]; vi: boolean }) {
  const activeCount = rows.filter(row => ['Đang phát hành', 'Đã bắt kịp bản gốc JP', 'Lâu lắm rồi chưa có tập mới'].includes(releaseStatus(row))).length
  const completedCount = rows.filter(row => row.evalution === 'Completed' || releaseStatus(row) === 'Hoàn thành').length
  const safety = Math.max(0, Math.min(100, 100 - publisher.avgDrop))
  const releaseActivity = Math.max(0, Math.min(100, publisher.marketShare * 3.5))
  const quality = Math.max(0, Math.min(100, publisher.avgScore * 10))
  const completion = rows.length ? (completedCount / rows.length) * 100 : 0
  const active = rows.length ? (activeCount / rows.length) * 100 : 0
  const catchup = avgValue(rows, row => row.catch_up_score * 10)
  const momentum = avgValue(rows, row => row.momentum_score * 10)

  const axes = [
    [vi ? 'Output' : 'Output', releaseActivity],
    [vi ? 'Completion' : 'Completion', completion],
    [vi ? 'Reliability' : 'Reliability', avgValue(rows, row => row.publisher_support_score * 10)],
    [vi ? 'Momentum' : 'Momentum', momentum],
    [vi ? 'Catch-up' : 'Catch-up', catchup],
    [vi ? 'Quality' : 'Quality', quality],
    [vi ? 'Safety' : 'Safety', safety],
    [vi ? 'Active' : 'Active', active],
  ] as const

  const size = 248
  const cx = size / 2
  const cy = size / 2
  const maxR = 76
  const points = axes.map(([, value], i) => {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / axes.length
    const r = Math.max(0, Math.min(100, value)) / 100 * maxR
    return `${cx + Math.cos(angle) * r},${cy + Math.sin(angle) * r}`
  }).join(' ')
  const grids = [0.33, 0.66, 1].map(level => axes.map(([,], i) => {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / axes.length
    const r = level * maxR
    return `${cx + Math.cos(angle) * r},${cy + Math.sin(angle) * r}`
  }).join(' '))

  return (
    <Card className="p-3 h-full overflow-hidden">
      <div className="mb-1">
        <div>
          <p className="text-[11px] font-black uppercase tracking-wide" style={{ color: 'var(--foreground)' }}>{vi ? 'Publisher DNA' : 'Publisher DNA'}</p>
          <p className="text-[10px]" style={{ color: 'var(--foreground-muted)' }}>{vi ? 'Giá trị được ghi trực tiếp trên radar.' : 'Values are shown directly on the radar.'}</p>
        </div>
      </div>

      <div className="flex justify-center">
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="max-w-full">
          {grids.map((g, i) => <polygon key={i} points={g} fill="none" stroke="rgba(136,146,170,.18)" />)}
          {axes.map(([label, value], i) => {
            const angle = -Math.PI / 2 + (i * 2 * Math.PI) / axes.length
            const x1 = cx + Math.cos(angle) * maxR
            const y1 = cy + Math.sin(angle) * maxR
            const x = cx + Math.cos(angle) * (maxR + 28)
            const y = cy + Math.sin(angle) * (maxR + 28)
            const anchor = Math.cos(angle) > 0.35 ? 'start' : Math.cos(angle) < -0.35 ? 'end' : 'middle'
            return (
              <g key={label}>
                <line x1={cx} y1={cy} x2={x1} y2={y1} stroke="rgba(136,146,170,.14)" />
                <text x={x} y={y - 5} textAnchor={anchor} dominantBaseline="middle" fontSize="8" fontWeight="700" fill="rgba(232,236,244,.76)">{label}</text>
                <text x={x} y={y + 7} textAnchor={anchor} dominantBaseline="middle" fontSize="10" fontWeight="900" fill={publisherScoreColor(value)}>{value.toFixed(0)}</text>
              </g>
            )
          })}
          <polygon points={points} fill="rgba(56,189,248,.26)" stroke="#38bdf8" strokeWidth="2" />
          {points.split(' ').map((p, i) => {
            const [x, y] = p.split(',').map(Number)
            return <circle key={i} cx={x} cy={y} r="3" fill="#67e8f9" />
          })}
        </svg>
      </div>
    </Card>
  )
}

function PublisherPortfolioMap({ rows, selectedKey, onSelect, vi }: { rows: LNRow[]; selectedKey: string | null; onSelect: (row: LNRow) => void; vi: boolean }) {
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 5, y: 50 })
  const [query, setQuery] = useState('')
  const [hoveredKey, setHoveredKey] = useState<string | null>(null)
  const dragRef = useRef<{ x: number; y: number } | null>(null)
  const pointersRef = useRef(new Map<number, { x: number; y: number }>())
  const pinchRef = useRef<{ dist: number; zoom: number; pan: { x: number; y: number }; pct: { x: number; y: number }; data: { x: number; y: number } } | null>(null)

  const plotRows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return rows.filter(row => {
      const searchable = `${row.series_title} ${row.series_id || ''} ${row.series_code || ''}`.toLowerCase()
      return !q || searchable.includes(q)
    })
  }, [rows, query])

  function transformPoint(row: LNRow) {
    const jitter = scatterStableNoise(row.series_key)
    const rawX = Math.max(0, Math.min(10, row.ln_score + jitter.x))
    const rawY = Math.max(0, Math.min(100, pctValue(row.drop_percent) + jitter.y))
    const x = 50 + (rawX - pan.x) * 10 * zoom
    const y = 50 - (rawY - pan.y) * zoom
    return {
      x,
      y,
      rawX,
      rawY,
      visible: x >= -5 && x <= 105 && y >= -5 && y <= 105,
    }
  }

  function clampPan(next: { x: number; y: number }) {
    return {
      x: Math.max(-1, Math.min(11, next.x)),
      y: Math.max(-10, Math.min(110, next.y)),
    }
  }

  function pointPercent(clientX: number, clientY: number, element: HTMLElement) {
    const rect = element.getBoundingClientRect()
    return {
      x: ((clientX - rect.left) / rect.width) * 100,
      y: ((clientY - rect.top) / rect.height) * 100,
    }
  }

  function dataAtPercent(percent: { x: number; y: number }, currentZoom = zoom, currentPan = pan) {
    return {
      x: currentPan.x + (percent.x - 50) / (10 * currentZoom),
      y: currentPan.y + (50 - percent.y) / currentZoom,
    }
  }

  function zoomAt(percent: { x: number; y: number }, nextZoom: number, baseZoom = zoom, basePan = pan) {
    const clamped = Math.max(1, Math.min(6, Number(nextZoom.toFixed(2))))
    const data = dataAtPercent(percent, baseZoom, basePan)
    setZoom(clamped)
    setPan(clampPan({
      x: data.x - (percent.x - 50) / (10 * clamped),
      y: data.y - (50 - percent.y) / clamped,
    }))
  }

  const hoveredRow = hoveredKey ? plotRows.find(row => row.series_key === hoveredKey) || null : null
  const hoveredPoint = hoveredRow ? transformPoint(hoveredRow) : null

  return (
    <Card className="p-3 h-full">
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-2 mb-2">
        <div>
          <p className="text-[11px] font-black uppercase tracking-wide" style={{ color: 'var(--foreground)' }}>{vi ? 'Portfolio Quality Map' : 'Portfolio Quality Map'}</p>
          <p className="text-[10px]" style={{ color: 'var(--foreground-muted)' }}>{vi ? 'Hiển thị toàn bộ portfolio; điểm được tách nhẹ để dễ bấm.' : 'Shows the full portfolio; points are separated for clickability.'}</p>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-1.5">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3" style={{ color: 'var(--foreground-muted)' }} />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={vi ? 'Tìm...' : 'Search...'}
              className="pl-7 pr-2 py-1.5 rounded-lg text-[10px] font-semibold outline-none w-[132px]"
              style={{ background: 'var(--ln-control-bg)', color: 'var(--foreground)', border: '1px solid var(--card-border)' }}
            />
          </div>

          <div className="flex items-center rounded-lg overflow-hidden" style={{ border: '1px solid var(--card-border)' }}>
            <button type="button" onClick={() => setZoom(z => Math.max(1, Number((z - 0.35).toFixed(2))))} className="px-2 py-1.5 text-[10px] font-black" style={{ background: 'var(--ln-control-bg)', color: 'var(--foreground-secondary)' }}>−</button>
            <button type="button" onClick={() => { setZoom(1); setPan({ x: 5, y: 50 }) }} className="px-2 py-1.5 text-[10px] font-black" style={{ background: zoom === 1 ? '#7c6af5' : 'var(--ln-control-bg)', color: zoom === 1 ? '#fff' : 'var(--foreground-secondary)' }}>{zoom.toFixed(1)}x</button>
            <button type="button" onClick={() => setZoom(z => Math.min(3.5, Number((z + 0.35).toFixed(2))))} className="px-2 py-1.5 text-[10px] font-black" style={{ background: 'var(--ln-control-bg)', color: 'var(--foreground-secondary)' }}>+</button>
          </div>
        </div>
      </div>

      <div
        className="relative h-[230px] rounded-lg overflow-hidden cursor-grab active:cursor-grabbing select-none"
        style={{ background: 'var(--ln-chart-bg)', border: '1px solid var(--card-border)', touchAction: 'none' }}
        onWheel={e => {
          e.preventDefault()
          const percent = pointPercent(e.clientX, e.clientY, e.currentTarget)
          zoomAt(percent, zoom * (e.deltaY > 0 ? 0.88 : 1.12))
        }}
        onPointerDown={e => {
          e.currentTarget.setPointerCapture(e.pointerId)
          pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
          dragRef.current = { x: e.clientX, y: e.clientY }
          pinchRef.current = null
        }}
        onPointerMove={e => {
          if (!pointersRef.current.has(e.pointerId)) return
          pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
          const pointers = Array.from(pointersRef.current.values())
          if (pointers.length >= 2) {
            const [a, b] = pointers
            const dist = Math.hypot(a.x - b.x, a.y - b.y)
            const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
            const percent = pointPercent(mid.x, mid.y, e.currentTarget)
            if (!pinchRef.current) {
              pinchRef.current = { dist, zoom, pan, pct: percent, data: dataAtPercent(percent) }
              return
            }
            const start = pinchRef.current
            const nextZoom = Math.max(1, Math.min(6, Number((start.zoom * (dist / Math.max(1, start.dist))).toFixed(2))))
            setZoom(nextZoom)
            setPan(clampPan({
              x: start.data.x - (start.pct.x - 50) / (10 * nextZoom),
              y: start.data.y - (50 - start.pct.y) / nextZoom,
            }))
            return
          }
          if (!dragRef.current) return
          const dx = e.clientX - dragRef.current.x
          const dy = e.clientY - dragRef.current.y
          const rect = e.currentTarget.getBoundingClientRect()
          dragRef.current = { x: e.clientX, y: e.clientY }
          setPan(current => clampPan({
            x: current.x - (dx / rect.width * 100) / (10 * zoom),
            y: current.y + (dy / rect.height * 100) / zoom,
          }))
        }}
        onPointerUp={e => {
          pointersRef.current.delete(e.pointerId)
          dragRef.current = null
          pinchRef.current = null
        }}
        onPointerCancel={e => {
          pointersRef.current.delete(e.pointerId)
          dragRef.current = null
          pinchRef.current = null
        }}
      >
        <div className="absolute inset-0 opacity-50 pointer-events-none">
          <div className="absolute left-0 top-0 w-1/2 h-1/2" style={{ background: 'linear-gradient(135deg, rgba(239,68,68,.08), transparent)' }} />
          <div className="absolute right-0 bottom-0 w-1/2 h-1/2" style={{ background: 'linear-gradient(315deg, rgba(34,197,94,.08), transparent)' }} />
        </div>

        <div className="absolute inset-x-8 inset-y-7">
          {[0, 25, 50, 75, 100].map(v => (
            <div key={`py-${v}`} className="absolute left-0 right-0 border-t border-dashed" style={{ top: `${100 - v}%`, borderColor: 'rgba(136,146,170,.14)' }}>
              <span className="absolute -left-2 -translate-x-full -top-2 text-[9px]" style={{ color: 'var(--foreground-muted)' }}>{v}%</span>
            </div>
          ))}
          {[0, 2, 4, 6, 8, 10].map(v => (
            <div key={`px-${v}`} className="absolute top-0 bottom-0 border-l border-dashed" style={{ left: `${v * 10}%`, borderColor: 'rgba(136,146,170,.10)' }}>
              <span className="absolute -bottom-4 -translate-x-1/2 text-[9px]" style={{ color: 'var(--foreground-muted)' }}>{v}</span>
            </div>
          ))}

          <span className="absolute left-2 top-2 text-[9px] font-black uppercase pointer-events-none" style={{ color: '#ef4444' }}>{vi ? 'Rủi ro cao' : 'High Risk'}</span>
          <span className="absolute right-2 top-2 text-[9px] font-black uppercase pointer-events-none" style={{ color: '#38bdf8' }}>{vi ? 'Khỏe mạnh nhưng rủi ro' : 'Popular Risk'}</span>
          <span className="absolute left-2 bottom-2 text-[9px] font-black uppercase pointer-events-none" style={{ color: '#a78bfa' }}>{vi ? 'Đình trệ' : 'Stalled'}</span>
          <span className="absolute right-2 bottom-2 text-[9px] font-black uppercase pointer-events-none" style={{ color: '#22c55e' }}>{vi ? 'Khỏe mạnh' : 'Healthy'}</span>

          {plotRows.map(row => {
            const point = transformPoint(row)
            if (!point.visible) return null
            const active = row.series_key === selectedKey
            const hovered = row.series_key === hoveredKey
            const color = statusColors[row.evalution || ''] || scoreColor(row.ln_score)
            const size = active ? 16 : hovered ? 14 : Math.max(9, Math.min(14, 7 + row.demand_score * 0.65))
            return (
              <button
                key={row.series_key}
                onClick={() => { setHoveredKey(row.series_key); onSelect(row) }}
                onMouseEnter={() => setHoveredKey(row.series_key)}
                onMouseLeave={() => setHoveredKey(null)}
                title={`${row.series_title}\nID ${row.series_id || '—'} · ${row.series_code || '—'}\nLN ${row.ln_score.toFixed(1)} · Drop ${fmtPercent(row.drop_percent)}`}
                className="absolute rounded-full transition-all hover:scale-125 focus:outline-none focus:ring-2 focus:ring-cyan-300"
                style={{
                  left: `${point.x}%`,
                  top: `${point.y}%`,
                  width: size,
                  height: size,
                  background: color,
                  border: active ? '2px solid #fff' : '1px solid rgba(255,255,255,.40)',
                  boxShadow: active ? `0 0 0 7px ${color}26, 0 0 24px ${color}` : hovered ? `0 0 0 5px ${color}25, 0 0 18px ${color}` : `0 0 10px ${color}66`,
                  transform: 'translate(-50%, -50%)',
                  zIndex: active || hovered ? 30 : 10,
                }}
              />
            )
          })}
        </div>

        <div className="absolute left-10 bottom-2 text-[9px]" style={{ color: 'var(--foreground-muted)' }}>LN Score →</div>
        <div className="absolute left-3 top-1/2 -rotate-90 text-[9px]" style={{ color: 'var(--foreground-muted)' }}>{vi ? 'Drop Risk' : 'Drop Risk'}</div>
        <div className="absolute right-3 bottom-2 text-[9px]" style={{ color: 'var(--foreground-muted)' }}>{plotRows.length.toLocaleString('vi-VN')} series</div>
      </div>
    </Card>
  )
}

function PublisherProgressTable({ rows, vi }: { rows: LNRow[]; vi: boolean }) {
  const items = [...rows].sort((a, b) => (b.catch_up_score - a.catch_up_score) || (b.ln_score - a.ln_score)).slice(0, 9)
  return (
    <Card className="p-3 h-full">
      <p className="text-xs font-black uppercase tracking-wide mb-2" style={{ color: 'var(--foreground)' }}>{vi ? 'Tiến độ VN vs gốc' : 'VN Progress vs Original'}</p>
      <div className="space-y-1.5">
        {items.map(row => {
          const pct = Math.max(0, Math.min(100, row.catch_up_score * 10))
          return (
            <div key={row.series_key} className="grid grid-cols-[1fr_46px_54px] gap-2 items-center text-[10px]">
              <span className="truncate font-semibold" style={{ color: 'var(--foreground-secondary)' }}>{row.series_title}</span>
              <span className="tabular-nums text-right" style={{ color: 'var(--foreground-muted)' }}>{fmtNum(row.number_of_volumes, 0)}/{fmtNum(row.original_volumes, 0)}</span>
              <div className="flex items-center gap-1">
                <div className="h-1.5 rounded-full overflow-hidden flex-1" style={{ background: 'var(--ln-track-bg)' }}>
                  <div className="h-full rounded-full" style={{ width: `${pct}%`, background: 'linear-gradient(90deg,#38bdf8,#22c55e)' }} />
                </div>
                <span className="tabular-nums" style={{ color: 'var(--foreground-muted)' }}>{pct.toFixed(0)}%</span>
              </div>
            </div>
          )
        })}
      </div>
    </Card>
  )
}

function PublisherBreakdown({ rows, vi }: { rows: LNRow[]; vi: boolean }) {
  const groups = [
    { key: 'active', label: vi ? 'Ongoing' : 'Ongoing', color: '#2563eb', rows: rows.filter(r => ['Good', 'Limping'].includes(r.evalution || '')) },
    { key: 'completed', label: vi ? 'Completed' : 'Completed', color: '#22c55e', rows: rows.filter(r => r.evalution === 'Completed') },
    { key: 'stalled', label: vi ? 'Stalled' : 'Stalled', color: '#eab308', rows: rows.filter(r => r.evalution === 'Dead') },
    { key: 'dropped', label: vi ? 'Dropped' : 'Dropped', color: '#ef4444', rows: rows.filter(r => r.evalution === 'Dropped') },
    { key: 'caught', label: vi ? 'Caught Up' : 'Caught Up', color: '#7c6af5', rows: rows.filter(r => releaseStatus(r) === 'Đã bắt kịp bản gốc JP') },
  ].filter(group => group.rows.length > 0).sort((a, b) => b.rows.length - a.rows.length)

  const total = Math.max(1, rows.length)

  return (
    <Card className="p-3 h-full overflow-hidden">
      <div className="mb-2">
        <div>
          <p className="text-[11px] font-black uppercase tracking-wide" style={{ color: 'var(--foreground)' }}>{vi ? 'Portfolio Treemap' : 'Portfolio Treemap'}</p>
          <p className="text-[10px]" style={{ color: 'var(--foreground-muted)' }}>{vi ? 'Diện tích theo số series.' : 'Area by number of series.'}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5 h-[230px]">
        {groups.map(group => {
          const pct = (group.rows.length / total) * 100
          return (
            <div
              key={group.key}
              className="rounded-xl p-3 min-w-[116px] flex flex-col justify-between overflow-hidden"
              style={{
                flex: `${Math.max(0.25, group.rows.length)} 1 ${Math.max(24, pct)}%`,
                background: `linear-gradient(135deg, ${group.color}55, ${group.color}22)`,
                border: `1px solid ${group.color}66`,
              }}
            >
              <div>
                <p className="text-[10px] font-black uppercase tracking-wide truncate" style={{ color: 'var(--foreground)' }}>{group.label}</p>
                <p className="text-3xl font-black leading-none mt-1" style={{ color: 'var(--foreground)' }}>{group.rows.length}</p>
              </div>
              <div>
                <p className="text-[10px]" style={{ color: 'var(--foreground-muted)' }}>{pct.toFixed(0)}% portfolio</p>
              </div>
            </div>
          )
        })}
      </div>
    </Card>
  )
}

function PublisherSeriesCarousel({ rows, selectedKey, vi }: { rows: LNRow[]; selectedKey: string | null; vi: boolean }) {
  const items = useMemo(() => {
    const fanRanked = rows.filter(row => row.fan_vote_rank != null)
    const source = fanRanked.length > 0 ? fanRanked : rows
    return [...source]
      .sort((a, b) => {
        const aRank = a.fan_vote_rank ?? Number.MAX_SAFE_INTEGER
        const bRank = b.fan_vote_rank ?? Number.MAX_SAFE_INTEGER
        return (aRank - bRank)
          || ((b.fan_vote_year || 0) - (a.fan_vote_year || 0))
          || ((b.fan_vote_votes || 0) - (a.fan_vote_votes || 0))
          || (b.ln_score - a.ln_score)
          || pctValue(a.drop_percent) - pctValue(b.drop_percent)
          || String(b.max_release_at || '').localeCompare(String(a.max_release_at || ''))
      })
      .slice(0, 10)
  }, [rows])

  const initial = Math.max(0, items.findIndex(row => row.series_key === selectedKey))
  const [activeIndex, setActiveIndex] = useState(initial < 0 ? 0 : initial)

  useEffect(() => {
    const idx = items.findIndex(row => row.series_key === selectedKey)
    if (idx >= 0) setActiveIndex(idx)
    else setActiveIndex(0)
  }, [selectedKey, items.length])

  useEffect(() => {
    if (items.length <= 1) return
    const timer = window.setInterval(() => {
      setActiveIndex(idx => (idx + 1) % items.length)
    }, 4500)
    return () => window.clearInterval(timer)
  }, [items.length])

  if (items.length === 0) {
    return <Card className="p-3"><span className="text-xs" style={{ color: 'var(--foreground-muted)' }}>{vi ? 'Không có series.' : 'No series.'}</span></Card>
  }

  const safeIndex = Math.min(activeIndex, items.length - 1)
  const active = items[safeIndex]
  const activeStyle = releaseStatusStyle(active)
  const cover = proxyImg(active.cover_url)
  const volumeCount = Math.max(0, Math.round(active.number_of_volumes || 0))
  const isCompletedOneshot = volumeCount === 1 && (active.evalution === 'Completed' || releaseStatusLabel(releaseStatus(active), false) === 'Completed')
  const volumeLabel = isCompletedOneshot
    ? 'Oneshot'
    : vi
      ? `${fmtNum(volumeCount, 0)} tập`
      : `${fmtNum(volumeCount, 0)} ${volumeCount === 1 ? 'Volume' : 'Volumes'}`
  const fanVoteLabel = active.fan_vote_rank && active.fan_vote_year
    ? (vi ? `LN ưa thích số ${active.fan_vote_rank} năm ${active.fan_vote_year}` : `Favourite Fan Vote #${active.fan_vote_rank} ${active.fan_vote_year}`)
    : null
  const description = active.description || (vi ? 'Chưa có mô tả cho series này.' : 'No description available for this series.')

  return (
    <Card className="p-3 overflow-hidden">
      <div className="flex items-center justify-between gap-3 mb-2">
        <div>
          <p className="text-[11px] font-black uppercase tracking-wide" style={{ color: 'var(--foreground)' }}>
            {vi ? 'Top Series Slideshow' : 'Top Series Slideshow'}
          </p>
          <p className="text-[10px]" style={{ color: 'var(--foreground-muted)' }}>
            {vi ? 'Chọn series nổi bật trong portfolio.' : 'Browse this publisher portfolio.'}
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-full px-2.5 py-1.5" style={{ background: 'rgba(255,255,255,.08)', border: '1px solid rgba(255,255,255,.12)' }}>
          {items.map((row, idx) => (
            <button
              key={row.series_key}
              type="button"
              onClick={() => setActiveIndex(idx)}
              className="w-3 h-3 rounded-full transition-all hover:scale-125"
              style={{ background: idx === safeIndex ? '#ffffff' : 'rgba(255,255,255,.38)', boxShadow: idx === safeIndex ? '0 0 0 2px rgba(167,139,250,.45)' : 'none' }}
              aria-label={`Show slide ${idx + 1}`}
              title={`${idx + 1}/${items.length}`}
            />
          ))}
        </div>
      </div>

      <div className="relative rounded-2xl overflow-hidden" style={{ background: 'linear-gradient(135deg, rgba(15,23,42,.96), rgba(17,24,39,.82))', border: '1px solid var(--card-border)' }}>
        {cover && <img src={cover} alt="" className="absolute inset-0 w-full h-full object-cover opacity-[0.10] blur-md scale-110" />}
        <div className="absolute inset-0" style={{ background: 'linear-gradient(90deg, rgba(2,6,23,.96), rgba(2,6,23,.75), rgba(2,6,23,.92))' }} />

        <Link href={detailHref(active)} className="absolute right-3 top-3 z-20 inline-flex items-center justify-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-black transition-all hover:scale-[1.02] min-w-[78px]" style={{ background: 'rgba(124,106,245,.22)', color: '#ddd6fe', border: '1px solid rgba(124,106,245,.36)' }}>Open <ArrowRight className="w-3.5 h-3.5" /></Link>

        <div className="relative grid grid-cols-[122px_1fr] sm:grid-cols-[150px_1fr] gap-4 p-3 min-h-[244px]">
          <div className="relative">
            <div className="relative rounded-xl overflow-hidden shadow-xl" style={{ aspectRatio: '2/3', border: '1px solid rgba(255,255,255,.16)', background: 'var(--ln-muted-bg)' }}>
              {cover ? (
                <img src={cover} alt={active.series_title} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <BookOpen className="w-8 h-8 opacity-30" style={{ color: 'var(--foreground-muted)' }} />
                </div>
              )}
            </div>
          </div>

          <div className="min-w-0 flex flex-col justify-between">
            <div className="pr-24">
              <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
                <span className="rounded-full px-2 py-0.5 text-[9px] font-black" style={{ color: activeStyle.color, background: activeStyle.bg, border: `1px solid ${activeStyle.border}` }}>{releaseStatusLabel(releaseStatus(active), vi)}</span>
                <span className="rounded-full px-2 py-0.5 text-[9px] font-bold" style={{ color: '#7dd3fc', background: 'rgba(56,189,248,.10)', border: '1px solid rgba(56,189,248,.18)' }}>{volumeLabel}</span>
                <span className="rounded-full px-2 py-0.5 text-[9px] font-bold" style={{ color: 'var(--foreground-muted)', background: 'var(--ln-muted-bg)' }}>
                  {fmtDate(active.max_release_at)}
                </span>
                {fanVoteLabel && (
                  <span
                    className="rounded-full px-2 py-0.5 text-[9px] font-black"
                    style={{ color: '#fde68a', background: 'rgba(234,179,8,.14)', border: '1px solid rgba(234,179,8,.28)' }}
                    title={active.fan_vote_votes ? `${fmtNum(active.fan_vote_votes, 0)} votes · ${active.fan_vote_period || active.fan_vote_year}` : active.fan_vote_period || undefined}
                  >
                    {fanVoteLabel}
                  </span>
                )}
              </div>

              <h3 className="text-xl sm:text-2xl font-black leading-tight line-clamp-3" style={{ color: 'var(--foreground)' }}>{active.series_title}</h3>
            </div>

            <div className="mt-3 rounded-xl p-3 min-h-[126px] max-h-[154px] overflow-hidden" style={{ background: 'rgba(15,23,42,.52)', border: '1px solid rgba(136,146,170,.14)' }}>
              <p className="text-[11px] leading-relaxed line-clamp-6" style={{ color: 'var(--foreground-secondary)' }}>{description}</p>
            </div>
          </div>
        </div>
      </div>
    </Card>
  )
}

function PublisherRiskWatch({ rows, vi }: { rows: LNRow[]; vi: boolean }) {
  const risky = [...rows].sort((a, b) => pctValue(b.drop_percent) - pctValue(a.drop_percent)).slice(0, 5)
  const stalled = rows
    .filter(row => row.evalution !== 'Completed' && releaseStatusLabel(releaseStatus(row), false) !== 'Completed')
    .sort((a, b) => (b.months_since_last_release || 0) - (a.months_since_last_release || 0))
    .slice(0, 5)
  return (
    <Card className="p-3">
      <p className="text-xs font-black uppercase tracking-wide mb-2" style={{ color: '#fb7185' }}>{vi ? 'Cảnh báo rủi ro' : 'Publisher Risk Watch'}</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="rounded-xl p-3" style={{ background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.18)' }}>
          <p className="text-[11px] font-black mb-2" style={{ color: '#f87171' }}>{vi ? 'Drop cao nhất' : 'Highest Drop Risk'}</p>
          <div className="space-y-1.5">
            {risky.map((row, i) => <div key={row.series_key} className="flex items-center justify-between gap-2 text-[11px]"><span className="truncate" style={{ color: 'var(--foreground-secondary)' }}>{i + 1}. {row.series_title}</span><span className="font-bold" style={{ color: '#f87171' }}>{fmtPercent(row.drop_percent)}</span></div>)}
          </div>
        </div>
        <div className="rounded-xl p-3" style={{ background: 'rgba(249,115,22,.08)', border: '1px solid rgba(249,115,22,.18)' }}>
          <p className="text-[11px] font-black mb-2" style={{ color: '#fb923c' }}>{vi ? 'Lâu chưa ra tập' : 'Stalled Series'}</p>
          <div className="space-y-1.5">
            {stalled.map((row, i) => <div key={row.series_key} className="flex items-center justify-between gap-2 text-[11px]"><span className="truncate" style={{ color: 'var(--foreground-secondary)' }}>{i + 1}. {row.series_title}</span><span className="font-bold" style={{ color: '#fb923c' }}>{row.months_since_last_release == null ? '—' : `${row.months_since_last_release.toFixed(0)}m`}</span></div>)}
          </div>
        </div>
      </div>
    </Card>
  )
}

function PublisherFocusView({ rows, volumeRows, publisherLogos, selectedPublisher, setSelectedPublisher, selectedKey, onSelectSeries, vi }: { rows: LNRow[]; volumeRows: VolumeReleaseRow[]; publisherLogos: PublisherLogoMap; selectedPublisher: string | null; setSelectedPublisher: (publisher: string) => void; selectedKey: string | null; onSelectSeries: (row: LNRow) => void; vi: boolean }) {
  const publishers = buildPublishers(rows, volumeRows).filter(p => p.releases24 > 0)
  const currentName = selectedPublisher || publishers[0]?.publisher || 'Unknown'
  const logoUrl = proxyImg(publisherLogos[publisherKey(currentName)] || null)
  const publisher = publishers.find(p => p.publisher === currentName) || publishers[0]
  const portfolioRows = rows.filter(row => (row.publisher || 'Unknown') === currentName)
  const publisherVolumes = volumeRows.filter(row => (row.publisher || 'Unknown') === currentName)
  const activeSeries = portfolioRows.filter(row => ['Đang phát hành', 'Đã bắt kịp bản gốc JP', 'Lâu lắm rồi chưa có tập mới'].includes(releaseStatus(row))).length
  const completedSeries = portfolioRows.filter(row => row.evalution === 'Completed' || releaseStatus(row) === 'Hoàn thành').length
  const avgScore = portfolioRows.length ? avgValue(portfolioRows, row => row.ln_score) : 0
  const avgDrop = portfolioRows.length ? avgValue(portfolioRows, row => pctValue(row.drop_percent)) : 0
  const reliability = portfolioRows.length ? avgValue(portfolioRows, row => row.publisher_support_score * 10) : 0
  const reliabilityRanks = publishers
    .map(p => {
      const pRows = rows.filter(row => (row.publisher || 'Unknown') === p.publisher)
      const score = pRows.length ? avgValue(pRows, row => row.publisher_support_score * 10) : 0
      return { publisher: p.publisher, score }
    })
    .sort((a, b) => b.score - a.score || a.publisher.localeCompare(b.publisher))
  const rank = Math.max(1, reliabilityRanks.findIndex(p => p.publisher === currentName) + 1)
  const marketShare = publisher?.marketShare || 0

  if (!publisher) {
    return <Card className="p-6 text-sm"><span style={{ color: 'var(--foreground-muted)' }}>{vi ? 'Không có dữ liệu nhà phát hành.' : 'No publisher data available.'}</span></Card>
  }

  const kpis = [
    { label: vi ? 'Series cấp phép' : 'Licensed Series', value: portfolioRows.length.toLocaleString('vi-VN'), delta: `${activeSeries} active`, color: '#818cf8' },
    { label: vi ? 'Tập đã phát hành' : 'Released Volumes', value: publisherVolumes.length.toLocaleString('vi-VN'), delta: `${marketShare.toFixed(1)}% share`, color: '#38bdf8' },
    { label: vi ? 'Series hoạt động' : 'Active Series', value: activeSeries.toLocaleString('vi-VN'), delta: `${completedSeries} completed`, color: '#22c55e' },
    { label: vi ? 'Điểm LN TB' : 'Average LN Score', value: avgScore.toFixed(2), delta: `Rank #${rank}`, color: scoreColor(avgScore) },
    { label: vi ? 'Drop TB' : 'Average Drop', value: `${avgDrop.toFixed(1)}%`, delta: vi ? 'rủi ro portfolio' : 'portfolio risk', color: dropColor(avgDrop) },
  ]

  return (
    <div className="space-y-3">
      <Card className="p-3.5">
        <div className="grid grid-cols-1 xl:grid-cols-[340px_1fr_260px] gap-4 items-center">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-[92px] h-[92px] rounded-full flex items-center justify-center text-2xl font-black shrink-0 overflow-hidden" style={{ background: 'rgba(255,255,255,.96)', color: '#1d4ed8', border: '5px solid rgba(255,255,255,.96)', boxShadow: '0 0 0 1px rgba(136,146,170,.18)' }}>
              {logoUrl ? (
                <img
                  src={logoUrl}
                  alt={`${currentName} logo`}
                  className="w-full h-full object-contain"
                  loading="eager"
                  decoding="async"
                />
              ) : (
                currentName.slice(0, 3).toUpperCase()
              )}
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-wide" style={{ color: 'var(--foreground-muted)' }}>{vi ? 'Nhà phát hành' : 'Publisher'}</p>
              <div className="flex items-center gap-3 min-w-0">
                <h2 className="text-2xl font-black truncate" style={{ color: 'var(--foreground)' }}>{currentName}</h2>
                <span className="shrink-0 text-2xl font-black leading-none" style={{ color: 'var(--foreground-muted)', textShadow: '0 0 14px rgba(234,179,8,.55)' }}>#{rank}</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            {kpis.map(kpi => (
              <div key={kpi.label} className="rounded-xl p-3" style={{ background: 'var(--ln-panel-bg)', border: '1px solid var(--card-border)' }}>
                <p className="text-[9px] font-black uppercase tracking-wide" style={{ color: 'var(--foreground-muted)' }}>{kpi.label}</p>
                <p className="text-2xl font-black mt-1 leading-none" style={{ color: 'var(--foreground)' }}>{kpi.value}</p>
                <p className="text-[10px] mt-1" style={{ color: kpi.color }}>{kpi.delta}</p>
              </div>
            ))}
          </div>

          <div className="rounded-xl p-3" style={{ background: 'rgba(124,106,245,.10)', border: '1px solid rgba(124,106,245,.20)' }}>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] font-black uppercase tracking-wide" style={{ color: 'var(--foreground-muted)' }}>{vi ? 'Publisher Reliability' : 'Publisher Reliability'}</p>
              <span className="text-sm font-black" style={{ color: 'var(--foreground-muted)' }}>Rank {rank}/{publishers.length}</span>
            </div>
            <div className="flex items-end gap-2">
              <span className="text-5xl font-black leading-none" style={{ color: publisherScoreColor(reliability) }}>{reliability.toFixed(0)}</span>
              <span className="pb-1 text-sm" style={{ color: 'var(--foreground-muted)' }}>/100</span>
            </div>
            <div className="h-2 rounded-full overflow-hidden mt-3" style={{ background: 'var(--ln-track-bg)' }}>
              <div className="h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, reliability))}%`, background: 'linear-gradient(90deg,#38bdf8,#a78bfa)' }} />
            </div>
            <select
              value={currentName}
              onChange={e => setSelectedPublisher(e.target.value)}
              className="mt-3 w-full rounded-lg px-2 py-1.5 text-xs font-bold outline-none"
              style={{ background: 'var(--ln-control-bg)', color: 'var(--foreground)', border: '1px solid var(--card-border)' }}
            >
              {publishers.map(p => <option key={p.publisher} value={p.publisher}>{p.publisher}</option>)}
            </select>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-[0.78fr_1.45fr_0.92fr] gap-3 items-stretch">
        <PublisherDNARadar publisher={publisher} rows={portfolioRows} vi={vi} />
        <PublisherSeriesCarousel rows={portfolioRows} selectedKey={selectedKey} vi={vi} />
        <PublisherBreakdown rows={portfolioRows} vi={vi} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[0.78fr_1.28fr_0.9fr] gap-3 items-start">
        <div className="grid grid-cols-1 gap-3">
          <GrowthChart volumeRows={publisherVolumes} vi={vi} />
          <Heatmap rows={portfolioRows} volumeRows={publisherVolumes} vi={vi} />
        </div>
        <PublisherPortfolioMap rows={portfolioRows} selectedKey={selectedKey} vi={vi} onSelect={onSelectSeries} />
        <PublisherRiskWatch rows={portfolioRows} vi={vi} />
      </div>
    </div>
  )
}

function scoreTooltip(row: LNRow) {
  const parts = String(row.score_components || row.evaluation_basis || '').split('\n').filter(Boolean)
  return [
    `Điểm LN: ${row.ln_score.toFixed(1)}/10`,
    `Tập mới nhất: ${row.months_since_last_release == null ? 'không rõ' : '~' + row.months_since_last_release.toFixed(1) + ' tháng trước'}`,
    `Nhịp ra tập TB: ${row.average_gap_months == null ? 'chưa đủ dữ liệu' : '~' + row.average_gap_months.toFixed(1) + ' tháng/tập'}`,
    `Nhà phát hành: ${row.publisher || '—'} (${row.publisher_activity || 'không rõ'})`,
    '',
    'Thành phần điểm:',
    ...(parts.length ? parts : ['Không có breakdown chi tiết.']),
  ].join('\n')
}

function dropTooltip(row: LNRow) {
  const parts = String(row.drop_components || row.drop_basis || '').split('\n').filter(Boolean)
  return [
    `Khả năng drop: ${fmtPercent(row.drop_percent)}`,
    `Điểm LN liên quan: ${row.ln_score.toFixed(1)}/10`,
    `Khung đánh giá: ${evalLabel(row.evalution)}`,
    '',
    'Thành phần rủi ro:',
    ...(parts.length ? parts : ['Không có breakdown chi tiết.']),
  ].join('\n')
}

async function loadNovelVolumeReleases(dashboardRows: LNRow[]): Promise<VolumeReleaseRow[]> {
  const publisherBySeries = new Map<number, string>()
  let seriesIds = Array.from(new Set(dashboardRows.map(row => {
    if (!row.lidex_series_id) return null
    publisherBySeries.set(row.lidex_series_id, row.publisher || 'Unknown')
    return row.lidex_series_id
  }).filter((id): id is number => Boolean(id))))

  if (seriesIds.length === 0) {
    const { data: seriesData, error: seriesError } = await supabase
      .from('series')
      .select('id, publisher')
      .eq('item_type', 'novel')
      .not('genres', 'cs', '{"Hentai"}')

    if (seriesError || !seriesData) {
      console.warn('[Dashboard] novel series fetch failed:', seriesError?.message)
      return []
    }

    seriesIds = seriesData.map((series: any) => {
      const id = Number(series.id)
      publisherBySeries.set(id, series.publisher || 'Unknown')
      return id
    }).filter(Boolean)
  }

  const releases: VolumeReleaseRow[] = []
  const batchSize = 200
  for (let i = 0; i < seriesIds.length; i += batchSize) {
    const chunk = seriesIds.slice(i, i + batchSize)
    const { data: volumeData, error: volumeError } = await supabase
      .from('volumes')
      .select('series_id, release_date, is_special')
      .in('series_id', chunk)
      .not('release_date', 'is', null)
      .limit(10000)

    if (volumeError) {
      console.warn('[Dashboard] volume fetch failed:', volumeError.message)
      continue
    }

    for (const volume of volumeData || []) {
      const special = (volume as any).is_special
      if (special === true || String(special).toLowerCase() === 'true') continue
      const seriesId = Number((volume as any).series_id)
      releases.push({
        series_id: seriesId,
        publisher: publisherBySeries.get(seriesId) || 'Unknown',
        release_date: String((volume as any).release_date).slice(0, 10),
      })
    }
  }

  return releases
}

async function loadPublisherLogos(): Promise<PublisherLogoMap> {
  const { data, error } = await supabase
    .from('publishers')
    .select('name, name_vi, logo_url')
    .not('logo_url', 'is', null)

  if (error || !data) {
    console.warn('[Dashboard] publisher logo fetch failed:', error?.message)
    return {}
  }

  const logos: PublisherLogoMap = {}
  for (const row of data as Array<{ name?: string | null; name_vi?: string | null; logo_url?: string | null }>) {
    if (!row.logo_url) continue
    if (row.name) logos[publisherKey(row.name)] = row.logo_url
    if (row.name_vi) logos[publisherKey(row.name_vi)] = row.logo_url
  }
  return logos
}

function LNWatchlist({ rows, onSelect, vi }: { rows: LNRow[]; onSelect: (row: LNRow) => void; vi: boolean }) {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [publisher, setPublisher] = useState('')
  const [releaseStatusFilter, setReleaseStatusFilter] = useState('')
  const [sortBy, setSortBy] = useState('scoreRelease')
  const [filtersOpen, setFiltersOpen] = useState(false)

  const statuses = useMemo(() => Array.from(new Set(rows.map(d => d.evalution).filter((v): v is string => Boolean(v))))
    .sort((a, b) => EVAL_ORDER.indexOf(a) - EVAL_ORDER.indexOf(b)), [rows])
  const publishers = useMemo(() => Array.from(new Set(rows.map(d => d.publisher).filter((v): v is string => Boolean(v)))).sort(), [rows])

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    const base = rows.filter(r => {
      const rs = releaseStatus(r)
      const blob = `${r.series_title} ${r.publisher} ${r.series_code} ${r.evalution} ${rs}`.toLowerCase()
      return (
        (!q || blob.includes(q)) &&
        (!status || r.evalution === status) &&
        (!publisher || r.publisher === publisher) &&
        (!releaseStatusFilter || rs === releaseStatusFilter)
      )
    })

    const withReleaseStatusPriority = (comparator: (a: LNRow, b: LNRow) => number) => (a: LNRow, b: LNRow) => {
      if (!releaseStatusFilter) {
        const statusDiff = releaseStatusPriority(a) - releaseStatusPriority(b)
        if (statusDiff !== 0) return statusDiff
      }
      return comparator(a, b)
    }

    const latest = (a: LNRow, b: LNRow) => String(b.max_release_at || '').localeCompare(String(a.max_release_at || ''))
    const sorters: Record<string, (a: LNRow, b: LNRow) => number> = {
      rank: withReleaseStatusPriority((a, b) => a.raw_rank - b.raw_rank),
      scoreRelease: withReleaseStatusPriority((a, b) => (b.ln_score - a.ln_score) || latest(a, b)),
      scoreDesc: withReleaseStatusPriority((a, b) => b.ln_score - a.ln_score),
      scoreAsc: withReleaseStatusPriority((a, b) => a.ln_score - b.ln_score),
      releaseDesc: withReleaseStatusPriority(latest),
      viewsDesc: withReleaseStatusPriority((a, b) => b.average_view_count - a.average_view_count),
      volumesDesc: withReleaseStatusPriority((a, b) => b.number_of_volumes - a.number_of_volumes),
      dropRiskDesc: withReleaseStatusPriority((a, b) => pctValue(b.drop_percent) - pctValue(a.drop_percent)),
      releaseStatus: (a, b) => (releaseStatusPriority(a) - releaseStatusPriority(b)) || (b.ln_score - a.ln_score) || latest(a, b),
    }

    return [...base].sort(sorters[sortBy] || sorters.scoreRelease)
  }, [rows, search, status, publisher, releaseStatusFilter, sortBy])

  const avg = filtered.length ? filtered.reduce((s, r) => s + r.ln_score, 0) / filtered.length : 0
  const good = filtered.filter(r => ['Good', 'Completed'].includes(r.evalution || '')).length
  const risky = filtered.filter(r => ['Dead', 'Dropped'].includes(r.evalution || '')).length
  const completed = filtered.filter(r => r.evalution === 'Completed').length
  const activeFilterCount = [status, publisher, releaseStatusFilter].filter(Boolean).length

  const stats = [
    [vi ? 'Series hiển thị' : 'Visible Series', filtered.length],
    [vi ? 'Điểm TB' : 'Avg Score', avg.toFixed(1)],
    [vi ? 'Tốt/Hoàn thành' : 'Good/Completed', good],
    [vi ? 'Gần chết/Đã drop' : 'Inactive/Dropped', risky],
    [vi ? 'Hoàn thành' : 'Completed', completed],
  ]

  return (
    <div className="space-y-3">
      <header className="text-center">
        <p className="text-[10px] font-black uppercase tracking-[.15em] mb-2 inline-flex items-center justify-center gap-2" style={{ color: '#7c6af5' }}>
          <span className="w-5 h-0.5 rounded-full" style={{ background: '#7c6af5' }} />
          {vi ? 'Vietnamese Light Novel DOA' : 'Vietnamese Light Novel DOA'}
        </p>
        <h2 className="text-xl sm:text-3xl font-black tracking-tight" style={{ color: 'var(--foreground)' }}>{vi ? 'Bảng xếp hạng Light Novel Việt Nam Ded or Alive' : 'Vietnamese Light Novel Ded or Alive Ranking'}</h2>
        <p className="text-xs mt-2 max-w-3xl mx-auto" style={{ color: 'var(--foreground-muted)' }}>{vi ? 'Xếp hạng theo Điểm LN, ngày phát hành gần nhất, tình trạng phát hành tại Việt Nam và khả năng bị drop.' : 'Ranked by LN Score, latest release date, Vietnamese release status, and drop risk.'}</p>
      </header>

      <div className="flex sm:grid sm:grid-cols-5 gap-2 overflow-x-auto pb-1">
        {stats.map(([label, value]) => (
          <div key={label} className="min-w-[106px] rounded-xl p-3 relative overflow-hidden" style={{ background: 'var(--ln-panel-bg-strong)', border: '1px solid var(--card-border)' }}>
            <div className="absolute top-0 left-0 right-0 h-0.5" style={{ background: 'rgba(124,106,245,.60)' }} />
            <p className="text-[8.5px] font-black uppercase tracking-[.12em]" style={{ color: 'var(--foreground-muted)' }}>{label}</p>
            <p className="text-xl font-black mt-1" style={{ color: 'var(--foreground)' }}>{String(value)}</p>
          </div>
        ))}
      </div>

      <div className="sticky top-0 z-20 rounded-xl p-3 backdrop-blur-xl" style={{ background: 'var(--ln-panel-bg-strong)', border: '1px solid var(--card-border)' }}>
        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: 'var(--foreground-muted)' }} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={vi ? 'Tìm tên truyện, nhà phát hành, mã series...' : 'Search title, publisher, series code...'}
              className="w-full pl-8 pr-3 py-2 rounded-lg text-xs outline-none"
              style={{ background: 'var(--ln-control-bg)', color: 'var(--foreground)', border: '1px solid var(--card-border)' }}
            />
          </div>

          <button
            onClick={() => setFiltersOpen(v => !v)}
            className="md:hidden flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-black"
            style={{
              background: 'var(--ln-control-bg)',
              color: activeFilterCount ? '#7c6af5' : 'var(--foreground-muted)',
              border: `1px solid ${activeFilterCount ? 'rgba(124,106,245,.6)' : 'var(--card-border)'}`,
            }}
          >
            <ListFilter className="w-3.5 h-3.5" />
            {vi ? 'Lọc' : 'Filters'}
            {activeFilterCount > 0 && <span className="rounded-full px-1.5 text-[10px]" style={{ background: '#7c6af5', color: '#fff' }}>{activeFilterCount}</span>}
          </button>

          <div className={`${filtersOpen ? 'flex' : 'hidden'} md:flex flex-col md:flex-row gap-2 w-full md:w-auto`}>
            <select value={status} onChange={e => setStatus(e.target.value)} className="px-3 py-2 rounded-lg text-xs font-semibold outline-none min-w-[140px]" style={{ background: 'var(--ln-control-bg)', color: 'var(--foreground)', border: '1px solid var(--card-border)' }}>
              <option value="">{vi ? 'Tất cả đánh giá' : 'All evaluations'}</option>
              {statuses.map(s => <option key={s} value={s}>{evalLabel(s, vi)}</option>)}
            </select>
            <select value={publisher} onChange={e => setPublisher(e.target.value)} className="px-3 py-2 rounded-lg text-xs font-semibold outline-none min-w-[150px]" style={{ background: 'var(--ln-control-bg)', color: 'var(--foreground)', border: '1px solid var(--card-border)' }}>
              <option value="">{vi ? 'Tất cả nhà phát hành' : 'All publishers'}</option>
              {publishers.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            <select value={releaseStatusFilter} onChange={e => setReleaseStatusFilter(e.target.value)} className="px-3 py-2 rounded-lg text-xs font-semibold outline-none min-w-[150px]" style={{ background: 'var(--ln-control-bg)', color: 'var(--foreground)', border: '1px solid var(--card-border)' }}>
              <option value="">{vi ? 'Tất cả trạng thái' : 'All statuses'}</option>
              <option value="Đang phát hành">{releaseStatusLabel('Đang phát hành', vi)}</option>
              <option value="Lâu lắm rồi chưa có tập mới">{releaseStatusLabel('Lâu lắm rồi chưa có tập mới', vi)}</option>
              <option value="Đã bắt kịp bản gốc JP">{releaseStatusLabel('Đã bắt kịp bản gốc JP', vi)}</option>
              <option value="Drop">{releaseStatusLabel('Drop', vi)}</option>
              <option value="Hoàn thành">{releaseStatusLabel('Hoàn thành', vi)}</option>
            </select>
            <select value={sortBy} onChange={e => setSortBy(e.target.value)} className="px-3 py-2 rounded-lg text-xs font-semibold outline-none min-w-[150px]" style={{ background: 'var(--ln-control-bg)', color: 'var(--foreground)', border: '1px solid var(--card-border)' }}>
              <option value="scoreRelease">{vi ? 'Điểm LN → Ngày ra' : 'LN Score → Release date'}</option>
              <option value="rank">{vi ? 'Xếp hạng gốc' : 'Original rank'}</option>
              <option value="scoreDesc">{vi ? 'Điểm cao → thấp' : 'Score high → low'}</option>
              <option value="scoreAsc">{vi ? 'Điểm thấp → cao' : 'Score low → high'}</option>
              <option value="releaseDesc">{vi ? 'Phát hành mới nhất' : 'Latest release'}</option>
              <option value="viewsDesc">{vi ? 'Lượt xem TB' : 'Average views'}</option>
              <option value="volumesDesc">{vi ? 'Số tập VN' : 'VN volumes'}</option>
              <option value="dropRiskDesc">{vi ? 'Drop cao → thấp' : 'Drop high → low'}</option>
            </select>
          </div>
        </div>
      </div>

      <div className="rounded-xl overflow-hidden" style={{ background: 'var(--ln-panel-bg-strong)', border: '1px solid var(--card-border)' }}>
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full min-w-[1120px] text-[12px] border-collapse">
            <thead style={{ background: 'var(--ln-control-bg)' }}>
              <tr style={{ color: 'var(--foreground-muted)', borderBottom: '1px solid rgba(136,146,170,.18)' }}>
                {(vi
                  ? ['Hạng', 'Series', 'Số tập', 'Ngày phát hành gần nhất', 'Nhà PH', 'Trạng thái', 'Điểm đánh giá', 'Khả năng drop', 'Đánh giá']
                  : ['Rank', 'Series', 'Volumes', 'Latest release', 'Publisher', 'Status', 'LN Score', 'Drop risk', 'Evaluation']
                ).map((h, i) => (
                  <th key={h} className={`${i === 0 ? 'text-center' : 'text-left'} font-black uppercase tracking-widest py-2.5 px-3 whitespace-nowrap`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={9} className="text-center py-10" style={{ color: 'var(--foreground-muted)' }}>{vi ? 'Không có series nào phù hợp với bộ lọc.' : 'No series match the current filters.'}</td></tr>
              ) : filtered.map((row, idx) => {
                const scoreBar = Math.max(0, Math.min(100, row.ln_score * 10))
                const riskBar = Math.max(0, Math.min(100, pctValue(row.drop_percent)))
                const rankBg = idx === 0 ? 'linear-gradient(135deg,#f6d860,#e8a800)' : idx === 1 ? 'linear-gradient(135deg,#d8dde8,#a5afc0)' : idx === 2 ? 'linear-gradient(135deg,#e8a86e,#c47730)' : 'var(--ln-muted-bg)'
                const rankColor = idx <= 2 ? '#161616' : 'var(--foreground-muted)'
                const rsStyle = releaseStatusStyle(row)
                const evalColor = statusColors[row.evalution || ''] || '#94a3b8'
                return (
                  <tr key={row.series_key} style={{ borderBottom: '1px solid var(--ln-row-border)' }}>
                    <td className="py-2.5 px-3 text-center"><span className="inline-flex items-center justify-center min-w-[34px] h-[34px] rounded-lg font-black text-[11px]" style={{ background: rankBg, color: rankColor }}>#{idx + 1}</span></td>
                    <td className="py-2.5 px-3">
                      <div className="flex items-center gap-3 min-w-[300px]">
                        {row.cover_url ? <img src={proxyImg(row.cover_url) || ''} alt="" className="w-[64px] h-[90px] object-cover rounded-lg shrink-0 shadow-lg" /> : <div className="w-[64px] h-[90px] rounded-lg shrink-0" style={{ background: 'rgba(124,106,245,.14)' }} />}
                        <div className="min-w-0">
                          <p className="font-black leading-snug line-clamp-2 max-w-[340px]" style={{ color: 'var(--foreground)' }}>{row.series_title}</p>
                          <p className="text-[10px] mt-1 font-semibold" style={{ color: 'var(--foreground-muted)' }}>ID {row.lidex_series_id || row.series_id || '—'} · {row.series_code || '—'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-2.5 px-3 tabular-nums" style={{ color: 'var(--foreground-secondary)' }}>{fmtNum(row.number_of_volumes, 0)}</td>
                    <td className="py-2.5 px-3 tabular-nums" style={{ color: 'var(--foreground-secondary)' }}>{fmtDate(row.max_release_at)}</td>
                    <td className="py-2.5 px-3" style={{ color: 'var(--foreground-secondary)' }}>{row.publisher || '—'}</td>
                    <td className="py-2.5 px-3"><span className="inline-flex rounded-full px-2.5 py-1 text-[10px] font-black whitespace-nowrap" style={{ color: rsStyle.color, background: rsStyle.bg, border: `1px solid ${rsStyle.border}` }}>{releaseStatusLabel(releaseStatus(row), vi)}</span></td>
                    <td className="py-2.5 px-3">
                      <div title={scoreTooltip(row)} className="cursor-help">
                        <p className="text-lg font-black leading-none" style={{ color: scoreColor(row.ln_score) }}>{row.ln_score.toFixed(1)}</p>
                        <div className="w-[68px] h-1 rounded-full mt-1 overflow-hidden" style={{ background: 'var(--ln-track-bg)' }}><div className="h-full rounded-full" style={{ width: `${scoreBar}%`, background: 'linear-gradient(90deg,#ef4444 0%,#eab308 50%,#22c55e 100%)' }} /></div>
                      </div>
                    </td>
                    <td className="py-2.5 px-3">
                      <div title={dropTooltip(row)} className="cursor-help">
                        <p className="text-sm font-black leading-none" style={{ color: dropColor(row.drop_percent) }}>{fmtPercent(row.drop_percent)}</p>
                        <div className="w-[68px] h-1 rounded-full mt-1 overflow-hidden" style={{ background: 'var(--ln-track-bg)' }}><div className="h-full rounded-full" style={{ width: `${riskBar}%`, background: 'linear-gradient(90deg,#22c55e 0%,#eab308 40%,#ef4444 80%)' }} /></div>
                      </div>
                    </td>
                    <td className="py-2.5 px-3"><span className="inline-flex rounded-full px-2.5 py-1 text-[10px] font-black whitespace-nowrap" style={{ color: evalColor, background: `${evalColor}20`, border: `1px solid ${evalColor}40` }}>{evalLabel(row.evalution, vi)}</span></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <div className="md:hidden">
          {filtered.map((row, idx) => {
            const scoreBar = Math.max(0, Math.min(100, row.ln_score * 10))
            const riskBar = Math.max(0, Math.min(100, pctValue(row.drop_percent)))
            const rsStyle = releaseStatusStyle(row)
            const evalColor = statusColors[row.evalution || ''] || '#94a3b8'
            const rankBg = idx === 0 ? 'linear-gradient(135deg,#f6d860,#e8a800)' : idx === 1 ? 'linear-gradient(135deg,#d8dde8,#a5afc0)' : idx === 2 ? 'linear-gradient(135deg,#e8a86e,#c47730)' : 'var(--ln-muted-bg)'
            return (
              <div key={row.series_key} className="p-3" style={{ borderBottom: '1px solid var(--ln-row-border)' }}>
                <div className="flex gap-3">
                  <div className="w-8 shrink-0 pt-1"><span className="inline-flex items-center justify-center w-8 h-8 rounded-lg font-black text-[10px]" style={{ background: rankBg, color: idx <= 2 ? '#161616' : 'var(--foreground-muted)' }}>#{idx + 1}</span></div>
                  {row.cover_url ? <img src={proxyImg(row.cover_url) || ''} alt="" className="w-[104px] h-[148px] object-cover rounded-lg shrink-0 shadow-lg" /> : <div className="w-[104px] h-[148px] rounded-lg shrink-0" style={{ background: 'rgba(124,106,245,.14)' }} />}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-black leading-snug line-clamp-4" style={{ color: 'var(--foreground)' }}>{row.series_title}</p>
                    <p className="text-[10px] mt-1 font-semibold" style={{ color: 'var(--foreground-muted)' }}>ID {row.lidex_series_id || row.series_id || '—'} · {row.series_code || '—'}</p>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      <span className="text-[10px] font-bold px-2 py-1 rounded-md" style={{ color: 'var(--foreground-muted)', background: 'var(--ln-muted-bg)' }}>{row.publisher || '—'}</span>
                      <span className="text-[10px] font-bold px-2 py-1 rounded-md" style={{ color: 'var(--foreground-muted)', background: 'var(--ln-muted-bg)' }}>{fmtDate(row.max_release_at)}</span>
                    </div>
                  </div>
                </div>

                <div className="pl-11 mt-2 flex flex-wrap gap-1.5">
                  <span className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5" style={{ background: 'var(--ln-control-bg)', border: '1px solid var(--card-border)' }}>
                    <span className="text-[9px] font-black uppercase" style={{ color: 'var(--foreground-muted)' }}>{vi ? 'Điểm' : 'Score'}</span>
                    <strong className="text-xs font-black" style={{ color: scoreColor(row.ln_score) }}>{row.ln_score.toFixed(1)}</strong>
                    <span className="w-10 h-1 rounded-full overflow-hidden" style={{ background: 'var(--ln-track-bg)' }}><span className="block h-full rounded-full" style={{ width: `${scoreBar}%`, background: 'linear-gradient(90deg,#ef4444 0%,#eab308 50%,#22c55e 100%)' }} /></span>
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5" style={{ background: 'var(--ln-control-bg)', border: '1px solid var(--card-border)' }}>
                    <span className="text-[9px] font-black uppercase" style={{ color: 'var(--foreground-muted)' }}>Drop</span>
                    <strong className="text-xs font-black" style={{ color: dropColor(row.drop_percent) }}>{fmtPercent(row.drop_percent)}</strong>
                    <span className="w-10 h-1 rounded-full overflow-hidden" style={{ background: 'var(--ln-track-bg)' }}><span className="block h-full rounded-full" style={{ width: `${riskBar}%`, background: 'linear-gradient(90deg,#22c55e 0%,#eab308 40%,#ef4444 80%)' }} /></span>
                  </span>
                  <span className="inline-flex rounded-lg px-2.5 py-1.5 text-[10px] font-black" style={{ color: evalColor, background: `${evalColor}20`, border: `1px solid ${evalColor}40` }}>{evalLabel(row.evalution, vi)}</span>
                  <span className="inline-flex rounded-lg px-2.5 py-1.5 text-[10px] font-black" style={{ color: rsStyle.color, background: rsStyle.bg, border: `1px solid ${rsStyle.border}` }}>{releaseStatusLabel(releaseStatus(row), vi)}</span>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export default function Dashboard() {
  const { locale } = useLocale()
  const vi = locale === 'vi'
  const [mode, setMode] = useState<Mode>('dashboard')
  const [rows, setRows] = useState<LNRow[]>([])
  const [volumeRows, setVolumeRows] = useState<VolumeReleaseRow[]>([])
  const [publisherLogos, setPublisherLogos] = useState<PublisherLogoMap>({})
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [selectedPublisher, setSelectedPublisher] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)

    const { data, error } = await supabase
      .from('ln_series_ranking')
      .select('*')
      .order('ln_score', { ascending: false })
      .order('max_release_at', { ascending: false })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    const mapped = mapRows((data || []) as RawRankingRow[])
    const hydrated = await hydrateRowsWithCanonicalSeries(mapped)
    const [fanHydrated, volumeReleases, logos] = await Promise.all([
      hydrateRowsWithFanVotes(hydrated),
      loadNovelVolumeReleases(hydrated),
      loadPublisherLogos(),
    ])
    setRows(fanHydrated)
    setVolumeRows(volumeReleases)
    setPublisherLogos(logos)
    setSelectedKey((fanHydrated.find(r => r.evalution === 'Good') || fanHydrated[0])?.series_key || null)
    setSelectedPublisher(buildPublishers(fanHydrated, volumeReleases).find(p => p.releases24 > 0)?.publisher || fanHydrated[0]?.publisher || null)
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const selected = useMemo(() => rows.find(r => r.series_key === selectedKey) || rows[0] || null, [rows, selectedKey])

  return (
    <div className="min-h-screen relative overflow-hidden" style={{ background: 'var(--background)' }}>
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-40 left-20 w-96 h-96 rounded-full blur-3xl" style={{ background: 'rgba(124,106,245,.10)' }} />
        <div className="absolute top-48 right-0 w-96 h-96 rounded-full blur-3xl" style={{ background: 'rgba(236,72,153,.07)' }} />
      </div>

      <div className="relative max-w-[1440px] mx-auto px-3 sm:px-4 lg:px-6 py-4 sm:py-5">
        <div className="flex items-center justify-between gap-2 mb-3">
          <ModeSwitch mode={mode} setMode={setMode} vi={vi} />
          <button onClick={load} className="p-1.5 rounded-lg transition-all hover:scale-110" style={{ background: 'var(--glass-bg)', border: '1px solid var(--card-border)' }} title={vi ? 'Làm mới' : 'Refresh'}>
            <RefreshCw className="w-4 h-4" style={{ color: 'var(--foreground-secondary)' }} />
          </button>
        </div>

        {loading ? (
          <div className="h-[60vh] flex items-center justify-center">
            <div className="flex items-center gap-3 text-sm" style={{ color: 'var(--foreground-secondary)' }}>
              <Loader2 className="w-5 h-5 animate-spin" />
              {vi ? 'Đang tải phân tích thị trường LN...' : 'Loading LN market analytics...'}
            </div>
          </div>
        ) : error ? (
          <Card className="p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 mt-0.5" style={{ color: '#f59e0b' }} />
              <div>
                <p className="font-bold" style={{ color: 'var(--foreground)' }}>{vi ? 'Không tải được dữ liệu dashboard' : 'Dashboard data failed to load'}</p>
                <p className="text-sm mt-1" style={{ color: 'var(--foreground-secondary)' }}>{error}</p>
              </div>
            </div>
          </Card>
        ) : mode === 'watchlist' ? (
          <LNWatchlist rows={rows} vi={vi} onSelect={(row) => { setSelectedKey(row.series_key); setMode('dashboard'); window.scrollTo({ top: 0, behavior: 'smooth' }) }} />
        ) : mode === 'publisher' ? (
          <PublisherFocusView rows={rows} volumeRows={volumeRows} publisherLogos={publisherLogos} selectedPublisher={selectedPublisher} setSelectedPublisher={setSelectedPublisher} selectedKey={selectedKey} vi={vi} onSelectSeries={(row) => { setSelectedKey(row.series_key); window.scrollTo({ top: 0, behavior: 'smooth' }) }} />
        ) : (
          <div className="space-y-4">
            <KpiStrip rows={rows} vi={vi} />

            <div className="grid grid-cols-1 xl:grid-cols-[1.7fr_0.9fr] gap-4">
              <ScatterPlot rows={rows} selectedKey={selectedKey} vi={vi} onSelect={row => setSelectedKey(row.series_key)} />
              <RadarChart row={selected} vi={vi} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
              <PublisherLeaderboard rows={rows} volumeRows={volumeRows} vi={vi} onSelectPublisher={(publisher) => { setSelectedPublisher(publisher); setMode('publisher'); window.scrollTo({ top: 0, behavior: 'smooth' }) }} />
              <GrowthChart volumeRows={volumeRows} vi={vi} />
              <Heatmap rows={rows} volumeRows={volumeRows} vi={vi} />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
