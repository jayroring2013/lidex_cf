'use client'

import { useEffect, useState, useMemo, useRef, useCallback } from 'react'
import { Scatter } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  LinearScale,
  PointElement,
  Tooltip,
  Legend,
  ChartOptions,
} from 'chart.js'
import { Loader2, RefreshCw, BarChart2, Tv, BookOpen, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react'
import { useLocale } from '@/contexts/LocaleContext'
import { fetchChartAnime, fetchChartNovelsData } from '@/lib/db'

ChartJS.register(LinearScale, PointElement, Tooltip, Legend)

// ── Shared constants ──────────────────────────────────────────────────────────
const SCORE_DIST_KEYS = ['10','20','30','40','50','60','70','80','90','100']

// Axis options built dynamically so labels can be translated
function buildAnimeAxisOptions(t: (k: any) => string) {
  return [
    { value: 'popularity', label: t('axis_popularity') },
    { value: 'favourites', label: t('axis_favourites') },
    { value: 'mean_score', label: t('axis_mean_score') },
    ...SCORE_DIST_KEYS.map(k => ({ value: `score_${k}`, label: `Score ${k} (voters)` })),
  ]
}
function buildNovelAxisOptions(t: (k: any) => string) {
  return [
    { value: 'volume_count', label: 'Volumes'       },
    { value: 'votes',        label: t('axis_votes') },
    { value: 'price',        label: 'Price'         },
    { value: 'avg_price',    label: 'Average Price' },
    // latest_year removed — moved to filter
  ]
}

const FORMAT_OPTIONS = ['All', 'TV', 'MOVIE', 'OVA', 'ONA', 'SPECIAL']

function buildAvgPriceBuckets(t: (k: any) => string) {
  return [
    { value: 'All',       label: t('all_avg_prices')   },
    { value: 'under50k',  label: '< 50,000 ₫'          },
    { value: '50-100k',   label: '50,000–100,000 ₫'    },
    { value: '100-150k',  label: '100,000–150,000 ₫'   },
    { value: 'over150k',  label: '> 150,000 ₫'         },
  ]
}

function matchAvgPrice(avg: number | null, bucket: string): boolean {
  if (bucket === 'All' || avg == null) return true
  if (bucket === 'under50k')  return avg < 50_000
  if (bucket === '50-100k')   return avg >= 50_000  && avg < 100_000
  if (bucket === '100-150k')  return avg >= 100_000 && avg < 150_000
  if (bucket === 'over150k')  return avg >= 150_000
  return true
}
const SEASON_OPTIONS = ['All', 'WINTER', 'SPRING', 'SUMMER', 'FALL']

const FORMAT_COLORS: Record<string, string> = {
  TV:      'rgba(99,102,241,0.85)',
  MOVIE:   'rgba(236,72,153,0.85)',
  OVA:     'rgba(251,191,36,0.85)',
  ONA:     'rgba(34,197,94,0.85)',
  SPECIAL: 'rgba(251,146,60,0.85)',
  OTHER:   'rgba(148,163,184,0.6)',
}

// Publisher color palette (same hash approach)
const PUBLISHER_PALETTE = [
  '#6366f1','#ec4899','#f59e0b','#22c55e','#ef4444',
  '#06b6d4','#a855f7','#f97316','#14b8a6','#84cc16',
  '#3b82f6','#e11d48','#d97706','#16a34a','#dc2626',
  '#0284c7','#9333ea','#ea580c','#0d9488','#65a30d',
  '#4f46e5','#db2777','#b45309','#15803d','#b91c1c',
  '#0369a1','#7c3aed','#c2410c','#0f766e','#4d7c0f',
]

function publisherColorIndex(name: string): number {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return h % PUBLISHER_PALETTE.length
}

function publisherColor(pub: string | null): string {
  if (!pub) return 'rgba(148,163,184,0.5)'
  return PUBLISHER_PALETTE[publisherColorIndex(pub)] + 'cc'
}

// ── Types ─────────────────────────────────────────────────────────────────────
interface AnimeSeries {
  id:    number
  title: string
  anime_meta: {
    popularity:         number | null
    favourites:         number | null
    mean_score:         number | null
    format:             string | null
    season:             string | null
    season_year:        number | null
    score_distribution: Record<string, number> | string | null
  } | null
}

interface NovelRow {
  id:           number
  title:        string
  publisher:    string | null
  volume_count: number
  price:        number | null   // sum of volume prices
  avg_price:    number | null   // price / volume_count
  latest_year:  number | null
  votes:        number | null
  period:       string | null
}

interface PlotPoint {
  x:       number
  y:       number
  title:   string
  id:      number
  color:   string
  label:   string   // subtitle for tooltip (format or publisher)
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function parseScoreDist(raw: any): Record<string, number> {
  if (!raw) return {}
  if (typeof raw === 'string') { try { return JSON.parse(raw) } catch { return {} } }
  return raw as Record<string, number>
}

function getAnimeValue(meta: AnimeSeries['anime_meta'], axis: string): number | null {
  if (!meta) return null
  if (axis === 'popularity') return meta.popularity ?? null
  if (axis === 'favourites') return meta.favourites ?? null
  if (axis === 'mean_score') return meta.mean_score ?? null
  if (axis.startsWith('score_')) {
    const dist = parseScoreDist(meta.score_distribution)
    return dist[axis.replace('score_', '')] ?? null
  }
  return null
}

function getNovelValue(row: NovelRow, axis: string): number | null {
  if (axis === 'volume_count') return row.volume_count ?? 0
  if (axis === 'votes')        return row.votes        ?? 0
  if (axis === 'price')        return row.price        ?? null
  if (axis === 'avg_price')    return row.avg_price    ?? null
  if (axis === 'latest_year')  return row.latest_year  ?? null
  return null
}

const selectStyle = {
  background: 'var(--background-secondary)',
  color:      'var(--foreground)',
  border:     '1px solid var(--card-border)',
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function ChartsPage() {
  const { t } = useLocale()
  const ANIME_AXIS_OPTIONS = buildAnimeAxisOptions(t)
  const NOVEL_AXIS_OPTIONS = buildNovelAxisOptions(t)
  const AVG_PRICE_BUCKETS  = buildAvgPriceBuckets(t)

  const [mode, setMode] = useState<'anime' | 'novel'>('anime')

  // ── Zoom + Pan state ─────────────────────────────────────────────────────
  const chartRef    = useRef<any>(null)
  const chartWrapRef = useRef<HTMLDivElement>(null)
  const isDragging  = useRef(false)
  const dragStart   = useRef<{ x: number; y: number; xMin: number; xMax: number; yMin: number; yMax: number } | null>(null)
  const [zoomLevel, setZoomLevel] = useState(1)
  const [zoomBounds, setZoomBounds] = useState<{
    xMin?: number; xMax?: number; yMin?: number; yMax?: number
  } | null>(null)
  const [isPanning, setIsPanning] = useState(false)

  // Anime state
  const [allAnime,  setAllAnime]  = useState<AnimeSeries[]>([])
  const [animeLoading, setAnimeLoading] = useState(true)

  // Novel state
  const [allNovels,         setAllNovels]         = useState<NovelRow[]>([])
  const [rawVolsBySeriesId, setRawVolsBySeriesId] = useState<Record<number, {year: number|null, price: number}[]>>({})
  const [allPeriods,   setAllPeriods]   = useState<string[]>([])
  const [votesByPeriod,setVotesByPeriod] = useState<Record<string, Record<string, number>>>({}) // period -> title -> votes
  const [novelLoading, setNovelLoading]  = useState(true)

  const [isDark, setIsDark] = useState(false)

  // Anime controls
  const [xAxis,        setXAxis]        = useState('popularity')
  const [yAxis,        setYAxis]        = useState('mean_score')
  const [formatFilter, setFormatFilter] = useState('All')
  const [seasonFilter, setSeasonFilter] = useState('All')
  const [yearFilter,   setYearFilter]   = useState('All')
  const [animeSearch,  setAnimeSearch]  = useState('')

  // Novel controls
  const [nxAxis,         setNxAxis]         = useState('volume_count')
  const [nyAxis,         setNyAxis]         = useState('votes')
  const [periodFilter,    setPeriodFilter]    = useState('All')
  const [publisherFilter, setPublisherFilter] = useState('All')
  const [avgPriceFilter,  setAvgPriceFilter]  = useState('All')  // 'All' | 'under50k' | '50-100k' | '100-150k' | 'over150k'
  const [novelSearch,     setNovelSearch]     = useState('')
  const [novelYearFilter, setNovelYearFilter] = useState('All')

  // Dark mode observer
  useEffect(() => {
    const update = () => setIsDark(document.documentElement.classList.contains('dark'))
    update()
    const obs = new MutationObserver(update)
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => obs.disconnect()
  }, [])

  // Fetch anime
  useEffect(() => {
    async function load() {
      setAnimeLoading(true)
      const data = await fetchChartAnime()
      setAllAnime(data as any)
      setAnimeLoading(false)
    }
    load()
  }, [])

  // Fetch novels — replicates the SQL query using Supabase joins
  useEffect(() => {
    async function load() {
      setNovelLoading(true)
      const res = await fetchChartNovelsData()
      setAllNovels(res.allNovels)
      setRawVolsBySeriesId(res.rawVolsBySeriesId)
      setAllPeriods(res.allPeriods)
      setVotesByPeriod(res.votesByPeriod)
      setNovelLoading(false)
    }
    load()
  }, [])

  // ── Anime derived data ────────────────────────────────────────────────────
  const availableYears = useMemo(() => {
    const s = new Set<number>()
    allAnime.forEach(a => { if (a.anime_meta?.season_year) s.add(a.anime_meta.season_year) })
    return ['All', ...Array.from(s).sort((a, b) => b - a).map(String)]
  }, [allAnime])

  const animePoints = useMemo(() => {
    const filtered = allAnime.filter(s => {
      const m = s.anime_meta
      if (!m) return false
      if (formatFilter !== 'All' && (m.format || '').toUpperCase() !== formatFilter) return false
      if (seasonFilter !== 'All' && (m.season || '').toUpperCase() !== seasonFilter) return false
      if (yearFilter   !== 'All' && String(m.season_year) !== yearFilter) return false
      if (animeSearch  && !s.title.toLowerCase().includes(animeSearch.toLowerCase())) return false
      return true
    })
    const pts: PlotPoint[] = []
    for (const s of filtered) {
      const x = getAnimeValue(s.anime_meta, xAxis)
      const y = getAnimeValue(s.anime_meta, yAxis)
      if (x == null || y == null || isNaN(x) || isNaN(y)) continue
      const fmt = (s.anime_meta?.format || 'OTHER').toUpperCase()
      pts.push({ x, y, title: s.title, id: s.id, color: FORMAT_COLORS[fmt] ?? FORMAT_COLORS.OTHER, label: fmt })
    }
    return pts
  }, [allAnime, xAxis, yAxis, formatFilter, seasonFilter, yearFilter, animeSearch])

  // ── Novel derived data ────────────────────────────────────────────────────
  // Periods come directly from raw voting_result rows (all periods, not just latest-per-novel)
  const availablePeriods = allPeriods

  const availableNovelYears = useMemo(() => {
    const s = new Set<number>()
    allNovels.forEach(n => { if (n.latest_year) s.add(n.latest_year) })
    return ['All', ...Array.from(s).sort((a, b) => b - a).map(String)]
  }, [allNovels])

  const availablePublishers = useMemo(() => {
    const counts: Record<string, number> = {}
    allNovels.forEach(n => { if (n.publisher) counts[n.publisher] = (counts[n.publisher] || 0) + 1 })
    return ['All', ...Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 60).map(([p]) => p)]
  }, [allNovels])

  const novelPoints = useMemo(() => {
    const periodVotes = periodFilter !== 'All' ? (votesByPeriod[periodFilter] ?? {}) : null
    const pts: PlotPoint[] = []

    for (const n of allNovels) {
      // ── Filters ──────────────────────────────────────────────────────────
      if (periodFilter    !== 'All' && periodVotes && !(n.title in periodVotes)) continue
      if (publisherFilter !== 'All' && n.publisher !== publisherFilter)          continue
      if (novelSearch && !n.title.toLowerCase().includes(novelSearch.toLowerCase())) continue

      // ── Year-aware volume/price aggregation ───────────────────────────────
      // Re-compute volume_count, price, avg_price from raw volume data
      // scoped to the selected year. If 'All', use all volumes.
      const rawVols = rawVolsBySeriesId[n.id as number] ?? []
      const filteredVols = novelYearFilter === 'All'
        ? rawVols
        : rawVols.filter(v => v.year != null && String(v.year) === novelYearFilter)

      // Skip series with no volumes in the selected year
      if (novelYearFilter !== 'All' && filteredVols.length === 0) continue

      const dynCount    = filteredVols.length
      const dynPrice    = filteredVols.reduce((sum, v) => sum + v.price, 0)
      const dynAvgPrice = dynCount > 0 && dynPrice > 0 ? Math.round(dynPrice / dynCount) : null

      const dynRow: NovelRow = {
        ...n,
        volume_count: dynCount,
        price:        dynPrice > 0 ? dynPrice : null,
        avg_price:    dynAvgPrice,
        votes:        periodVotes ? (periodVotes[n.title] ?? 0) : n.votes,
      }

      if (!matchAvgPrice(dynRow.avg_price, avgPriceFilter)) continue

      const x = getNovelValue(dynRow, nxAxis)
      const y = getNovelValue(dynRow, nyAxis)
      if (x == null || y == null || isNaN(x) || isNaN(y)) continue

      pts.push({ x, y, title: n.title, id: n.id, color: publisherColor(n.publisher), label: n.publisher || 'Unknown' })
    }
    return pts
  }, [allNovels, rawVolsBySeriesId, nxAxis, nyAxis, periodFilter, publisherFilter, avgPriceFilter, novelSearch, votesByPeriod, novelYearFilter])

  // ── Active points (based on mode) ────────────────────────────────────────
  const points  = mode === 'anime' ? animePoints  : novelPoints
  const loading = mode === 'anime' ? animeLoading : novelLoading

  const { medianX, medianY } = useMemo(() => {
    const xs = points.map(p => p.x).sort((a, b) => a - b)
    const ys = points.map(p => p.y).sort((a, b) => a - b)
    const mid = (arr: number[]) => arr.length ? arr[Math.floor(arr.length / 2)] : 0
    return { medianX: mid(xs), medianY: mid(ys) }
  }, [points])

  const topIds = useMemo(
    () => new Set([...points].sort((a, b) => b.y - a.y).slice(0, 15).map(p => p.id)),
    [points]
  )
  const normalPoints    = points.filter(p => !topIds.has(p.id))
  const highlightPoints = points.filter(p =>  topIds.has(p.id))

  // Novel legend: top publishers in current view
  const novelLegend = useMemo(() => {
    const counts: Record<string, number> = {}
    novelPoints.forEach(p => { counts[p.label] = (counts[p.label] || 0) + 1 })
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 10)
  }, [novelPoints])

  const gridColor  = isDark ? 'rgba(148,163,184,0.1)' : 'rgba(100,116,139,0.12)'
  const labelColor = isDark ? 'rgba(148,163,184,1)'   : 'rgba(71,85,105,1)'

  const axisLabel = (v: string) => {
    const opts = mode === 'anime' ? ANIME_AXIS_OPTIONS : NOVEL_AXIS_OPTIONS
    return opts.find(o => o.value === v)?.label ?? v
  }
  const curX = mode === 'anime' ? xAxis  : nxAxis
  const curY = mode === 'anime' ? yAxis  : nyAxis

  const chartData = {
    datasets: [
      {
        label:            'Main',
        data:             normalPoints,
        backgroundColor:  normalPoints.map(p => p.color),
        pointRadius:      5,
        pointHoverRadius: 7,
      },
      {
        label:            'Top',
        data:             highlightPoints,
        backgroundColor:  highlightPoints.map(p => p.color),
        pointRadius:      9,
        pointHoverRadius: 11,
        pointBorderColor: highlightPoints.map(p => p.color.replace('cc','ff')),
        pointBorderWidth: 2,
      },
    ],
  }

  // ── Zoom helpers ─────────────────────────────────────────────────────────
  const applyZoom = useCallback((factor: number) => {
    const chart = chartRef.current
    if (!chart) return
    const xScale = chart.scales.x
    const yScale = chart.scales.y
    if (!xScale || !yScale) return

    const xRange  = xScale.max - xScale.min
    const yRange  = yScale.max - yScale.min
    const xCenter = (xScale.max + xScale.min) / 2
    const yCenter = (yScale.max + yScale.min) / 2
    const newXRange = xRange / factor
    const newYRange = yRange / factor

    const bounds = {
      xMin: xCenter - newXRange / 2,
      xMax: xCenter + newXRange / 2,
      yMin: yCenter - newYRange / 2,
      yMax: yCenter + newYRange / 2,
    }
    setZoomBounds(bounds)
    setZoomLevel(prev => Math.round(prev * factor * 10) / 10)
  }, [])

  const resetZoom = useCallback(() => {
    setZoomBounds(null)
    setZoomLevel(1)
  }, [])

  // ── Pan helpers ──────────────────────────────────────────────────────────
  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const chart = chartRef.current
    if (!chart) return
    const xScale = chart.scales.x
    const yScale = chart.scales.y
    if (!xScale || !yScale) return
    isDragging.current = true
    setIsPanning(true)
    dragStart.current = {
      x: e.clientX, y: e.clientY,
      xMin: xScale.min, xMax: xScale.max,
      yMin: yScale.min, yMax: yScale.max,
    }
    e.preventDefault()
  }, [])

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDragging.current || !dragStart.current) return
    const chart = chartRef.current
    if (!chart) return
    const xScale = chart.scales.x
    const yScale = chart.scales.y
    if (!xScale || !yScale) return

    const dx = e.clientX - dragStart.current.x
    const dy = e.clientY - dragStart.current.y

    // Convert pixel delta to data units
    const xRange    = dragStart.current.xMax - dragStart.current.xMin
    const yRange    = dragStart.current.yMax - dragStart.current.yMin
    const chartW    = xScale.right - xScale.left
    const chartH    = yScale.bottom - yScale.top
    const xDataDelta = (dx / chartW) * xRange
    const yDataDelta = (dy / chartH) * yRange

    setZoomBounds({
      xMin: dragStart.current.xMin - xDataDelta,
      xMax: dragStart.current.xMax - xDataDelta,
      yMin: dragStart.current.yMin + yDataDelta,
      yMax: dragStart.current.yMax + yDataDelta,
    })
  }, [])

  const handleMouseUp = useCallback(() => {
    isDragging.current = false
    setIsPanning(false)
    dragStart.current = null
  }, [])

  const handleWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    // Scroll wheel zoom — pinch-to-zoom feel
    e.preventDefault()
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15
    applyZoom(factor)
  }, [applyZoom])

  // ── Non-passive wheel listener to block page scroll ─────────────────────
  useEffect(() => {
    const el = chartWrapRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      e.stopPropagation()
      const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15
      applyZoom(factor)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [applyZoom])

  const chartOptions: ChartOptions<'scatter'> = {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: isDragging.current ? 0 : 200 },
    scales: {
      x: {
        grid:  { color: gridColor },
        ticks: { color: labelColor, maxTicksLimit: 10 },
        title: { display: true, text: axisLabel(curX), color: labelColor, font: { size: 13, weight: 600 } },
        ...(zoomBounds?.xMin != null ? { min: zoomBounds.xMin, max: zoomBounds.xMax } : {}),
      },
      y: {
        grid:  { color: gridColor },
        ticks: { color: labelColor, maxTicksLimit: 10 },
        title: { display: true, text: axisLabel(curY), color: labelColor, font: { size: 13, weight: 600 } },
        ...(zoomBounds?.yMin != null ? { min: zoomBounds.yMin, max: zoomBounds.yMax } : {}),
      },
    },
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx) => {
            const r = ctx.raw as PlotPoint
            const sub = mode === 'anime' ? `Format: ${r.label}` : `Publisher: ${r.label}`
            // Don't format years with toLocaleString (2025 → "2.025" in some locales)
            const fmtVal = (axis: string, val: number) => {
              if (axis === 'latest_year' || axis === 'year') return String(val)
              if (axis === 'price' || axis === 'avg_price') return val.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' ₫'
              return val.toLocaleString()
            }
            return [r.title, sub, `${axisLabel(curX)}: ${fmtVal(curX, r.x)}`, `${axisLabel(curY)}: ${fmtVal(curY, r.y)}`]
          },
        },
        backgroundColor: isDark ? 'rgba(15,23,42,0.96)' : 'rgba(255,255,255,0.97)',
        titleColor:      isDark ? '#f8fafc' : '#0f172a',
        bodyColor:       isDark ? '#94a3b8' : '#475569',
        borderColor:     isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)',
        borderWidth: 1,
        padding: 10,
        titleFont: { weight: 'bold', size: 13 },
      },
    },
  }

  // Use a ref so the plugin always reads the LATEST values without stale closures
  const pluginDataRef = useRef({ highlightPoints, medianX, medianY, isDark, mode })
  useEffect(() => {
    pluginDataRef.current = { highlightPoints, medianX, medianY, isDark, mode }
  })

  const labelPlugin = useMemo(() => ({
    id: 'scatterLabels',
    afterDatasetsDraw(chart: any) {
      const { highlightPoints, medianX, medianY, isDark } = pluginDataRef.current
      const ctx   = chart.ctx
      const meta1 = chart.getDatasetMeta(1)
      if (!meta1?.data?.length) return

      ctx.save()
      ctx.font = '600 11px system-ui, sans-serif'
      ctx.textBaseline = 'middle'

      // Max label width before truncating (px) — keeps labels readable without overflow
      const MAX_LABEL_W = 160

      meta1.data.forEach((el: any, i: number) => {
        const pt = highlightPoints[i]
        if (!pt) return
        const { x, y } = el.getProps(['x','y'], true)

        // Truncate only if text is too wide — use full title, trim to fit MAX_LABEL_W
        let text = pt.title
        // Remove subtitle after ' - ' or ': '
        text = text.split(' - ')[0].split(': ')[0].trim()

        // Measure and trim word-by-word until it fits
        let measured = ctx.measureText(text).width
        if (measured > MAX_LABEL_W) {
          const words = text.split(' ')
          let trimmed = ''
          for (const word of words) {
            const candidate = trimmed ? trimmed + ' ' + word : word
            if (ctx.measureText(candidate + '…').width > MAX_LABEL_W) break
            trimmed = candidate
          }
          text = trimmed + '…'
          measured = ctx.measureText(text).width
        }

        const padX = 8, padY = 5
        const pw   = measured + padX * 2
        const ph   = 20
        // Center above the point; clamp horizontally inside chart area
        const chartLeft  = chart.chartArea?.left  ?? 0
        const chartRight = chart.chartArea?.right ?? chart.width
        let px = x - pw / 2
        px = Math.max(chartLeft + 2, Math.min(px, chartRight - pw - 2))
        const py = y - 14 - ph

        // Background pill — no border, just semi-transparent fill
        ctx.fillStyle = isDark ? 'rgba(15,23,42,0.82)' : 'rgba(241,245,249,0.92)'
        ctx.beginPath()
        ctx.roundRect(px, py, pw, ph, ph / 2)
        ctx.fill()

        // Text
        ctx.fillStyle = isDark ? '#f1f5f9' : '#1e293b'
        ctx.fillText(text, px + padX, py + ph / 2)
      })

      // Median lines
      const xScale = chart.scales.x
      const yScale = chart.scales.y
      if (!xScale || !yScale) { ctx.restore(); return }

      ctx.strokeStyle = isDark ? 'rgba(148,163,184,0.35)' : 'rgba(100,116,139,0.3)'
      ctx.lineWidth   = 1.5
      ctx.setLineDash([6, 4])

      const mxPx = xScale.getPixelForValue(medianX)
      const myPx = yScale.getPixelForValue(medianY)

      ctx.beginPath(); ctx.moveTo(mxPx, yScale.top);  ctx.lineTo(mxPx, yScale.bottom); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(xScale.left, myPx); ctx.lineTo(xScale.right, myPx);  ctx.stroke()

      ctx.setLineDash([])
      ctx.restore()
    },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), []) // created once — reads live data via ref

  return (
    <div className="min-h-screen" style={{ background: 'var(--background)' }}>
      <div className="max-w-7xl mx-auto px-4 py-8">

        {/* ── Header ── */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold mb-1 flex items-center gap-2" style={{ color: 'var(--foreground)' }}>
              <BarChart2 className="w-8 h-8 text-primary-500" />
              {t('charts_title')}
            </h1>
            <p className="text-sm" style={{ color: 'var(--foreground-secondary)' }}>
              {mode === 'anime' ? t('charts_subtitle_anime') : t('charts_subtitle_novel')} — {points.length.toLocaleString()} {t('series_plotted')}
            </p>
          </div>
          <div className="mt-4 md:mt-0 flex items-center gap-3">

            {/* ── Mode switch ── */}
            <div className="flex rounded-xl overflow-hidden" style={{ border: '1px solid var(--card-border)' }}>
              <button
                onClick={() => setMode('anime')}
                className="flex items-center gap-2 px-4 py-2 text-sm font-semibold transition-all"
                style={mode === 'anime'
                  ? { background: '#6366f1', color: '#fff' }
                  : { background: 'var(--background-secondary)', color: 'var(--foreground-secondary)' }}
              >
                <Tv className="w-4 h-4" /> Anime
              </button>
              <button
                onClick={() => setMode('novel')}
                className="flex items-center gap-2 px-4 py-2 text-sm font-semibold transition-all"
                style={mode === 'novel'
                  ? { background: '#6366f1', color: '#fff' }
                  : { background: 'var(--background-secondary)', color: 'var(--foreground-secondary)' }}
              >
                <BookOpen className="w-4 h-4" /> {t('nav_charts') === 'Biểu đồ' ? 'Tiểu thuyết' : 'Novel'}
              </button>
            </div>

            <button onClick={() => window.location.reload()} className="p-2 glass rounded-lg" title="Refresh">
              <RefreshCw className="w-4 h-4" style={{ color: 'var(--foreground-secondary)' }} />
            </button>
          </div>
        </div>

        {/* ── Chart Card ── */}
        <div className="glass rounded-2xl overflow-hidden">

          {/* ── ANIME: Row 1 — format buttons + season / year ── */}
          {mode === 'anime' && (
            <div className="flex flex-wrap items-center gap-2 px-6 py-4" style={{ borderBottom: '1px solid var(--card-border)' }}>
              {FORMAT_OPTIONS.map(f => (
                <button
                  key={f}
                  onClick={() => setFormatFilter(f)}
                  className="px-4 py-1.5 rounded-lg text-sm font-semibold transition-all"
                  style={formatFilter === f
                    ? { background: '#6366f1', color: '#fff' }
                    : { ...selectStyle }}
                >
                  {f}
                </button>
              ))}
              <div className="ml-auto flex items-center gap-2 flex-wrap">
                <select value={seasonFilter} onChange={e => setSeasonFilter(e.target.value)} className="text-sm rounded-lg px-3 py-1.5 outline-none" style={selectStyle}>
                  {SEASON_OPTIONS.map(s => <option key={s} value={s}>{s === 'All' ? t('all_seasons') : s}</option>)}
                </select>
                <select value={yearFilter} onChange={e => setYearFilter(e.target.value)} className="text-sm rounded-lg px-3 py-1.5 outline-none" style={selectStyle}>
                  {availableYears.map(y => <option key={y} value={y}>{y === 'All' ? t('all_years') : y}</option>)}
                </select>
              </div>
            </div>
          )}

          {/* ── NOVEL: Row 1 — period + publisher filters ── */}
          {mode === 'novel' && (
            <div className="flex flex-wrap items-center gap-2 px-6 py-4" style={{ borderBottom: '1px solid var(--card-border)' }}>
              <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--foreground-muted)' }}>{t('period_label')}</span>
              <select value={periodFilter} onChange={e => setPeriodFilter(e.target.value)} className="text-sm rounded-lg px-3 py-1.5 outline-none" style={selectStyle}>
                {availablePeriods.map(p => <option key={p} value={p}>{p === 'All' ? t('all_periods') : p}</option>)}
              </select>

              <span className="text-xs font-semibold uppercase tracking-wide ml-2" style={{ color: 'var(--foreground-muted)' }}>{t('publisher_label')}</span>
              <select value={publisherFilter} onChange={e => setPublisherFilter(e.target.value)} className="text-sm rounded-lg px-3 py-1.5 outline-none max-w-[200px]" style={selectStyle}>
                {availablePublishers.map(p => <option key={p} value={p}>{p === 'All' ? t('all_publishers') : p}</option>)}
              </select>

              <span className="text-xs font-semibold uppercase tracking-wide ml-2" style={{ color: 'var(--foreground-muted)' }}>{t('avg_vol_price')}</span>
              <select value={avgPriceFilter} onChange={e => setAvgPriceFilter(e.target.value)} className="text-sm rounded-lg px-3 py-1.5 outline-none" style={selectStyle}>
                {AVG_PRICE_BUCKETS.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
              </select>

              <span className="text-xs font-semibold uppercase tracking-wide ml-2" style={{ color: 'var(--foreground-muted)' }}>Year</span>
              <select value={novelYearFilter} onChange={e => setNovelYearFilter(e.target.value)} className="text-sm rounded-lg px-3 py-1.5 outline-none" style={selectStyle}>
                {availableNovelYears.map(y => <option key={y} value={y}>{y === 'All' ? 'All Years' : y}</option>)}
              </select>
            </div>
          )}

          {/* ── Row 2: X / Y axes + search ── */}
          <div className="flex flex-wrap items-center gap-3 px-6 py-4" style={{ borderBottom: '1px solid var(--card-border)' }}>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--foreground-muted)' }}>{t('axis_x')}</span>
              <select
                value={mode === 'anime' ? xAxis : nxAxis}
                onChange={e => mode === 'anime' ? setXAxis(e.target.value) : setNxAxis(e.target.value)}
                className="text-sm rounded-lg px-3 py-1.5 outline-none min-w-[180px]"
                style={selectStyle}
              >
                {(mode === 'anime' ? ANIME_AXIS_OPTIONS : NOVEL_AXIS_OPTIONS).map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--foreground-muted)' }}>{t('axis_y')}</span>
              <select
                value={mode === 'anime' ? yAxis : nyAxis}
                onChange={e => mode === 'anime' ? setYAxis(e.target.value) : setNyAxis(e.target.value)}
                className="text-sm rounded-lg px-3 py-1.5 outline-none min-w-[180px]"
                style={selectStyle}
              >
                {(mode === 'anime' ? ANIME_AXIS_OPTIONS : NOVEL_AXIS_OPTIONS).map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>

            <input
              type="text"
              placeholder={mode === 'anime' ? t('search_anime') : t('search_novel')}
              value={mode === 'anime' ? animeSearch : novelSearch}
              onChange={e => mode === 'anime' ? setAnimeSearch(e.target.value) : setNovelSearch(e.target.value)}
              className="text-sm rounded-lg px-3 py-1.5 outline-none ml-auto min-w-[200px]"
              style={selectStyle}
            />
          </div>

          {/* ── Chart area ── */}
          <div
            ref={chartWrapRef}
            className="relative px-4 pb-6 pt-4 select-none"
            style={{ height: '520px', cursor: zoomLevel !== 1 ? (isPanning ? 'grabbing' : 'grab') : 'default' }}
            onMouseDown={zoomLevel !== 1 ? handleMouseDown : undefined}
            onMouseMove={zoomLevel !== 1 ? handleMouseMove : undefined}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          >

            {/* Zoom controls — top-right corner of chart */}
            <div className="absolute top-5 right-5 z-20 flex items-center gap-1">
              <div className="flex items-center rounded-xl overflow-hidden"
                style={{ background: 'var(--glass-bg)', border: '1px solid var(--card-border)', backdropFilter: 'blur(8px)' }}>
                <button
                  onClick={() => applyZoom(1.4)}
                  title="Zoom in"
                  className="px-2.5 py-2 transition-colors hover:bg-primary-500/20"
                  style={{ color: 'var(--foreground-secondary)' }}>
                  <ZoomIn className="w-4 h-4" />
                </button>
                <div className="w-px h-5" style={{ background: 'var(--card-border)' }} />
                <button
                  onClick={() => applyZoom(1 / 1.4)}
                  title="Zoom out"
                  className="px-2.5 py-2 transition-colors hover:bg-primary-500/20"
                  style={{ color: 'var(--foreground-secondary)' }}>
                  <ZoomOut className="w-4 h-4" />
                </button>
                {zoomLevel !== 1 && (
                  <>
                    <div className="w-px h-5" style={{ background: 'var(--card-border)' }} />
                    <button
                      onClick={resetZoom}
                      title="Reset zoom"
                      className="px-2.5 py-2 transition-colors hover:bg-red-500/20"
                      style={{ color: 'var(--foreground-secondary)' }}>
                      <Maximize2 className="w-3.5 h-3.5" />
                    </button>
                  </>
                )}
              </div>
              {/* Zoom level badge + pan hint */}
              {zoomLevel !== 1 && (
                <div className="flex items-center gap-1.5">
                  <span className="px-2 py-1 rounded-lg text-xs font-bold"
                    style={{ background: 'var(--glass-bg)', border: '1px solid var(--card-border)', color: '#6366f1' }}>
                    {zoomLevel.toFixed(1)}×
                  </span>
                  <span className="px-2 py-1 rounded-lg text-[10px] font-medium hidden sm:block"
                    style={{ background: 'var(--glass-bg)', border: '1px solid var(--card-border)', color: 'var(--foreground-muted)' }}>
                    {isPanning ? '✋ Panning' : '✋ Drag to pan'}
                  </span>
                </div>
              )}
            </div>
            {loading ? (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="flex flex-col items-center gap-3">
                  <Loader2 className="w-10 h-10 text-primary-500 animate-spin" />
                  <span className="text-sm" style={{ color: 'var(--foreground-muted)' }}>{t('loading_data')}…</span>
                </div>
              </div>
            ) : points.length === 0 ? (
              <div className="absolute inset-0 flex items-center justify-center">
                <p className="text-sm" style={{ color: 'var(--foreground-muted)' }}>{t('no_data')}</p>
              </div>
            ) : (
              <Scatter key={mode} ref={chartRef} data={chartData} options={chartOptions} plugins={[labelPlugin as any]} />
            )}
          </div>

          {/* ── Legend ── */}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-6 py-3" style={{ borderTop: '1px solid var(--card-border)' }}>

            {/* Anime legend: format colors */}
            {mode === 'anime' && Object.entries(FORMAT_COLORS).filter(([k]) => k !== 'OTHER').map(([fmt, color]) => (
              <div key={fmt} className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full" style={{ background: color }} />
                <span className="text-xs" style={{ color: 'var(--foreground-secondary)' }}>{fmt}</span>
              </div>
            ))}

            {/* Novel legend: top publishers */}
            {mode === 'novel' && (
              <>
                <span className="text-xs font-semibold uppercase tracking-wide mr-1" style={{ color: 'var(--foreground-muted)' }}>{t('publishers_label')}</span>
                {novelLegend.map(([pub, count]) => (
                  <button
                    key={pub}
                    onClick={() => setPublisherFilter(publisherFilter === pub ? 'All' : pub)}
                    className="flex items-center gap-1.5 transition-opacity"
                    style={{ opacity: publisherFilter !== 'All' && publisherFilter !== pub ? 0.35 : 1 }}
                    title={`${count} novels — click to filter`}
                  >
                    <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: publisherColor(pub) }} />
                    <span className="text-xs" style={{ color: 'var(--foreground-secondary)' }}>{pub}</span>
                    <span className="text-xs" style={{ color: 'var(--foreground-muted)' }}>({count})</span>
                  </button>
                ))}
              </>
            )}

            <div className="flex items-center gap-1.5 ml-auto">
              <span className="inline-block w-6 border-t-2 border-dashed" style={{ borderColor: 'rgba(148,163,184,0.5)' }} />
              <span className="text-xs" style={{ color: 'var(--foreground-muted)' }}>{t('median')}</span>
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
