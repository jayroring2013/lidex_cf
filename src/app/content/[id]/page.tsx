'use client'

import { useRef, useState, useEffect, useId } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import {
  Star, Calendar, BookOpen, Info, Tags,
  ExternalLink, Share2, Copy, Twitter, Loader2,
  ArrowLeft, Award, TrendingUp, Globe, ChevronDown, ChevronUp,
  BarChart2, FlaskConical, Users, Film, Layers, BookMarked,
  Languages, BadgeCheck, Building2, Image as ImageIcon
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

  // ── Manga-specific: fetch manga_meta + latest volume cover ───────────────────
  useEffect(() => {
    if (!series || series.item_type !== 'manga') return

    async function loadMangaEnrichment() {
      // 1. manga_meta — only fields that are actually populated (no MangaDex data yet)
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

  // ── Anime: set cover from series directly ────────────────────────────────────
  useEffect(() => {
    if (!series || series.item_type === 'manga') return
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

  const handleShareTwitter = () => {
    const text = encodeURIComponent(`Check out "${series?.title}" on LiDex Analytics!`)
    const url  = encodeURIComponent(window.location.href)
    window.open(`https://twitter.com/intent/tweet?text=${text}&url=${url}`, '_blank')
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
          <div className="flex flex-col md:flex-row md:items-end gap-5 md:gap-8 pt-24 sm:pt-28 pb-10 sm:pb-14">

            {/* ── Cover ── */}
            <div className="flex-shrink-0 mx-auto md:mx-0">
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
                    {!synopsisExpanded && (
                      <div className="absolute bottom-0 left-0 right-0 h-8 pointer-events-none"
                        style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.4), transparent)' }} />
                    )}
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
          <div className="lg:col-span-2 min-w-0">

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
                ) : isManga ? (
                  /* --- NEW MANGA STATS SECTION --- */
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
          <div className="space-y-4 sm:space-y-5 min-w-0">

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
                <button onClick={handleShareTwitter} className="p-2.5 rounded-lg flex items-center justify-center gap-1.5 transition-colors text-xs font-medium hover:text-[#1d9bf0]"
                  style={{ background: 'var(--background-secondary)', color: 'var(--foreground-secondary)', border: '1px solid var(--card-border)' }}>
                  <Twitter className="w-3.5 h-3.5 flex-shrink-0" />
                  Twitter
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
                {isManga ? (
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
        </div>
      </div>
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

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
