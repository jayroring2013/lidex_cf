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
  Flame,
  Gauge,
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

type ScatterRow = {
  series_key: string
  source_series_id: number | null
  series_code: string | null
  series_title: string
  publisher: string | null
  evaluation: string | null
  vn_status: string | null
  risk_band: string | null
  cover_url: string | null
  ln_score: number | null
  drop_percent: number | null
  drop_probability: number | null
  original_status: string | null
  vn_volume_count: number | null
  original_volume_count: number | null
  catch_up_ratio: number | null
  series_last_release: string | null
  months_since_series_release: number | null
}

type RadarRow = {
  series_key: string
  series_title: string
  publisher: string | null
  cover_url: string | null
  ln_score: number | null
  drop_percent: number | null
  evaluation: string | null
  vn_status: string | null
  release_speed_score: number | null
  catch_up_score: number | null
  popularity_score: number | null
  publisher_reliability_score: number | null
  completion_safety_score: number | null
  market_momentum_score: number | null
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

type OngoingRow = {
  series_key: string
  source_series_id: number | null
  series_code: string | null
  series_title: string
  publisher: string | null
  cover_url: string | null
  ln_score: number | null
  drop_percent: number | null
  evaluation: string | null
  vn_status: string | null
  original_status: string | null
  vn_volume_count: number | null
  original_volume_count: number | null
  series_last_release: string | null
  months_since_series_release: number | null
  score_components: string | null
  drop_components: string | null
  evaluation_basis: string | null
}

const statusColors: Record<string, string> = {
  Completed: '#22c55e',
  Good: '#38bdf8',
  Limping: '#f59e0b',
  Dead: '#ef4444',
  Dropped: '#a855f7',
}

function fmtNum(value: number | null | undefined, digits = 1) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—'
  return Number(value).toLocaleString(undefined, { maximumFractionDigits: digits })
}

