'use client'

import { useState, useEffect, useRef, useMemo, ReactNode } from 'react'
import { Search, ChevronDown, Sparkles, Check, X, BookOpen } from 'lucide-react'

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

function avgValue<T>(list: T[], fn: (item: T) => number): number {
  if (!list.length) return 0
  const sum = list.reduce((acc, item) => acc + (Number(fn(item)) || 0), 0)
  return sum / list.length
}

function pctValue(v: number | null | undefined): number {
  if (v === null || v === undefined) return 0
  return v > 1 ? v : v * 100
}

function publisherReliabilityScore(portfolioRows: LNRow[], publisherVolumes: VolumeReleaseRow[]) {
  if (!portfolioRows.length) return 0
  const avgScore = avgValue(portfolioRows, row => row.ln_score)
  const avgDrop = avgValue(portfolioRows, row => pctValue(row.drop_percent))
  const completed = portfolioRows.filter(row => row.evalution === 'Completed' || releaseStatus(row) === 'Hoàn thành').length
  const active = portfolioRows.filter(row => ['Đang phát hành', 'Đã bắt kịp bản gốc JP', 'Lâu lắm rồi chưa có tập mới'].includes(releaseStatus(row))).length
  const releasesCount = publisherVolumes.length

  const scorePart = (avgScore / 10) * 35
  const dropPart = (1 - Math.min(100, avgDrop) / 100) * 35
  const activePart = (active / Math.max(1, portfolioRows.length)) * 15
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
    return {
      publisher,
      rows: pRows,
      volumeRows: pVols,
      releases24,
      marketShare,
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
  'bg-gradient-to-b from-[#1638a0] to-[#0c2370]', // Deep Blue (Bac Ninh style)
  'bg-gradient-to-b from-[#dc2626] to-[#991b1b]', // Crimson Red (Cong An Ha Noi style)
  'bg-gradient-to-b from-[#b91c1c] to-[#7f1d1d]', // Dark Red (Cong An TPHCM style)
  'bg-gradient-to-b from-[#581c87] to-[#3b0764]', // Royal Purple (Ha Noi FC style)
  'bg-gradient-to-b from-[#c2410c] to-[#7c2d12]', // Hai Phong style
  'bg-gradient-to-b from-[#d97706] to-[#92400e]', // Hoang Anh Gia Lai Gold style
  'bg-gradient-to-b from-[#be123c] to-[#881337]', // Ha Tinh FC style
  'bg-gradient-to-b from-[#9f1239] to-[#4c0519]', // Binh Dinh style
]

function PublisherCardsGrid({
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
  selectedPublisher: string | null
  onSelectPublisher: (publisher: string) => void
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
          const bgClass = CARD_COLORS[idx % CARD_COLORS.length]

          return (
            <div
              key={p.publisher}
              onClick={() => onSelectPublisher(p.publisher)}
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
            </div>
          )
        })}
      </div>
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
  setSelectedPublisher: (publisher: string) => void
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
    <div className="space-y-4">
      {/* 1. Top Publisher Cards Grid (Matching Reference Image) */}
      <PublisherCardsGrid
        publishers={publishers}
        rows={rows}
        volumeRows={volumeRows}
        publisherLogos={publisherLogos}
        selectedPublisher={currentName}
        onSelectPublisher={setSelectedPublisher}
        vi={vi}
      />

      {/* 2. Detailed Publisher Focus Header */}
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
                  onSelect={setSelectedPublisher}
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
    </div>
  )
}
