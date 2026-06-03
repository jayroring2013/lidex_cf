'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState, useRef, useCallback } from 'react'
import Link from 'next/link'
import {
  Search, SlidersHorizontal, X, ChevronDown, Loader2,
  BookOpen, Tv, Book, TrendingUp, Clock, ArrowRight, ExternalLink, LayoutGrid
} from 'lucide-react'
import supabase from '@/lib/supabaseClient'
import { useLocale } from '@/contexts/LocaleContext'

// ── Types ─────────────────────────────────────────────────────────────────────
type ContentType = 'anime' | 'manga' | 'novel'

interface SeriesCard {
  id:         string | number
  title:      string
  cover_url:  string | null
  scoreLabel: string
  status:     string | null
  type:       ContentType
  meta:       string | null
  year:       number | null
  genres:     string[]
  href:       string
  external:   boolean
}

// ── Config ────────────────────────────────────────────────────────────────────
const TYPE_CONFIG = {
  anime: { label: 'Anime',       color: '#6366f1', icon: Tv       },
  manga: { label: 'Manga',       color: '#ec4899', icon: Book     },
  novel: { label: 'Tiểu thuyết', color: '#22c55e', icon: BookOpen },
}

const STATUS_OPTS_ANIME = ['all','ongoing','completed','cancelled','hiatus','not_yet_released']
const STATUS_OPTS_MANGA = ['all','ongoing','completed','cancelled','hiatus']
const STATUS_OPTS_NOVEL = ['all','ongoing','completed','cancelled','hiatus']
const FORMAT_OPTS       = ['all','TV','MOVIE','OVA','ONA','SPECIAL']
const PAGE_SIZE_OPTS    = [12, 24, 48, 96]

const SORT_OPTS: Record<ContentType, { id: string; label: string }[]> = {
  anime: [
    { id: 'popular_desc', label: 'Phổ biến nhất'    },
    { id: 'score_desc',   label: 'Điểm cao nhất'    },
    { id: 'year_desc',    label: 'Mới cập nhật'     },
    { id: 'title_asc',    label: 'Tên A–Z'          },
  ],
  manga: [
    { id: 'year_desc',    label: 'Mới cập nhật'     },
    { id: 'title_asc',    label: 'Tên A–Z'          },
  ],
  novel: [
    { id: 'year_desc',    label: 'Mới cập nhật'     },
    { id: 'title_asc',    label: 'Tên A–Z'          },
  ],
}

function parseContentType(value: string | null): ContentType {
  return value === 'manga' || value === 'novel' || value === 'anime' ? value : 'anime'
}

