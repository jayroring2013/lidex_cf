'use client'

export const dynamic = 'force-dynamic'

// Proxy MangaDex images through our API route to bypass CORS/hotlink blocking
const MANGADEX_DOMAINS = ['uploads.mangadex.org', 'cmdxd98ubx3fv.cloudfront.net', 'mangadex.org']
function proxyImg(url: string | null): string | null {
  if (!url) return null
  try {
    const hostname = new URL(url).hostname
    if (MANGADEX_DOMAINS.some(d => hostname.endsWith(d))) {
      return `/api/image-proxy?url=${encodeURIComponent(url)}`
    }
  } catch {}
  return url
}

import { useEffect, useState, useMemo, useCallback } from 'react'
import { createClient } from '@supabase/supabase-js'
import { ChevronUp, ChevronDown, ChevronsUpDown, Search, Loader2, SlidersHorizontal, X } from 'lucide-react'
import Link from 'next/link'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// ── Types ─────────────────────────────────────────────────────────────────────
type ItemType = 'anime' | 'manga' | 'novel'
type SortDir  = 'asc' | 'desc' | null

interface Row {
  id:               number | string
  title:            string
  cover_url:        string | null
  item_type:        string
  studio:           string | null
  publisher:        string | null
  status:           string | null
  // anime fields
  mean_score:       number | null
  popularity:       number | null
  favourites:       number | null
  episodes:         number | null
  duration_min:     number | null
  format:           string | null
  season:           string | null
  season_year:      number | null
  // novel fields
  volume_count:     number | null
  votes:            number | null
  avg_price:        number | null
  // manga fields (from manga table)
  rating:           number | null
  follows:          number | null
  year:             number | null
  author:           string | null
  demographic:      string | null
  content_rating:   string | null
  original_language:string | null
  genres:           string[] | null
  themes:           string[] | null
}

// ── Column definitions ────────────────────────────────────────────────────────
interface ColDef {
  key:     keyof Row
  label:   string
  short:   string
  numeric: boolean
  unit?:   string
  invert?: boolean  // lower = better (e.g. popularity rank)
}

const ANIME_COLS: ColDef[] = [
  { key: 'mean_score',   label: 'Mean Score',  short: 'SCORE',    numeric: true  },
  { key: 'popularity',   label: 'Popularity',  short: 'POP.',     numeric: true, invert: true },
  { key: 'favourites',   label: 'Favourites',  short: 'FAVS',     numeric: true  },
  { key: 'episodes',     label: 'Episodes',    short: 'EPS',      numeric: true  },
  { key: 'duration_min', label: 'Duration',    short: 'DUR.',     numeric: true, unit: 'min' },
  { key: 'format',       label: 'Format',      short: 'FORMAT',   numeric: false },
  { key: 'season',       label: 'Season',      short: 'SEASON',   numeric: false },
  { key: 'status',       label: 'Status',      short: 'STATUS',   numeric: false },
]

const MANGA_COLS: ColDef[] = [
  { key: 'rating',           label: 'Rating',       short: 'RATING',   numeric: true  },
  { key: 'follows',          label: 'Follows',      short: 'FOLLOWS',  numeric: true  },
  { key: 'year',             label: 'Year',         short: 'YEAR',     numeric: false },
  { key: 'author',           label: 'Author',       short: 'AUTHOR',   numeric: false },
  { key: 'demographic',      label: 'Demographic',  short: 'DEMO',     numeric: false },
  { key: 'content_rating',   label: 'Rating',       short: 'AGE',      numeric: false },
  { key: 'original_language',label: 'Language',     short: 'LANG',     numeric: false },
  { key: 'genres',           label: 'Genres',       short: 'GENRES',   numeric: false },
  { key: 'status',           label: 'Status',       short: 'STATUS',   numeric: false },
]

const NOVEL_COLS: ColDef[] = [
  { key: 'volume_count', label: 'Volumes',    short: 'VOLS',     numeric: true  },
  { key: 'votes',        label: 'Votes',      short: 'VOTES',    numeric: true  },
  { key: 'avg_price',    label: 'Avg Price',  short: 'AVG ₫',    numeric: true, unit: '₫' },
  { key: 'publisher',    label: 'Publisher',  short: 'PUBLISHER',numeric: false },
  { key: 'status',       label: 'Status',     short: 'STATUS',   numeric: false },
]

const COLS: Record<ItemType, ColDef[]> = {
  anime: ANIME_COLS,
  manga: MANGA_COLS,
  novel: NOVEL_COLS,
}