function fmtScore(value: number | null | undefined) {
  if (value === null || value === undefined) return '—'
  return Number(value).toFixed(1)
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

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-3xl ${className}`}
      style={{
        background: 'linear-gradient(180deg, rgba(15,23,42,0.86), rgba(15,23,42,0.54))',
        border: '1px solid rgba(148,163,184,0.16)',
        boxShadow: '0 18px 60px rgba(0,0,0,0.28)',
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
  sub,
}: {
  icon: any
  label: string
  value: string
  accent: string
  sub?: string
}) {
  return (
    <Card className="p-4 sm:p-5 overflow-hidden relative">
      <div
        className="absolute -right-8 -top-8 w-24 h-24 rounded-full blur-2xl"
        style={{ background: `${accent}33` }}
      />
      <div className="relative flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--foreground-muted)' }}>
            {label}
          </p>
          <p className="text-2xl sm:text-3xl font-black mt-2" style={{ color: 'var(--foreground)' }}>
            {value}
          </p>
          {sub && (
            <p className="text-xs mt-1" style={{ color: 'var(--foreground-secondary)' }}>
              {sub}
            </p>
          )}
        </div>
        <div className="w-10 h-10 rounded-2xl flex items-center justify-center" style={{ background: `${accent}20` }}>
          <Icon className="w-5 h-5" style={{ color: accent }} />
        </div>
      </div>
    </Card>
  )
}

function ScatterPlot({
  rows,
  selectedKey,
  onSelect,
}: {
  rows: ScatterRow[]
  selectedKey: string | null
  onSelect: (row: ScatterRow) => void
}) {
  const safeRows = rows.filter(r => r.ln_score != null && r.drop_percent != null)

  return (
    <Card className="p-5 lg:p-6">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-5">
        <div>
          <p className="text-sm font-bold" style={{ color: 'var(--foreground)' }}>LN Score vs Drop Risk</p>
          <p className="text-xs mt-1" style={{ color: 'var(--foreground-muted)' }}>Each dot represents one Vietnamese licensed LN series.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {['Good', 'Limping', 'Dead', 'Dropped', 'Completed'].map(s => (
            <span key={s} className="text-[11px] font-semibold flex items-center gap-1" style={{ color: 'var(--foreground-secondary)' }}>
              <span className="w-2 h-2 rounded-full" style={{ background: statusColors[s] }} />
              {s}
            </span>
          ))}
        </div>
      </div>

      <div className="relative h-[300px] sm:h-[360px] rounded-2xl overflow-hidden" style={{ background: 'rgba(2,6,23,0.45)', border: '1px solid rgba(148,163,184,0.1)' }}>
        <div className="absolute inset-7 sm:inset-6">
          {[0, 25, 50, 75, 100].map(v => (
            <div key={`y-${v}`} className="absolute left-0 right-0 border-t border-dashed" style={{ top: `${100 - v}%`, borderColor: 'rgba(148,163,184,0.14)' }}>
              <span className="absolute -left-1 -translate-x-full -top-2 text-[10px]" style={{ color: 'var(--foreground-muted)' }}>{v}%</span>
            </div>
          ))}
          {[0, 2, 4, 6, 8, 10].map(v => (
            <div key={`x-${v}`} className="absolute top-0 bottom-0 border-l border-dashed" style={{ left: `${v * 10}%`, borderColor: 'rgba(148,163,184,0.1)' }}>
              <span className="absolute -bottom-5 -translate-x-1/2 text-[10px]" style={{ color: 'var(--foreground-muted)' }}>{v}</span>
            </div>
          ))}

          {safeRows.map(row => {
            const x = Math.max(0, Math.min(100, Number(row.ln_score) * 10))
            const y = 100 - Math.max(0, Math.min(100, Number(row.drop_percent)))
            const active = selectedKey === row.series_key
            const color = statusColors[row.evaluation || ''] || colorForScore(row.ln_score)
            return (
              <button
                key={row.series_key}
                onClick={() => onSelect(row)}
                title={`${row.series_title} · LN ${row.ln_score} · Drop ${row.drop_percent}%`}
                className="absolute rounded-full transition-all hover:scale-150"
                style={{
                  left: `${x}%`,
                  top: `${y}%`,
                  width: active ? 15 : 9,
                  height: active ? 15 : 9,
                  background: color,
                  border: active ? '2px solid #fff' : '1px solid rgba(255,255,255,0.35)',
                  boxShadow: active ? `0 0 0 7px ${color}25, 0 0 24px ${color}` : `0 0 12px ${color}66`,
                  transform: 'translate(-50%, -50%)',
                }}
              />
            )
          })}
        </div>

        <div className="absolute left-4 bottom-3 text-[11px]" style={{ color: 'var(--foreground-muted)' }}>LN Score →</div>
        <div className="absolute left-2 top-1/2 -rotate-90 text-[11px]" style={{ color: 'var(--foreground-muted)' }}>Drop Probability</div>
      </div>
    </Card>
  )
}

function RadarChart({ row }: { row: RadarRow | null }) {
  const axes = [
    ['Release Speed', row?.release_speed_score ?? 0],
    ['Catch-up', row?.catch_up_score ?? 0],
    ['Popularity', row?.popularity_score ?? 0],
    ['Publisher', row?.publisher_reliability_score ?? 0],
    ['Safety', row?.completion_safety_score ?? 0],
    ['Momentum', row?.market_momentum_score ?? 0],
  ] as const

  const size = 240
  const cx = size / 2
  const cy = size / 2
  const maxR = 82
  const points = axes.map(([, value], i) => {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / axes.length
    const r = (Math.max(0, Math.min(10, value)) / 10) * maxR
    return `${cx + Math.cos(angle) * r},${cy + Math.sin(angle) * r}`
  }).join(' ')

  const grid = [0.25, 0.5, 0.75, 1].map(level => axes.map(([,], i) => {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / axes.length
    const r = level * maxR
    return `${cx + Math.cos(angle) * r},${cy + Math.sin(angle) * r}`
  }).join(' '))

  return (
    <Card className="p-5 lg:p-6">
      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          <p className="text-sm font-bold" style={{ color: 'var(--foreground)' }}>Selected Series Profile</p>
          <p className="text-xs mt-1" style={{ color: 'var(--foreground-muted)' }}>Radar-style health breakdown from imported Excel metrics.</p>
        </div>
        {row?.cover_url && (
          <img src={proxyImg(row.cover_url) || ''} alt="" className="w-12 h-16 object-cover rounded-lg" />
        )}
      </div>

      {row ? (
        <>
          <div className="mb-3">
            <p className="text-lg font-black line-clamp-2" style={{ color: 'var(--foreground)' }}>{row.series_title}</p>
            <p className="text-xs mt-1" style={{ color: 'var(--foreground-muted)' }}>{row.publisher || 'Unknown publisher'} · {row.vn_status || row.evaluation || '—'}</p>
          </div>

          <div className="flex justify-center">
            <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="max-w-full">
              {grid.map((g, i) => (
                <polygon key={i} points={g} fill="none" stroke="rgba(148,163,184,0.18)" strokeWidth="1" />
              ))}
              {axes.map(([label], i) => {
                const angle = -Math.PI / 2 + (i * 2 * Math.PI) / axes.length
                const x = cx + Math.cos(angle) * (maxR + 24)
                const y = cy + Math.sin(angle) * (maxR + 24)
                return (
                  <g key={label}>
                    <line x1={cx} y1={cy} x2={cx + Math.cos(angle) * maxR} y2={cy + Math.sin(angle) * maxR} stroke="rgba(148,163,184,0.14)" />
                    <text x={x} y={y} textAnchor="middle" dominantBaseline="middle" fontSize="10" fill="rgba(226,232,240,0.68)">{label}</text>
                  </g>
                )
              })}
              <polygon points={points} fill="rgba(99,102,241,0.35)" stroke="#818cf8" strokeWidth="2" />
              {points.split(' ').map((p, i) => {
                const [x, y] = p.split(',').map(Number)
                return <circle key={i} cx={x} cy={y} r="3.5" fill="#c4b5fd" />
              })}
            </svg>
          </div>

          <div className="grid grid-cols-2 gap-3 mt-2">
            <div className="rounded-2xl p-3" style={{ background: 'rgba(34,197,94,0.1)' }}>
              <p className="text-xs" style={{ color: 'var(--foreground-muted)' }}>LN Score</p>
              <p className="text-xl font-black" style={{ color: colorForScore(row.ln_score) }}>{fmtScore(row.ln_score)}</p>
            </div>
            <div className="rounded-2xl p-3" style={{ background: 'rgba(239,68,68,0.1)' }}>
              <p className="text-xs" style={{ color: 'var(--foreground-muted)' }}>Drop Risk</p>
              <p className="text-xl font-black" style={{ color: colorForDrop(row.drop_percent) }}>{fmtNum(row.drop_percent)}%</p>
            </div>
          </div>
        </>
      ) : (
        <div className="h-[360px] flex items-center justify-center text-sm" style={{ color: 'var(--foreground-muted)' }}>
          Select a point from the scatter chart.
        </div>
      )}
    </Card>
  )
}

function PublisherLeaderboard({ rows }: { rows: PublisherRow[] }) {
  const max = Math.max(...rows.map(r => r.releases_last_12m || 0), 1)
  return (
    <Card className="p-5 lg:p-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <p className="text-sm font-bold" style={{ color: 'var(--foreground)' }}>Most Active Publishers</p>
          <p className="text-xs mt-1" style={{ color: 'var(--foreground-muted)' }}>Ranked by releases in the last 12 months.</p>
        </div>
        <Building2 className="w-5 h-5" style={{ color: '#38bdf8' }} />
      </div>

      <div className="space-y-4">
        {rows.slice(0, 8).map((row, i) => (
          <div key={row.publisher}>
            <div className="flex items-center justify-between gap-3 text-xs mb-1.5">
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-5 h-5 rounded-lg flex items-center justify-center font-black" style={{ background: 'rgba(56,189,248,0.14)', color: '#38bdf8' }}>{i + 1}</span>
                <span className="font-bold truncate" style={{ color: 'var(--foreground)' }}>{row.publisher}</span>
              </div>
              <span style={{ color: 'var(--foreground-muted)' }}>{row.releases_last_12m || 0} releases</span>
            </div>
            <div className="h-2 rounded-full overflow-hidden" style={{ background: 'rgba(148,163,184,0.12)' }}>
              <div className="h-full rounded-full" style={{ width: `${((row.releases_last_12m || 0) / max) * 100}%`, background: 'linear-gradient(90deg, #38bdf8, #818cf8)' }} />
            </div>
            <div className="flex items-center justify-between text-[11px] mt-1" style={{ color: 'var(--foreground-muted)' }}>
              <span>Avg score {fmtScore(row.avg_ln_score)}</span>
              <span>Drop {fmtNum(row.avg_drop_percent)}%</span>
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}

function GrowthChart({ rows }: { rows: GrowthRow[] }) {
  const data = rows.filter(r => r.year && r.volumes_released != null).slice(-12)
  const w = 720
  const h = 260
  const pad = 34
  const maxY = Math.max(...data.map(d => d.volumes_released || 0), 1)
  const points = data.map((d, i) => {
    const x = pad + (i / Math.max(1, data.length - 1)) * (w - pad * 2)
    const y = h - pad - ((d.volumes_released || 0) / maxY) * (h - pad * 2)
    return { x, y, d }
  })
  const line = points.map(p => `${p.x},${p.y}`).join(' ')

  return (
    <Card className="p-5 lg:p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-sm font-bold" style={{ color: 'var(--foreground)' }}>Vietnamese LN Market Growth</p>
          <p className="text-xs mt-1" style={{ color: 'var(--foreground-muted)' }}>Volumes released per year from imported licensed books.</p>
        </div>
        <TrendingUp className="w-5 h-5" style={{ color: '#22c55e' }} />
      </div>

      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${w} ${h}`} className="min-w-[520px] w-full h-[240px] sm:h-[260px]">
          {[0, 0.25, 0.5, 0.75, 1].map((g, i) => (
            <line key={i} x1={pad} x2={w - pad} y1={pad + g * (h - pad * 2)} y2={pad + g * (h - pad * 2)} stroke="rgba(148,163,184,0.12)" strokeDasharray="5 5" />
          ))}
          <polyline points={line} fill="none" stroke="#22c55e" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          {points.map(p => (
            <g key={p.d.year}>
              <circle cx={p.x} cy={p.y} r="4" fill="#bbf7d0" stroke="#22c55e" strokeWidth="2" />
              <text x={p.x} y={h - 10} textAnchor="middle" fontSize="11" fill="rgba(226,232,240,0.55)">{p.d.year}</text>
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
    <Card className="p-5 lg:p-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <p className="text-sm font-bold" style={{ color: 'var(--foreground)' }}>Publisher Release Heatmap</p>
          <p className="text-xs mt-1" style={{ color: 'var(--foreground-muted)' }}>Monthly release concentration by publisher.</p>
        </div>
        <BarChart3 className="w-5 h-5" style={{ color: '#ec4899' }} />
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[560px]">
          <div className="grid gap-1 mb-2" style={{ gridTemplateColumns: `150px repeat(${months.length}, 1fr)` }}>
            <div />
            {months.map(([m, label]) => <div key={m} className="text-[10px] text-center" style={{ color: 'var(--foreground-muted)' }}>{label}</div>)}
          </div>
          <div className="space-y-1">
            {publishers.map(pub => (
              <div key={pub} className="grid gap-1 items-center" style={{ gridTemplateColumns: `150px repeat(${months.length}, 1fr)` }}>
                <div className="text-xs truncate pr-2" style={{ color: 'var(--foreground-secondary)' }}>{pub}</div>
                {months.map(([m]) => {
                  const v = lookup.get(`${pub}|${m}`) || 0
                  const alpha = v === 0 ? 0.08 : 0.18 + (v / max) * 0.72
                  return <div key={m} title={`${pub}: ${v}`} className="h-7 rounded-md" style={{ background: `rgba(236,72,153,${alpha})`, border: '1px solid rgba(255,255,255,0.04)' }} />
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </Card>
  )
}

function OngoingTable({ rows, onSelect }: { rows: OngoingRow[]; onSelect: (key: string) => void }) {
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('All')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return rows.filter(row => {
      const textMatch = !q || `${row.series_title} ${row.publisher} ${row.series_code}`.toLowerCase().includes(q)
      const statusMatch = status === 'All' || row.evaluation === status || row.vn_status === status
      return textMatch && statusMatch
    }).slice(0, 60)
  }, [rows, query, status])

  const statuses: string[] = ['All', ...Array.from(new Set(rows.map(r => r.evaluation).filter((s): s is string => Boolean(s))))]

  return (
    <Card className="p-5 lg:p-6">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 mb-5">
        <div>
          <p className="text-sm font-bold" style={{ color: 'var(--foreground)' }}>Ongoing Series Watchlist</p>
          <p className="text-xs mt-1" style={{ color: 'var(--foreground-muted)' }}>Styled after the Excel HTML dashboard table: score, drop risk, status, and release health.</p>
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--foreground-muted)' }} />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search series..."
              className="pl-9 pr-3 py-2 rounded-xl text-sm outline-none w-full sm:w-56"
              style={{ background: 'rgba(15,23,42,0.8)', color: 'var(--foreground)', border: '1px solid rgba(148,163,184,0.16)' }}
            />
          </div>

          <select
            value={status}
            onChange={e => setStatus(e.target.value)}
            className="px-3 py-2 rounded-xl text-sm outline-none"
            style={{ background: 'rgba(15,23,42,0.8)', color: 'var(--foreground)', border: '1px solid rgba(148,163,184,0.16)' }}
          >
            {statuses.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] text-sm">
          <thead>
            <tr style={{ color: 'var(--foreground-muted)' }}>
              <th className="text-left font-semibold py-3 px-3">Series</th>
              <th className="text-left font-semibold py-3 px-3">Publisher</th>
              <th className="text-center font-semibold py-3 px-3">VN/JP</th>
              <th className="text-center font-semibold py-3 px-3">LN Score</th>
              <th className="text-center font-semibold py-3 px-3">Drop %</th>
              <th className="text-left font-semibold py-3 px-3">Status</th>
              <th className="text-right font-semibold py-3 px-3">Last release</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(row => (
              <tr
                key={row.series_key}
                className="group cursor-pointer transition-colors"
                onClick={() => onSelect(row.series_key)}
                style={{ borderTop: '1px solid rgba(148,163,184,0.1)' }}
              >
                <td className="py-3 px-3">
                  <div className="flex items-center gap-3 min-w-0">
                    {row.cover_url ? (
                      <img src={proxyImg(row.cover_url) || ''} alt="" className="w-10 h-14 object-cover rounded-lg flex-shrink-0" />
                    ) : (
                      <div className="w-10 h-14 rounded-lg flex-shrink-0" style={{ background: 'rgba(99,102,241,0.14)' }} />
                    )}
                    <div className="min-w-0">
                      <p className="font-bold line-clamp-1" style={{ color: 'var(--foreground)' }}>{row.series_title}</p>
                      <p className="text-xs mt-0.5" style={{ color: 'var(--foreground-muted)' }}>{row.series_code || row.source_series_id || row.series_key}</p>
                    </div>
                  </div>
                </td>
                <td className="py-3 px-3" style={{ color: 'var(--foreground-secondary)' }}>{row.publisher || '—'}</td>
                <td className="py-3 px-3 text-center" style={{ color: 'var(--foreground-secondary)' }}>
                  {row.vn_volume_count ?? '—'} / {row.original_volume_count ?? '—'}
                </td>
                <td className="py-3 px-3 text-center">
                  <span className="px-2.5 py-1 rounded-full text-xs font-black" style={{ color: colorForScore(row.ln_score), background: `${colorForScore(row.ln_score)}18` }}>
                    {fmtScore(row.ln_score)}
                  </span>
                </td>
                <td className="py-3 px-3 text-center">
                  <span className="px-2.5 py-1 rounded-full text-xs font-black" style={{ color: colorForDrop(row.drop_percent), background: `${colorForDrop(row.drop_percent)}18` }}>
                    {fmtNum(row.drop_percent)}%
                  </span>
                </td>
                <td className="py-3 px-3">
                  <div>
                    <p className="text-xs font-bold" style={{ color: statusColors[row.evaluation || ''] || 'var(--foreground-secondary)' }}>{row.evaluation || '—'}</p>
                    <p className="text-[11px] line-clamp-1" style={{ color: 'var(--foreground-muted)' }}>{row.vn_status || '—'}</p>
                  </div>
                </td>
                <td className="py-3 px-3 text-right" style={{ color: 'var(--foreground-muted)' }}>
                  {row.series_last_release || '—'}
                  <p className="text-[11px]">{fmtNum(row.months_since_series_release)} mo</p>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

export default function Dashboard() {
  const { locale } = useLocale()
  const vi = locale === 'vi'

  const [loading, setLoading] = useState(true)
  const [kpis, setKpis] = useState<Kpis | null>(null)
  const [scatter, setScatter] = useState<ScatterRow[]>([])
  const [radarRows, setRadarRows] = useState<RadarRow[]>([])
  const [publishers, setPublishers] = useState<PublisherRow[]>([])
  const [growth, setGrowth] = useState<GrowthRow[]>([])
  const [heatmap, setHeatmap] = useState<HeatmapRow[]>([])
  const [ongoing, setOngoing] = useState<OngoingRow[]>([])
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)

    try {
      const [
        kpiRes,
        scatterRes,
        radarRes,
        publisherRes,
        growthRes,
        heatmapRes,
        ongoingRes,
      ] = await Promise.all([
        supabase.from('v_ln_dashboard_kpis').select('*').single(),
        supabase.from('v_ln_scatter').select('*').order('ln_score', { ascending: false }),
        supabase.from('v_ln_series_radar').select('*').order('ln_score', { ascending: false }),
        supabase.from('v_ln_publisher_leaderboard').select('*').limit(12),
        supabase.from('v_ln_market_growth').select('*').order('year', { ascending: true }),
        supabase.from('v_ln_publisher_monthly_activity').select('*'),
        supabase.from('v_ln_top_ongoing').select('*').limit(120),
      ])

      if (kpiRes.error) throw kpiRes.error
      if (scatterRes.error) throw scatterRes.error
      if (radarRes.error) throw radarRes.error
      if (publisherRes.error) throw publisherRes.error
      if (growthRes.error) throw growthRes.error
      if (heatmapRes.error) throw heatmapRes.error
      if (ongoingRes.error) throw ongoingRes.error

      setKpis(kpiRes.data as Kpis)
      setScatter((scatterRes.data || []) as ScatterRow[])
      setRadarRows((radarRes.data || []) as RadarRow[])
      setPublishers((publisherRes.data || []) as PublisherRow[])
      setGrowth((growthRes.data || []) as GrowthRow[])
      setHeatmap((heatmapRes.data || []) as HeatmapRow[])
      setOngoing((ongoingRes.data || []) as OngoingRow[])

      const firstGood =
        ((scatterRes.data || []) as ScatterRow[]).find(r => r.evaluation === 'Good') ||
        ((scatterRes.data || []) as ScatterRow[])[0]

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

  const selectedRadar = useMemo(() => {
    if (!selectedKey) return radarRows[0] || null
    return radarRows.find(r => r.series_key === selectedKey) || radarRows[0] || null
  }, [radarRows, selectedKey])

  const selectedScatter = useMemo(() => {
    if (!selectedKey) return null
    return scatter.find(r => r.series_key === selectedKey) || null
  }, [scatter, selectedKey])

  return (
    <div className="min-h-screen relative overflow-hidden" style={{ background: 'var(--background)' }}>
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-40 left-20 w-96 h-96 rounded-full blur-3xl" style={{ background: 'rgba(99,102,241,0.16)' }} />
        <div className="absolute top-40 right-0 w-96 h-96 rounded-full blur-3xl" style={{ background: 'rgba(236,72,153,0.12)' }} />
        <div className="absolute bottom-20 left-1/3 w-96 h-96 rounded-full blur-3xl" style={{ background: 'rgba(34,197,94,0.08)' }} />
      </div>

      <div className="relative max-w-7xl mx-auto px-3 sm:px-4 lg:px-8 py-6 sm:py-10">
        <div className="flex items-start justify-between gap-3 mb-6 sm:mb-8">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full px-3 py-1 mb-3" style={{ background: 'rgba(99,102,241,0.13)', border: '1px solid rgba(129,140,248,0.18)' }}>
              <Sparkles className="w-3.5 h-3.5" style={{ color: '#a5b4fc' }} />
              <span className="text-xs font-bold uppercase tracking-wider" style={{ color: '#a5b4fc' }}>
                {vi ? 'Thị trường Light Novel Việt Nam' : 'Vietnamese Light Novel Market'}
              </span>
            </div>
            <h1 className="text-2xl sm:text-5xl font-black tracking-tight" style={{ color: 'var(--foreground)' }}>
              LN Market Analytics
            </h1>
            <p className="text-sm sm:text-base mt-2 max-w-2xl" style={{ color: 'var(--foreground-secondary)' }}>
              {vi
                ? 'Bảng phân tích điểm LN, rủi ro drop, hoạt động nhà phát hành và xu hướng phát hành tại Việt Nam.'
                : 'LN score, drop risk, publisher activity, and release trend analytics for the Vietnamese light novel market.'}
            </p>
          </div>

          <button
            onClick={load}
            className="p-2 rounded-xl transition-all hover:scale-110"
            style={{ background: 'var(--glass-bg)', border: '1px solid var(--card-border)' }}
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4" style={{ color: 'var(--foreground-secondary)' }} />
          </button>
        </div>

        {loading ? (
          <div className="h-[60vh] flex items-center justify-center">
            <div className="flex items-center gap-3 text-sm" style={{ color: 'var(--foreground-secondary)' }}>
              <Loader2 className="w-5 h-5 animate-spin" />
              Loading LN market analytics...
            </div>
          </div>
        ) : error ? (
          <Card className="p-6">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 mt-0.5" style={{ color: '#f59e0b' }} />
              <div>
                <p className="font-bold" style={{ color: 'var(--foreground)' }}>Dashboard data failed to load</p>
                <p className="text-sm mt-1" style={{ color: 'var(--foreground-secondary)' }}>{error}</p>
                <p className="text-xs mt-3" style={{ color: 'var(--foreground-muted)' }}>
                  Check that the Supabase SQL views exist and that anon/RLS policies allow SELECT access.
                </p>
              </div>
            </div>
          </Card>
        ) : (
          <div className="space-y-6">
            <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 sm:gap-4">
              <KpiCard icon={BookOpen} label="Total Licensed Series" value={fmtNum(kpis?.total_licensed_series, 0)} accent="#818cf8" />
              <KpiCard icon={Activity} label="Active Series" value={fmtNum(kpis?.active_series, 0)} accent="#22c55e" />
              <KpiCard icon={CheckCircle2} label="Completed Series" value={fmtNum(kpis?.completed_series, 0)} accent="#38bdf8" />
              <KpiCard icon={Gauge} label="Average LN Score" value={fmtScore(kpis?.average_ln_score)} accent="#fbbf24" />
              <KpiCard icon={AlertTriangle} label="Average Drop %" value={`${fmtNum(kpis?.average_drop_percent)}%`} accent="#fb7185" />
              <KpiCard icon={ShieldCheck} label="Active Publishers" value={fmtNum(kpis?.active_publishers, 0)} accent="#a78bfa" />
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-[1.5fr_0.9fr] gap-6">
              <ScatterPlot
                rows={scatter}
                selectedKey={selectedKey}
                onSelect={(row) => setSelectedKey(row.series_key)}
              />
              <RadarChart row={selectedRadar} />
            </div>

            {selectedScatter && (
              <Card className="p-4 sm:p-5">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-wider font-bold" style={{ color: 'var(--foreground-muted)' }}>Currently selected</p>
                    <p className="text-xl font-black mt-1" style={{ color: 'var(--foreground)' }}>{selectedScatter.series_title}</p>
                    <p className="text-sm mt-1" style={{ color: 'var(--foreground-secondary)' }}>
                      {selectedScatter.publisher || 'Unknown publisher'} · {selectedScatter.vn_volume_count ?? '—'} / {selectedScatter.original_volume_count ?? '—'} volumes · {selectedScatter.vn_status || selectedScatter.evaluation || '—'}
                    </p>
                  </div>
                  <Link
                    href={selectedScatter.source_series_id ? `/content/${selectedScatter.source_series_id}` : '/browse'}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all hover:scale-105"
                    style={{ background: 'rgba(99,102,241,0.16)', color: '#a5b4fc', border: '1px solid rgba(129,140,248,0.22)' }}
                  >
                    Open detail
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                </div>
              </Card>
            )}

            <div className="grid grid-cols-1 xl:grid-cols-[0.9fr_1.2fr] gap-6">
              <PublisherLeaderboard rows={publishers} />
              <GrowthChart rows={growth} />
            </div>

            <Heatmap rows={heatmap} />

            <OngoingTable
              rows={ongoing}
              onSelect={(key) => {
                setSelectedKey(key)
                window.scrollTo({ top: 0, behavior: 'smooth' })
              }}
            />

            <div className="text-center text-xs pb-4" style={{ color: 'var(--foreground-muted)' }}>
              Data source: imported workbook views in Supabase. Last import: {kpis?.last_imported_at ? new Date(kpis.last_imported_at).toLocaleString() : '—'}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
