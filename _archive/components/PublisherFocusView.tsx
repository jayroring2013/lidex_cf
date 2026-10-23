'use client'

import { useState, useEffect, useRef, useMemo, ReactNode } from 'react'
import Link from 'next/link'
import { Search, ChevronDown, Sparkles, Check, X, BookOpen, TrendingUp, BarChart3, ArrowLeft, ArrowRight } from 'lucide-react'

export type LNRow = {
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

export type VolumeReleaseRow = {
  series_id: number
  publisher: string
  release_date: string
}

export type PublisherLogoMap = Record<string, string>

type PublisherAgg = {
  publisher: string
  releases24: number
  seriesCount: number
  avgScore: number
  avgDrop: number
  marketShare: number
}

type HeatmapRow = {
  publisher: string
  monthKey: string
  monthLabel: string
  count: number
}

const statusColors: Record<string, string> = {
  Good: '#22c55e',
  Limping: '#eab308',
  Dead: '#ef4444',
  Dropped: '#dc2626',
  Completed: '#38bdf8',
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
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

function proxyImg(url: string | null | undefined): string | null {
  if (!url) return null
  if (url.startsWith('https://img.duoshuba.com') || url.startsWith('http://img.duoshuba.com')) {
    return `/api/image-proxy?url=${encodeURIComponent(url)}`
  }
  return url
}

function publisherKey(name: string | null | undefined): string {
  if (!name) return ''
  return name.toLowerCase().trim().replace(/[^a-z0-9]/g, '')
}

function releaseStatusLabel(status: string, vi = true) {
  if (vi) return status
  return ({
    'Đang phát hành': 'Active',
    'Lâu lắm rồi chưa có tập mới': 'Long inactive',
    Drop: 'Dropped',
    'Đã bắt kịp bản gốc JP': 'Caught up to JP',
    'Hoàn thành': 'Completed',
    'Có bản quyền nhưng chưa phát hành': 'Licensed but unreleased',
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

function isStalledSeries(row: LNRow) {
  const rs = releaseStatus(row)
  if (rs === 'Có bản quyền nhưng chưa phát hành') return false
  const label = releaseStatusLabel(rs, false)
  return row.evalution !== 'Completed' && label !== 'Completed' && label !== 'Caught up to JP'
}

function releaseStatusStyle(row: LNRow) {
  const s = releaseStatus(row)
  if (s === 'Hoàn thành') return { bg: 'rgba(56,189,248,.18)', color: '#38bdf8', border: 'rgba(56,189,248,.30)' }
  if (s === 'Đang phát hành') return { bg: 'rgba(34,197,94,.18)', color: '#22c55e', border: 'rgba(34,197,94,.30)' }
  if (s === 'Đã bắt kịp bản gốc JP') return { bg: 'rgba(168,85,247,.18)', color: '#c084fc', border: 'rgba(168,85,247,.30)' }
  if (s === 'Lâu lắm rồi chưa có tập mới') return { bg: 'rgba(234,179,8,.18)', color: '#facc15', border: 'rgba(234,179,8,.30)' }
  if (s === 'Drop') return { bg: 'rgba(239,68,68,.18)', color: '#f87171', border: 'rgba(239,68,68,.30)' }
  return { bg: 'rgba(148,163,184,.14)', color: '#cbd5e1', border: 'rgba(148,163,184,.22)' }
}

function avgValue<T>(list: T[], fn: (item: T) => number): number {
  if (!list.length) return 0
  const sum = list.reduce((acc, item) => acc + (Number(fn(item)) || 0), 0)
  return sum / list.length
}

function pctValue(v: number | null | undefined): number {
  if (v === null || v === undefined) return 0
  return v > 1 ? v : v * 100
}

function fmtPercent(v: number | null | undefined): string {
  if (v === null || v === undefined) return '—'
  const p = pctValue(v)
  return `${p.toFixed(1)}%`
}

function fmtNum(value: number | null | undefined, digits = 1) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—'
  return Number(value).toLocaleString('vi-VN', { maximumFractionDigits: digits })
}

function fmtDurationFromMonths(months: number | null | undefined, vi = true): string {
  if (months == null || Number.isNaN(Number(months))) return vi ? 'Chưa có thông tin' : 'No data'
  const m = Math.max(0, Math.round(Number(months)))
  const years = Math.floor(m / 12)
  const remMonths = m % 12
  const parts = [
    years > 0 ? `${years} ${vi ? 'năm' : years === 1 ? 'year' : 'years'}` : '',
    remMonths > 0 ? `${remMonths} ${vi ? 'tháng' : remMonths === 1 ? 'month' : 'months'}` : '',
  ].filter(Boolean)
  return parts.length ? parts.join(' ') : (vi ? 'Vừa mới ra' : 'Just released')
}

function scatterStableNoise(key: string) {
  let hash = 0
  for (let i = 0; i < key.length; i++) hash = (hash << 5) - hash + key.charCodeAt(i)
  const normX = (Math.abs(hash) % 100) / 100
  const normY = (Math.abs(hash >> 3) % 100) / 100
  return {
    x: (normX - 0.5) * 0.36,
    y: (normY - 0.5) * 3.6,
  }
}

function volumeReleaseYear(row: VolumeReleaseRow) {
  if (!row.release_date) return null
  const d = new Date(row.release_date)
  const year = d.getFullYear()
  return Number.isFinite(year) ? year : null
}

function availableReleaseYears(rows: VolumeReleaseRow[]) {
  const years = new Set<number>()
  for (const row of rows) {
    const y = volumeReleaseYear(row)
    if (y !== null) years.add(y)
  }
  return Array.from(years).sort((a, b) => b - a)
}

function filterVolumeRowsBySingleYear(rows: VolumeReleaseRow[], selectedYear: number | null) {
  if (selectedYear === null) return rows
  return rows.filter(row => volumeReleaseYear(row) === selectedYear)
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

function buildGrowth(rows: VolumeReleaseRow[]) {
  const map = new Map<number, { year: number; volumes: number }>()
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
  const w = 720
  const h = 270
  const padL = 50
  const padR = 24
  const padT = 24
  const padB = 44
  const maxY = Math.max(...data.map(d => d.volumes), 1)
  const tickStep = maxY <= 30 ? 5 : maxY <= 80 ? 10 : maxY <= 160 ? 20 : 50
  const roundedMax = Math.max(tickStep, Math.ceil(maxY / tickStep) * tickStep)
  const yTicks = Array.from({ length: 5 }, (_, i) => Math.round((roundedMax / 4) * (4 - i)))
  const points = data.map((d, i) => {
    const x = padL + i / Math.max(1, data.length - 1) * (w - padL - padR)
    const y = h - padB - d.volumes / roundedMax * (h - padT - padB)
    return { x, y, d }
  })
  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')
  const areaPath = points.length
    ? `${linePath} L ${points[points.length - 1].x} ${h - padB} L ${points[0].x} ${h - padB} Z`
    : ''
  const xTickEvery = data.length > 11 ? 2 : 1
  const xTickIndexes = data.map((_, i) => i).filter(i => i === 0 || i === data.length - 1 || i % xTickEvery === 0)

  return (
    <Card className="p-3 h-[330px] overflow-hidden">
      <div className="flex items-center justify-between mb-2">
        <div>
          <p className="text-[12px] font-black uppercase tracking-wide" style={{ color: 'var(--foreground)' }}>{vi ? 'Số lượng tập truyện phát hành theo từng năm' : 'Vietnamese LN Market Growth'}</p>
          <p className="text-[11px]" style={{ color: 'var(--foreground-muted)' }}>{vi ? 'Số tập phát hành theo năm từ bảng volumes.' : 'Released volumes by year from volume data.'}</p>
        </div>
        <TrendingUp className="w-4 h-4" style={{ color: '#22c55e' }} />
      </div>

      <div className="rounded-lg px-1 pt-1" style={{ background: 'var(--ln-chart-bg)', border: '1px solid var(--card-border)' }}>
        <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-[264px]" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Biểu đồ số tập phát hành theo năm">
          <defs>
            <linearGradient id="growthArea" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#22c55e" stopOpacity="0.30" />
              <stop offset="100%" stopColor="#22c55e" stopOpacity="0.02" />
            </linearGradient>
          </defs>

          <rect x={padL} y={padT} width={w - padL - padR} height={h - padT - padB} rx="8" fill="var(--ln-chart-plot-bg)" stroke="var(--ln-chart-grid)" />
          {yTicks.map((tick, i) => {
            const y = h - padB - tick / roundedMax * (h - padT - padB)
            return (
              <g key={`${tick}-${i}`}>
                <line x1={padL} x2={w - padR} y1={y} y2={y} stroke="var(--ln-chart-grid)" strokeDasharray={tick === 0 ? '0' : '5 5'} />
                <text x={padL - 9} y={y + 5} textAnchor="end" fontSize="14" fontWeight="800" fill="var(--foreground-secondary)">
                  {tick.toLocaleString('vi-VN', { notation: tick >= 1000 ? 'compact' : 'standard' })}
                </text>
              </g>
            )
          })}

          {xTickIndexes.map(i => {
            const p = points[i]
            if (!p) return null
            return (
              <g key={`x-${p.d.year}`}>
                <line x1={p.x} x2={p.x} y1={padT} y2={h - padB} stroke="var(--ln-chart-grid)" opacity="0.55" />
                <text x={p.x} y={h - 14} textAnchor="middle" fontSize="14" fontWeight="900" fill="var(--foreground-secondary)">
                  {p.d.year}
                </text>
              </g>
            )
          })}

          {areaPath && <path d={areaPath} fill="url(#growthArea)" />}
          <path d={linePath} fill="none" stroke="#22c55e" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />

          {points.map((p, i) => (
            <g key={p.d.year}>
              <title>{`${p.d.year}: ${p.d.volumes.toLocaleString('vi-VN')} tập`}</title>
              <line x1={p.x} x2={p.x} y1={p.y} y2={h - padB} stroke="#22c55e" strokeOpacity="0.12" />
              <circle cx={p.x} cy={p.y} r="8" fill="#22c55e" opacity="0.14" />
              <circle cx={p.x} cy={p.y} r="4.8" fill="#bbf7d0" stroke="#22c55e" strokeWidth="2.2" vectorEffect="non-scaling-stroke" />
              {(i === points.length - 1 || p.d.volumes === maxY) && (
                <g>
                  <rect x={p.x - 22} y={p.y - 32} width="44" height="22" rx="6" fill="var(--ln-tooltip-bg)" stroke="rgba(34,197,94,.35)" />
                  <text x={p.x} y={p.y - 17} textAnchor="middle" fontSize="13" fontWeight="900" fill="#16a34a">{p.d.volumes}</text>
                </g>
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
                title={`${selectedPublisher}: ${v.toLocaleString('vi-VN')} tập`}
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

function publisherReliabilityScore(rows: LNRow[], volumeRows: VolumeReleaseRow[] = []) {
  if (rows.length === 0) return 0
  const avgScore = avgValue(rows, r => r.ln_score)
  const avgDrop = avgValue(rows, r => pctValue(r.drop_percent))
  const completed = rows.filter(r => r.evalution === 'Completed' || releaseStatus(r) === 'Hoàn thành').length
  const active = rows.filter(r => ['Đang phát hành', 'Đã bắt kịp bản gốc JP', 'Lâu lắm rồi chưa có tập mới'].includes(releaseStatus(r))).length
  const releasesCount = volumeRows.length

  const scorePart = (avgScore / 10) * 35
  const dropPart = (1 - Math.min(100, avgDrop) / 100) * 35
  const activePart = (active / Math.max(1, rows.length)) * 15
  const completedPart = Math.min(10, completed * 2)
  const volumePart = Math.min(5, releasesCount * 0.5)

  return Math.max(0, Math.min(100, scorePart + dropPart + activePart + completedPart + volumePart))
}

function publisherScoreColor(score: number) {
  if (score >= 80) return '#22c55e'
  if (score >= 70) return '#38bdf8'
  if (score >= 60) return '#eab308'
  if (score >= 45) return '#f97316'
  return '#ef4444'
}

function scoreColor(s: number) {
  if (s >= 8.0) return '#22c55e'
  if (s >= 7.0) return '#38bdf8'
  if (s >= 6.0) return '#eab308'
  if (s >= 5.0) return '#f97316'
  return '#ef4444'
}

function dropColor(d: number) {
  if (d <= 20) return '#22c55e'
  if (d <= 35) return '#38bdf8'
  if (d <= 50) return '#eab308'
  if (d <= 70) return '#f97316'
  return '#ef4444'
}

function buildPublishers(rows: LNRow[], volumeRows: VolumeReleaseRow[]) {
  const map: Record<string, { publisher: string; rows: LNRow[]; volumeRows: VolumeReleaseRow[] }> = {}
  for (const r of rows) {
    const p = r.publisher || 'Unknown'
    if (!map[p]) map[p] = { publisher: p, rows: [], volumeRows: [] }
    map[p].rows.push(r)
  }
  for (const v of volumeRows) {
    const p = v.publisher || 'Unknown'
    if (!map[p]) map[p] = { publisher: p, rows: [], volumeRows: [] }
    map[p].volumeRows.push(v)
  }

  const totalReleases24 = volumeRows.length || 1

  return Object.values(map).map(({ publisher, rows: pRows, volumeRows: pVols }) => {
    const releases24 = pVols.length
    const marketShare = (releases24 / totalReleases24) * 100
    const seriesCount = pRows.length
    const avgScore = avgValue(pRows, r => r.ln_score)
    const avgDrop = avgValue(pRows, r => pctValue(r.drop_percent))
    return {
      publisher,
      rows: pRows,
      volumeRows: pVols,
      releases24,
      marketShare,
      seriesCount,
      avgScore,
      avgDrop,
    }
  }).sort((a, b) => b.releases24 - a.releases24 || a.publisher.localeCompare(b.publisher))
}

function PublisherLogoMark({ name, logoUrl, size = 'md' }: { name: string; logoUrl: string | null; size?: 'sm' | 'md' }) {
  const dim = size === 'sm' ? 'w-9 h-9' : 'w-11 h-11'
  return (
    <div
      className={`${dim} rounded-xl flex items-center justify-center shrink-0 overflow-hidden text-[10px] font-black`}
      style={{
        background: 'rgba(255,255,255,.96)',
        color: '#1d4ed8',
        border: '1px solid rgba(136,146,170,.22)',
        boxShadow: '0 6px 20px rgba(15,23,42,.10)',
      }}
    >
      {logoUrl ? (
        <img src={logoUrl} alt="" className="w-full h-full object-contain p-0.5" loading="lazy" decoding="async" />
      ) : (
        name.slice(0, 3).toUpperCase()
      )}
    </div>
  )
}

function PublisherHeaderPicker({
  currentName,
  publishers,
  publisherLogos,
  onSelect,
  vi,
}: {
  currentName: string
  publishers: { publisher: string }[]
  publisherLogos: PublisherLogoMap
  onSelect: (publisher: string) => void
  vi: boolean
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const filtered = publishers.filter(p => p.publisher.toLowerCase().includes(query.trim().toLowerCase()))

  useEffect(() => {
    if (!open) return
    function onPointerDown(event: Event) {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false)
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div ref={wrapRef} className="relative inline-flex shrink-0">
      <button
        type="button"
        onClick={() => setOpen(value => !value)}
        className="h-8 w-8 rounded-full outline-none transition-all hover:scale-105 inline-flex items-center justify-center"
        style={{
          background: 'var(--ln-control-bg)',
          color: 'var(--foreground)',
          border: '1px solid var(--card-border)',
          boxShadow: '0 6px 18px rgba(15,23,42,.10)',
        }}
        aria-haspopup="dialog"
        aria-expanded={open}
        title={vi ? 'Chọn nhà phát hành' : 'Choose publisher'}
      >
        <ChevronDown className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} style={{ color: 'var(--foreground-secondary)' }} />
      </button>

      {open && (
        <div
          className="fixed left-1/2 top-28 z-50 w-[calc(100vw-24px)] max-w-[360px] -translate-x-1/2 overflow-hidden rounded-2xl shadow-2xl sm:absolute sm:left-1/2 sm:top-[calc(100%+8px)] sm:w-[min(360px,calc(100vw-32px))] sm:max-w-none sm:-translate-x-1/2"
          style={{ background: 'var(--publisher-picker-bg, var(--card-bg))', border: '1px solid var(--card-border)', boxShadow: '0 22px 70px rgba(15,23,42,.42)' }}
          role="dialog"
        >
          <div className="p-3 border-b" style={{ borderColor: 'var(--card-border)' }}>
            <p className="text-sm font-black text-center mb-3" style={{ color: 'var(--foreground)' }}>{vi ? 'Chọn nhà phát hành' : 'Choose Publisher'}</p>
            <div className="flex items-center gap-2 rounded-xl px-3 py-2" style={{ background: 'var(--ln-control-bg)', border: '1px solid var(--card-border)' }}>
              <Search className="w-4 h-4 shrink-0" style={{ color: 'var(--foreground-muted)' }} />
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder={vi ? 'Tìm theo tên NPH' : 'Search publisher'}
                className="w-full bg-transparent outline-none text-sm"
                style={{ color: 'var(--foreground)' }}
                autoFocus
              />
            </div>
          </div>

          <div className="max-h-[min(420px,60vh)] overflow-y-auto">
            {filtered.map(p => {
              const logoUrl = proxyImg(publisherLogos[publisherKey(p.publisher)] || null)
              const active = p.publisher === currentName
              return (
                <button
                  key={p.publisher}
                  type="button"
                  onClick={() => {
                    onSelect(p.publisher)
                    setOpen(false)
                    setQuery('')
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors"
                  style={{
                    background: active ? 'rgba(124,106,245,.14)' : 'transparent',
                    borderBottom: '1px solid var(--card-border)',
                  }}
                >
                  <PublisherLogoMark name={p.publisher} logoUrl={logoUrl} size="sm" />
                  <p className="text-sm font-black truncate" style={{ color: active ? '#7c6af5' : 'var(--foreground)' }}>{p.publisher}</p>
                </button>
              )
            })}
            {filtered.length === 0 && (
              <div className="px-4 py-8 text-center text-sm" style={{ color: 'var(--foreground-muted)' }}>
                {vi ? 'Không tìm thấy nhà phát hành.' : 'No publishers found.'}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

const CARD_COLORS = [
  'bg-gradient-to-b from-[#1638a0] to-[#0c2370]', // Deep Blue
  'bg-gradient-to-b from-[#dc2626] to-[#991b1b]', // Crimson Red
  'bg-gradient-to-b from-[#b91c1c] to-[#7f1d1d]', // Dark Red
  'bg-gradient-to-b from-[#581c87] to-[#3b0764]', // Royal Purple
  'bg-gradient-to-b from-[#c2410c] to-[#7c2d12]', // Bronze
  'bg-gradient-to-b from-[#d97706] to-[#92400e]', // Gold
  'bg-gradient-to-b from-[#be123c] to-[#881337]', // Rose
  'bg-gradient-to-b from-[#9f1239] to-[#4c0519]', // Magenta
]

function getPublisherCardColor(publisherName: string, idx: number): string {
  const name = publisherName.toLowerCase().trim()
  if (name.includes('ipm')) return 'bg-gradient-to-b from-[#007038] to-[#004221]' // IPM Iconic Forest Green
  if (name.includes('wings')) return 'bg-gradient-to-b from-[#0284c7] to-[#0369a1]' // WingsBooks Sky Blue
  if (name.includes('trẻ') || name.includes('tre')) return 'bg-gradient-to-b from-[#b91c1c] to-[#7f1d1d]' // NXB Trẻ Red
  if (name.includes('amak')) return 'bg-gradient-to-b from-[#581c87] to-[#3b0764]' // AMAK Deep Purple
  if (name.includes('tsuki')) return 'bg-gradient-to-b from-[#9a3412] to-[#7c2d12]' // Tsuki Warm Bronze
  if (name.includes('sky')) return 'bg-gradient-to-b from-[#d97706] to-[#92400e]' // Skybooks Gold Amber
  if (name.includes('hikari')) return 'bg-gradient-to-b from-[#be123c] to-[#881337]' // Hikari Pink Rose
  if (name.includes('quảng văn') || name.includes('quang van')) return 'bg-gradient-to-b from-[#881337] to-[#4c0519]' // Quảng Văn Wine Burgundy
  if (name.includes('shine')) return 'bg-gradient-to-b from-[#1e40af] to-[#1e3a8a]' // Shine Books Sapphire
  if (name.includes('owl')) return 'bg-gradient-to-b from-[#0f766e] to-[#115e59]' // Owlbooks Teal
  if (name.includes('kim đồng') || name.includes('kim dong')) return 'bg-gradient-to-b from-[#dc2626] to-[#991b1b]' // Kim Đồng Red
  if (name.includes('uranix')) return 'bg-gradient-to-b from-[#6b21a8] to-[#4c1d95]' // Uranix Purple
  if (name.includes('ai novel')) return 'bg-gradient-to-b from-[#c2410c] to-[#7c2d12]' // Ai Novel Bronze
  if (name.includes('ichi')) return 'bg-gradient-to-b from-[#ea580c] to-[#9a3412]' // Ichi Fox Orange
  if (name.includes('orion')) return 'bg-gradient-to-b from-[#9f1239] to-[#4c0519]' // Orion Magenta
  if (name.includes('ta books')) return 'bg-gradient-to-b from-[#1d4ed8] to-[#1e40af]' // Ta Books Royal Blue

  return CARD_COLORS[idx % CARD_COLORS.length]
}

export function PublisherCardsGrid({
  publishers,
  rows,
  volumeRows,
  publisherLogos,
  selectedPublisher,
  onSelectPublisher,
  vi = true,
}: {
  publishers: { publisher: string; releases24: number; marketShare: number }[]
  rows: LNRow[]
  volumeRows: VolumeReleaseRow[]
  publisherLogos: PublisherLogoMap
  selectedPublisher?: string | null
  onSelectPublisher?: (publisher: string) => void
  vi?: boolean
}) {
  return (
    <div className="mb-5">
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4">
        {publishers.map((p, idx) => {
          const isSelected = p.publisher === selectedPublisher
          const pRows = rows.filter(r => (r.publisher || 'Unknown') === p.publisher)
          const pVolumes = volumeRows.filter(v => (v.publisher || 'Unknown') === p.publisher)
          
          const activeCount = pRows.filter(r =>
            ['Đang phát hành', 'Đã bắt kịp bản gốc JP', 'Lâu lắm rồi chưa có tập mới'].includes(releaseStatus(r))
          ).length

          const droppedCount = pRows.filter(r =>
            r.evalution === 'Dropped' || releaseStatus(r) === 'Drop' || r.evalution === 'Dead'
          ).length

          const isLiveActive = p.releases24 > 0 || activeCount > 0
          const logoUrl = proxyImg(publisherLogos[publisherKey(p.publisher)] || null)
          const bgClass = getPublisherCardColor(p.publisher, idx)

          return (
            <Link
              key={p.publisher}
              href={`/publisher?name=${encodeURIComponent(p.publisher)}`}
              onClick={() => onSelectPublisher?.(p.publisher)}
              className={`relative rounded-3xl p-3 sm:p-4 cursor-pointer transition-all duration-200 ${bgClass} shadow-xl hover:shadow-2xl flex flex-col justify-between items-center h-36 sm:h-44 group ${
                isSelected
                  ? 'ring-4 ring-cyan-400 scale-[1.04] z-10 shadow-cyan-500/30'
                  : 'hover:scale-[1.02] opacity-95 hover:opacity-100'
              }`}
            >
              {/* Red Live Pulsing Dot (Top Left) */}
              {isLiveActive && (
                <span
                  className="absolute top-3.5 left-4 w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse shadow-[0_0_10px_rgba(239,68,68,0.95)]"
                  title="Hoạt động"
                />
              )}

              {/* Center Publisher Logo Emblem */}
              <div className="flex-1 flex items-center justify-center my-auto">
                <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-white/95 p-1.5 flex items-center justify-center shadow-lg group-hover:scale-105 transition-transform overflow-hidden border-2 border-white/60">
                  {logoUrl ? (
                    <img
                      src={logoUrl}
                      alt={p.publisher}
                      className="w-full h-full object-contain"
                      loading="lazy"
                    />
                  ) : (
                    <span className="text-sm sm:text-base font-black text-slate-900 uppercase tracking-wider">
                      {p.publisher.slice(0, 3)}
                    </span>
                  )}
                </div>
              </div>

              {/* Bottom Minimal Footer Stats Row: ↑ active  ↓ dropped  ■ total volumes */}
              <div className="flex items-center justify-center gap-3 sm:gap-4 text-xs sm:text-sm font-black text-white/90 pt-1">
                <div className="flex items-center gap-1 text-emerald-400" title="Active LN series">
                  <span className="text-xs font-black">↑</span>
                  <span>{activeCount}</span>
                </div>

                <div className="flex items-center gap-1 text-rose-400" title="Dropped / inactive series">
                  <span className="text-xs font-black">↓</span>
                  <span>{droppedCount}</span>
                </div>

                <div className="flex items-center gap-1 text-slate-300" title="Volume releases">
                  <span className="text-[10px]">■</span>
                  <span>{pVolumes.length}</span>
                </div>
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}

function PublisherDNARadar({ publisher, rows, volumeRows, vi }: { publisher: PublisherAgg; rows: LNRow[]; volumeRows: VolumeReleaseRow[]; vi: boolean }) {
  const [hoveredAxis, setHoveredAxis] = useState<number | null>(null)
  const activeCount = rows.filter(row => ['Đang phát hành', 'Đã bắt kịp bản gốc JP', 'Lâu lắm rồi chưa có tập mới'].includes(releaseStatus(row))).length
  const completedCount = rows.filter(row => row.evalution === 'Completed' || releaseStatus(row) === 'Hoàn thành').length
  const safety = Math.max(0, Math.min(100, 100 - publisher.avgDrop))
  const releaseActivity = Math.max(0, Math.min(100, publisher.marketShare * 3.5))
  const quality = Math.max(0, Math.min(100, publisher.avgScore * 10))
  const completion = rows.length ? (completedCount / rows.length) * 100 : 0
  const active = rows.length ? (activeCount / rows.length) * 100 : 0
  const catchup = avgValue(rows, row => row.catch_up_score * 10)
  const releasePace = publisherReliabilityScore(rows, volumeRows)
  const reliability = publisherReliabilityScore(rows, volumeRows)

  const axes = [
    { label: vi ? 'Sản lượng' : 'Output', short: vi ? 'SL' : 'OUT', icon: '↗', value: releaseActivity, description: vi ? 'Tỷ trọng số tập phát hành của nhà phát hành trong dữ liệu hiện tại.' : 'Publisher release share across the current dataset.' },
    { label: vi ? 'Hoàn thành' : 'Completion', short: vi ? 'HT' : 'CMP', icon: '✓', value: completion, description: vi ? 'Tỷ lệ series đã hoàn thành trong portfolio.' : 'Share of completed series in the portfolio.' },
    { label: vi ? 'Độ tin cậy' : 'Reliability', short: vi ? 'TC' : 'REL', icon: '◉', value: reliability, description: vi ? 'Đánh giá năng lực NPH: độ mới phát hành, tỷ lệ truyện drop/lâu chưa ra, tốc độ ra tập.' : 'Publisher competency score.' },
    { label: vi ? 'Tốc độ phát hành' : 'Release Pace', short: vi ? 'TĐ' : 'PACE', icon: '≋', value: releasePace, description: vi ? 'Dựa chủ yếu vào khoảng cách trung bình giữa các tập.' : 'Based mainly on average months between volumes.' },
    { label: vi ? 'Bắt kịp' : 'Catch-up', short: vi ? 'BK' : 'CUP', icon: '⇄', value: catchup, description: vi ? 'Mức độ bản Việt bắt kịp số tập gốc/JP.' : 'How closely Vietnamese releases match original volumes.' },
    { label: vi ? 'Chất lượng' : 'Quality', short: vi ? 'CL' : 'QLT', icon: '◆', value: quality, description: vi ? 'Điểm LN trung bình được quy đổi về thang 100.' : 'Average LN score scaled to 100.' },
    { label: vi ? 'An toàn' : 'Safety', short: vi ? 'AT' : 'SAF', icon: '◌', value: safety, description: vi ? 'Nghịch đảo của khả năng drop trung bình.' : 'Inverse of average drop risk.' },
    { label: vi ? 'Đang phát hành' : 'Active', short: vi ? 'ĐP' : 'ACT', icon: '●', value: active, description: vi ? 'Tỷ lệ series vẫn còn hoạt động.' : 'Share of active series.' },
  ] as const

  const size = 260
  const cx = size / 2
  const cy = size / 2
  const maxR = 78
  const points = axes.map((axis, i) => {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / axes.length
    const r = Math.max(0, Math.min(100, axis.value)) / 100 * maxR
    return `${cx + Math.cos(angle) * r},${cy + Math.sin(angle) * r}`
  }).join(' ')
  const grids = [0.25, 0.5, 0.75, 1].map(level => axes.map((_, i) => {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / axes.length
    const r = level * maxR
    return `${cx + Math.cos(angle) * r},${cy + Math.sin(angle) * r}`
  }).join(' '))

  return (
    <Card className="p-3 h-full">
      <div className="mb-1">
        <p className="text-[11px] font-black uppercase tracking-wide" style={{ color: 'var(--foreground)' }}>{vi ? 'Thông số NPH' : 'Publisher DNA'}</p>
        <p className="text-[10px]" style={{ color: 'var(--foreground-muted)' }}>{vi ? 'Rê chuột hoặc chạm vào từng trục để xem chi tiết.' : 'Hover or tap each axis for details.'}</p>
      </div>

      <div className="relative flex justify-center overflow-visible pt-3" onMouseLeave={() => setHoveredAxis(null)}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="max-w-full">
          {grids.map((g, i) => <polygon key={i} points={g} fill="none" stroke="var(--ln-chart-grid)" />)}
          {axes.map((axis, i) => {
            const angle = -Math.PI / 2 + (i * 2 * Math.PI) / axes.length
            const x1 = cx + Math.cos(angle) * maxR
            const y1 = cy + Math.sin(angle) * maxR
            const x = cx + Math.cos(angle) * (maxR + 31)
            const y = cy + Math.sin(angle) * (maxR + 31)
            const isActive = hoveredAxis === i
            const color = publisherScoreColor(axis.value)
            return (
              <g key={axis.label} onMouseEnter={() => setHoveredAxis(i)} style={{ cursor: 'pointer' }}>
                <title>{`${axis.label}: ${axis.value.toFixed(0)}/100`}</title>
                <line x1={cx} y1={cy} x2={x1} y2={y1} stroke="var(--ln-chart-grid)" />
                <circle cx={x} cy={y} r={isActive ? 15 : 13} fill={isActive ? `${color}22` : 'var(--ln-control-bg)'} stroke={isActive ? color : 'var(--card-border)'} strokeWidth={isActive ? 2 : 1} />
                <text x={x} y={y} textAnchor="middle" dominantBaseline="middle" fontSize="13" fontWeight="900" fill={color}>{axis.icon}</text>
              </g>
            )
          })}
          <polygon points={points} fill="rgba(56,189,248,.26)" stroke="#38bdf8" strokeWidth="2" />
        </svg>
      </div>
    </Card>
  )
}

function detailHref(row: LNRow) {
  const targetId = row.lidex_series_id || row.series_id || row.series_code || row.series_key
  return `/content/${encodeURIComponent(targetId)}`
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return '—'
  const date = new Date(d)
  if (Number.isNaN(date.getTime())) return String(d).slice(0, 10)
  return date.toLocaleDateString('vi-VN', { year: 'numeric', month: '2-digit', day: '2-digit' })
}

function publisherPortfolioBuckets(rows: LNRow[]) {
  const buckets = {
    completed: [] as LNRow[],
    ongoing: [] as LNRow[],
    stalled: [] as LNRow[],
    dropped: [] as LNRow[],
    caught: [] as LNRow[],
  }

  rows.forEach(row => {
    const status = releaseStatusLabel(releaseStatus(row), false)
    if (row.evalution === 'Completed' || status === 'Completed') buckets.completed.push(row)
    else if (row.evalution === 'Dropped' || status === 'Dropped') buckets.dropped.push(row)
    else if (status === 'Caught up to JP') buckets.caught.push(row)
    else if (row.evalution === 'Limping' || row.evalution === 'Dead' || status === 'Long inactive') buckets.stalled.push(row)
    else buckets.ongoing.push(row)
  })

  return buckets
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
  const [failedCoverKey, setFailedCoverKey] = useState<string | null>(null)

  useEffect(() => {
    const idx = items.findIndex(row => row.series_key === selectedKey)
    if (idx >= 0) setActiveIndex(idx)
    else setActiveIndex(0)
  }, [selectedKey, items.length])

  useEffect(() => {
    if (items.length <= 1) return
    const timer = window.setInterval(() => {
      setActiveIndex(idx => (idx + 1) % items.length)
    }, 8000)
    return () => window.clearInterval(timer)
  }, [items.length])

  if (items.length === 0) {
    return <Card className="p-3"><span className="text-xs" style={{ color: 'var(--foreground-muted)' }}>{vi ? 'Không có series.' : 'No series.'}</span></Card>
  }

  const safeIndex = Math.min(activeIndex, items.length - 1)
  const active = items[safeIndex]
  const activeStyle = releaseStatusStyle(active)
  const cover = proxyImg(active.cover_url)
  const showCover = Boolean(cover && failedCoverKey !== active.series_key)
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
            {vi ? 'Các series LN nổi bật' : 'Top Series Slideshow'}
          </p>
          <p className="text-[10px]" style={{ color: 'var(--foreground-muted)' }}>
            {vi ? 'Chọn series nổi bật trong portfolio.' : 'Browse this publisher portfolio.'}
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-full px-2.5 py-1.5 shadow-sm" style={{ background: 'var(--ln-control-bg)', border: '1px solid var(--card-border)' }}>
          {items.map((row, idx) => (
            <button
              key={row.series_key}
              type="button"
              onClick={() => setActiveIndex(idx)}
              className="w-3 h-3 rounded-full transition-all hover:scale-125"
              style={{ background: idx === safeIndex ? '#7c6af5' : 'var(--foreground-muted)', opacity: idx === safeIndex ? 1 : 0.55, boxShadow: idx === safeIndex ? '0 0 0 3px rgba(124,106,245,.22)' : 'none' }}
              aria-label={`Show slide ${idx + 1}`}
              title={`${idx + 1}/${items.length}`}
            />
          ))}
        </div>
      </div>

      <div className="relative rounded-2xl overflow-hidden" style={{ background: 'var(--ln-slideshow-bg)', border: '1px solid var(--card-border)' }}>
        {showCover && <img src={cover || ''} alt="" className="absolute inset-0 w-full h-full object-cover opacity-[0.08] blur-md scale-110" onError={() => setFailedCoverKey(active.series_key)} />}
        <div className="absolute inset-0" style={{ background: 'var(--ln-slideshow-overlay)' }} />

        <Link href={detailHref(active)} className="absolute right-3 top-3 z-20 inline-flex items-center justify-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-black transition-all hover:scale-[1.02] min-w-[78px]" style={{ background: 'var(--ln-slideshow-open-bg)', color: 'var(--ln-slideshow-open-text)', border: '1px solid var(--ln-slideshow-open-border)' }}>Open <ArrowRight className="w-3.5 h-3.5" /></Link>

        <div className="relative grid grid-cols-[122px_1fr] sm:grid-cols-[150px_1fr] gap-4 p-3 min-h-[244px]">
          <div className="relative">
            <div className="relative rounded-xl overflow-hidden shadow-xl" style={{ aspectRatio: '2/3', border: '1px solid var(--ln-slideshow-cover-border)', background: 'var(--ln-slideshow-cover-bg)' }}>
              {showCover ? (
                <img src={cover || ''} alt={active.series_title} className="w-full h-full object-cover" onError={() => setFailedCoverKey(active.series_key)} />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <BookOpen className="w-8 h-8 opacity-50" style={{ color: 'var(--foreground-muted)' }} />
                </div>
              )}
            </div>
          </div>

          <div className="min-w-0 flex flex-col justify-between">
            <div className="pr-24">
              <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
                <span className="rounded-full px-2 py-0.5 text-[9px] font-black" style={{ color: activeStyle.color, background: activeStyle.bg, border: `1px solid ${activeStyle.border}` }}>{releaseStatusLabel(releaseStatus(active), vi)}</span>
                <span className="rounded-full px-2 py-0.5 text-[9px] font-bold" style={{ color: 'var(--ln-slideshow-volume-text)', background: 'var(--ln-slideshow-volume-bg)', border: '1px solid var(--ln-slideshow-volume-border)' }}>{volumeLabel}</span>
                <span className="rounded-full px-2 py-0.5 text-[9px] font-bold" style={{ color: 'var(--ln-slideshow-date-text)', background: 'var(--ln-slideshow-date-bg)', border: '1px solid var(--card-border)' }}>
                  {fmtDate(active.max_release_at)}
                </span>
                {fanVoteLabel && (
                  <span
                    className="rounded-full px-2 py-0.5 text-[9px] font-black"
                    style={{ color: 'var(--ln-slideshow-vote-text)', background: 'var(--ln-slideshow-vote-bg)', border: '1px solid var(--ln-slideshow-vote-border)' }}
                    title={active.fan_vote_votes ? `${fmtNum(active.fan_vote_votes, 0)} votes · ${active.fan_vote_period || active.fan_vote_year}` : active.fan_vote_period || undefined}
                  >
                    {fanVoteLabel}
                  </span>
                )}
              </div>

              <h3 className="text-xl sm:text-2xl font-black leading-tight line-clamp-3" style={{ color: 'var(--ln-slideshow-title)' }}>{active.series_title}</h3>
            </div>

            <div className="mt-3 rounded-xl p-3 min-h-[126px] max-h-[154px] overflow-hidden" style={{ background: 'var(--ln-slideshow-desc-bg)', border: '1px solid var(--ln-slideshow-desc-border)' }}>
              <p className="text-[11px] leading-relaxed line-clamp-6" style={{ color: 'var(--ln-slideshow-text)' }}>{description}</p>
            </div>
          </div>
        </div>
      </div>
    </Card>
  )
}

function PublisherBreakdown({ rows, vi }: { rows: LNRow[]; vi: boolean }) {
  const buckets = publisherPortfolioBuckets(rows)
  const groups = [
    { key: 'completed', label: vi ? 'Completed' : 'Completed', color: '#22c55e', rows: buckets.completed },
    { key: 'active', label: vi ? 'Ongoing' : 'Ongoing', color: '#2563eb', rows: buckets.ongoing },
    { key: 'stalled', label: vi ? 'Stalled' : 'Stalled', color: '#eab308', rows: buckets.stalled },
    { key: 'dropped', label: vi ? 'Dropped' : 'Dropped', color: '#ef4444', rows: buckets.dropped },
    { key: 'caught', label: vi ? 'Caught Up' : 'Caught Up', color: '#7c6af5', rows: buckets.caught },
  ].filter(group => group.rows.length > 0).sort((a, b) => b.rows.length - a.rows.length)

  const total = Math.max(1, rows.length)

  return (
    <Card className="p-3 h-full overflow-hidden">
      <div className="mb-2">
        <p className="text-[11px] font-black uppercase tracking-wide" style={{ color: 'var(--foreground)' }}>{vi ? 'Tình trạng các bộ LN' : 'Portfolio Treemap'}</p>
        <p className="text-[10px]" style={{ color: 'var(--foreground-muted)' }}>{vi ? 'Diện tích theo số series.' : 'Area by number of series.'}</p>
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
                <p className="text-[10px]" style={{ color: 'var(--foreground-muted)' }}>{pct.toFixed(1)}% portfolio</p>
              </div>
            </div>
          )
        })}
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
  const chartRef = useRef<HTMLDivElement | null>(null)

  const plotRows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return rows.filter(row => {
      const rs = releaseStatus(row)
      if (rs === 'Có bản quyền nhưng chưa phát hành') return false
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

  useEffect(() => {
    const element = chartRef.current
    if (!element) return

    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      event.stopPropagation()
      const percent = pointPercent(event.clientX, event.clientY, element)
      zoomAt(percent, zoom * (event.deltaY > 0 ? 0.88 : 1.12))
    }

    element.addEventListener('wheel', onWheel, { passive: false })
    return () => element.removeEventListener('wheel', onWheel)
  }, [zoom, pan])

  function resetMap() {
    setZoom(1)
    setPan({ x: 5, y: 50 })
  }

  return (
    <Card className="p-3">
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-2 mb-2">
        <div>
          <p className="text-[11px] font-black uppercase tracking-wide" style={{ color: 'var(--foreground)' }}>{vi ? 'Biểu đồ sinh tồn của các bộ truyện' : 'Portfolio Quality Map'}</p>
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
          <button type="button" onClick={resetMap} className="px-2 py-1.5 rounded-lg text-[10px] font-black transition-all hover:scale-[1.03]" style={{ background: 'var(--ln-control-bg)', color: 'var(--foreground-secondary)', border: '1px solid var(--card-border)' }}>Reset</button>
          <div className="flex items-center rounded-lg overflow-hidden" style={{ border: '1px solid var(--card-border)' }}>
            <button type="button" onClick={() => setZoom(z => Math.max(1, Number((z - 0.35).toFixed(2))))} className="px-2 py-1.5 text-[10px] font-black" style={{ background: 'var(--ln-control-bg)', color: 'var(--foreground-secondary)' }}>−</button>
            <button type="button" onClick={() => { setZoom(1); setPan({ x: 5, y: 50 }) }} className="px-2 py-1.5 text-[10px] font-black" style={{ background: zoom === 1 ? '#7c6af5' : 'var(--ln-control-bg)', color: zoom === 1 ? '#fff' : 'var(--foreground-secondary)' }}>{zoom.toFixed(1)}x</button>
            <button type="button" onClick={() => setZoom(z => Math.min(3.5, Number((z + 0.35).toFixed(2))))} className="px-2 py-1.5 text-[10px] font-black" style={{ background: 'var(--ln-control-bg)', color: 'var(--foreground-secondary)' }}>+</button>
          </div>
        </div>
      </div>

      <div
        ref={chartRef}
        className="relative h-[230px] rounded-lg overflow-hidden cursor-grab active:cursor-grabbing select-none"
        style={{ background: 'var(--ln-chart-bg)', border: '1px solid var(--card-border)', touchAction: 'none' }}
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
                onClick={e => { e.preventDefault(); e.currentTarget.blur(); setHoveredKey(row.series_key); onSelect(row) }}
                onMouseEnter={() => setHoveredKey(row.series_key)}
                onMouseLeave={() => setHoveredKey(null)}
                onFocus={() => setHoveredKey(row.series_key)}
                onBlur={() => setHoveredKey(null)}
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
          {hoveredRow && hoveredPoint && hoveredPoint.visible && (
            <div
              className="absolute pointer-events-none rounded-lg px-2.5 py-2 text-[10px] shadow-xl"
              style={{
                left: `clamp(6px, ${hoveredPoint.x}%, calc(100% - 190px))`,
                top: `clamp(6px, ${hoveredPoint.y}%, calc(100% - 76px))`,
                transform: 'translate(10px, -50%)',
                background: 'var(--ln-tooltip-bg)',
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

        <div className="absolute left-10 bottom-2 text-[9px]" style={{ color: 'var(--foreground-muted)' }}>LN Score →</div>
        <div className="absolute left-3 top-1/2 -rotate-90 text-[9px]" style={{ color: 'var(--foreground-muted)' }}>{vi ? 'Drop Risk' : 'Drop Risk'}</div>
      </div>
    </Card>
  )
}

function PublisherRiskCards({ rows, vi }: { rows: LNRow[]; vi: boolean }) {
  const risky = [...rows].sort((a, b) => pctValue(b.drop_percent) - pctValue(a.drop_percent)).slice(0, 5)
  const stalled = rows.filter(isStalledSeries).sort((a, b) => (b.months_since_last_release || 0) - (a.months_since_last_release || 0)).slice(0, 5)

  return (
    <div className="grid grid-cols-1 gap-3">
      <Card className="p-3">
        <p className="text-xs font-black uppercase tracking-wide mb-3" style={{ color: '#f87171' }}>Các bộ truyện có nguy cơ drop cao nhất</p>
        <div className="space-y-2">
          {risky.map((row, i) => (
            <div key={row.series_key} className="flex items-center justify-between gap-2 text-[12px]">
              <span className="truncate" style={{ color: 'var(--foreground-secondary)' }}>{i + 1}. {row.series_title}</span>
              <span className="font-black text-rose-400">{fmtPercent(row.drop_percent)}</span>
            </div>
          ))}
        </div>
      </Card>
      <Card className="p-3">
        <p className="text-xs font-black uppercase tracking-wide mb-3" style={{ color: '#fb923c' }}>Các bộ truyện lâu chưa ra mới</p>
        <div className="space-y-2">
          {stalled.map((row, i) => (
            <div key={row.series_key} className="flex items-center justify-between gap-2 text-[12px]">
              <span className="truncate" style={{ color: 'var(--foreground-secondary)' }}>{i + 1}. {row.series_title}</span>
              <span className="font-black text-amber-400 text-right shrink-0">{fmtDurationFromMonths(row.months_since_last_release, vi)}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}

export function PublisherFocusView({
  rows,
  volumeRows,
  publisherLogos,
  selectedPublisher,
  setSelectedPublisher,
  selectedKey,
  onSelectSeries,
  vi = true,
}: {
  rows: LNRow[]
  volumeRows: VolumeReleaseRow[]
  publisherLogos: PublisherLogoMap
  selectedPublisher: string | null
  setSelectedPublisher: (publisher: string | null) => void
  selectedKey: string | null
  onSelectSeries: (row: LNRow) => void
  vi?: boolean
}) {
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
  const reliability = publisherReliabilityScore(portfolioRows, publisherVolumes)
  const reliabilityRanks = publishers
    .map(p => {
      const pRows = rows.filter(row => (row.publisher || 'Unknown') === p.publisher)
      const pVolumes = volumeRows.filter(row => (row.publisher || 'Unknown') === p.publisher)
      const score = publisherReliabilityScore(pRows, pVolumes)
      return { publisher: p.publisher, score }
    })
    .sort((a, b) => b.score - a.score || a.publisher.localeCompare(b.publisher))
  const rank = Math.max(1, reliabilityRanks.findIndex(p => p.publisher === currentName) + 1)
  const avgScoreRanks = publishers
    .map(p => {
      const pRows = rows.filter(row => (row.publisher || 'Unknown') === p.publisher)
      const score = pRows.length ? avgValue(pRows, row => row.ln_score) : 0
      return { publisher: p.publisher, score }
    })
    .sort((a, b) => b.score - a.score || a.publisher.localeCompare(b.publisher))
  const avgScoreRank = Math.max(1, avgScoreRanks.findIndex(p => p.publisher === currentName) + 1)
  const marketShare = publisher?.marketShare || 0
  const publisherPickerItems = publishers.map(p => ({ publisher: p.publisher }))

  if (!publisher) {
    return <Card className="p-6 text-sm"><span style={{ color: 'var(--foreground-muted)' }}>Không có dữ liệu nhà phát hành.</span></Card>
  }

  const kpis = [
    { label: 'Số truyện có bản quyền', value: portfolioRows.length.toLocaleString('vi-VN'), delta: `${activeSeries} active`, color: '#818cf8' },
    { label: 'Số tập truyện phát hành', value: publisherVolumes.length.toLocaleString('vi-VN'), delta: `${marketShare.toFixed(1)}% share`, color: '#38bdf8' },
    { label: 'Số LN còn sống', value: activeSeries.toLocaleString('vi-VN'), delta: `${completedSeries} completed`, color: '#22c55e' },
    { label: 'Điểm LN trung bình', value: avgScore.toFixed(2), delta: `Rank #${avgScoreRank}`, color: scoreColor(avgScore) },
    { label: 'Khả năng drop LN trung bình', value: `${avgDrop.toFixed(1)}%`, delta: 'rủi ro portfolio', color: dropColor(avgDrop) },
  ]

  return (
    <div className="space-y-4 animate-in fade-in duration-200">
      {/* 1. Detailed Publisher Focus Header */}
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
              <p className="text-[10px] font-black uppercase tracking-wide" style={{ color: 'var(--foreground-muted)' }}>Nhà phát hành</p>
              <div className="flex items-center gap-3 min-w-0">
                <h2 className="text-2xl font-black truncate" style={{ color: 'var(--foreground)' }}>{currentName}</h2>
                <span className="shrink-0 text-2xl font-black leading-none" style={{ color: 'var(--foreground-muted)', textShadow: '0 0 14px rgba(234,179,8,.55)' }}>#{rank}</span>
                <PublisherHeaderPicker
                  currentName={currentName}
                  publishers={publisherPickerItems}
                  publisherLogos={publisherLogos}
                  onSelect={(p) => setSelectedPublisher(p)}
                  vi={vi}
                />
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
              <p className="text-[10px] font-black uppercase tracking-wide" style={{ color: 'var(--foreground-muted)' }}>Publisher Reliability</p>
              <span className="text-sm font-black" style={{ color: 'var(--foreground-muted)' }}>Rank {rank}/{publishers.length}</span>
            </div>
            <div className="flex items-end gap-2">
              <span className="text-5xl font-black leading-none" style={{ color: publisherScoreColor(reliability) }}>{reliability.toFixed(0)}</span>
              <span className="pb-1 text-sm" style={{ color: 'var(--foreground-muted)' }}>/100</span>
            </div>
            <div className="h-2 rounded-full overflow-hidden mt-3" style={{ background: 'var(--ln-track-bg)' }}>
              <div className="h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, reliability))}%`, background: 'linear-gradient(90deg,#38bdf8,#a78bfa)' }} />
            </div>
          </div>
        </div>
      </Card>

      {/* 2. Publisher Analytics Detail Sections */}
      <div className="grid grid-cols-1 xl:grid-cols-[0.78fr_1.45fr_0.92fr] gap-3 items-stretch">
        <PublisherDNARadar publisher={publisher} rows={portfolioRows} volumeRows={publisherVolumes} vi={vi} />
        <PublisherSeriesCarousel rows={portfolioRows} selectedKey={selectedKey} vi={vi} />
        <PublisherBreakdown rows={portfolioRows} vi={vi} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[0.78fr_1.28fr_0.9fr] gap-3 items-start">
        <div className="grid grid-cols-1 gap-3">
          <GrowthChart volumeRows={publisherVolumes} vi={vi} />
          <Heatmap rows={portfolioRows} volumeRows={publisherVolumes} vi={vi} />
        </div>
        <PublisherPortfolioMap rows={portfolioRows} selectedKey={selectedKey} vi={vi} onSelect={onSelectSeries} />
        <PublisherRiskCards rows={portfolioRows} vi={vi} />
      </div>
    </div>
  )
}
