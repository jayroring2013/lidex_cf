'use client'

import { useEffect, useState, useCallback } from 'react'
import { BookOpen, Tv, Book, Loader2, RefreshCw } from 'lucide-react'
import { getCachedTopRatedSeries, getCachedBoardStats, getCachedBoardRecent } from '@/lib/cachedDb'
import StatsCard from '../../components/StatsCard'
import Link from 'next/link'

interface SiteStats {
  totalSeries: number
  totalAnime:  number
  totalManga:  number
  totalNovel:  number
}

interface CarouselItem {
  id:        string | number
  title:     string
  cover_url: string | null
  score:     number | null
  href:      string
}

type CarouselSection = 'anime' | 'manga' | 'novel'

const SECTION_LABELS: Record<CarouselSection, string> = {
  anime: 'Anime',
  manga: 'Manga',
  novel: 'Tiểu thuyết',
}

const SECTION_COLORS: Record<CarouselSection, string> = {
  anime: '#6366f1',
  manga: '#ec4899',
  novel: '#22c55e',
}

const ROTATE_INTERVAL = 6000

function proxyImg(url: string | null): string | null {
  if (!url) return null
  try {
    const h = new URL(url).hostname
    if (!h.includes('supabase') && !h.includes('localhost') && !h.includes('r2.dev') && !h.includes('cloudflarestorage.com') && !url.startsWith('/')) {
      return `/api/image-proxy?url=${encodeURIComponent(url)}`
    }
  } catch {}
  return url
}

