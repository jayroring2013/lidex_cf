'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useMemo, useState } from 'react'
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

type Kpis = {
  total_licensed_series: number
  active_series: number
  completed_series: number
  average_ln_score: number | null
  average_drop_percent: number | null
  active_publishers: number
  last_imported_at?: string | null
}

type LNRow = {
  series_key: string
  source_series_id: number | null
  series_code: string | null
  lidex_series_id?: number | null
  series_title: string
  publisher: string | null
  evaluation: string | null
  evaluation_basis?: string | null
  vn_status: string | null
  risk_band: string | null
  cover_url: string | null
  ln_score: number | null
  drop_percent?: number | null
  drop_probability: number | null
  original_status: string | null
  vn_volume_count: number | null
  original_volume_count: number | null
  catch_up_ratio: number | null
  series_last_release: string | null
  months_since_series_release: number | null
  series_avg_gap_months?: number | null
  publisher_activity?: string | null
  publisher_releases_last_12m?: number | null
  publisher_releases_last_24m?: number | null
  score_components?: string | null
  drop_components?: string | null
  release_speed_score?: number | null
  catch_up_score?: number | null
  popularity_score?: number | null
  publisher_reliability_score?: number | null
  completion_safety_score?: number | null
  market_momentum_score?: number | null
}

type PublisherRow = {
  publisher: string
  series_count: number
  avg_ln_score: number | null
  avg_drop_percent: number | null
  completion_rate_percent: number | null
  releases_last_12m: number | null
  releases_last_24m: number | null
  publisher_activity: string | null
}

type GrowthRow = {
  year: number
  volumes_released: number
  new_licenses: number
  market_growth_percent: number | null
}

type HeatmapRow = {
  publisher: string
  month_start: string
  month_label: string
  release_count: number
}

const statusColors: Record<string, string> = {
  Completed: '#22c55e',
  Good: '#38bdf8',
  Limping: '#f59e0b',
  Dead: '#ef4444',
  Dropped: '#a855f7',
}

const statusOrder: Record<string, number> = {
  Good: 1,
  Limping: 2,
  Dead: 3,
  Dropped: 4,
  Completed: 5,
}

function fmtNum(value: number | null | undefined, digits = 1) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—'
  return Number(value).toLocaleString(undefined, { maximumFractionDigits: digits })
}

function fmtScore(value: number | null | undefined) {
  if (value === null || value === undefined) return '—'
  return Number(value).toFixed(1)
}

function dropPercent(row: LNRow) {
  if (row.drop_percent !== undefined && row.drop_percent !== null) return Number(row.drop_percent)
  if (row.drop_probability !== undefined && row.drop_probability !== null) return Number(row.drop_probability) * 100
  return null
}

function colorForScore(score?: number | null) {
  if (score == null) return '#64748b'
  if (score >= 8) return '#22c55e'
  if (score >= 6) return '#38bdf8'
  if (score >= 4) return '#f59e0b'
  return '#ef4444'
}

function colorForDrop(drop?: number | null) {
  if (drop == null) return '#64748b'
  if (drop <= 25) return '#22c55e'
  if (drop <= 55) return '#f59e0b'
  return '#ef4444'
}

function proxyImg(url: string | null): string | null {
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
  if (row.lidex_series_id) return `/content/${row.lidex_series_id}`
  return `/browse?search=${encodeURIComponent(row.series_title)}`
}

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-xl ${className}`}
      style={{
        background: 'linear-gradient(180deg, rgba(10,15,30,0.94), rgba(10,15,30,0.84))',
        border: '1px solid rgba(148,163,184,0.16)',
        boxShadow: '0 8px 28px rgba(0,0,0,0.22)',
      }}
    >
      {children}
    </div>
  )
}

function KpiCard({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: any
  label: string
  value: string
  accent: string
}) {
  return (
    <Card className="p-3 overflow-hidden relative min-h-[86px]">
      <div className="absolute -right-8 -top-8 w-20 h-20 rounded-full blur-2xl" style={{ background: `${accent}22` }} />
      <div className="relative flex items-start justify-between gap-2">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.14em] leading-tight" style={{ color: 'rgba(148,163,184,0.78)' }}>
            {label}
          </p>
          <p className="text-xl sm:text-2xl font-black mt-2 leading-none" style={{ color: 'var(--foreground)' }}>
            {value}
          </p>
        </div>
        <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${accent}1f` }}>
          <Icon className="w-4 h-4" style={{ color: accent }} />
        </div>
      </div>
    </Card>
  )
}