const FORMAT_OPTIONS = ['All', 'TV', 'MOVIE', 'OVA', 'ONA', 'SPECIAL']
const SEASON_OPTIONS  = ['All', 'WINTER', 'SPRING', 'SUMMER', 'FALL']
const STATUS_OPTIONS  = ['All', 'ongoing', 'completed', 'cancelled', 'hiatus', 'publishing', 'finished']

const sel = {
  background: 'var(--background-secondary)',
  color:      'var(--foreground)',
  border:     '1px solid var(--card-border)',
}

// ── Percentile coloring ───────────────────────────────────────────────────────
function usePercentiles(rows: Row[], keys: (keyof Row)[]) {
  return useMemo(() => {
    const maps: Partial<Record<keyof Row, number[]>> = {}
    for (const key of keys) {
      maps[key] = rows
        .map(r => r[key] as number | null)
        .filter((v): v is number => v != null)
        .sort((a, b) => a - b)
    }
    return maps
  }, [rows, keys])
}

function getPct(value: number, sorted: number[]): number {
  if (!sorted.length) return 50
  const rank = sorted.filter(v => v <= value).length
  return (rank / sorted.length) * 100
}

function pctColor(pct: number, invert = false): string {
  const p = invert ? 100 - pct : pct
  if (p >= 80) return '#4ade80'  // green
  if (p >= 60) return '#86efac'  // light green
  if (p >= 40) return 'var(--foreground)'
  if (p >= 20) return '#fca5a5'  // light red
  return '#f87171'               // red
}