function getInitialBrowseParams() {
  if (typeof window === 'undefined') return { type: 'anime' as ContentType, search: '' }
  const params = new URLSearchParams(window.location.search)
  return {
    type: parseContentType(params.get('type')),
    search: params.get('search') || '',
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function useDebounce<T>(value: T, ms = 300): T {
  const [dv, setDv] = useState(value)
  useEffect(() => { const t = setTimeout(() => setDv(value), ms); return () => clearTimeout(t) }, [value, ms])
  return dv
}

function proxyImg(url: string | null): string | null {
  if (!url) return null
  try {
    const h = new URL(url).hostname
    if (!h.includes('supabase') && !h.includes('localhost') && !url.startsWith('/'))
      return `/api/image-proxy?url=${encodeURIComponent(url)}`
  } catch {}
  return url
}

function fmtNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

function statusLabel(s: string | null): string {
  const map: Record<string, string> = {
    ongoing: 'Đang tiếp', completed: 'Hoàn thành', cancelled: 'Đã hủy',
    hiatus: 'Tạm dừng', publishing: 'Đang XB', finished: 'Hoàn thành',
    not_yet_released: 'Sắp ra', upcoming: 'Sắp ra', releasing: 'Đang chiếu',
  }
  return map[(s || '').toLowerCase()] || s || ''
}

function statusColor(s: string | null): string {
  const sl = (s || '').toLowerCase()
  if (['ongoing','publishing','releasing'].includes(sl)) return '#22c55e'
  if (['completed','finished'].includes(sl))             return '#6366f1'
  if (['cancelled','discontinued'].includes(sl))         return '#f87171'
  if (['hiatus'].includes(sl))                           return '#fb923c'
  return '#64748b'
}

function statusOptionsFor(type: ContentType): string[] {
  if (type === 'anime') return STATUS_OPTS_ANIME
  if (type === 'manga') return STATUS_OPTS_MANGA
  return STATUS_OPTS_NOVEL
}

function gridCols(size: number): string {
  if (size <= 12) return 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4'
  if (size <= 24) return 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6'
  return 'grid-cols-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8'
}

// ── Card mappers ──────────────────────────────────────────────────────────────

async function fetchLatestVolCovers(ids: (string | number)[]): Promise<Record<string | number, string | null>> {
  if (!ids.length) return {}
  const { data } = await supabase
    .from('volumes')
    .select('series_id, cover_url, volume_number')
    .in('series_id', ids)
    .eq('is_special', false)
    .not('cover_url', 'is', null)
    .order('volume_number', { ascending: false })
  if (!data) return {}
  const map: Record<string | number, string | null> = {}
  for (const row of data) {
    if (map[row.series_id] === undefined) {
      map[row.series_id] = proxyImg(row.cover_url)
    }
  }
  return map
}

function toAnimeCards(rows: any[]): SeriesCard[] {
  return rows.map(s => {
    const meta = Array.isArray(s.anime_meta) ? s.anime_meta[0] : s.anime_meta
    return {
      id: s.id, title: s.title,
      cover_url:  s.cover_url ?? null,
      scoreLabel: meta?.mean_score ? `★ ${meta.mean_score}` : '',
      status:     s.status,
      type:       'anime' as ContentType,
      meta:       s.studio ?? null,
      year:       meta?.season_year ?? null,
      genres:     [],
      href:       `/content/${s.id}`,
      external:   false,
    }
  })
}

function toMangaCards(rows: any[], volCovers: Record<string | number, string | null> = {}): SeriesCard[] {
  return rows.map(m => ({
    id:         m.id,
    title:      m.title,
    cover_url:  volCovers[m.id] !== undefined ? volCovers[m.id] : proxyImg(m.cover_url),
    scoreLabel: '',
    status:     m.status,
    type:       'manga' as ContentType,
    meta:       null,
    year:       null,
    genres:     Array.isArray(m.genres) ? m.genres : [],
    href:       `/content/${m.id}`,
    external:   false,
  }))
}

function toNovelCards(rows: any[], volCovers: Record<string | number, string | null> = {}): SeriesCard[] {
  return (rows || []).filter(Boolean).map(n => ({
    id:         n.id,
    title:      n.title,
    cover_url:  volCovers[n.id] !== undefined ? volCovers[n.id] : proxyImg(n.cover_url),
    scoreLabel: '',
    status:     n.status,
    type:       'novel' as ContentType,
    meta:       null,
    year:       null,
    genres:     Array.isArray(n.genres) ? n.genres : [],
    href:       `/content/${n.id}`,
    external:   false,
  }))
}

// ── Aceternity-style Glow Card ────────────────────────────────────────────────
function GlowCard({ children, color }: { children: React.ReactNode; color: string }) {
  const ref  = useRef<HTMLDivElement>(null)
  const [g,  setG] = useState({ x: 0, y: 0, on: false })
  return (
    <div ref={ref}
      onMouseMove={e => { if (!ref.current) return; const r = ref.current.getBoundingClientRect(); setG({ x: e.clientX - r.left, y: e.clientY - r.top, on: true }) }}
      onMouseLeave={() => setG(p => ({ ...p, on: false }))}
      className="relative group rounded-2xl overflow-hidden transition-all duration-200 hover:scale-[1.02] hover:-translate-y-0.5"
      style={{ background: 'var(--glass-bg)', border: '1px solid var(--card-border)' }}
    >
      <div className="pointer-events-none absolute inset-0 z-10 rounded-2xl transition-opacity duration-300"
        style={{ opacity: g.on ? 1 : 0, background: `radial-gradient(200px circle at ${g.x}px ${g.y}px, ${color}20, transparent 70%)` }} />
      <div className="pointer-events-none absolute inset-0 z-10 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"
        style={{ boxShadow: `inset 0 0 0 1px ${color}50` }} />
      {children}
    </div>
  )
}

// ── Skeleton ──────────────────────────────────────────────────────────────────
function SkeletonCard() {
  return (
    <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--card-border)' }}>
      <div className="aspect-[2/3] animate-pulse" style={{ background: 'var(--background-secondary)' }} />
      <div className="p-3 space-y-2">
        <div className="h-3 rounded-full w-5/6 animate-pulse" style={{ background: 'var(--background-secondary)' }} />
        <div className="h-2.5 rounded-full w-2/5 animate-pulse" style={{ background: 'var(--background-secondary)' }} />
      </div>
    </div>
  )
}

// ── Series Card (grid) ────────────────────────────────────────────────────────
function CardItem({ card, color }: { card: SeriesCard; color: string }) {
  const [err, setErr] = useState(false)
  const inner = (
    <GlowCard color={color}>
      <div className="relative aspect-[2/3] overflow-hidden">
        {card.cover_url && !err
          ? <img src={card.cover_url} alt={card.title} className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" onError={() => setErr(true)} />
          : <div className="w-full h-full flex items-center justify-center" style={{ background: `linear-gradient(135deg, ${color}20, ${color}06)` }}>
              <BookOpen className="w-8 h-8 opacity-20" style={{ color }} />
            </div>
        }
        {card.scoreLabel && (
          <div className="absolute top-2 right-2 px-2 py-0.5 rounded-lg text-xs font-bold"
            style={{ background: 'rgba(0,0,0,0.80)', color: '#fbbf24', backdropFilter: 'blur(6px)' }}>
            {card.scoreLabel}
          </div>
        )}
        {card.status && (
          <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded-full text-[10px] font-bold text-white"
            style={{ background: `${statusColor(card.status)}dd`, backdropFilter: 'blur(4px)' }}>
            {statusLabel(card.status)}
          </div>
        )}
        {card.external && (
          <div className="absolute top-2 left-2 w-5 h-5 rounded-md flex items-center justify-center"
            style={{ background: 'rgba(0,0,0,0.65)' }}>
            <ExternalLink className="w-2.5 h-2.5 text-white/70" />
          </div>
        )}
        <div className="absolute inset-0 flex items-end opacity-0 group-hover:opacity-100 transition-opacity duration-200"
          style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.88) 40%, transparent)' }}>
          <div className="p-3 w-full">
            <p className="text-white text-xs font-semibold line-clamp-2">{card.title}</p>
            {card.meta && <p className="text-white/50 text-[10px] truncate mt-0.5">{card.meta}</p>}
          </div>
        </div>
      </div>
      <div className="px-3 pt-2 pb-3 h-[72px] flex flex-col justify-between">
        <div>
          <p className="text-xs font-semibold line-clamp-2 leading-snug" style={{ color: 'var(--foreground)' }}>{card.title}</p>
        </div>
        <div className="flex items-center justify-between mt-1">
          {card.meta
            ? <p className="text-[10px] truncate flex-1" style={{ color: 'var(--foreground-muted)' }}>{card.meta}</p>
            : <span />
          }
          {card.genres.length > 0 && (
            <span className="text-[9px] px-1.5 py-0.5 rounded-md font-semibold ml-1 flex-shrink-0"
              style={{ background: `${color}18`, color }}>{card.genres[0]}</span>
          )}
        </div>
      </div>
    </GlowCard>
  )
  return card.external
    ? <a href={card.href} target="_blank" rel="noopener noreferrer">{inner}</a>
    : <Link href={card.href}>{inner}</Link>
}