export default function Dashboard() {
  const [stats,    setStats]    = useState<SiteStats | null>(null)
  const [loading,  setLoading]  = useState(true)

  const [carouselData, setCarouselData] = useState<Record<CarouselSection, CarouselItem[]>>({
    anime: [], manga: [], novel: [],
  })
  const [activeSection, setActiveSection] = useState<CarouselSection>('anime')
  const [transitioning, setTransitioning] = useState(false)
  const [autoRotate, setAutoRotate] = useState(true)

  const sections: CarouselSection[] = ['anime', 'manga', 'novel']

  useEffect(() => {
    async function loadDashboard() {
      try {
        const [topAnimeData, boardStats, mangaData, novelData] = await Promise.all([
          getCachedTopRatedSeries({ limit: 10 }),
          getCachedBoardStats(),
          getCachedBoardRecent('manga'),
          getCachedBoardRecent('novel'),
        ])

        const anime = boardStats.anime
        const novel = boardStats.novel
        const manga = boardStats.manga

        setStats({
          totalAnime:  anime,
          totalNovel:  novel,
          totalManga:  manga,
          totalSeries: anime + novel + manga,
        })

        const animeItems: CarouselItem[] = (topAnimeData.data || []).map((s: any) => ({
          id:        s.id,
          title:     s.title,
          cover_url: s.cover_url,
          score:     s.anime_mean_score,
          href:      `/content/${s.id}`,
        }))

        const mangaItems: CarouselItem[] = (mangaData || []).map((m: any) => ({
          id:        m.id,
          title:     m.title,
          cover_url: proxyImg(m.cover_url),
          score:     null,
          href:      `/content/${m.id}`,
        }))

        const novelItems: CarouselItem[] = (novelData || []).map((n: any) => ({
          id:        n.id,
          title:     n.title,
          cover_url: proxyImg(n.cover_url),
          score:     null,
          href:      `/content/${n.id}`,
        }))

        setCarouselData({ anime: animeItems, manga: mangaItems, novel: novelItems })
      } catch (error) {
        console.error('Failed to load dashboard:', error)
      } finally {
        setLoading(false)
      }
    }
    loadDashboard()
  }, [])

  const goToSection = useCallback((section: CarouselSection) => {
    if (section === activeSection) return
    setTransitioning(true)
    setTimeout(() => {
      setActiveSection(section)
      setTransitioning(false)
    }, 250)
  }, [activeSection])

  useEffect(() => {
    if (!autoRotate) return
    const t = setInterval(() => {
      const next = sections[(sections.indexOf(activeSection) + 1) % sections.length]
      goToSection(next)
    }, ROTATE_INTERVAL)
    return () => clearInterval(t)
  }, [autoRotate, activeSection, goToSection])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen" style={{ background: 'var(--background)' }}>
        <Loader2 className="w-12 h-12 text-primary-500 animate-spin" />
      </div>
    )
  }

  const items = carouselData[activeSection]
  const color = SECTION_COLORS[activeSection]

  return (
    <div className="min-h-screen" style={{ background: 'var(--background)' }}>
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold mb-1" style={{ color: 'var(--foreground)' }}>Dashboard</h1>
            <p className="text-sm" style={{ color: 'var(--foreground-secondary)' }}>
              Tổng quan nội dung và hoạt động cộng đồng
            </p>
          </div>
          <div className="mt-4 md:mt-0 flex items-center gap-3">
            <button onClick={() => window.location.reload()} className="p-2 glass rounded-lg transition-colors" title="Refresh">
              <RefreshCw className="w-4 h-4" style={{ color: 'var(--foreground-secondary)' }} />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-10">
          <StatsCard icon={BookOpen} value={stats?.totalSeries?.toLocaleString() || '0'} label="Total Series"   color="primary" trend={null} />
          <StatsCard icon={Tv}       value={stats?.totalAnime?.toLocaleString()  || '0'} label="Anime"          color="purple"  trend={null} />
          <StatsCard icon={Book}     value={stats?.totalManga?.toLocaleString()  || '0'} label="Manga"          color="pink"    trend={null} />
          <StatsCard icon={BookOpen} value={(stats as any)?.totalNovel?.toLocaleString() || '0'} label="Tiểu thuyết" color="green" trend={null} />
        </div>

        <div>
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-black" style={{ color: 'var(--foreground)' }}>Top</span>
              <span className="text-3xl font-black" style={{ color }}>10</span>
              <span className="text-lg font-bold ml-1 transition-colors duration-300" style={{ color }}>
                {SECTION_LABELS[activeSection]}
              </span>
            </div>

            <div className="flex items-center gap-3">
              {sections.map(s => (
                <button
                  key={s}
                  onClick={() => { setAutoRotate(false); goToSection(s) }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all duration-200"
                  style={{
                    background: activeSection === s ? SECTION_COLORS[s] : 'var(--background-secondary)',
                    color:      activeSection === s ? '#fff' : 'var(--foreground-secondary)',
                    border:     `1px solid ${activeSection === s ? SECTION_COLORS[s] : 'var(--card-border)'}`,
                    transform:  activeSection === s ? 'scale(1.05)' : 'scale(1)',
                  }}
                >
                  <span className="w-2 h-2 rounded-full" style={{ background: activeSection === s ? '#fff' : SECTION_COLORS[s] }} />
                  {SECTION_LABELS[s]}
                </button>
              ))}
              {autoRotate && (
                <div className="flex gap-1 ml-1">
                  {sections.map(s => (
                    <div
                      key={s}
                      className="h-0.5 rounded-full transition-all duration-300"
                      style={{
                        width:      activeSection === s ? '20px' : '6px',
                        background: activeSection === s ? SECTION_COLORS[s] : 'var(--card-border)',
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-x-3 gap-y-10 transition-opacity duration-250" style={{ opacity: transitioning ? 0 : 1 }}>
            {items.length === 0 ? (
              <div className="col-span-5 flex items-center justify-center h-48">
                <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--foreground-muted)' }} />
              </div>
            ) : items.map((item, i) => (
              <TopCard key={item.id} item={item} rank={i + 1} accentColor={color} scoreLabel={activeSection === 'novel' ? 'votes' : undefined} />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function TopCard({ item, rank, accentColor, scoreLabel }: {
  item: CarouselItem
  rank: number
  accentColor: string
  scoreLabel?: string
}) {
  const [imgErr, setImgErr] = useState(false)

  const fmtScore = (s: number | null) => {
    if (s == null) return null
    if (scoreLabel === 'votes') return s >= 1000 ? `${(s / 1000).toFixed(1)}K` : String(s)
    return String(s)
  }

  const scoreText = fmtScore(item.score)

  const card = (
    <div className="relative group cursor-pointer">
      <span
        className="absolute select-none pointer-events-none font-black z-0"
        style={{
          fontSize:         'clamp(64px, 9vw, 100px)',
          color:            'transparent',
          WebkitTextStroke: `2px ${accentColor}55`,
          bottom:           '-4px',
          left:             '0',
          transform:        'translateX(-32%)',
          lineHeight:       1,
          fontFamily:       '"Arial Black", Impact, sans-serif',
          letterSpacing:    '-3px',
        }}
      >
        {rank}
      </span>

      <div className="relative z-10 ml-auto rounded-xl overflow-hidden shadow-xl transition-transform duration-200 group-hover:scale-[1.04]" style={{ width: '78%', border: `2px solid ${accentColor}44` }}>
        {item.cover_url && !imgErr ? (
          <img src={item.cover_url} alt={item.title} loading="lazy" decoding="async" className="w-full aspect-[2/3] object-cover block" onError={() => setImgErr(true)} />
        ) : (
          <div className="w-full aspect-[2/3] flex items-center justify-center p-3" style={{ background: 'var(--background-secondary)' }}>
            <p className="text-xs font-semibold text-center line-clamp-4" style={{ color: 'var(--foreground-secondary)' }}>
              {item.title}
            </p>
          </div>
        )}

        {scoreText && (
          <div className="absolute top-2 right-2 px-1.5 py-0.5 rounded-md text-xs font-bold flex items-center gap-0.5" style={{ background: 'rgba(0,0,0,0.78)', color: '#fbbf24', backdropFilter: 'blur(4px)' }}>
            ★ {scoreText}
          </div>
        )}

        <div className="absolute inset-0 flex items-end opacity-0 group-hover:opacity-100 transition-opacity duration-200" style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.88) 45%, transparent)' }}>
          <p className="text-white text-xs font-semibold px-2 pb-2 line-clamp-2 w-full">
            {item.title}
          </p>
        </div>
      </div>
    </div>
  )

  return item.href !== '#' ? <Link href={item.href}>{card}</Link> : <div>{card}</div>
}
