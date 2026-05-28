'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
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
  Sparkles,
  TrendingUp,
} from 'lucide-react'
import supabase from '@/lib/supabaseClient'
import { useLocale } from '@/contexts/LocaleContext'

type Mode = 'dashboard' | 'watchlist'

type RawRankingRow = {
  id: number
  series_title: string | null
  series_id: string | null
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

  release_pace_score: number
  catch_up_score: number
  demand_score: number
  publisher_support_score: number
  completion_safety_score: number
  momentum_score: number
}

type PublisherAgg = {
  publisher: string
  releases24: number
  seriesCount: number
  avgScore: number
  avgDrop: number
  marketShare: number
}

type GrowthRow = {
  year: number
  volumes: number
  seriesCount: number
}

type HeatmapRow = {
  publisher: string
  monthKey: string
  monthLabel: string
  count: number
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

function evalLabel(s?: string | null) {
  return ({ Completed: 'Hoàn thành', Good: 'Tốt', Limping: 'Cầm chừng', Dead: 'Gần chết', Dropped: 'Đã drop' } as Record<string, string>)[s || ''] || s || '—'
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

function detailHref(row: LNRow | null) {
  if (!row) return '/browse'
  // series_id in ln_series_ranking is the source/Hako ID, not guaranteed to match LiDex series.id.
  // Search is safer than redirecting to the wrong /content/[id].
  return `/browse?search=${encodeURIComponent(row.series_title)}`
}

function clamp10(v: number) {
  return Math.max(0, Math.min(10, Number.isFinite(v) ? v : 0))
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
      series_key: `${r.series_id || r.id}|${r.series_code || ''}`,
      series_title: r.series_title || 'Untitled',
      series_id: r.series_id,
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
      release_pace_score: releasePaceScore(avgGap, monthsSince),
      catch_up_score: catchUpScore(r),
      demand_score: demand(num(r.average_view_count)),
      publisher_support_score: publisherSupport(r.publisher_activity, releases24),
      completion_safety_score: safetyScore(r.evalution, drop),
      momentum_score: momentumScore(r.publisher_activity, releases24, monthsSince),
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

function KpiStrip({ rows }: { rows: LNRow[] }) {
  const avgScore = rows.length ? rows.reduce((s, r) => s + r.ln_score, 0) / rows.length : 0
  const avgDrop = rows.length ? rows.reduce((s, r) => s + pctValue(r.drop_percent), 0) / rows.length : 0
  const active = rows.filter(r => ['Đang phát hành', 'Đã bắt kịp bản gốc JP', 'Lâu lắm rồi chưa có tập mới'].includes(releaseStatus(r))).length
  const completed = rows.filter(r => r.evalution === 'Completed' || releaseStatus(r) === 'Hoàn thành').length
  const activePublishers = new Set(rows.filter(r => r.publisher_activity === 'Active').map(r => r.publisher).filter(Boolean)).size

  const items = [
    { label: 'Licensed', value: rows.length.toLocaleString('vi-VN'), icon: BookOpen, color: '#818cf8' },
    { label: 'Active', value: active.toLocaleString('vi-VN'), icon: Activity, color: '#22c55e' },
    { label: 'Completed', value: completed.toLocaleString('vi-VN'), icon: CheckCircle2, color: '#38bdf8' },
    { label: 'Avg Score', value: avgScore.toFixed(1), icon: Gauge, color: '#eab308' },
    { label: 'Avg Drop', value: `${avgDrop.toFixed(1)}%`, icon: AlertTriangle, color: '#fb7185' },
    { label: 'Active Pubs', value: activePublishers.toLocaleString('vi-VN'), icon: ShieldCheck, color: '#a78bfa' },
  ]

  return (
    <Card className="p-2.5">
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-2">
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

function ModeSwitch({ mode, setMode }: { mode: Mode; setMode: (m: Mode) => void }) {
  return (
    <div className="flex items-center gap-1 p-1 rounded-xl" style={{ background: 'var(--ln-panel-bg-strong)', border: '1px solid var(--card-border)' }}>
      <button
        onClick={() => setMode('dashboard')}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all"
        style={mode === 'dashboard' ? { background: '#7c6af5', color: '#fff' } : { color: 'var(--foreground-secondary)' }}
      >
        <LayoutDashboard className="w-3.5 h-3.5" />
        Dashboard
      </button>
      <button
        onClick={() => setMode('watchlist')}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all"
        style={mode === 'watchlist' ? { background: '#22c55e', color: '#03150a' } : { color: 'var(--foreground-secondary)' }}
      >
        <ListFilter className="w-3.5 h-3.5" />
        LN Watchlist
      </button>
    </div>
  )
}

function ScatterPlot({ rows, selectedKey, onSelect }: { rows: LNRow[]; selectedKey: string | null; onSelect: (row: LNRow) => void }) {
  const plotRows = rows.filter(r => r.evalution !== 'Completed')
  return (
    <Card className="p-3.5">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div>
          <p className="text-xs font-black uppercase tracking-wide" style={{ color: 'var(--foreground)' }}>LN Score vs Drop Risk</p>
          <p className="text-[11px]" style={{ color: 'var(--foreground-muted)' }}>Completed novels are hidden to focus on current market risk.</p>
        </div>
        <div className="hidden sm:flex flex-wrap gap-2">
          {['Good', 'Limping', 'Dead', 'Dropped'].map(s => (
            <span key={s} className="text-[10px] font-bold flex items-center gap-1" style={{ color: 'var(--foreground-secondary)' }}>
              <span className="w-2 h-2 rounded-full" style={{ background: statusColors[s] }} />
              {s}
            </span>
          ))}
        </div>
      </div>

      <div className="relative h-[300px] sm:h-[350px] rounded-lg overflow-hidden" style={{ background: 'var(--ln-chart-bg)', border: '1px solid var(--card-border)' }}>
        <div className="absolute inset-0 opacity-50 pointer-events-none">
          <div className="absolute left-0 top-0 w-1/2 h-1/2" style={{ background: 'linear-gradient(135deg, rgba(239,68,68,.08), transparent)' }} />
          <div className="absolute right-0 bottom-0 w-1/2 h-1/2" style={{ background: 'linear-gradient(315deg, rgba(34,197,94,.08), transparent)' }} />
        </div>

        <div className="absolute inset-7 sm:inset-8">
          {[0, 25, 50, 75, 100].map(v => (
            <div key={`y-${v}`} className="absolute left-0 right-0 border-t border-dashed" style={{ top: `${100 - v}%`, borderColor: 'rgba(136,146,170,.16)' }}>
              <span className="absolute -left-1 -translate-x-full -top-2 text-[9px]" style={{ color: 'var(--foreground-muted)' }}>{v}%</span>
            </div>
          ))}
          {[0, 2, 4, 6, 8, 10].map(v => (
            <div key={`x-${v}`} className="absolute top-0 bottom-0 border-l border-dashed" style={{ left: `${v * 10}%`, borderColor: 'rgba(136,146,170,.10)' }}>
              <span className="absolute -bottom-4 -translate-x-1/2 text-[9px]" style={{ color: 'var(--foreground-muted)' }}>{v}</span>
            </div>
          ))}

          <span className="absolute left-2 top-2 text-[10px] font-black uppercase" style={{ color: '#ef4444' }}>High Risk</span>
          <span className="absolute right-2 top-2 text-[10px] font-black uppercase" style={{ color: '#eab308' }}>Popular Risk</span>
          <span className="absolute left-2 bottom-2 text-[10px] font-black uppercase" style={{ color: '#a78bfa' }}>Stalled</span>
          <span className="absolute right-2 bottom-2 text-[10px] font-black uppercase" style={{ color: '#22c55e' }}>Healthy</span>

          {plotRows.map(row => {
            const x = Math.max(0, Math.min(100, row.ln_score * 10))
            const y = 100 - Math.max(0, Math.min(100, pctValue(row.drop_percent)))
            const active = row.series_key === selectedKey
            const color = statusColors[row.evalution || ''] || scoreColor(row.ln_score)
            return (
              <button
                key={row.series_key}
                onClick={() => onSelect(row)}
                title={`${row.series_title}\nLN ${row.ln_score.toFixed(1)} · Drop ${fmtPercent(row.drop_percent)}`}
                className="absolute rounded-full transition-all hover:scale-150"
                style={{
                  left: `${x}%`,
                  top: `${y}%`,
                  width: active ? 15 : 8,
                  height: active ? 15 : 8,
                  background: color,
                  border: active ? '2px solid #fff' : '1px solid rgba(255,255,255,.35)',
                  boxShadow: active ? `0 0 0 8px ${color}26, 0 0 26px ${color}` : `0 0 12px ${color}66`,
                  transform: 'translate(-50%, -50%)',
                }}
              />
            )
          })}
        </div>

        <div className="absolute left-4 bottom-2 text-[10px]" style={{ color: 'var(--foreground-muted)' }}>LN Score →</div>
        <div className="absolute left-2 top-1/2 -rotate-90 text-[10px]" style={{ color: 'var(--foreground-muted)' }}>Drop Probability</div>
      </div>
    </Card>
  )
}

function RadarChart({ row }: { row: LNRow | null }) {
  const axes = row ? [
    ['Release Pace', row.release_pace_score, 'Average gap + latest release recency'],
    ['Catch-up', row.catch_up_score, 'VN volumes compared with original volumes'],
    ['Demand', row.demand_score, 'Average view count percentile'],
    ['Publisher', row.publisher_support_score, 'Publisher activity + 24M release output'],
    ['Safety', row.completion_safety_score, 'Inverse of drop probability'],
    ['Momentum', row.momentum_score, 'Publisher support + recent release recency'],
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
        <span style={{ color: 'var(--foreground-muted)' }}>Select a series</span>
      </Card>
    )
  }

  const percentile = row.ln_score > 0 ? 100 - Math.round(row.raw_rank / 236 * 100) : null
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
          <p className="text-xs font-black uppercase tracking-wide" style={{ color: 'var(--foreground)' }}>Selected Series Profile</p>
          <p className="text-[11px] mt-0.5" style={{ color: 'var(--foreground-muted)' }}>Radar values use your imported workbook metrics.</p>
          <h2 className="text-base sm:text-lg font-black leading-snug mt-2 line-clamp-3" style={{ color: 'var(--foreground)' }}>{row.series_title}</h2>
          <div className="flex flex-wrap gap-1.5 mt-2">
            <span className="rounded-full px-2 py-0.5 text-[10px] font-black" style={{ color: rsStyle.color, background: rsStyle.bg, border: `1px solid ${rsStyle.border}` }}>{releaseStatus(row)}</span>
            <span className="rounded-full px-2 py-0.5 text-[10px] font-black" style={{ color: 'var(--foreground-muted)', background: 'var(--ln-muted-bg)' }}>{row.publisher || '—'}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2 mt-3">
        <div className="rounded-lg p-2" style={{ background: 'rgba(34,197,94,.10)' }}>
          <p className="text-[9px] uppercase font-black" style={{ color: 'var(--foreground-muted)' }}>LN Score</p>
          <p className="text-xl font-black" style={{ color: scoreColor(row.ln_score) }}>{fmtScore(row.ln_score)}</p>
        </div>
        <div className="rounded-lg p-2" style={{ background: 'rgba(239,68,68,.10)' }}>
          <p className="text-[9px] uppercase font-black" style={{ color: 'var(--foreground-muted)' }}>Drop</p>
          <p className="text-xl font-black" style={{ color: dropColor(row.drop_percent) }}>{fmtPercent(row.drop_percent)}</p>
        </div>
        <div className="rounded-lg p-2" style={{ background: 'rgba(124,106,245,.11)' }}>
          <p className="text-[9px] uppercase font-black" style={{ color: 'var(--foreground-muted)' }}>VN/JP</p>
          <p className="text-sm font-black" style={{ color: '#c4b5fd' }}>{fmtNum(row.number_of_volumes, 0)}/{fmtNum(row.original_volumes, 0)}</p>
        </div>
        <Link href={detailHref(row)} className="rounded-lg p-2 flex items-center justify-center gap-1 text-xs font-black transition-all hover:scale-[1.02]" style={{ background: 'rgba(124,106,245,.18)', color: '#c4b5fd', border: '1px solid rgba(124,106,245,.28)' }}>
          Open
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-[220px_1fr] xl:grid-cols-1 gap-2 mt-2 items-center">
        <div className="flex justify-center">
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

        <div className="grid grid-cols-2 gap-1.5">
          {axes.map(([label, value, source]) => (
            <div key={label} title={source} className="rounded-lg px-2 py-1.5" style={{ background: 'var(--ln-panel-bg)', border: '1px solid var(--card-border)' }}>
              <p className="text-[9px] uppercase font-black" style={{ color: 'var(--foreground-muted)' }}>{label}</p>
              <p className="text-xs font-black" style={{ color: '#c4b5fd' }}>{fmtScore(value)}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 mt-2 text-[11px]" style={{ color: 'var(--foreground-muted)' }}>
        <div>Latest: <span style={{ color: 'var(--foreground-secondary)' }}>{fmtDate(row.max_release_at)}</span></div>
        <div>JP: <span style={{ color: 'var(--foreground-secondary)' }}>{row.original_status || '—'}</span></div>
        <div>Avg gap: <span style={{ color: 'var(--foreground-secondary)' }}>{row.average_gap_months == null ? '—' : `${fmtNum(row.average_gap_months)}m`}</span></div>
        <div>Demand rank: <span style={{ color: 'var(--foreground-secondary)' }}>{percentile == null ? '—' : `Top ${Math.max(1, 100 - percentile)}%`}</span></div>
      </div>
    </Card>
  )
}

function buildPublishers(rows: LNRow[]) {
  const groups = new Map<string, LNRow[]>()
  for (const row of rows) {
    const key = row.publisher || 'Unknown'
    groups.set(key, [...(groups.get(key) || []), row])
  }
  const totalReleases = Array.from(groups.values()).reduce((s, items) => s + Math.max(...items.map(i => i.publisher_releases_last_24m), 0), 0) || 1
  return Array.from(groups.entries()).map(([publisher, items]): PublisherAgg => {
    const releases24 = Math.max(...items.map(i => i.publisher_releases_last_24m), 0)
    return {
      publisher,
      releases24,
      seriesCount: items.length,
      avgScore: items.reduce((s, i) => s + i.ln_score, 0) / items.length,
      avgDrop: items.reduce((s, i) => s + pctValue(i.drop_percent), 0) / items.length,
      marketShare: releases24 / totalReleases * 100,
    }
  }).sort((a, b) => b.releases24 - a.releases24 || b.seriesCount - a.seriesCount)
}

function PublisherLeaderboard({ rows }: { rows: LNRow[] }) {
  const publishers = buildPublishers(rows).slice(0, 6)
  const max = Math.max(...publishers.map(p => p.releases24), 1)

  return (
    <Card className="p-3 h-[226px] overflow-hidden">
      <div className="flex items-center justify-between mb-2">
        <div>
          <p className="text-[11px] font-black uppercase tracking-wide" style={{ color: 'var(--foreground)' }}>Most Active Publishers</p>
          <p className="text-[10px]" style={{ color: 'var(--foreground-muted)' }}>Release output, score, and completion proxy.</p>
        </div>
        <Building2 className="w-4 h-4" style={{ color: '#38bdf8' }} />
      </div>

      <div className="grid grid-cols-[1.05fr_0.9fr_0.55fr_0.6fr] gap-2 px-1 pb-1 text-[9px] font-black uppercase tracking-wide" style={{ color: 'var(--foreground-muted)' }}>
        <span>Publisher</span>
        <span>Releases</span>
        <span className="text-right">Score</span>
        <span className="text-right">Safe</span>
      </div>

      <div className="space-y-1.5">
        {publishers.map((p, i) => {
          const width = (p.releases24 / max) * 100
          const completionProxy = Math.max(0, Math.min(100, 100 - p.avgDrop))
          return (
            <div key={p.publisher} className="grid grid-cols-[1.05fr_0.9fr_0.55fr_0.6fr] gap-2 items-center">
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
            </div>
          )
        })}
      </div>
    </Card>
  )
}

function buildGrowth(rows: LNRow[]) {
  const map = new Map<number, GrowthRow>()
  for (const row of rows) {
    if (!row.max_release_at) continue
    const year = new Date(row.max_release_at).getFullYear()
    if (!Number.isFinite(year)) continue
    const prev = map.get(year) || { year, volumes: 0, seriesCount: 0 }
    prev.volumes += row.number_of_volumes
    prev.seriesCount += 1
    map.set(year, prev)
  }
  return Array.from(map.values()).sort((a, b) => a.year - b.year).slice(-12)
}

function GrowthChart({ rows }: { rows: LNRow[] }) {
  const data = buildGrowth(rows)
  const w = 520
  const h = 148
  const pad = 24
  const maxY = Math.max(...data.map(d => d.volumes), 1)
  const points = data.map((d, i) => {
    const x = pad + i / Math.max(1, data.length - 1) * (w - pad * 2)
    const y = h - pad - d.volumes / maxY * (h - pad * 2)
    return { x, y, d }
  })
  const line = points.map(p => `${p.x},${p.y}`).join(' ')

  return (
    <Card className="p-3 h-[226px] overflow-hidden">
      <div className="flex items-center justify-between mb-1.5">
        <div>
          <p className="text-[11px] font-black uppercase tracking-wide" style={{ color: 'var(--foreground)' }}>Vietnamese LN Market Growth</p>
          <p className="text-[10px]" style={{ color: 'var(--foreground-muted)' }}>VN volume proxy by latest-release year.</p>
        </div>
        <TrendingUp className="w-4 h-4" style={{ color: '#22c55e' }} />
      </div>

      <div className="flex items-center gap-4 mb-1 text-[10px]" style={{ color: 'var(--foreground-secondary)' }}>
        <span className="inline-flex items-center gap-1"><span className="w-3 h-0.5 rounded-full" style={{ background: '#22c55e' }} /> Volumes</span>
        <span className="inline-flex items-center gap-1"><span className="w-3 h-0.5 rounded-full" style={{ background: '#38bdf8' }} /> Series count</span>
      </div>

      <div className="overflow-hidden">
        <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-[166px]">
          {[0, .25, .5, .75, 1].map((g, i) => (
            <line key={i} x1={pad} x2={w - pad} y1={pad + g * (h - pad * 2)} y2={pad + g * (h - pad * 2)} stroke="rgba(136,146,170,.14)" strokeDasharray="5 5" />
          ))}
          <polyline points={line} fill="none" stroke="#22c55e" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          {points.map(p => (
            <g key={p.d.year}>
              <circle cx={p.x} cy={p.y} r="3" fill="#bbf7d0" stroke="#22c55e" strokeWidth="1.6" />
              <text x={p.x} y={h - 5} textAnchor="middle" fontSize="8.5" fill="rgba(232,236,244,.55)">{p.d.year}</text>
            </g>
          ))}
        </svg>
      </div>
    </Card>
  )
}

function buildHeatmap(rows: LNRow[]) {
  const cutoff = new Date()
  cutoff.setMonth(cutoff.getMonth() - 11)
  cutoff.setDate(1)
  const map = new Map<string, HeatmapRow>()
  for (const row of rows) {
    if (!row.max_release_at) continue
    const d = new Date(row.max_release_at)
    if (Number.isNaN(d.getTime()) || d < cutoff) continue
    const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
    const monthLabel = d.toLocaleString('en-US', { month: 'short' })
    const publisher = row.publisher || 'Unknown'
    const key = `${publisher}|${monthKey}`
    const prev = map.get(key) || { publisher, monthKey, monthLabel, count: 0 }
    prev.count += 1
    map.set(key, prev)
  }
  return Array.from(map.values()).sort((a, b) => a.monthKey.localeCompare(b.monthKey) || a.publisher.localeCompare(b.publisher))
}

function Heatmap({ rows }: { rows: LNRow[] }) {
  const data = buildHeatmap(rows)
  const publishers = buildPublishers(rows).slice(0, 6).map(p => p.publisher)
  const months = Array.from(new Map(data.map(d => [d.monthKey, d.monthLabel])).entries()).sort((a, b) => a[0].localeCompare(b[0]))
  const max = Math.max(...data.map(d => d.count), 1)
  const lookup = new Map(data.map(d => [`${d.publisher}|${d.monthKey}`, d.count]))

  return (
    <Card className="p-3 h-[226px] overflow-hidden">
      <div className="flex items-center justify-between mb-2">
        <div>
          <p className="text-[11px] font-black uppercase tracking-wide" style={{ color: 'var(--foreground)' }}>Publisher Release Activity</p>
          <p className="text-[10px]" style={{ color: 'var(--foreground-muted)' }}>Latest-release concentration.</p>
        </div>
        <BarChart3 className="w-4 h-4" style={{ color: '#ec4899' }} />
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[350px]">
          <div className="grid gap-1 mb-1" style={{ gridTemplateColumns: `74px repeat(${months.length}, 1fr)` }}>
            <div />
            {months.map(([key, label]) => (
              <div key={key} className="text-[8px] text-center" style={{ color: 'var(--foreground-muted)' }}>{label}</div>
            ))}
          </div>

          <div className="space-y-1">
            {publishers.map(pub => (
              <div key={pub} className="grid gap-1 items-center" style={{ gridTemplateColumns: `74px repeat(${months.length}, 1fr)` }}>
                <div className="text-[10px] truncate pr-1 font-semibold" style={{ color: 'var(--foreground-secondary)' }}>{pub}</div>
                {months.map(([key]) => {
                  const v = lookup.get(`${pub}|${key}`) || 0
                  const alpha = v === 0 ? .08 : .18 + v / max * .76
                  return <div key={key} title={`${pub}: ${v}`} className="h-5 rounded-sm" style={{ background: `rgba(124,106,245,${alpha})`, border: '1px solid rgba(255,255,255,.04)' }} />
                })}
              </div>
            ))}
          </div>

          <div className="flex items-center gap-2 mt-2 pl-[74px]">
            <span className="text-[9px]" style={{ color: 'var(--foreground-muted)' }}>0</span>
            <div className="h-2 flex-1 rounded-full" style={{ background: 'linear-gradient(90deg,rgba(124,106,245,.18),#3b82f6,#22c5b8)' }} />
            <span className="text-[9px]" style={{ color: 'var(--foreground-muted)' }}>{max}+</span>
          </div>
        </div>
      </div>
    </Card>
  )
}

function scoreTooltip(row: LNRow) {
  const parts = String(row.score_components || row.evaluation_basis || '').split('\n').filter(Boolean)
  return [
    `Điểm LN: ${row.ln_score.toFixed(1)}/10`,
    `Tập mới nhất: ${row.months_since_last_release == null ? 'không rõ' : '~' + row.months_since_last_release.toFixed(1) + ' tháng trước'}`,
    `Tiến độ VN/JP: ${fmtNum(row.number_of_volumes, 0)}/${fmtNum(row.original_volumes, 0)} tập`,
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

function LNWatchlist({ rows, onSelect }: { rows: LNRow[]; onSelect: (row: LNRow) => void }) {
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
    ['Series hiển thị', filtered.length],
    ['Điểm TB', avg.toFixed(1)],
    ['Tốt/Hoàn thành', good],
    ['Gần chết/Đã drop', risky],
    ['Hoàn thành', completed],
  ]

  return (
    <div className="space-y-3">
      <header className="text-center">
        <p className="text-[10px] font-black uppercase tracking-[.15em] mb-2 inline-flex items-center justify-center gap-2" style={{ color: '#7c6af5' }}>
          <span className="w-5 h-0.5 rounded-full" style={{ background: '#7c6af5' }} />
          Vietnamese Light Novel DOA
        </p>
        <h2 className="text-xl sm:text-3xl font-black tracking-tight" style={{ color: 'var(--foreground)' }}>Bảng xếp hạng Light Novel Việt Nam Ded or Alive</h2>
        <p className="text-xs mt-2 max-w-3xl mx-auto" style={{ color: 'var(--foreground-muted)' }}>Xếp hạng theo Điểm LN, ngày phát hành gần nhất, tình trạng phát hành tại Việt Nam và khả năng bị drop.</p>
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
              placeholder="Tìm tên truyện, nhà phát hành, mã series..."
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
            Lọc
            {activeFilterCount > 0 && <span className="rounded-full px-1.5 text-[10px]" style={{ background: '#7c6af5', color: '#fff' }}>{activeFilterCount}</span>}
          </button>

          <div className={`${filtersOpen ? 'flex' : 'hidden'} md:flex flex-col md:flex-row gap-2 w-full md:w-auto`}>
            <select value={status} onChange={e => setStatus(e.target.value)} className="px-3 py-2 rounded-lg text-xs font-semibold outline-none min-w-[140px]" style={{ background: 'var(--ln-control-bg)', color: 'var(--foreground)', border: '1px solid var(--card-border)' }}>
              <option value="">Tất cả đánh giá</option>
              {statuses.map(s => <option key={s} value={s}>{evalLabel(s)}</option>)}
            </select>
            <select value={publisher} onChange={e => setPublisher(e.target.value)} className="px-3 py-2 rounded-lg text-xs font-semibold outline-none min-w-[150px]" style={{ background: 'var(--ln-control-bg)', color: 'var(--foreground)', border: '1px solid var(--card-border)' }}>
              <option value="">Tất cả nhà phát hành</option>
              {publishers.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            <select value={releaseStatusFilter} onChange={e => setReleaseStatusFilter(e.target.value)} className="px-3 py-2 rounded-lg text-xs font-semibold outline-none min-w-[150px]" style={{ background: 'var(--ln-control-bg)', color: 'var(--foreground)', border: '1px solid var(--card-border)' }}>
              <option value="">Tất cả trạng thái</option>
              <option value="Đang phát hành">Đang phát hành</option>
              <option value="Lâu lắm rồi chưa có tập mới">Lâu rồi chưa ra</option>
              <option value="Đã bắt kịp bản gốc JP">Đã bắt kịp JP</option>
              <option value="Drop">Đã drop</option>
              <option value="Hoàn thành">Hoàn thành</option>
            </select>
            <select value={sortBy} onChange={e => setSortBy(e.target.value)} className="px-3 py-2 rounded-lg text-xs font-semibold outline-none min-w-[150px]" style={{ background: 'var(--ln-control-bg)', color: 'var(--foreground)', border: '1px solid var(--card-border)' }}>
              <option value="scoreRelease">Điểm LN → Ngày ra</option>
              <option value="rank">Xếp hạng gốc</option>
              <option value="scoreDesc">Điểm cao → thấp</option>
              <option value="scoreAsc">Điểm thấp → cao</option>
              <option value="releaseDesc">Phát hành mới nhất</option>
              <option value="viewsDesc">Lượt xem TB</option>
              <option value="volumesDesc">Số tập VN</option>
              <option value="dropRiskDesc">Drop cao → thấp</option>
            </select>
          </div>
        </div>
      </div>

      <div className="rounded-xl overflow-hidden" style={{ background: 'var(--ln-panel-bg-strong)', border: '1px solid var(--card-border)' }}>
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full min-w-[1120px] text-[12px] border-collapse">
            <thead style={{ background: 'var(--ln-control-bg)' }}>
              <tr style={{ color: 'var(--foreground-muted)', borderBottom: '1px solid rgba(136,146,170,.18)' }}>
                {['Hạng', 'Series', 'Số tập', 'Ngày phát hành gần nhất', 'Nhà PH', 'Trạng thái', 'Điểm đánh giá', 'Khả năng drop', 'Đánh giá'].map((h, i) => (
                  <th key={h} className={`${i === 0 ? 'text-center' : 'text-left'} font-black uppercase tracking-widest py-2.5 px-3 whitespace-nowrap`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={9} className="text-center py-10" style={{ color: 'var(--foreground-muted)' }}>Không có series nào phù hợp với bộ lọc.</td></tr>
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
                          <p className="text-[10px] mt-1 font-semibold" style={{ color: 'var(--foreground-muted)' }}>ID {row.series_id || '—'} · {row.series_code || '—'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-2.5 px-3 tabular-nums" style={{ color: 'var(--foreground-secondary)' }}>{fmtNum(row.number_of_volumes, 0)}</td>
                    <td className="py-2.5 px-3 tabular-nums" style={{ color: 'var(--foreground-secondary)' }}>{fmtDate(row.max_release_at)}</td>
                    <td className="py-2.5 px-3" style={{ color: 'var(--foreground-secondary)' }}>{row.publisher || '—'}</td>
                    <td className="py-2.5 px-3"><span className="inline-flex rounded-full px-2.5 py-1 text-[10px] font-black whitespace-nowrap" style={{ color: rsStyle.color, background: rsStyle.bg, border: `1px solid ${rsStyle.border}` }}>{releaseStatus(row)}</span></td>
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
                    <td className="py-2.5 px-3"><span className="inline-flex rounded-full px-2.5 py-1 text-[10px] font-black whitespace-nowrap" style={{ color: evalColor, background: `${evalColor}20`, border: `1px solid ${evalColor}40` }}>{evalLabel(row.evalution)}</span></td>
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
                    <p className="text-[10px] mt-1 font-semibold" style={{ color: 'var(--foreground-muted)' }}>ID {row.series_id || '—'} · {row.series_code || '—'}</p>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      <span className="text-[10px] font-bold px-2 py-1 rounded-md" style={{ color: 'var(--foreground-muted)', background: 'var(--ln-muted-bg)' }}>{row.publisher || '—'}</span>
                      <span className="text-[10px] font-bold px-2 py-1 rounded-md" style={{ color: 'var(--foreground-muted)', background: 'var(--ln-muted-bg)' }}>{fmtDate(row.max_release_at)}</span>
                    </div>
                  </div>
                </div>

                <div className="pl-11 mt-2 flex flex-wrap gap-1.5">
                  <span className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5" style={{ background: 'var(--ln-control-bg)', border: '1px solid var(--card-border)' }}>
                    <span className="text-[9px] font-black uppercase" style={{ color: 'var(--foreground-muted)' }}>Điểm</span>
                    <strong className="text-xs font-black" style={{ color: scoreColor(row.ln_score) }}>{row.ln_score.toFixed(1)}</strong>
                    <span className="w-10 h-1 rounded-full overflow-hidden" style={{ background: 'var(--ln-track-bg)' }}><span className="block h-full rounded-full" style={{ width: `${scoreBar}%`, background: 'linear-gradient(90deg,#ef4444 0%,#eab308 50%,#22c55e 100%)' }} /></span>
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5" style={{ background: 'var(--ln-control-bg)', border: '1px solid var(--card-border)' }}>
                    <span className="text-[9px] font-black uppercase" style={{ color: 'var(--foreground-muted)' }}>Drop</span>
                    <strong className="text-xs font-black" style={{ color: dropColor(row.drop_percent) }}>{fmtPercent(row.drop_percent)}</strong>
                    <span className="w-10 h-1 rounded-full overflow-hidden" style={{ background: 'var(--ln-track-bg)' }}><span className="block h-full rounded-full" style={{ width: `${riskBar}%`, background: 'linear-gradient(90deg,#22c55e 0%,#eab308 40%,#ef4444 80%)' }} /></span>
                  </span>
                  <span className="inline-flex rounded-lg px-2.5 py-1.5 text-[10px] font-black" style={{ color: evalColor, background: `${evalColor}20`, border: `1px solid ${evalColor}40` }}>{evalLabel(row.evalution)}</span>
                  <span className="inline-flex rounded-lg px-2.5 py-1.5 text-[10px] font-black" style={{ color: rsStyle.color, background: rsStyle.bg, border: `1px solid ${rsStyle.border}` }}>{releaseStatus(row)}</span>
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
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
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
    setRows(mapped)
    setSelectedKey((mapped.find(r => r.evalution === 'Good') || mapped[0])?.series_key || null)
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
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3 mb-4">
          <div>
            <div className="inline-flex items-center gap-2 rounded-lg px-2.5 py-1 mb-2" style={{ background: 'rgba(124,106,245,.12)', border: '1px solid rgba(124,106,245,.22)' }}>
              <Sparkles className="w-3 h-3" style={{ color: '#a78bfa' }} />
              <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#a78bfa' }}>
                {vi ? 'Thị trường Light Novel Việt Nam' : 'Vietnamese Light Novel Market'}
              </span>
            </div>
            <h1 className="text-2xl sm:text-4xl font-black tracking-tight" style={{ color: 'var(--foreground)' }}>LN Market Analytics</h1>
            <p className="text-xs sm:text-sm mt-1.5 max-w-2xl" style={{ color: 'var(--foreground-secondary)' }}>
              {vi ? 'Điểm LN, rủi ro drop, hoạt động nhà phát hành và watchlist từ bảng ln_series_ranking.' : 'LN score, drop risk, publisher activity, and watchlist from ln_series_ranking.'}
            </p>
          </div>

          <div className="flex items-center gap-2 self-start">
            <ModeSwitch mode={mode} setMode={setMode} />
            <button onClick={load} className="p-1.5 rounded-lg transition-all hover:scale-110" style={{ background: 'var(--glass-bg)', border: '1px solid var(--card-border)' }} title="Refresh">
              <RefreshCw className="w-4 h-4" style={{ color: 'var(--foreground-secondary)' }} />
            </button>
          </div>
        </div>

        {loading ? (
          <div className="h-[60vh] flex items-center justify-center">
            <div className="flex items-center gap-3 text-sm" style={{ color: 'var(--foreground-secondary)' }}>
              <Loader2 className="w-5 h-5 animate-spin" />
              Loading LN market analytics...
            </div>
          </div>
        ) : error ? (
          <Card className="p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 mt-0.5" style={{ color: '#f59e0b' }} />
              <div>
                <p className="font-bold" style={{ color: 'var(--foreground)' }}>Dashboard data failed to load</p>
                <p className="text-sm mt-1" style={{ color: 'var(--foreground-secondary)' }}>{error}</p>
              </div>
            </div>
          </Card>
        ) : mode === 'watchlist' ? (
          <LNWatchlist rows={rows} onSelect={(row) => { setSelectedKey(row.series_key); setMode('dashboard'); window.scrollTo({ top: 0, behavior: 'smooth' }) }} />
        ) : (
          <div className="space-y-4">
            <KpiStrip rows={rows} />

            <div className="grid grid-cols-1 xl:grid-cols-[1.7fr_0.9fr] gap-4">
              <ScatterPlot rows={rows} selectedKey={selectedKey} onSelect={row => setSelectedKey(row.series_key)} />
              <RadarChart row={selected} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
              <PublisherLeaderboard rows={rows} />
              <GrowthChart rows={rows} />
              <Heatmap rows={rows} />
            </div>

            <div className="flex justify-center pt-1">
              <button onClick={() => { setMode('watchlist'); window.scrollTo({ top: 0, behavior: 'smooth' }) }} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-black transition-all hover:scale-[1.02]" style={{ background: 'rgba(34,197,94,.14)', color: '#86efac', border: '1px solid rgba(34,197,94,.22)' }}>
                Open LN Watchlist
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