// ── Mini Carousel Card ────────────────────────────────────────────────────────
function MiniCard({ card, color }: { card: SeriesCard; color: string }) {
  const [err, setErr] = useState(false)
  const inner = (
    <div className="flex-shrink-0 w-28 sm:w-32 group cursor-pointer">
      <div className="relative aspect-[2/3] rounded-xl overflow-hidden mb-2 transition-all duration-200 group-hover:scale-[1.04] group-hover:-translate-y-0.5"
        style={{ border: `1px solid ${color}30` }}>
        {card.cover_url && !err
          ? <img src={card.cover_url} alt={card.title} className="w-full h-full object-cover" onError={() => setErr(true)} />
          : <div className="w-full h-full" style={{ background: `linear-gradient(135deg, ${color}22, ${color}08)` }} />
        }
        {card.scoreLabel && (
          <div className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded-md text-[10px] font-bold"
            style={{ background: 'rgba(0,0,0,0.78)', color: '#fbbf24' }}>{card.scoreLabel}</div>
        )}
      </div>
      <p className="text-[11px] font-semibold line-clamp-2 leading-tight" style={{ color: 'var(--foreground)' }}>{card.title}</p>
      {card.meta && <p className="text-[10px] truncate mt-0.5" style={{ color: 'var(--foreground-muted)' }}>{card.meta}</p>}
    </div>
  )
  return card.external
    ? <a href={card.href} target="_blank" rel="noopener noreferrer">{inner}</a>
    : <Link href={card.href}>{inner}</Link>
}