function fmtVal(col: ColDef, val: any): string {
  if (val == null || val === '') return '—'
  // Arrays (genres, themes) — show first 2 tags
  if (Array.isArray(val)) {
    if (val.length === 0) return '—'
    return val.slice(0, 2).join(', ') + (val.length > 2 ? ` +${val.length - 2}` : '')
  }
  if (col.numeric) {
    const n = Number(val)
    if (col.key === 'popularity') return `#${n.toLocaleString()}`
    if (col.key === 'avg_price')  return n.toLocaleString() + ' ₫'
    if (col.key === 'follows' || col.key === 'favourites' || col.key === 'votes') {
      if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
      if (n >= 1_000)     return (n / 1_000).toFixed(1) + 'K'
      return String(n)
    }
    if (col.key === 'rating') return n.toFixed(2)
    if (col.unit) return `${n.toLocaleString()} ${col.unit}`
    return n.toLocaleString()
  }
  // year — don't uppercase
  if (col.key === 'year' || col.key === 'author' || col.key === 'original_language') return String(val)
  return String(val).toUpperCase()
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function IndexPage() {
  const [type,       setType]       = useState<ItemType>('anime')
  const [allRows,    setAllRows]    = useState<Row[]>([])
  const [loading,    setLoading]    = useState(true)
  const [search,     setSearch]     = useState('')
  const [sortKey,    setSortKey]    = useState<keyof Row>('mean_score')
  const [sortDir,    setSortDir]    = useState<SortDir>('desc')
  const [sidebarOpen,setSidebarOpen]= useState(true)

  // Filters
  const [formatF,    setFormatF]    = useState('All')
  const [seasonF,    setSeasonF]    = useState('All')
  const [statusF,    setStatusF]    = useState('All')
  const [yearF,      setYearF]      = useState('All')
  const [publisherF, setPublisherF] = useState('All')
  const [minScore,   setMinScore]   = useState(0)
  const [minPop,     setMinPop]     = useState(0)
  const [maxPop,     setMaxPop]     = useState(999999)
  const [minEps,     setMinEps]     = useState(0)
  const [minVols,    setMinVols]    = useState(0)
  const [minRating,  setMinRating]  = useState(0)
  const [demographicF,  setDemographicF]   = useState('All')
  const [contentRatingF,setContentRatingF] = useState('All')
  const [langF,         setLangF]          = useState('All')

  // Fetch data when type changes
  useEffect(() => {
    async function load() {
      setLoading(true)
      setAllRows([])

      if (type === 'anime') {
        const { data } = await supabase
          .from('series')
          .select('id, title, cover_url, item_type, studio, status, anime_meta!inner(mean_score, popularity, favourites, episodes, duration_min, format, season, season_year)')
          .eq('item_type', 'anime')
          .eq('anime_meta.season_year', 2026)
          .limit(3000)
        if (data) setAllRows(data.map((s: any) => ({
          ...s,
          mean_score:   s.anime_meta?.mean_score   ?? null,
          popularity:   s.anime_meta?.popularity   ?? null,
          favourites:   s.anime_meta?.favourites   ?? null,
          episodes:     s.anime_meta?.episodes     ?? null,
          duration_min: s.anime_meta?.duration_min ?? null,
          format:       s.anime_meta?.format       ?? null,
          season:       s.anime_meta?.season       ? `${s.anime_meta.season} ${s.anime_meta.season_year ?? ''}`.trim() : null,
          season_year:  s.anime_meta?.season_year  ?? null,
          volume_count: null, votes: null, avg_price: null, publisher: null,
        })))

      } else if (type === 'manga') {
        const { data } = await supabase
          .from('manga')
          .select('id, title_en, title_ja_ro, cover_url, status, demographic, content_rating, year, original_language, genres, themes, author, follows, rating')
          .order('follows', { ascending: false })
          .limit(3000)
        if (data) setAllRows(data.map((m: any) => ({
          id:                m.id,
          title:             m.title_en || m.title_ja_ro || m.id,
          cover_url:         proxyImg(m.cover_url) ?? null,
          item_type:         'manga',
          studio:            null,
          publisher:         null,
          status:            m.status,
          // anime fields — unused
          mean_score: null, popularity: null, favourites: null,
          episodes: null, duration_min: null, format: null,
          season: null, season_year: null,
          // novel fields — unused
          volume_count: null, votes: null, avg_price: null,
          // manga-specific
          rating:            m.rating    != null ? Number(m.rating)  : null,
          follows:           m.follows   != null ? Number(m.follows) : null,
          year:              m.year      != null ? Number(m.year)    : null,
          author:            m.author,
          demographic:       m.demographic,
          content_rating:    m.content_rating,
          original_language: m.original_language,
          genres:            Array.isArray(m.genres) ? m.genres : null,
          themes:            Array.isArray(m.themes) ? m.themes : null,
        })))

      } else {
        // Novel — series + volumes (batched) + voting_result
        const { data: sData } = await supabase
          .from('series')
          .select('id, title, cover_url, item_type, publisher, status')
          .eq('item_type', 'novel')
          .limit(2000)

        if (!sData) { setLoading(false); return }

        // Fetch volumes in batches of 200 to avoid .in() limit
        const seriesIds = sData.map((s: any) => s.id)
        const allVolData: any[] = []
        for (let i = 0; i < seriesIds.length; i += 200) {
          const chunk = seriesIds.slice(i, i + 200)
          const { data: vBatch } = await supabase
            .from('volumes')
            .select('series_id, price, is_special')
            .in('series_id', chunk)
            .limit(10000)
          if (vBatch) allVolData.push(...vBatch)
        }

        // Filter out specials — handle both boolean and string storage
        const volData = allVolData.filter(v => {
          const val = v.is_special
          if (typeof val === 'boolean') return val === false
          if (typeof val === 'string')  return val.toUpperCase() !== 'TRUE'
          return true
        })

        // Build vol map: series_id → { count, priceSum }
        const volMap: Record<number, { count: number; priceSum: number }> = {}
        for (const v of volData) {
          if (!volMap[v.series_id]) volMap[v.series_id] = { count: 0, priceSum: 0 }
          volMap[v.series_id].count++
          volMap[v.series_id].priceSum += Number(v.price) || 0
        }

        // Fetch voting results
        const { data: vtData } = await supabase
          .from('voting_result')
          .select('title, votes, period')
          .limit(10000)

        // Parse MM/YYYY → sortable int
        const parsePeriod = (p: string | null): number => {
          if (!p) return 0
          const parts = p.split('/')
          if (parts.length !== 2) return 0
          return parseInt(parts[1]) * 100 + parseInt(parts[0])
        }

        // Keep only the latest-period vote per title
        const latestVote: Record<string, { votes: number; _period: number }> = {}
        for (const vr of vtData || []) {
          const cur = parsePeriod(vr.period)
          const existing = latestVote[vr.title]
          if (!existing || cur > existing._period) {
            latestVote[vr.title] = { votes: Number(vr.votes) || 0, _period: cur }
          }
        }

        setAllRows(sData.map((s: any) => {
          const vol   = volMap[s.id]
          const cnt   = vol?.count    ?? 0
          const price = vol?.priceSum ?? null
          return {
            ...s,
            cover_url:  s.cover_url ?? null,
            studio: null,
            mean_score: null, popularity: null, favourites: null,
            episodes: null, duration_min: null, format: null,
            season: null, season_year: null,
            volume_count: cnt,
            votes:        latestVote[s.title]?.votes ?? null,
            avg_price:    price != null && cnt > 0 ? Math.round(price / cnt) : null,
          }
        }))
      }
      setLoading(false)
    }
    load()
  }, [type])

  // Reset filters on type change
  useEffect(() => {
    setSearch(''); setFormatF('All'); setSeasonF('All'); setStatusF('All')
    setYearF('All'); setPublisherF('All'); setMinScore(0); setMinPop(0)
    setMaxPop(999999); setMinEps(0); setMinVols(0)
    const defaults: Partial<Record<ItemType, keyof Row>> = { anime: 'mean_score', manga: 'follows', novel: 'votes' }
    setSortKey(defaults[type]!); setSortDir('desc')
  }, [type])

  const availableYears = useMemo(() => {
    const s = new Set<number>()
    allRows.forEach(r => { if (r.season_year) s.add(r.season_year) })
    return ['All', ...Array.from(s).sort((a, b) => b - a).map(String)]
  }, [allRows])

  const availablePublishers = useMemo(() => {
    const s = new Set<string>()
    allRows.forEach(r => { if (r.publisher) s.add(r.publisher) })
    return ['All', ...Array.from(s).sort()]
  }, [allRows])

  const availableDemographics = useMemo(() => {
    const s = new Set<string>()
    allRows.forEach(r => { if (r.demographic) s.add(r.demographic) })
    return ['All', ...Array.from(s).sort()]
  }, [allRows])

  const availableContentRatings = useMemo(() => {
    const s = new Set<string>()
    allRows.forEach(r => { if (r.content_rating) s.add(r.content_rating) })
    return ['All', ...Array.from(s).sort()]
  }, [allRows])

  const availableLanguages = useMemo(() => {
    const s = new Set<string>()
    allRows.forEach(r => { if (r.original_language) s.add(r.original_language) })
    return ['All', ...Array.from(s).sort()]
  }, [allRows])

  // Filter + sort
  const filtered = useMemo(() => {
    let rows = allRows.filter(r => {
      if (search && !r.title.toLowerCase().includes(search.toLowerCase())) return false
      if (statusF    !== 'All' && (r.status   || '').toLowerCase() !== statusF.toLowerCase()) return false
      if (publisherF !== 'All' && r.publisher !== publisherF) return false
      if (type === 'anime') {
        if (formatF !== 'All' && (r.format || '').toUpperCase() !== formatF) return false
        if (seasonF !== 'All' && (r.season || '').toUpperCase().startsWith(seasonF)) return false
        if (yearF   !== 'All' && String(r.season_year) !== yearF) return false
        if (r.mean_score != null && r.mean_score < minScore) return false
        if (r.popularity != null && r.popularity < minPop)  return false
        if (r.popularity != null && r.popularity > maxPop)  return false
        if (minEps > 0 && (r.episodes ?? 0) < minEps)       return false
      }
      if (type === 'novel') {
        if (minVols > 0 && (r.volume_count ?? 0) < minVols) return false
      }
      if (type === 'manga') {
        if (demographicF   !== 'All' && (r.demographic   || '').toLowerCase() !== demographicF.toLowerCase())   return false
        if (contentRatingF !== 'All' && (r.content_rating|| '').toLowerCase() !== contentRatingF.toLowerCase()) return false
        if (langF          !== 'All' && (r.original_language || '') !== langF)                                  return false
        if (minRating > 0  && (r.rating ?? 0) < minRating) return false
      }
      return true
    })

    if (sortKey && sortDir) {
      rows = [...rows].sort((a, b) => {
        const av = a[sortKey], bv = b[sortKey]
        if (av == null && bv == null) return 0
        if (av == null) return 1
        if (bv == null) return -1
        if (typeof av === 'number' && typeof bv === 'number') {
          return sortDir === 'asc' ? av - bv : bv - av
        }
        return sortDir === 'asc'
          ? String(av).localeCompare(String(bv))
          : String(bv).localeCompare(String(av))
      })
    }
    return rows
  }, [allRows, search, sortKey, sortDir, formatF, seasonF, statusF, yearF, publisherF, minScore, minPop, maxPop, minEps, minVols, type, demographicF, contentRatingF, langF, minRating])

  const cols = COLS[type]
  const numericKeys = cols.filter(c => c.numeric).map(c => c.key)
  const pctMaps = usePercentiles(filtered, numericKeys)

  function toggleSort(key: keyof Row) {
    if (sortKey === key) {
      setSortDir(d => d === 'desc' ? 'asc' : d === 'asc' ? null : 'desc')
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
  }

  function SortIcon({ k }: { k: keyof Row }) {
    if (sortKey !== k) return <ChevronsUpDown className="w-3 h-3 opacity-30" />
    if (sortDir === 'desc') return <ChevronDown className="w-3 h-3 text-primary-400" />
    if (sortDir === 'asc')  return <ChevronUp   className="w-3 h-3 text-primary-400" />
    return <ChevronsUpDown className="w-3 h-3 opacity-30" />
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--background)' }}>
      <div className="max-w-[1400px] mx-auto px-3 sm:px-4 py-4 sm:py-8">

        {/* ── Header ── */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold" style={{ color: 'var(--foreground)' }}>Index</h1>
            <p className="text-xs sm:text-sm mt-0.5" style={{ color: 'var(--foreground-secondary)' }}>
              {loading ? 'Loading…' : `${filtered.length.toLocaleString()} results`}
            </p>
          </div>

          {/* Type tabs */}
          <div className="flex rounded-xl overflow-hidden self-start sm:self-auto" style={{ border: '1px solid var(--card-border)' }}>
            {(['anime', 'manga', 'novel'] as ItemType[]).map(t => (
              <button
                key={t}
                onClick={() => setType(t)}
                className="px-3 sm:px-5 py-2 text-xs sm:text-sm font-semibold capitalize transition-all"
                style={type === t
                  ? { background: '#6366f1', color: '#fff' }
                  : { background: 'var(--background-secondary)', color: 'var(--foreground-secondary)' }}
              >
                {t === 'anime' ? 'Anime' : t === 'manga' ? 'Manga' : 'Tiểu thuyết'}
              </button>
            ))}
          </div>
        </div>

        {/* ── Mobile filter bar ── */}
        <div className="flex sm:hidden items-center gap-2 mb-3">
          <button
            onClick={() => setSidebarOpen(o => !o)}
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all"
            style={sidebarOpen
              ? { background: '#6366f1', color: '#fff' }
              : { background: 'var(--glass-bg)', color: 'var(--foreground-secondary)', border: '1px solid var(--card-border)' }}>
            <SlidersHorizontal className="w-3.5 h-3.5" />
            Filters
            {[statusF,formatF,seasonF,yearF,publisherF,demographicF,contentRatingF,langF].filter(v=>v!=='All').length > 0 && (
              <span className="w-4 h-4 rounded-full text-[10px] font-black flex items-center justify-center"
                style={{ background: 'rgba(255,255,255,0.3)' }}>
                {[statusF,formatF,seasonF,yearF,publisherF,demographicF,contentRatingF,langF].filter(v=>v!=='All').length}
              </span>
            )}
          </button>
          {/* Mobile search */}
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: 'var(--foreground-muted)' }} />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Tìm kiếm…"
              className="w-full pl-8 pr-3 py-2 text-xs rounded-xl outline-none"
              style={{ background: 'var(--glass-bg)', color: 'var(--foreground)', border: '1px solid var(--card-border)' }} />
            {search && <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2"><X className="w-3 h-3" style={{ color: 'var(--foreground-muted)' }} /></button>}
          </div>
        </div>

        {/* ── Mobile filter panel (collapsible) ── */}
        {sidebarOpen && (
          <div className="sm:hidden rounded-2xl overflow-hidden mb-3 p-4 space-y-4"
            style={{ background: 'var(--glass-bg)', border: '1px solid var(--card-border)' }}>
            <FilterSelect label="Status" value={statusF} onChange={setStatusF} options={STATUS_OPTIONS} />
            {type === 'anime' && <>
              <FilterSelect label="Format" value={formatF} onChange={setFormatF} options={FORMAT_OPTIONS} />
              <FilterSelect label="Year"   value={yearF}   onChange={setYearF}   options={availableYears} />
            </>}
            {type === 'manga' && <>
              <FilterSelect label="Demographic" value={demographicF}   onChange={setDemographicF}   options={availableDemographics}  />
              <FilterSelect label="Content"     value={contentRatingF} onChange={setContentRatingF} options={availableContentRatings} />
            </>}
            {type === 'novel' && <FilterSelect label="Publisher" value={publisherF} onChange={setPublisherF} options={availablePublishers.slice(0,40)} />}
            <button onClick={() => { setSearch(''); setFormatF('All'); setSeasonF('All'); setStatusF('All'); setYearF('All'); setPublisherF('All'); setMinScore(0); setMinPop(0); setMaxPop(999999); setMinEps(0); setMinVols(0); setMinRating(0); setDemographicF('All'); setContentRatingF('All'); setLangF('All') }}
              className="w-full py-1.5 text-xs font-semibold rounded-lg"
              style={{ background: 'var(--background-secondary)', color: 'var(--foreground-secondary)', border: '1px solid var(--card-border)' }}>
              Reset All
            </button>
          </div>
        )}

        <div className="flex gap-6 items-start">

          {/* ── Sidebar — desktop only ── */}
          <div
            className={`hidden sm:block flex-shrink-0 rounded-2xl overflow-hidden transition-all ${sidebarOpen ? 'w-64' : 'w-12'}`}
            style={{ background: 'var(--glass-bg)', border: '1px solid var(--card-border)' }}
          >
            {/* Toggle */}
            <button
              onClick={() => setSidebarOpen(o => !o)}
              className="w-full flex items-center gap-2 px-4 py-3 text-sm font-semibold transition-colors"
              style={{ borderBottom: '1px solid var(--card-border)', color: 'var(--foreground)' }}
            >
              <SlidersHorizontal className="w-4 h-4 flex-shrink-0 text-primary-400" />
              {sidebarOpen && 'Filters'}
            </button>

            {sidebarOpen && (
              <div className="p-4 space-y-5">

                {/* Search */}
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wide block mb-1.5" style={{ color: 'var(--foreground-muted)' }}>Search</label>
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: 'var(--foreground-muted)' }} />
                    <input
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                      placeholder="Title…"
                      className="w-full pl-8 pr-3 py-1.5 text-sm rounded-lg outline-none"
                      style={sel}
                    />
                    {search && (
                      <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2">
                        <X className="w-3 h-3" style={{ color: 'var(--foreground-muted)' }} />
                      </button>
                    )}
                  </div>
                </div>

                {/* Status */}
                <FilterSelect label="Status" value={statusF} onChange={setStatusF} options={STATUS_OPTIONS} />

                {/* Anime-specific */}
                {type === 'anime' && (<>
                  <FilterSelect label="Format" value={formatF} onChange={setFormatF} options={FORMAT_OPTIONS} />
                  <FilterSelect label="Season" value={seasonF} onChange={setSeasonF} options={SEASON_OPTIONS} />
                  <FilterSelect label="Year"   value={yearF}   onChange={setYearF}   options={availableYears} />

                  <SliderFilter
                    label="Min Score"
                    value={minScore} min={0} max={100} step={5}
                    onChange={setMinScore}
                    display={v => v === 0 ? 'Any' : `≥ ${v}`}
                  />
                  <SliderFilter
                    label="Min Episodes"
                    value={minEps} min={0} max={200} step={1}
                    onChange={setMinEps}
                    display={v => v === 0 ? 'Any' : `≥ ${v}`}
                  />
                </>)}

                {/* Manga-specific */}
                {type === 'manga' && (<>
                  <FilterSelect label="Demographic"  value={demographicF}  onChange={setDemographicF}  options={availableDemographics}  />
                  <FilterSelect label="Content"      value={contentRatingF}onChange={setContentRatingF}options={availableContentRatings} />
                  <FilterSelect label="Language"     value={langF}         onChange={setLangF}         options={availableLanguages}      />
                  <SliderFilter
                    label="Min Rating"
                    value={minRating} min={0} max={10} step={0.5}
                    onChange={setMinRating}
                    display={v => v === 0 ? 'Any' : `≥ ${v}`}
                  />
                </>)}

                {/* Novel-specific */}
                {type === 'novel' && (<>
                  <FilterSelect label="Publisher" value={publisherF} onChange={setPublisherF} options={availablePublishers.slice(0, 60)} />
                  <SliderFilter
                    label="Min Volumes"
                    value={minVols} min={0} max={50} step={1}
                    onChange={setMinVols}
                    display={v => v === 0 ? 'Any' : `≥ ${v}`}
                  />
                </>)}

                {/* Reset */}
                <button
                  onClick={() => {
                    setSearch(''); setFormatF('All'); setSeasonF('All')
                    setStatusF('All'); setYearF('All'); setPublisherF('All')
                    setMinScore(0); setMinPop(0); setMaxPop(999999); setMinEps(0); setMinVols(0)
                    setMinRating(0); setDemographicF('All'); setContentRatingF('All'); setLangF('All')
                  }}
                  className="w-full py-1.5 text-xs font-semibold rounded-lg transition-colors"
                  style={{ background: 'var(--background-secondary)', color: 'var(--foreground-secondary)', border: '1px solid var(--card-border)' }}
                >
                  Reset All
                </button>
              </div>
            )}
          </div>

          {/* ── Table ── */}
          <div className="flex-1 min-w-0 rounded-2xl overflow-hidden" style={{ background: 'var(--glass-bg)', border: '1px solid var(--card-border)' }}>
            {loading ? (
              <div className="flex items-center justify-center h-64">
                <div className="flex flex-col items-center gap-3">
                  <Loader2 className="w-8 h-8 text-primary-500 animate-spin" />
                  <span className="text-sm" style={{ color: 'var(--foreground-muted)' }}>Loading…</span>
                </div>
              </div>
            ) : (
              <>
              {/* ── Mobile card list ── */}
              <div className="sm:hidden divide-y" style={{ borderColor: 'var(--card-border)' }}>
                {filtered.length === 0
                  ? <p className="text-center py-12 text-sm" style={{ color: 'var(--foreground-muted)' }}>No results</p>
                  : filtered.slice(0, 100).map(row => (
                    <MobileCard key={row.id} row={row} cols={cols} pctMaps={pctMaps} type={type} />
                  ))
                }
                {filtered.length > 100 && (
                  <p className="text-center py-3 text-xs" style={{ color: 'var(--foreground-muted)' }}>
                    Showing 100 of {filtered.length.toLocaleString()} — use filters to narrow down
                  </p>
                )}
              </div>
              {/* ── Desktop table ── */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--card-border)', background: 'var(--background-secondary)' }}>
                      <th className="text-left px-5 py-3 font-semibold sticky left-0 z-10 whitespace-nowrap" style={{ color: 'var(--foreground-muted)', background: 'var(--glass-bg)', minWidth: 260 }}>
                        TITLE
                      </th>
                      {cols.map(col => (
                        <th
                          key={col.key}
                          className="px-4 py-3 text-right whitespace-nowrap cursor-pointer select-none"
                          style={{ color: sortKey === col.key ? '#818cf8' : 'var(--foreground-muted)' }}
                          onClick={() => toggleSort(col.key)}
                        >
                          <div className="flex items-center justify-end gap-1.5">
                            <SortIcon k={col.key} />
                            {col.label}
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.length === 0 ? (
                      <tr>
                        <td colSpan={cols.length + 1} className="text-center py-16 text-sm" style={{ color: 'var(--foreground-muted)' }}>
                          No results match your filters
                        </td>
                      </tr>
                    ) : filtered.slice(0, 200).map((row, i) => (
                      <tr
                        key={row.id}
                        className="group transition-colors duration-100 hover:bg-primary-500/5"
                        style={{ borderBottom: '1px solid var(--card-border)', background: i % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.02)' }}
                      >
                        {/* Title cell — cover thumbnail + title + meta */}
                        <td className="px-3 py-2 sticky left-0 z-10" style={{ background: i % 2 === 0 ? 'var(--glass-bg)' : 'var(--background-secondary)' }}>
                          <div className="flex items-center gap-3">
                            {/* Cover thumbnail */}
                            <div className="flex-shrink-0 w-8 h-12 rounded-md overflow-hidden"
                              style={{ background: 'var(--background-secondary)', border: '1px solid var(--card-border)' }}>
                              {row.cover_url
                                ? <img src={row.cover_url} alt="" className="w-full h-full object-cover block" />
                                : <div className="w-full h-full" style={{ background: 'var(--background-secondary)' }} />
                              }
                            </div>
                            {/* Text */}
                            <div className="min-w-0">
                              {row.item_type === 'manga' ? (
                                <p className="font-semibold text-sm truncate max-w-[180px]" style={{ color: 'var(--foreground)' }}>{row.title}</p>
                              ) : (
                                <Link href={`/content/${row.id}`} className="hover:text-primary-400 transition-colors">
                                  <p className="font-semibold text-sm truncate max-w-[180px]" style={{ color: 'var(--foreground)' }}>{row.title}</p>
                                </Link>
                              )}
                              <p className="text-[11px] truncate max-w-[180px] mt-0.5" style={{ color: 'var(--foreground-muted)' }}>
                                {row.studio || row.publisher || row.item_type}
                              </p>
                            </div>
                          </div>
                        </td>

                        {/* Data cells */}
                        {cols.map(col => {
                          const val = row[col.key]
                          const sorted = pctMaps[col.key] ?? []
                          const pct  = col.numeric && val != null ? getPct(Number(val), sorted) : 50
                          const color = col.numeric && val != null
                            ? pctColor(pct, col.invert)
                            : 'var(--foreground-secondary)'
                          return (
                            <td key={col.key} className="px-4 py-3 text-right font-semibold tabular-nums whitespace-nowrap" style={{ color }}>
                              {fmtVal(col, val)}
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {filtered.length > 200 && (
                  <p className="text-center py-3 text-xs" style={{ color: 'var(--foreground-muted)', borderTop: '1px solid var(--card-border)' }}>
                    Showing top 200 of {filtered.length.toLocaleString()} — use filters to narrow down
                  </p>
                )}
              </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

// ── Mobile Card ──────────────────────────────────────────────────────────────
function MobileCard({ row, cols, pctMaps, type }: {
  row: Row
  cols: ColDef[]
  pctMaps: Partial<Record<keyof Row, number[]>>
  type: ItemType
}) {
  const [imgErr, setImgErr] = useState(false)
  // Show only the 3 most important numeric cols on mobile
  const keyCols = cols.filter(c => c.numeric).slice(0, 3)

  const inner = (
    <div className="flex items-center gap-3 px-3 py-3 transition-colors hover:bg-primary-500/5">
      {/* Cover */}
      <div className="flex-shrink-0 w-10 h-14 rounded-lg overflow-hidden"
        style={{ background: 'var(--background-secondary)', border: '1px solid var(--card-border)' }}>
        {row.cover_url && !imgErr
          ? <img src={row.cover_url} alt="" className="w-full h-full object-cover block" onError={() => setImgErr(true)} />
          : <div className="w-full h-full" style={{ background: 'var(--background-secondary)' }} />
        }
      </div>
      {/* Text + stats */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold truncate" style={{ color: 'var(--foreground)' }}>{row.title}</p>
        <p className="text-[11px] truncate mt-0.5" style={{ color: 'var(--foreground-muted)' }}>
          {row.studio || row.publisher || row.author || row.item_type}
        </p>
        {/* Key stats row */}
        <div className="flex items-center gap-3 mt-1.5 flex-wrap">
          {keyCols.map(col => {
            const val = row[col.key]
            if (val == null) return null
            const sorted = pctMaps[col.key] ?? []
            const pct    = getPct(Number(val), sorted)
            const color  = pctColor(pct, col.invert)
            return (
              <div key={col.key} className="flex items-center gap-1">
                <span className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--foreground-muted)' }}>{col.short}</span>
                <span className="text-xs font-bold tabular-nums" style={{ color }}>{fmtVal(col, val)}</span>
              </div>
            )
          })}
          {/* Status pill */}
          {row.status && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold" style={{ background: 'var(--background-secondary)', color: 'var(--foreground-secondary)' }}>
              {String(row.status).toUpperCase()}
            </span>
          )}
        </div>
      </div>
    </div>
  )

  return row.item_type !== 'manga'
    ? <Link href={`/content/${row.id}`}>{inner}</Link>
    : <div>{inner}</div>
}

function FilterSelect({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void; options: string[]
}) {
  return (
    <div>
      <label className="text-xs font-semibold uppercase tracking-wide block mb-1.5" style={{ color: 'var(--foreground-muted)' }}>
        {label}
      </label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full text-sm rounded-lg px-3 py-1.5 outline-none"
        style={{ background: 'var(--background-secondary)', color: 'var(--foreground)', border: '1px solid var(--card-border)' }}
      >
        {options.map(o => <option key={o} value={o}>{o === 'All' ? `All ${label}s` : o}</option>)}
      </select>
    </div>
  )
}

function SliderFilter({ label, value, min, max, step, onChange, display }: {
  label: string; value: number; min: number; max: number; step: number
  onChange: (v: number) => void; display: (v: number) => string
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--foreground-muted)' }}>{label}</label>
        <span className="text-xs font-bold" style={{ color: value === min ? 'var(--foreground-muted)' : '#818cf8' }}>{display(value)}</span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full accent-primary-500"
      />
    </div>
  )
}