function ModeSwitch({ mode, setMode }: { mode: 'dashboard' | 'watchlist'; setMode: (m: 'dashboard' | 'watchlist') => void }) {
  return (
    <div className="flex items-center gap-1 p-1 rounded-xl" style={{ background: 'rgba(15,23,42,0.8)', border: '1px solid rgba(148,163,184,0.16)' }}>
      <button
        onClick={() => setMode('dashboard')}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all"
        style={mode === 'dashboard' ? { background: '#6366f1', color: '#fff' } : { color: 'var(--foreground-secondary)' }}
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

function ScatterPlot({
  rows,
  selectedKey,
  onSelect,
}: {
  rows: LNRow[]
  selectedKey: string | null
  onSelect: (row: LNRow) => void
}) {
  const safeRows = rows.filter(r => r.evaluation !== 'Completed' && r.ln_score != null && dropPercent(r) != null)

  return (
    <Card className="p-4">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-3">
        <div>
          <p className="text-xs font-black uppercase tracking-wide" style={{ color: 'var(--foreground)' }}>LN Score vs Drop Risk</p>
          <p className="text-[11px] mt-0.5" style={{ color: 'var(--foreground-muted)' }}>Completed novels are hidden to focus on current market risk.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {['Good', 'Limping', 'Dead', 'Dropped'].map(s => (
            <span key={s} className="text-[10px] font-semibold flex items-center gap-1" style={{ color: 'var(--foreground-secondary)' }}>
              <span className="w-2 h-2 rounded-full" style={{ background: statusColors[s] }} />
              {s}
            </span>
          ))}
        </div>
      </div>

      <div className="relative h-[215px] sm:h-[255px] rounded-xl overflow-hidden" style={{ background: 'rgba(2,6,23,0.45)', border: '1px solid rgba(148,163,184,0.1)' }}>
        <div className="absolute inset-5">
          {[0, 25, 50, 75, 100].map(v => (
            <div key={`y-${v}`} className="absolute left-0 right-0 border-t border-dashed" style={{ top: `${100 - v}%`, borderColor: 'rgba(148,163,184,0.14)' }}>
              <span className="absolute -left-1 -translate-x-full -top-2 text-[9px]" style={{ color: 'var(--foreground-muted)' }}>{v}%</span>
            </div>
          ))}
          {[0, 2, 4, 6, 8, 10].map(v => (
            <div key={`x-${v}`} className="absolute top-0 bottom-0 border-l border-dashed" style={{ left: `${v * 10}%`, borderColor: 'rgba(148,163,184,0.1)' }}>
              <span className="absolute -bottom-4 -translate-x-1/2 text-[9px]" style={{ color: 'var(--foreground-muted)' }}>{v}</span>
            </div>
          ))}

          {safeRows.map(row => {
            const drop = dropPercent(row)
            const x = Math.max(0, Math.min(100, Number(row.ln_score) * 10))
            const y = 100 - Math.max(0, Math.min(100, Number(drop)))
            const active = selectedKey === row.series_key
            const color = statusColors[row.evaluation || ''] || colorForScore(row.ln_score)
            return (
              <button
                key={row.series_key}
                onClick={() => onSelect(row)}
                title={`${row.series_title} · LN ${row.ln_score} · Drop ${drop}%`}
                className="absolute rounded-full transition-all hover:scale-150"
                style={{
                  left: `${x}%`,
                  top: `${y}%`,
                  width: active ? 12 : 7,
                  height: active ? 12 : 7,
                  background: color,
                  border: active ? '2px solid #fff' : '1px solid rgba(255,255,255,0.35)',
                  boxShadow: active ? `0 0 0 6px ${color}25, 0 0 20px ${color}` : `0 0 10px ${color}55`,
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
  const axes = [
    ['Release Speed', row?.release_speed_score ?? 0, 'Avg gap + recency'],
    ['Catch-up', row?.catch_up_score ?? 0, 'VN/JP volume ratio'],
    ['Demand', row?.popularity_score ?? 0, 'View-count percentile'],
    ['Publisher', row?.publisher_reliability_score ?? 0, 'Publisher activity'],
    ['Safety', row?.completion_safety_score ?? 0, 'Inverse drop risk'],
    ['Momentum', row?.market_momentum_score ?? 0, 'Recent publisher releases'],
  ] as const

  const size = 188
  const cx = size / 2
  const cy = size / 2
  const maxR = 60
  const points = axes.map(([, value], i) => {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / axes.length
    const r = (Math.max(0, Math.min(10, value)) / 10) * maxR
    return `${cx + Math.cos(angle) * r},${cy + Math.sin(angle) * r}`
  }).join(' ')

  const grid = [0.33, 0.66, 1].map(level => axes.map(([,], i) => {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / axes.length
    const r = level * maxR
    return `${cx + Math.cos(angle) * r},${cy + Math.sin(angle) * r}`
  }).join(' '))

  const drop = row ? dropPercent(row) : null

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-wide" style={{ color: 'var(--foreground)' }}>Selected Series Profile</p>
          <p className="text-[11px] mt-0.5" style={{ color: 'var(--foreground-muted)' }}>Radar values are derived from your imported workbook metrics.</p>
        </div>
        {row?.cover_url && (
          <img src={proxyImg(row.cover_url) || ''} alt="" className="w-10 h-14 object-cover rounded-lg shrink-0" />
        )}
      </div>

      {row ? (
        <>
          <div className="mb-2">
            <p className="text-base font-black line-clamp-2 leading-snug" style={{ color: 'var(--foreground)' }}>{row.series_title}</p>
            <p className="text-[11px] mt-1" style={{ color: 'var(--foreground-muted)' }}>{row.publisher || 'Unknown'} · {row.vn_status || row.evaluation || '—'}</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-[190px_1fr] xl:grid-cols-1 gap-2 items-center">
            <div className="flex justify-center">
              <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="max-w-full">
                {grid.map((g, i) => (
                  <polygon key={i} points={g} fill="none" stroke="rgba(148,163,184,0.18)" strokeWidth="1" />
                ))}
                {axes.map(([label], i) => {
                  const angle = -Math.PI / 2 + (i * 2 * Math.PI) / axes.length
                  const x = cx + Math.cos(angle) * (maxR + 18)
                  const y = cy + Math.sin(angle) * (maxR + 18)
                  return (
                    <g key={label}>
                      <line x1={cx} y1={cy} x2={cx + Math.cos(angle) * maxR} y2={cy + Math.sin(angle) * maxR} stroke="rgba(148,163,184,0.14)" />
                      <text x={x} y={y} textAnchor="middle" dominantBaseline="middle" fontSize="8.5" fill="rgba(226,232,240,0.68)">{label}</text>
                    </g>
                  )
                })}
                <polygon points={points} fill="rgba(99,102,241,0.34)" stroke="#818cf8" strokeWidth="2" />
                {points.split(' ').map((p, i) => {
                  const [x, y] = p.split(',').map(Number)
                  return <circle key={i} cx={x} cy={y} r="3" fill="#c4b5fd" />
                })}
              </svg>
            </div>

            <div className="grid grid-cols-2 gap-1.5">
              {axes.map(([label, value, source]) => (
                <div key={label} className="rounded-lg px-2 py-1.5" style={{ background: 'rgba(15,23,42,0.72)', border: '1px solid rgba(148,163,184,0.1)' }} title={source}>
                  <p className="text-[9px] uppercase tracking-wide" style={{ color: 'var(--foreground-muted)' }}>{label}</p>
                  <p className="text-xs font-black" style={{ color: '#c4b5fd' }}>{fmtScore(value)}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 mt-3">
            <div className="rounded-lg p-2" style={{ background: 'rgba(34,197,94,0.1)' }}>
              <p className="text-[10px]" style={{ color: 'var(--foreground-muted)' }}>LN Score</p>
              <p className="text-lg font-black" style={{ color: colorForScore(row.ln_score) }}>{fmtScore(row.ln_score)}</p>
            </div>
            <div className="rounded-lg p-2" style={{ background: 'rgba(239,68,68,0.1)' }}>
              <p className="text-[10px]" style={{ color: 'var(--foreground-muted)' }}>Drop Risk</p>
              <p className="text-lg font-black" style={{ color: colorForDrop(drop) }}>{fmtNum(drop)}%</p>
            </div>
            <Link
              href={detailHref(row)}
              className="rounded-lg p-2 flex items-center justify-center gap-1 text-xs font-black transition-all hover:scale-[1.02]"
              style={{ background: 'rgba(99,102,241,0.18)', color: '#c4b5fd', border: '1px solid rgba(129,140,248,0.22)' }}
            >
              Open
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </>
      ) : (
        <div className="h-[260px] flex items-center justify-center text-sm" style={{ color: 'var(--foreground-muted)' }}>
          Select a point from the scatter chart.
        </div>
      )}
    </Card>
  )
}

function PublisherLeaderboard({ rows }: { rows: PublisherRow[] }) {
  const max = Math.max(...rows.map(r => r.releases_last_12m || 0), 1)

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-xs font-black uppercase tracking-wide" style={{ color: 'var(--foreground)' }}>Most Active Publishers</p>
          <p className="text-[11px] mt-0.5" style={{ color: 'var(--foreground-muted)' }}>Bar width is scaled against the top publisher.</p>
        </div>
        <Building2 className="w-4 h-4" style={{ color: '#38bdf8' }} />
      </div>

      <div className="space-y-2.5">
        {rows.slice(0, 7).map((row, i) => {
          const v = row.releases_last_12m || 0
          return (
            <div key={row.publisher}>
              <div className="flex items-center justify-between gap-3 text-[11px] mb-1">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-4 h-4 rounded-md flex items-center justify-center font-black text-[10px]" style={{ background: 'rgba(56,189,248,0.14)', color: '#38bdf8' }}>{i + 1}</span>
                  <span className="font-bold truncate" style={{ color: 'var(--foreground)' }}>{row.publisher}</span>
                </div>
                <span style={{ color: 'var(--foreground-muted)' }}>{v}/{max}</span>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(148,163,184,0.12)' }}>
                <div className="h-full rounded-full" style={{ width: `${(v / max) * 100}%`, background: 'linear-gradient(90deg, #38bdf8, #818cf8)' }} />
              </div>
              <div className="flex items-center justify-between text-[10px] mt-0.5" style={{ color: 'var(--foreground-muted)' }}>
                <span>Score {fmtScore(row.avg_ln_score)}</span>
                <span>Drop {fmtNum(row.avg_drop_percent)}%</span>
              </div>
            </div>
          )
        })}
      </div>
    </Card>
  )
}

function GrowthChart({ rows }: { rows: GrowthRow[] }) {
  const data = rows.filter(r => r.year && r.volumes_released != null).slice(-12)
  const w = 620
  const h = 175
  const pad = 28
  const maxY = Math.max(...data.map(d => d.volumes_released || 0), 1)
  const points = data.map((d, i) => {
    const x = pad + (i / Math.max(1, data.length - 1)) * (w - pad * 2)
    const y = h - pad - ((d.volumes_released || 0) / maxY) * (h - pad * 2)
    return { x, y, d }
  })
  const line = points.map(p => `${p.x},${p.y}`).join(' ')

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-2">
        <div>
          <p className="text-xs font-black uppercase tracking-wide" style={{ color: 'var(--foreground)' }}>Vietnamese LN Market Growth</p>
          <p className="text-[11px] mt-0.5" style={{ color: 'var(--foreground-muted)' }}>Volumes released per year.</p>
        </div>
        <TrendingUp className="w-4 h-4" style={{ color: '#22c55e' }} />
      </div>

      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${w} ${h}`} className="min-w-[480px] w-full h-[170px]">
          {[0, 0.25, 0.5, 0.75, 1].map((g, i) => (
            <line key={i} x1={pad} x2={w - pad} y1={pad + g * (h - pad * 2)} y2={pad + g * (h - pad * 2)} stroke="rgba(148,163,184,0.12)" strokeDasharray="5 5" />
          ))}
          <polyline points={line} fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          {points.map(p => (
            <g key={p.d.year}>
              <circle cx={p.x} cy={p.y} r="3.2" fill="#bbf7d0" stroke="#22c55e" strokeWidth="1.8" />
              <text x={p.x} y={h - 7} textAnchor="middle" fontSize="9.5" fill="rgba(226,232,240,0.55)">{p.d.year}</text>
            </g>
          ))}
        </svg>
      </div>
    </Card>
  )
}

function Heatmap({ rows }: { rows: HeatmapRow[] }) {
  const publishers = Array.from(new Set(rows.map(r => r.publisher))).slice(0, 8)
  const months = Array.from(new Map(rows.map(r => [r.month_start, r.month_label])).entries()).sort((a, b) => a[0].localeCompare(b[0]))
  const max = Math.max(...rows.map(r => r.release_count), 1)
  const lookup = new Map(rows.map(r => [`${r.publisher}|${r.month_start}`, r.release_count]))

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-xs font-black uppercase tracking-wide" style={{ color: 'var(--foreground)' }}>Publisher Release Heatmap</p>
          <p className="text-[11px] mt-0.5" style={{ color: 'var(--foreground-muted)' }}>Monthly release concentration.</p>
        </div>
        <BarChart3 className="w-4 h-4" style={{ color: '#ec4899' }} />
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[520px]">
          <div className="grid gap-1 mb-1.5" style={{ gridTemplateColumns: `125px repeat(${months.length}, 1fr)` }}>
            <div />
            {months.map(([m, label]) => <div key={m} className="text-[9px] text-center" style={{ color: 'var(--foreground-muted)' }}>{label}</div>)}
          </div>
          <div className="space-y-1">
            {publishers.map(pub => (
              <div key={pub} className="grid gap-1 items-center" style={{ gridTemplateColumns: `125px repeat(${months.length}, 1fr)` }}>
                <div className="text-[11px] truncate pr-2" style={{ color: 'var(--foreground-secondary)' }}>{pub}</div>
                {months.map(([m]) => {
                  const v = lookup.get(`${pub}|${m}`) || 0
                  const alpha = v === 0 ? 0.07 : 0.16 + (v / max) * 0.72
                  return <div key={m} title={`${pub}: ${v}`} className="h-4 rounded" style={{ background: `rgba(236,72,153,${alpha})`, border: '1px solid rgba(255,255,255,0.04)' }} />
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </Card>
  )
}

function LNWatchlist({ rows, onSelect }: { rows: LNRow[]; onSelect: (key: string) => void }) {
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('All')
  const [publisher, setPublisher] = useState('All')
  const [sort, setSort] = useState('status')

  const statuses: string[] = ['All', ...Array.from(new Set(rows.map(r => r.evaluation).filter((s): s is string => Boolean(s))))]
  const publishers: string[] = ['All', ...Array.from(new Set(rows.map(r => r.publisher).filter((s): s is string => Boolean(s))))]

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const base = rows.filter(row => {
      const textMatch = !q || `${row.series_title} ${row.publisher} ${row.series_code} ${row.vn_status}`.toLowerCase().includes(q)
      const statusMatch = status === 'All' || row.evaluation === status || row.vn_status === status
      const publisherMatch = publisher === 'All' || row.publisher === publisher
      return textMatch && statusMatch && publisherMatch
    })

    return [...base].sort((a, b) => {
      if (sort === 'score') return (b.ln_score ?? -1) - (a.ln_score ?? -1)
      if (sort === 'drop') return (dropPercent(b) ?? -1) - (dropPercent(a) ?? -1)
      if (sort === 'release') return String(b.series_last_release || '').localeCompare(String(a.series_last_release || ''))
      const ao = statusOrder[a.evaluation || ''] ?? 99
      const bo = statusOrder[b.evaluation || ''] ?? 99
      if (ao !== bo) return ao - bo
      return (b.ln_score ?? -1) - (a.ln_score ?? -1)
    })
  }, [rows, query, status, publisher, sort])

  return (
    <Card className="p-4">
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-3 mb-4">
        <div>
          <p className="text-xs font-black uppercase tracking-wide" style={{ color: 'var(--foreground)' }}>LN Watchlist</p>
          <p className="text-[11px] mt-0.5" style={{ color: 'var(--foreground-muted)' }}>
            All imported novels, ordered like the current LN DOA dashboard: active/watchlist first, completed last.
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <div className="relative col-span-2 md:col-span-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: 'var(--foreground-muted)' }} />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search..."
              className="pl-8 pr-3 py-1.5 rounded-lg text-xs outline-none w-full"
              style={{ background: 'rgba(15,23,42,0.8)', color: 'var(--foreground)', border: '1px solid rgba(148,163,184,0.16)' }}
            />
          </div>

          <select value={status} onChange={e => setStatus(e.target.value)} className="px-3 py-1.5 rounded-lg text-xs outline-none" style={{ background: 'rgba(15,23,42,0.8)', color: 'var(--foreground)', border: '1px solid rgba(148,163,184,0.16)' }}>
            {statuses.map(s => <option key={s} value={s}>{s}</option>)}
          </select>

          <select value={publisher} onChange={e => setPublisher(e.target.value)} className="px-3 py-1.5 rounded-lg text-xs outline-none" style={{ background: 'rgba(15,23,42,0.8)', color: 'var(--foreground)', border: '1px solid rgba(148,163,184,0.16)' }}>
            {publishers.map(s => <option key={s} value={s}>{s}</option>)}
          </select>

          <select value={sort} onChange={e => setSort(e.target.value)} className="px-3 py-1.5 rounded-lg text-xs outline-none" style={{ background: 'rgba(15,23,42,0.8)', color: 'var(--foreground)', border: '1px solid rgba(148,163,184,0.16)' }}>
            <option value="status">Status order</option>
            <option value="score">LN Score</option>
            <option value="drop">Drop Risk</option>
            <option value="release">Latest release</option>
          </select>
        </div>
      </div>

      <div className="mb-3 text-[11px]" style={{ color: 'var(--foreground-muted)' }}>
        Showing {filtered.length.toLocaleString()} / {rows.length.toLocaleString()} novels
      </div>

      <div className="hidden md:block overflow-x-auto">
        <table className="w-full min-w-[980px] text-xs">
          <thead>
            <tr style={{ color: 'var(--foreground-muted)', borderBottom: '1px solid rgba(148,163,184,0.12)' }}>
              <th className="text-left font-semibold py-2 px-2">Series</th>
              <th className="text-left font-semibold py-2 px-2">Publisher</th>
              <th className="text-center font-semibold py-2 px-2">VN/JP</th>
              <th className="text-center font-semibold py-2 px-2">LN</th>
              <th className="text-center font-semibold py-2 px-2">Drop</th>
              <th className="text-left font-semibold py-2 px-2">Status</th>
              <th className="text-right font-semibold py-2 px-2">Last Release</th>
              <th className="text-right font-semibold py-2 px-2">Action</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(row => {
              const drop = dropPercent(row)
              return (
                <tr key={row.series_key} style={{ borderBottom: '1px solid rgba(148,163,184,0.075)' }}>
                  <td className="py-2 px-2">
                    <div className="flex items-center gap-2 min-w-0">
                      {row.cover_url ? (
                        <img src={proxyImg(row.cover_url) || ''} alt="" className="w-8 h-11 object-cover rounded-md shrink-0" />
                      ) : (
                        <div className="w-8 h-11 rounded-md shrink-0" style={{ background: 'rgba(99,102,241,0.14)' }} />
                      )}
                      <div className="min-w-0">
                        <p className="font-bold line-clamp-1" style={{ color: 'var(--foreground)' }}>{row.series_title}</p>
                        <p className="text-[10px] mt-0.5" style={{ color: 'var(--foreground-muted)' }}>{row.series_code || row.source_series_id || row.series_key}</p>
                      </div>
                    </div>
                  </td>
                  <td className="py-2 px-2" style={{ color: 'var(--foreground-secondary)' }}>{row.publisher || '—'}</td>
                  <td className="py-2 px-2 text-center" style={{ color: 'var(--foreground-secondary)' }}>{row.vn_volume_count ?? '—'} / {row.original_volume_count ?? '—'}</td>
                  <td className="py-2 px-2 text-center"><span className="px-2 py-0.5 rounded-full font-black" style={{ color: colorForScore(row.ln_score), background: `${colorForScore(row.ln_score)}18` }}>{fmtScore(row.ln_score)}</span></td>
                  <td className="py-2 px-2 text-center"><span className="px-2 py-0.5 rounded-full font-black" style={{ color: colorForDrop(drop), background: `${colorForDrop(drop)}18` }}>{fmtNum(drop)}%</span></td>
                  <td className="py-2 px-2">
                    <p className="font-bold" style={{ color: statusColors[row.evaluation || ''] || 'var(--foreground-secondary)' }}>{row.evaluation || '—'}</p>
                    <p className="text-[10px] line-clamp-1" style={{ color: 'var(--foreground-muted)' }}>{row.vn_status || '—'}</p>
                  </td>
                  <td className="py-2 px-2 text-right" style={{ color: 'var(--foreground-muted)' }}>
                    {row.series_last_release || '—'}
                    <p className="text-[10px]">{fmtNum(row.months_since_series_release)} mo</p>
                  </td>
                  <td className="py-2 px-2 text-right">
                    <Link href={detailHref(row)} className="inline-flex items-center gap-1 px-2 py-1 rounded-md font-bold" style={{ background: 'rgba(99,102,241,0.15)', color: '#c4b5fd' }}>
                      Open <ArrowRight className="w-3 h-3" />
                    </Link>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="md:hidden space-y-2">
        {filtered.map(row => {
          const drop = dropPercent(row)
          return (
            <div key={row.series_key} className="rounded-lg p-2.5" style={{ background: 'rgba(15,23,42,0.7)', border: '1px solid rgba(148,163,184,0.12)' }}>
              <div className="flex gap-2">
                {row.cover_url ? (
                  <img src={proxyImg(row.cover_url) || ''} alt="" className="w-12 h-16 object-cover rounded-md shrink-0" />
                ) : (
                  <div className="w-12 h-16 rounded-md shrink-0" style={{ background: 'rgba(99,102,241,0.14)' }} />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-black leading-snug line-clamp-2" style={{ color: 'var(--foreground)' }}>{row.series_title}</p>
                  <p className="text-[11px] mt-1" style={{ color: 'var(--foreground-muted)' }}>{row.publisher || '—'} · {row.vn_volume_count ?? '—'} / {row.original_volume_count ?? '—'} vols</p>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black" style={{ color: colorForScore(row.ln_score), background: `${colorForScore(row.ln_score)}18` }}>LN {fmtScore(row.ln_score)}</span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black" style={{ color: colorForDrop(drop), background: `${colorForDrop(drop)}18` }}>Drop {fmtNum(drop)}%</span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black" style={{ color: statusColors[row.evaluation || ''] || '#94a3b8', background: 'rgba(148,163,184,0.12)' }}>{row.evaluation || '—'}</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between mt-2">
                <button onClick={() => onSelect(row.series_key)} className="text-[11px] font-bold" style={{ color: '#38bdf8' }}>Preview in chart</button>
                <Link href={detailHref(row)} className="text-[11px] font-bold flex items-center gap-1" style={{ color: '#c4b5fd' }}>Open <ArrowRight className="w-3 h-3" /></Link>
              </div>
            </div>
          )
        })}
      </div>
    </Card>
  )
}

export default function Dashboard() {
  const { locale } = useLocale()
  const vi = locale === 'vi'

  const [mode, setMode] = useState<'dashboard' | 'watchlist'>('dashboard')
  const [loading, setLoading] = useState(true)
  const [kpis, setKpis] = useState<Kpis | null>(null)
  const [allRows, setAllRows] = useState<LNRow[]>([])
  const [publishers, setPublishers] = useState<PublisherRow[]>([])
  const [growth, setGrowth] = useState<GrowthRow[]>([])
  const [heatmap, setHeatmap] = useState<HeatmapRow[]>([])
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)

    try {
      const [kpiRes, allRes, publisherRes, growthRes, heatmapRes] = await Promise.all([
        supabase.from('v_ln_dashboard_kpis').select('*').single(),
        supabase
          .from('ln_evaluation_series')
          .select('series_key,source_series_id,series_code,lidex_series_id,series_title,publisher,evaluation,evaluation_basis,vn_status,risk_band,cover_url,ln_score,drop_probability,original_status,vn_volume_count,original_volume_count,catch_up_ratio,series_last_release,months_since_series_release,series_avg_gap_months,publisher_activity,publisher_releases_last_12m,publisher_releases_last_24m,score_components,drop_components,release_speed_score,catch_up_score,popularity_score,publisher_reliability_score,completion_safety_score,market_momentum_score')
          .order('ln_score', { ascending: false }),
        supabase.from('v_ln_publisher_leaderboard').select('*').limit(12),
        supabase.from('v_ln_market_growth').select('*').order('year', { ascending: true }),
        supabase.from('v_ln_publisher_monthly_activity').select('*'),
      ])

      if (kpiRes.error) throw kpiRes.error
      if (allRes.error) throw allRes.error
      if (publisherRes.error) throw publisherRes.error
      if (growthRes.error) throw growthRes.error
      if (heatmapRes.error) throw heatmapRes.error

      const rows = (allRes.data || []) as LNRow[]

      setKpis(kpiRes.data as Kpis)
      setAllRows(rows)
      setPublishers((publisherRes.data || []) as PublisherRow[])
      setGrowth((growthRes.data || []) as GrowthRow[])
      setHeatmap((heatmapRes.data || []) as HeatmapRow[])

      const firstGood = rows.find(r => r.evaluation === 'Good' && r.ln_score != null) || rows.find(r => r.evaluation !== 'Completed') || rows[0]
      setSelectedKey(firstGood?.series_key || null)
    } catch (e: any) {
      console.error(e)
      setError(e?.message || 'Failed to load LN dashboard data.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const selected = useMemo(() => {
    if (!selectedKey) return allRows[0] || null
    return allRows.find(r => r.series_key === selectedKey) || allRows[0] || null
  }, [allRows, selectedKey])

  const scatterRows = useMemo(() => allRows.filter(r => r.evaluation !== 'Completed'), [allRows])

  return (
    <div className="min-h-screen relative overflow-hidden" style={{ background: 'var(--background)' }}>
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-40 left-20 w-96 h-96 rounded-full blur-3xl" style={{ background: 'rgba(99,102,241,0.10)' }} />
        <div className="absolute top-40 right-0 w-96 h-96 rounded-full blur-3xl" style={{ background: 'rgba(236,72,153,0.08)' }} />
      </div>

      <div className="relative max-w-7xl mx-auto px-3 sm:px-4 lg:px-8 py-4 sm:py-5">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3 mb-4">
          <div>
            <div className="inline-flex items-center gap-2 rounded-lg px-2.5 py-1 mb-2" style={{ background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(129,140,248,0.18)' }}>
              <Sparkles className="w-3 h-3" style={{ color: '#a5b4fc' }} />
              <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#a5b4fc' }}>
                {vi ? 'Thị trường Light Novel Việt Nam' : 'Vietnamese Light Novel Market'}
              </span>
            </div>
            <h1 className="text-2xl sm:text-4xl font-black tracking-tight" style={{ color: 'var(--foreground)' }}>
              LN Market Analytics
            </h1>
            <p className="text-xs sm:text-sm mt-1.5 max-w-2xl" style={{ color: 'var(--foreground-secondary)' }}>
              {vi
                ? 'Điểm LN, rủi ro drop, hoạt động nhà phát hành và watchlist các bộ LN đã được nhập từ workbook.'
                : 'LN score, drop risk, publisher activity, and the full imported LN watchlist.'}
            </p>
          </div>

          <div className="flex items-center gap-2 self-start">
            <ModeSwitch mode={mode} setMode={setMode} />
            <button
              onClick={load}
              className="p-1.5 rounded-lg transition-all hover:scale-110"
              style={{ background: 'var(--glass-bg)', border: '1px solid var(--card-border)' }}
              title="Refresh"
            >
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
          <LNWatchlist
            rows={allRows}
            onSelect={(key) => {
              setSelectedKey(key)
              setMode('dashboard')
              window.scrollTo({ top: 0, behavior: 'smooth' })
            }}
          />
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-2.5">
              <KpiCard icon={BookOpen} label="Total Licensed Series" value={fmtNum(kpis?.total_licensed_series, 0)} accent="#818cf8" />
              <KpiCard icon={Activity} label="Active Series" value={fmtNum(kpis?.active_series, 0)} accent="#22c55e" />
              <KpiCard icon={CheckCircle2} label="Completed Series" value={fmtNum(kpis?.completed_series, 0)} accent="#38bdf8" />
              <KpiCard icon={Gauge} label="Average LN Score" value={fmtScore(kpis?.average_ln_score)} accent="#fbbf24" />
              <KpiCard icon={AlertTriangle} label="Average Drop %" value={`${fmtNum(kpis?.average_drop_percent)}%`} accent="#fb7185" />
              <KpiCard icon={ShieldCheck} label="Active Publishers" value={fmtNum(kpis?.active_publishers, 0)} accent="#a78bfa" />
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-[1.7fr_0.8fr] gap-4">
              <ScatterPlot
                rows={scatterRows}
                selectedKey={selectedKey}
                onSelect={(row) => setSelectedKey(row.series_key)}
              />
              <RadarChart row={selected} />
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-[0.75fr_1fr] gap-4">
              <PublisherLeaderboard rows={publishers} />
              <GrowthChart rows={growth} />
            </div>

            <Heatmap rows={heatmap} />

            <div className="flex justify-center pt-1">
              <button
                onClick={() => {
                  setMode('watchlist')
                  window.scrollTo({ top: 0, behavior: 'smooth' })
                }}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-black transition-all hover:scale-[1.02]"
                style={{ background: 'rgba(34,197,94,0.14)', color: '#86efac', border: '1px solid rgba(34,197,94,0.22)' }}
              >
                Open LN Watchlist
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="text-center text-[10px] pb-2" style={{ color: 'var(--foreground-muted)' }}>
              Data source: imported workbook tables in Supabase. Last import: {kpis?.last_imported_at ? new Date(kpis.last_imported_at).toLocaleString() : '—'}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