// ── Carousel row ──────────────────────────────────────────────────────────────
function Carousel({ title, icon: Icon, items, loading, color }: {
  title: string; icon: any; items: SeriesCard[]; loading: boolean; color: string
}) {
  return (
    <div className="mb-10">
      <div className="flex items-center gap-2.5 mb-4">
        <div className="w-7 h-7 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: `${color}20` }}>
          <Icon className="w-3.5 h-3.5" style={{ color }} />
        </div>
        <h3 className="text-sm font-bold" style={{ color: 'var(--foreground)' }}>{title}</h3>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-2" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
        {loading
          ? Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex-shrink-0 w-28 sm:w-32 animate-pulse">
                <div className="aspect-[2/3] rounded-xl mb-2" style={{ background: 'var(--background-secondary)' }} />
                <div className="h-2.5 rounded w-4/5 mb-1" style={{ background: 'var(--background-secondary)' }} />
                <div className="h-2 rounded w-3/5" style={{ background: 'var(--background-secondary)' }} />
              </div>
            ))
          : items.map(c => <MiniCard key={`${c.type}-${c.id}`} card={c} color={color} />)
        }
      </div>
    </div>
  )
}

// ── Filter Popover ────────────────────────────────────────────────────────────
function FilterPopover({ type, status, setStatus, format, setFormat, genre, setGenre,
  genreOptions, activeCount, onClear, color }: any) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const fn = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', fn)
    return () => document.removeEventListener('mousedown', fn)
  }, [])

  const Pill = ({ val, active, onChange }: { val: string; active: boolean; onChange: () => void }) => (
    <button onClick={onChange}
      className="px-2.5 py-1.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap"
      style={active
        ? { background: color, color: '#fff', boxShadow: `0 2px 8px ${color}44` }
        : { background: 'var(--background-secondary)', color: 'var(--foreground-secondary)', border: '1px solid var(--card-border)' }}>
      {val === 'all' ? 'Tất cả' : statusLabel(val)}
    </button>
  )

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-semibold transition-all"
        style={activeCount > 0
          ? { background: `${color}18`, color, border: `1px solid ${color}50` }
          : { background: 'var(--glass-bg)', color: 'var(--foreground-secondary)', border: '1px solid var(--card-border)' }}>
        <SlidersHorizontal className="w-3.5 h-3.5" />
        Bộ lọc
        {activeCount > 0 && (
          <span className="w-5 h-5 rounded-full text-[10px] font-black flex items-center justify-center text-white" style={{ background: color }}>
            {activeCount}
          </span>
        )}
        <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute top-[calc(100%+8px)] left-0 z-50 rounded-2xl p-5 shadow-2xl"
          style={{ background: 'var(--glass-bg)', border: '1px solid var(--card-border)', backdropFilter: 'blur(20px)', minWidth: 300, maxWidth: '92vw' }}>
          <div className="flex items-center justify-between mb-4 pb-3" style={{ borderBottom: '1px solid var(--card-border)' }}>
            <span className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--foreground)' }}>Bộ lọc nâng cao</span>
            {activeCount > 0 && (
              <button onClick={() => { onClear(); setOpen(false) }} className="text-xs font-semibold text-red-400 hover:text-red-300 transition-colors">
                ✕ Xóa tất cả
              </button>
            )}
          </div>
          <div className="space-y-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--foreground-muted)' }}>Trạng thái</p>
              <div className="flex flex-wrap gap-1.5">
                {statusOptionsFor(type).map(o => (
                  <Pill key={o} val={o} active={status === o} onChange={() => setStatus(o)} />
                ))}
              </div>
            </div>
            {type === 'anime' && (
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--foreground-muted)' }}>Format</p>
                <div className="flex flex-wrap gap-1.5">
                  {FORMAT_OPTS.map(o => <Pill key={o} val={o} active={format === o} onChange={() => setFormat(o)} />)}
                </div>
              </div>
            )}
            {type === 'manga' && genreOptions.length > 0 && (
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--foreground-muted)' }}>Thể loại</p>
                <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto">
                  <Pill val="all" active={genre === 'all'} onChange={() => setGenre('all')} />
                  {genreOptions.map((g: string) => <Pill key={g} val={g} active={genre === g} onChange={() => setGenre(g)} />)}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function BrowsePage() {
  const hasMounted = useRef(false)
  const skipNextTypeReset = useRef(false)

  const [type,        setType]        = useState<ContentType>('anime')
  const [browseMode,  setBrowseMode]  = useState(false)
  const [searchInput, setSearchInput] = useState('')
  const [sort,        setSort]        = useState(SORT_OPTS.anime[0].id)
  const [status,      setStatus]      = useState('all')
  const [format,      setFormat]      = useState('all')
  const [genre,       setGenre]       = useState('all')
  const [pageSize,    setPageSize]    = useState(24)
  const [page,        setPage]        = useState(0)

  const [cards,       setCards]       = useState<SeriesCard[]>([])
  const [hasMore,     setHasMore]     = useState(false)
  const [loading,     setLoading]     = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [popular,     setPopular]     = useState<SeriesCard[]>([])
  const [recent,      setRecent]      = useState<SeriesCard[]>([])
  const [discLoading, setDiscLoading] = useState(true)
  const [genreOpts,   setGenreOpts]   = useState<string[]>([])

  const search    = useDebounce(searchInput, 300)
  const color     = TYPE_CONFIG[type].color
  const TypeIcon  = TYPE_CONFIG[type].icon
  const { t }    = useLocale()

  useEffect(() => {
    const params = getInitialBrowseParams()
    if (params.type !== type) {
      skipNextTypeReset.current = true
      setType(params.type)
    }
    setSort(SORT_OPTS[params.type][0].id)
    setSearchInput(params.search)
    setBrowseMode(Boolean(params.search))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Reset on type change
  useEffect(() => {
    if (!hasMounted.current) {
      hasMounted.current = true
      return
    }
    if (skipNextTypeReset.current) {
      skipNextTypeReset.current = false
      return
    }
    setSort(SORT_OPTS[type][0].id)
    setStatus('all'); setFormat('all'); setGenre('all')
    setPage(0); setCards([]); setBrowseMode(false); setSearchInput('')
  }, [type])

  // Discovery carousels
  useEffect(() => {
    let cancelled = false
    async function load() {
      setDiscLoading(true)
      try {
        if (type === 'anime') {
          // ✅ Use !inner so series without a 2026 anime_meta row are excluded entirely
          const [{ data: pop }, { data: rec }] = await Promise.all([
            supabase.from('series')
              .select('id, title, cover_url, status, studio, anime_meta!inner(mean_score, popularity, season_year)')
              .eq('item_type', 'anime')
              .eq('anime_meta.season_year', 2026)
              .not('cover_url', 'is', null)
              .not('genres', 'cs', '{"Hentai"}')
              .order('anime_meta(popularity)', { ascending: false })
              .limit(14),
            supabase.from('series')
              .select('id, title, cover_url, status, studio, anime_meta!inner(mean_score, season_year)')
              .eq('item_type', 'anime')
              .eq('anime_meta.season_year', 2026)
              .not('cover_url', 'is', null)
              .not('genres', 'cs', '{"Hentai"}')
              .order('updated_at', { ascending: false })
              .limit(14),
          ])
          if (!cancelled) { setPopular(toAnimeCards(pop || [])); setRecent(toAnimeCards(rec || [])) }

        } else if (type === 'manga') {
          const [{ data: pop }, { data: rec }] = await Promise.all([
            supabase.from('series').select('id, title, cover_url, status, genres').eq('item_type', 'manga').not('genres', 'cs', '{"Hentai"}')
              .order('updated_at', { ascending: false }).limit(14),
            supabase.from('series').select('id, title, cover_url, status, genres').eq('item_type', 'manga').not('genres', 'cs', '{"Hentai"}')
              .order('created_at', { ascending: false }).limit(14),
          ])
          const allRows = [...(pop || []), ...(rec || [])]
          const ids = allRows.map((m: any) => m.id)
          const volCovers = await fetchLatestVolCovers(ids)
          if (!cancelled) {
            setPopular(toMangaCards(pop || [], volCovers)); setRecent(toMangaCards(rec || [], volCovers))
            const gs = new Set<string>()
            allRows.forEach((m: any) => { if (Array.isArray(m.genres)) m.genres.forEach((g: string) => gs.add(g)) })
            setGenreOpts(Array.from(gs).sort())
          }

        } else {
          const [{ data: pop }, { data: rec }] = await Promise.all([
            supabase.from('series').select('id, title, cover_url, status, genres').eq('item_type', 'novel').not('genres', 'cs', '{"Hentai"}')
              .order('updated_at', { ascending: false }).limit(14),
            supabase.from('series').select('id, title, cover_url, status, genres').eq('item_type', 'novel').not('genres', 'cs', '{"Hentai"}')
              .order('created_at', { ascending: false }).limit(14),
          ])
          const allRows = [...(pop || []), ...(rec || [])]
          const ids = allRows.map((n: any) => n.id)
          const volCovers = await fetchLatestVolCovers(ids)
          if (!cancelled) {
            setPopular(toNovelCards(pop || [], volCovers)); setRecent(toNovelCards(rec || [], volCovers))
          }
        }
      } catch (e) { console.error('Discovery error:', e) }
      finally { if (!cancelled) setDiscLoading(false) }
    }
    load()
    return () => { cancelled = true }
  }, [type])

  // Browse fetch
  const fetchCards = useCallback(async (reset = true) => {
    reset ? setLoading(true) : setLoadingMore(true)
    const offset = reset ? 0 : page * pageSize
    try {
      let results: SeriesCard[] = []
      let more = false

      if (type === 'anime') {
        // ✅ Use !inner so only series with a matching 2026 anime_meta row are returned
        let q = supabase.from('series')
          .select('id, title, cover_url, status, studio, anime_meta!inner(mean_score, popularity, format, season_year)')
          .eq('item_type', 'anime')
          .eq('anime_meta.season_year', 2026)
          .not('genres', 'cs', '{"Hentai"}')
        if (search)           q = q.ilike('title', `%${search}%`)
        if (status !== 'all') q = q.ilike('status', status)
        if (sort === 'score_desc')        q = q.order('anime_meta(mean_score)',    { ascending: false })
        else if (sort === 'popular_desc') q = q.order('anime_meta(popularity)',    { ascending: false })
        else if (sort === 'year_desc')    q = q.order('updated_at',                { ascending: false })
        else                              q = q.order('title',                     { ascending: true  })
        const { data } = await q.range(offset, offset + pageSize - 1)
        results = toAnimeCards(data || [])
        more = results.length === pageSize

      } else if (type === 'manga') {
        let q = supabase.from('series')
          .select('id, title, cover_url, status, genres').eq('item_type', 'manga').not('genres', 'cs', '{"Hentai"}')
        if (search)           q = q.ilike('title', `%${search}%`)
        if (status !== 'all') q = q.ilike('status', status)
        if (genre  !== 'all') q = q.contains('genres', [genre])
        if (sort === 'year_desc')         q = q.order('updated_at', { ascending: false })
        else                              q = q.order('title',      { ascending: true })
        const { data } = await q.range(offset, offset + pageSize - 1)
        const volCovers = await fetchLatestVolCovers((data || []).map((m: any) => m.id))
        results = toMangaCards(data || [], volCovers)
        more = results.length === pageSize

      } else {
        let q = supabase.from('series')
          .select('id, title, cover_url, status, genres').eq('item_type', 'novel').not('genres', 'cs', '{"Hentai"}')
        if (search) q = q.ilike('title', `%${search}%`)
        if (status !== 'all') q = q.eq('status', status)
        if (sort === 'year_desc')         q = q.order('updated_at', { ascending: false })
        else                              q = q.order('title',      { ascending: true })
        const { data } = await q.range(offset, offset + pageSize - 1)
        const volCovers = await fetchLatestVolCovers((data || []).map((n: any) => n.id))
        results = toNovelCards(data || [], volCovers)
        more = results.length === pageSize
      }

      if (reset) { setCards(results); setPage(1) }
      else       { setCards(prev => [...prev, ...results]); setPage(p => p + 1) }
      setHasMore(more)
    } finally {
      reset ? setLoading(false) : setLoadingMore(false)
    }
  }, [type, search, status, format, genre, sort, page, pageSize])

  useEffect(() => {
    if (!browseMode && !search) return
    fetchCards(true)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, search, status, format, genre, sort, browseMode, pageSize])

  const activeFilters = [status !== 'all', format !== 'all', genre !== 'all'].filter(Boolean).length
  const isBrowsing    = browseMode || !!search

  return (
    <div className="min-h-screen" style={{ background: 'var(--background)' }}>

      {/* ── Hero header ── */}
      <div className="relative overflow-hidden" style={{ borderBottom: '1px solid var(--card-border)' }}>
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full blur-3xl opacity-[0.12] transition-colors duration-700" style={{ background: color }} />
          <div className="absolute -bottom-16 right-10 w-72 h-72 rounded-full blur-3xl opacity-[0.08] transition-colors duration-700" style={{ background: color }} />
        </div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 sm:pt-12 pb-6 sm:pb-8">
          <h1 className="text-3xl sm:text-5xl font-black mb-1.5 leading-none">
            <span style={{ color: 'var(--foreground)' }}>{t('browse_discover')} </span>
            <span className="transition-colors duration-300" style={{ color }}>{TYPE_CONFIG[type].label}</span>
          </h1>
          <p className="text-sm mb-6" style={{ color: 'var(--foreground-secondary)' }}>
            {t('browse_subtitle')}
          </p>

          {/* Type pill switcher */}
          <div className="inline-flex p-1 rounded-2xl mb-5" style={{ background: 'var(--glass-bg)', border: '1px solid var(--card-border)' }}>
            {(Object.keys(TYPE_CONFIG) as ContentType[]).map(t => {
              const cfg = TYPE_CONFIG[t]; const Icon = cfg.icon; const active = t === type
              return (
                <button key={t} onClick={() => setType(t)}
                  className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all duration-200"
                  style={active
                    ? { background: cfg.color, color: '#fff', boxShadow: `0 2px 12px ${cfg.color}55` }
                    : { color: 'var(--foreground-secondary)' }}>
                  <Icon className="w-3.5 h-3.5 flex-shrink-0" />
                  {cfg.label}
                </button>
              )
            })}
          </div>

          {/* Search */}
          <div className="relative max-w-lg">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" style={{ color: 'var(--foreground-muted)' }} />
            <input
              value={searchInput}
              onChange={e => { setSearchInput(e.target.value); if (e.target.value) setBrowseMode(true) }}
              placeholder={`${t('browse_search')} ${TYPE_CONFIG[type].label.toLowerCase()}…`}
              className="w-full pl-11 pr-10 py-3 rounded-2xl text-sm outline-none transition-all duration-200"
              style={{ background: 'var(--glass-bg)', color: 'var(--foreground)', border: '1px solid var(--card-border)' }}
              onFocus={e => { e.currentTarget.style.borderColor = `${color}88`; e.currentTarget.style.boxShadow = `0 0 0 3px ${color}15` }}
              onBlur={e  => { e.currentTarget.style.borderColor = 'var(--card-border)'; e.currentTarget.style.boxShadow = 'none' }}
            />
            {searchInput && (
              <button onClick={() => setSearchInput('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full flex items-center justify-center"
                style={{ background: 'var(--background-secondary)', color: 'var(--foreground-muted)' }}>
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">

        {/* Discovery */}
        {!isBrowsing && (
          <div>
            <Carousel title={t('browse_popular')} icon={TrendingUp} items={popular} loading={discLoading} color={color} />
            <Carousel title={t('browse_recent')}  icon={Clock}      items={recent}  loading={discLoading} color={color} />
            <div className="flex justify-center mt-2">
              <button onClick={() => setBrowseMode(true)}
                className="group flex items-center gap-2.5 px-7 py-3.5 rounded-2xl text-sm font-bold text-white transition-all hover:scale-105"
                style={{ background: `linear-gradient(135deg, ${color}, ${color}99)`, boxShadow: `0 6px 20px ${color}44` }}>
                <LayoutGrid className="w-4 h-4" />
                {t('browse_all')} {TYPE_CONFIG[type].label}
                <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
              </button>
            </div>
          </div>
        )}

        {/* Browse grid */}
        {isBrowsing && (
          <div>
            {/* Toolbar */}
            <div className="flex flex-wrap items-center gap-2 mb-4">
              <FilterPopover
                type={type} status={status} setStatus={setStatus}
                format={format} setFormat={setFormat} genre={genre} setGenre={setGenre}
                genreOptions={genreOpts} activeCount={activeFilters}
                onClear={() => { setStatus('all'); setFormat('all'); setGenre('all') }}
                color={color}
              />

              {/* Sort */}
              <div className="relative">
                <select value={sort} onChange={e => setSort(e.target.value)}
                  className="appearance-none pl-3 pr-8 py-2 rounded-xl text-sm font-semibold outline-none cursor-pointer"
                  style={{ background: 'var(--glass-bg)', color: 'var(--foreground)', border: '1px solid var(--card-border)' }}>
                  {SORT_OPTS[type].map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none" style={{ color: 'var(--foreground-muted)' }} />
              </div>

              {/* Page size */}
              <div className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl"
                style={{ background: 'var(--glass-bg)', border: '1px solid var(--card-border)' }}>
                <LayoutGrid className="w-3.5 h-3.5 mr-1" style={{ color: 'var(--foreground-muted)' }} />
                {PAGE_SIZE_OPTS.map(n => (
                  <button key={n} onClick={() => { setPageSize(n); setPage(0); fetchCards(true) }}
                    className="px-2 py-0.5 rounded-lg text-xs font-bold transition-all"
                    style={pageSize === n ? { background: color, color: '#fff' } : { color: 'var(--foreground-muted)' }}>
                    {n}
                  </button>
                ))}
              </div>

              <div className="ml-auto flex items-center gap-3">
                {!loading && <span className="text-xs" style={{ color: 'var(--foreground-muted)' }}>{cards.length}{hasMore ? '+' : ''} kết quả</span>}
                {!searchInput && (
                  <button onClick={() => setBrowseMode(false)}
                    className="flex items-center gap-1 text-xs font-semibold hover:text-red-400 transition-colors"
                    style={{ color: 'var(--foreground-secondary)' }}>
                    <X className="w-3 h-3" /> Đóng
                  </button>
                )}
              </div>
            </div>

            {/* Active filter chips */}
            {activeFilters > 0 && (
              <div className="flex flex-wrap gap-2 mb-4">
                {status !== 'all' && <FilterChip label={`Trạng thái: ${statusLabel(status)}`} onRemove={() => setStatus('all')} color={color} />}
                {format !== 'all' && <FilterChip label={`Format: ${format}`}     onRemove={() => setFormat('all')} color={color} />}
                {genre  !== 'all' && <FilterChip label={genre}                   onRemove={() => setGenre('all')}  color={color} />}
              </div>
            )}

            {/* Grid */}
            {loading ? (
              <div className={`grid gap-3 sm:gap-4 ${gridCols(pageSize)}`}>
                {Array.from({ length: pageSize }).map((_, i) => <SkeletonCard key={i} />)}
              </div>
            ) : cards.length === 0 ? (
              <div className="flex flex-col items-center py-28 gap-4">
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center" style={{ background: `${color}15` }}>
                  <TypeIcon className="w-8 h-8 opacity-30" style={{ color }} />
                </div>
                <p className="text-sm font-medium" style={{ color: 'var(--foreground-muted)' }}>Không tìm thấy kết quả</p>
                {activeFilters > 0 && (
                  <button onClick={() => { setStatus('all'); setFormat('all'); setGenre('all') }}
                    className="text-xs font-semibold px-4 py-2 rounded-xl"
                    style={{ background: `${color}15`, color }}>Xóa bộ lọc</button>
                )}
              </div>
            ) : (
              <>
                <div className={`grid gap-3 sm:gap-4 items-start ${gridCols(pageSize)}`}>
                  {cards.map(c => <CardItem key={`${c.type}-${c.id}`} card={c} color={color} />)}
                </div>
                {hasMore && (
                  <div className="flex justify-center mt-10">
                    <button onClick={() => fetchCards(false)} disabled={loadingMore}
                      className="flex items-center gap-2 px-6 py-3 rounded-2xl text-sm font-bold transition-all hover:scale-105 disabled:opacity-50"
                      style={{ background: `${color}15`, color, border: `1px solid ${color}40` }}>
                      {loadingMore ? <Loader2 className="w-4 h-4 animate-spin" /> : <ChevronDown className="w-4 h-4" />}
                      Tải thêm
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function FilterChip({ label, onRemove, color }: { label: string; onRemove: () => void; color: string }) {
  return (
    <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold"
      style={{ background: `${color}15`, color, border: `1px solid ${color}40` }}>
      {label}
      <button onClick={onRemove}><X className="w-3 h-3 hover:opacity-70" /></button>
    </span>
  )
}
