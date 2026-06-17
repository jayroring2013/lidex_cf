'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState, useRef, useCallback } from 'react'
import Link from 'next/link'
import { ArrowRight, Sparkles, BarChart2, Flame, Info, BrainCircuit, Building2, Trophy, Loader2, BookOpen } from 'lucide-react'
import { fetchHomeData } from '@/lib/db'
import { useLocale } from '@/contexts/LocaleContext'

interface Cover { id: number; title: string; cover_url: string | null }
interface TypeCounts { anime: number; manga: number; novel: number }
// ── Types ─────────────────────────────────────────────────────────────────────
interface CarouselItem { id: string | number; title: string; cover_url: string | null; score: number | null; href: string }
type CarouselSection = 'anime' | 'manga' | 'novel'

// ── Config ────────────────────────────────────────────────────────────────────
const SECTION_CONFIG: Record<CarouselSection, { label: string; labelVI: string; color: string; href: string }> = {
  anime: { label: 'Anime',       labelVI: 'Anime',       color: '#6366f1', href: '/browse?type=anime' },
  manga: { label: 'Manga',       labelVI: 'Manga',       color: '#ec4899', href: '/browse?type=manga' },
  novel: { label: 'Novel',       labelVI: 'Tiểu thuyết', color: '#22c55e', href: '/browse?type=novel' },
}
const ROTATE_INTERVAL = 6000

// Proxy ALL external images to avoid CORS / hotlink issues
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


function CardSkeleton() {
  return (
    <div className="relative">
      <div className="ml-auto rounded-xl overflow-hidden animate-pulse" style={{ width: '78%' }}>
        <div className="aspect-[2/3]" style={{ background: 'var(--background-secondary)' }} />
      </div>
    </div>
  )
}

// ── Top Card ──────────────────────────────────────────────────────────────────
function TopCard({ item, rank, accentColor, scoreLabel, onInteract }: {
  item: CarouselItem; rank: number; accentColor: string; scoreLabel?: string; onInteract?: () => void
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
      {/* Rank number */}
      <span className="absolute select-none pointer-events-none font-black z-0"
        style={{
          fontSize: 'clamp(48px, 8vw, 100px)', color: 'transparent',
          WebkitTextStroke: `2px ${accentColor}44`, bottom: '-4px', left: '0',
          transform: 'translateX(-30%)', lineHeight: 1,
          fontFamily: '"Arial Black", Impact, sans-serif', letterSpacing: '-2px',
        }}>
        {rank}
      </span>

      {/* Cover */}
      <div className="relative z-10 ml-auto rounded-xl overflow-hidden shadow-xl transition-all duration-200 group-hover:scale-[1.04] group-hover:shadow-2xl"
        style={{ width: '78%', border: `2px solid ${accentColor}33` }}>
        {item.cover_url && !imgErr ? (
          <img src={item.cover_url} alt={item.title}
            className="w-full aspect-[2/3] object-cover block"
            onError={() => setImgErr(true)} />
        ) : (
          <div className="w-full aspect-[2/3] flex items-center justify-center p-3"
            style={{ background: 'var(--background-secondary)' }}>
            <p className="text-xs font-semibold text-center line-clamp-4" style={{ color: 'var(--foreground-secondary)' }}>{item.title}</p>
          </div>
        )}

        {scoreText && (
          <div className="absolute top-2 right-2 px-1.5 py-0.5 rounded-md text-xs font-bold"
            style={{ background: 'rgba(0,0,0,0.78)', color: '#fbbf24', backdropFilter: 'blur(4px)' }}>
            ★ {scoreText}
          </div>
        )}

        {/* Hover overlay */}
        <div className="absolute inset-0 flex items-end opacity-0 group-hover:opacity-100 transition-opacity duration-200"
          style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.52) 35%, rgba(0,0,0,0.14) 70%, transparent)' }}>
          <p className="text-white text-xs font-semibold px-2 pb-2 line-clamp-2 w-full">{item.title}</p>
        </div>

        {/* Accent glow on hover */}
        <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none"
          style={{ boxShadow: `inset 0 0 0 2px ${accentColor}88` }} />
      </div>
    </div>
  )

  return item.href !== '#'
    ? <Link href={item.href} onMouseEnter={onInteract} onPointerDown={onInteract} onFocus={onInteract}>{card}</Link>
    : <div onMouseEnter={onInteract} onPointerDown={onInteract}>{card}</div>
}


// ── Safe image ────────────────────────────────────────────────────────────────
function SafeImg({ src, alt, className }: { src: string; alt: string; className?: string }) {
  const [err, setErr] = useState(false)
  if (err) return <div className={className} style={{ background: 'rgba(99,102,241,0.12)' }} />
  return <img src={src} alt={alt} className={className ?? 'w-full h-full object-cover block'} onError={() => setErr(true)} />
}

// ── Scrolling cover column ────────────────────────────────────────────────────
function CoverColumn({ covers, speed, offset, delay }: {
  covers: Cover[]; speed: number; offset: number; delay: number
}) {
  const doubled = [...covers, ...covers]
  return (
    <div className="flex flex-col gap-2 w-full" style={{ marginTop: offset }}>
      <div style={{ animation: `scrollUp ${speed}s linear infinite`, animationDelay: `${delay}s` }}
        className="flex flex-col gap-2">
        {doubled.map((c, i) => (
          <div key={i} className="rounded-lg overflow-hidden flex-shrink-0"
            style={{ aspectRatio: '2/3', border: '1px solid rgba(255,255,255,0.05)' }}>
            {c.cover_url
              ? <SafeImg src={c.cover_url} alt={c.title} />
              : <div className="w-full h-full" style={{ background: 'rgba(99,102,241,0.1)' }} />}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Trending card with cycling background covers ───────────────────────────────
function TrendingCard({ items, vi }: { items: Cover[]; vi: boolean }) {
  const [activeIdx, setActiveIdx] = useState(0)
  const [fading, setFading] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (items.length < 2) return
    timerRef.current = setInterval(() => {
      setFading(true)
      setTimeout(() => {
        setActiveIdx(prev => (prev + 1) % items.length)
        setFading(false)
      }, 400)
    }, 3000)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [items.length])

  const active = items[activeIdx]

  return (
    <Link href={active ? `/content/${active.id}` : '/browse'}
      className="relative rounded-2xl overflow-hidden w-full h-full block"
      style={{ background: '#7c2d12', boxShadow: '0 8px 32px rgba(249,115,22,0.3)' }}>

      {/* Full-bleed cover */}
      {active?.cover_url && (
        <div className="absolute inset-0 transition-opacity duration-500"
          style={{ opacity: fading ? 0 : 1 }}>
          <img src={active.cover_url} alt="" className="w-full h-full object-cover object-center" />
        </div>
      )}

      {/* Bottom scrim only — mirrors the gradient feel of feature cards */}
      <div className="absolute inset-0"
        style={{ background: 'linear-gradient(to bottom, transparent 30%, rgba(0,0,0,0.78) 100%)' }} />

      {/* Content — same position/structure as FeatureCard */}
      <div className="absolute inset-0 flex flex-col justify-end p-5">
        {/* Series title — same size/weight as feature card titles */}
        <p className="text-base font-bold text-white leading-tight transition-opacity duration-400"
          style={{ opacity: fading ? 0 : 1 }}>
          {active?.title ?? '…'}
        </p>
        {/* CTA row — same as feature cards */}
        <p className="text-xs mt-1.5 font-semibold flex items-center gap-1"
          style={{ color: 'rgba(255,255,255,0.7)' }}>
          <Flame className="w-3 h-3 text-orange-300 flex-shrink-0" />
          {vi ? 'Đang thịnh hành' : 'Trending Now'}
          <ArrowRight className="w-3 h-3 ml-auto transition-transform group-hover:translate-x-0.5" />
        </p>
      </div>
    </Link>
  )
}

// ── Feature card ──────────────────────────────────────────────────────────────
function FeatureCard({ color, title, cta, href }: {
  color: string; title: string; cta: string; href: string
}) {
  return (
    <Link href={href}
      className="group relative flex flex-col justify-end rounded-2xl overflow-hidden w-full h-full transition-all duration-200 hover:scale-[1.02] hover:-translate-y-1"
      style={{ background: color, boxShadow: `0 6px 24px ${color}55` }}>
      <div className="absolute inset-0"
        style={{ background: 'linear-gradient(135deg, rgba(255,255,255,0.13) 0%, transparent 60%)' }} />
      <div className="relative p-5">
        <p className="text-base font-bold text-white leading-tight">{title}</p>
        <p className="text-xs mt-1.5 font-semibold flex items-center gap-1"
          style={{ color: 'rgba(255,255,255,0.7)' }}>
          {cta}
          <ArrowRight className="w-3 h-3 transition-transform group-hover:translate-x-0.5" />
        </p>
      </div>
    </Link>
  )
}


// ── Home feature icons ────────────────────────────────────────────────────────
function HomeFeatureIcon({ icon: Icon, title, subtitle }: {
  icon: any
  title: string
  subtitle: string
}) {
  return (
    <div className="flex flex-col items-center text-center gap-2 min-w-[118px] sm:min-w-[132px]">
      <Icon
        className="w-7 h-7 sm:w-8 sm:h-8"
        strokeWidth={1.8}
        style={{ color: 'var(--foreground)' }}
      />
      <div>
        <p className="text-[11px] sm:text-xs font-black leading-tight" style={{ color: 'var(--foreground)' }}>
          {title}
        </p>
        <p className="text-[9px] sm:text-[10px] mt-0.5 leading-snug" style={{ color: 'var(--foreground-muted)' }}>
          {subtitle}
        </p>
      </div>
    </div>
  )
}

function HomeFeatureStrip({ vi }: { vi: boolean }) {
  const features = [
    {
      icon: Info,
      title: vi ? 'Thông tin' : 'Information',
      subtitle: vi ? 'Cập nhật LN yêu thích' : 'Up-to-date favourite LN',
    },
    {
      icon: BrainCircuit,
      title: vi ? 'Phân tích sâu' : 'In-depth Analysis',
      subtitle: vi ? 'Hiểu rõ từng tựa' : 'Title-level insight',
    },
    {
      icon: Building2,
      title: vi ? 'Dữ liệu NPH' : 'Deep-dive Data',
      subtitle: vi ? 'Nhà phát hành đứng sau LN' : 'Publisher behind the LN',
    },
    {
      icon: Sparkles,
      title: vi ? 'Dự đoán' : 'Prediction',
      subtitle: vi ? 'Khả năng cấp phép tương lai' : 'Future licensing likelihood',
    },
    {
      icon: Trophy,
      title: vi ? 'Xếp hạng LN' : 'Ranking',
      subtitle: vi ? 'BXH LN yêu thích' : 'Favourite LN ranking',
    },
  ]

  return (
    <section className="pt-7 sm:pt-8 pb-4">
      <div className="max-w-7xl mx-auto px-6 sm:px-10 lg:px-16">
        <div className="flex flex-wrap items-start justify-center gap-x-8 gap-y-5 sm:gap-x-12 lg:gap-x-16">
          {features.map(feature => <HomeFeatureIcon key={feature.title} {...feature} />)}
        </div>
        <p className="text-center text-[10px] sm:text-xs mt-6" style={{ color: 'var(--foreground-muted)' }}>
          {vi
            ? 'Tính năng và dữ liệu có thể thay đổi theo nguồn dữ liệu hiện có.'
            : 'Features and data may vary depending on available sources.'}
        </p>
      </div>
    </section>
  )
}

function HomeMissionBanner({ vi, covers }: { vi: boolean; covers: Cover[] }) {
  const visualCovers = covers.slice(0, 3)

  return (
    <section className="pb-16 sm:pb-20">
      <div className="max-w-7xl mx-auto px-6 sm:px-10 lg:px-16">
        <div
          className="grid md:grid-cols-[0.9fr_1.1fr] gap-0 overflow-hidden rounded-2xl"
          style={{
            background: 'var(--home-mission-bg)',
            border: '1px solid var(--home-mission-border)',
            boxShadow: 'var(--home-mission-shadow)',
          }}
        >
          <div className="relative min-h-[190px] sm:min-h-[230px] overflow-hidden" style={{ background: 'var(--home-mission-cover-bg)' }}>
            {visualCovers.length > 0 ? (
              <div className="absolute inset-0 grid grid-cols-3 gap-3 p-4 sm:p-5 items-center">
                {visualCovers.map((cover, idx) => (
                  <div
                    key={`${cover.id}-${idx}`}
                    className="relative rounded-xl overflow-hidden h-full"
                    style={{
                      aspectRatio: '2 / 3',
                      maxHeight: '100%',
                      justifySelf: 'center',
                      border: '1px solid var(--home-mission-border)',
                      boxShadow: '0 12px 32px rgba(15, 23, 42, .16)',
                      background: 'var(--home-mission-cover-fallback)',
                    }}
                  >
                    <div className="absolute inset-0 flex items-center justify-center" style={{ color: 'var(--foreground-muted)' }}>
                      <BookOpen className="w-8 h-8 opacity-40" />
                    </div>
                    {cover.cover_url ? (
                      <img
                        src={cover.cover_url}
                        alt=""
                        className="relative z-10 w-full h-full object-cover"
                        onError={e => { e.currentTarget.style.display = 'none' }}
                      />
                    ) : (
                      <div className="relative z-10 w-full h-full" style={{ background: 'var(--home-mission-cover-fallback)' }} />
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="absolute inset-0" style={{ background: 'var(--home-mission-cover-fallback)' }} />
            )}

            <div className="absolute inset-0" style={{ background: 'var(--home-mission-overlay)' }} />

          </div>

          <div className="relative p-6 sm:p-8 md:p-10 flex flex-col justify-center">
            <div className="absolute inset-0 opacity-70"
              style={{ background: 'var(--home-mission-glow)' }} />

            <div className="relative">


              <h2 className="text-3xl sm:text-4xl font-black leading-tight mb-5" style={{ color: 'var(--home-mission-title)' }}>
                {vi ? 'Một góc nhỏ gọn cho anh em mê Light Novel.' : 'A comfy portable hub for Light Novel fans.'}
              </h2>

              <p className="text-base sm:text-lg leading-relaxed max-w-2xl" style={{ color: 'var(--home-mission-text)' }}>
                {vi
                  ? 'Một nền tảng nhỏ gọn để anh em có thể dễ dàng theo dõi các bộ Light Novel ưa thích của mình một cách dễ dàng nhất, theo hướng phân tích số liệu.'
                  : 'A comfy portable hub where everyone can keep track of their favourite Light Novel in the easiest possible, data-driven way.'}
              </p>


            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function Home() {
  const { locale } = useLocale()
  const vi = locale === 'vi'

  const [covers,     setCovers]     = useState<Cover[]>([])
  const [trending,   setTrending]   = useState<Cover[]>([])
  const [typeCounts, setTypeCounts] = useState<TypeCounts | null>(null)

  const [carouselData,  setCarouselData]  = useState<Record<CarouselSection, CarouselItem[]>>({ anime: [], manga: [], novel: [] })
  const [carouselReady, setCarouselReady] = useState(false)
  const [activeSection, setActiveSection] = useState<CarouselSection>('novel')
  const [transitioning, setTransitioning] = useState(false)
  const [autoRotate,    setAutoRotate]    = useState(true)

  const sections: CarouselSection[] = ['anime', 'manga', 'novel']

  useEffect(() => {
    async function loadAllData() {
      try {
        const data = await fetchHomeData()
        
        // 1. Cover wall
        const shuffledCovers = [...data.covers].sort(() => Math.random() - 0.5)
        setCovers(shuffledCovers)
        
        // 2. Trending
        const allTrending = [
          ...data.trendingAnime,
          ...data.trendingManga,
          ...data.trendingNovels
        ]
        const shuffledTrending = [...allTrending].sort(() => Math.random() - 0.5)
        setTrending(shuffledTrending.slice(0, 8))
        
        // 3. Type counts
        setTypeCounts({
          anime: data.typeCounts[0],
          manga: data.typeCounts[1],
          novel: data.typeCounts[2],
        })
        
        // 4. Carousel data
        setCarouselData({
          anime: data.topAnime.map((s) => ({
            id: s.id,
            title: s.title,
            cover_url: s.cover_url,
            score: s.anime_mean_score,
            href: `/content/${s.id}`
          })),
          manga: data.recentManga.map((m) => ({
            id: m.id,
            title: m.title,
            cover_url: data.mangaVolCovers[m.id] !== undefined ? data.mangaVolCovers[m.id] : m.cover_url,
            score: null,
            href: `/content/${m.id}`
          })),
          novel: data.votingNovels.length > 0
            ? data.votingNovels
            : data.recentNovels.map((n) => ({
                id: n.id,
                title: n.title,
                cover_url: data.novelVolCovers[n.id] !== undefined ? data.novelVolCovers[n.id] : n.cover_url,
                score: null,
                href: `/content/${n.id}`
              })),
        })
        
        setCarouselReady(true)
      } catch (err) {
        console.error('Failed to load homepage data from Server Action:', err)
      }
    }
    loadAllData()
  }, [])

  // Cover wall columns
  const rightCovers = covers.slice(0, Math.ceil(covers.length * 0.6))
  const leftCovers  = covers.slice(Math.ceil(covers.length * 0.6))
  const rightCols = [0,1,2,3,4].map(i => rightCovers.filter((_, idx) => idx % 5 === i))
  const leftCols  = [0,1,2].map(i => leftCovers.filter((_, idx)  => idx % 3 === i))
  const hasCols = covers.length >= 8
  const R_SPEEDS  = [28,22,32,24,26]
  const R_OFFSETS = [0,-60,30,-30,50]
  const R_DELAYS  = [0,-8,-4,-14,-6]
  const L_SPEEDS  = [30,24,27]
  const L_OFFSETS = [-20,40,-40]
  const L_DELAYS  = [-5,-12,-2]


  const goToSection = useCallback((section: CarouselSection) => {
    if (section === activeSection) return
    setTransitioning(true)
    setTimeout(() => { setActiveSection(section); setTransitioning(false) }, 220)
  }, [activeSection])

  const stopTop10Rotation = useCallback(() => setAutoRotate(false), [])

  useEffect(() => {
    if (!autoRotate) return
    const t = setInterval(() => {
      const next = sections[(sections.indexOf(activeSection) + 1) % sections.length]
      goToSection(next)
    }, ROTATE_INTERVAL)
    return () => clearInterval(t)
  }, [autoRotate, activeSection, goToSection])

  const items = carouselData[activeSection]
  const color = SECTION_CONFIG[activeSection].color

  return (
    <div style={{ background: 'var(--background)' }}>

      {/* ══ HERO ══════════════════════════════════════════════════════════════ */}
      <section className="relative flex flex-col overflow-hidden" style={{ minHeight: '100svh' }}>

        {/* Cover wall */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute inset-0 z-10"
            style={{ background: 'var(--hero-wall-overlay)' }} />
          <div className="absolute inset-x-0 top-0 h-32 z-10" style={{ background: 'linear-gradient(to bottom, var(--background), transparent)' }} />
          <div className="absolute inset-x-0 bottom-0 h-40 z-10" style={{ background: 'linear-gradient(to top, var(--background), transparent)' }} />
          <div className="absolute inset-0 items-start overflow-hidden" style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: '10px', padding: '0 4px' }}>
            {hasCols
              ? [
                  { covers: leftCols[0].length ? leftCols[0] : covers.slice(0,6),  speed: L_SPEEDS[0], offset: L_OFFSETS[0], delay: L_DELAYS[0] },
                  { covers: leftCols[1].length ? leftCols[1] : covers.slice(0,6),  speed: L_SPEEDS[1], offset: L_OFFSETS[1], delay: L_DELAYS[1] },
                  { covers: leftCols[2].length ? leftCols[2] : covers.slice(0,6),  speed: L_SPEEDS[2], offset: L_OFFSETS[2], delay: L_DELAYS[2] },
                  { covers: rightCols[0].length ? rightCols[0] : covers.slice(0,6), speed: R_SPEEDS[0], offset: R_OFFSETS[0], delay: R_DELAYS[0] },
                  { covers: rightCols[1].length ? rightCols[1] : covers.slice(0,6), speed: R_SPEEDS[1], offset: R_OFFSETS[1], delay: R_DELAYS[1] },
                  { covers: rightCols[2].length ? rightCols[2] : covers.slice(0,6), speed: R_SPEEDS[2], offset: R_OFFSETS[2], delay: R_DELAYS[2] },
                  { covers: rightCols[3].length ? rightCols[3] : covers.slice(0,6), speed: R_SPEEDS[3], offset: R_OFFSETS[3], delay: R_DELAYS[3] },
                  { covers: rightCols[4].length ? rightCols[4] : covers.slice(0,6), speed: R_SPEEDS[4], offset: R_OFFSETS[4], delay: R_DELAYS[4] },
                ].map((col, i) => (
                  <CoverColumn key={i} covers={col.covers} speed={col.speed} offset={col.offset} delay={col.delay} />
                ))
              : Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="flex flex-col gap-2 w-full">
                    {Array.from({ length: 8 }).map((_, j) => (
                      <div key={j} className="rounded-lg flex-shrink-0 animate-pulse"
                        style={{ aspectRatio: '2/3', background: 'rgba(99,102,241,0.07)' }} />
                    ))}
                  </div>
                ))
            }
          </div>
        </div>

        {/* Hero content */}
        <div className="relative z-20 flex-1 flex flex-col justify-center">
          <div className="max-w-7xl mx-auto w-full px-6 sm:px-10 lg:px-16 py-24">
            <p className="text-xs sm:text-sm font-semibold tracking-widest uppercase mb-5"
              style={{ color: '#818cf8', letterSpacing: '0.18em' }}>
              {vi ? 'Phân tích · Dữ liệu · Cộng đồng' : 'Analytics · Data · Community'}
            </p>
            <h1 className="font-black leading-none tracking-tight mb-6"
              style={{ fontSize: 'clamp(2.8rem, 7vw, 5.5rem)', color: 'var(--foreground)', maxWidth: '10ch' }}>
              {vi ? (
                <>Khám phá<br /><span style={{ color: '#818cf8' }}>tựa tiếp</span><br />theo</>
              ) : (
                <>Discover<br /><span style={{ color: '#818cf8' }}>your next</span><br />obsession</>
              )}
            </h1>
            <p className="text-base sm:text-lg mb-10 max-w-sm leading-relaxed"
              style={{ color: 'var(--hero-secondary-text)', fontWeight: 500 }}>
              {vi
                ? 'Điểm số, xu hướng và thống kê sâu cho Anime, Manga & Light Novel.'
                : 'Scores, trends and deep stats for Anime, Manga & Light Novels.'}
            </p>
            <div className="flex items-center gap-3 flex-wrap">
              <Link href="/browse"
                className="group flex items-center gap-2 px-6 py-3.5 rounded-xl text-sm font-bold text-white transition-all duration-200 hover:brightness-110 hover:-translate-y-0.5"
                style={{ background: '#6366f1', boxShadow: '0 4px 20px rgba(99,102,241,0.35)' }}>
                <Sparkles className="w-4 h-4" />
                {vi ? 'Bắt đầu ngay' : 'Start Exploring'}
                <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
              <Link href="/charts"
                className="flex items-center gap-2 px-6 py-3.5 rounded-xl text-sm font-semibold transition-all duration-200 hover:-translate-y-0.5"
                style={{ color: 'var(--hero-secondary-button-text)', border: '1px solid var(--hero-secondary-button-border)', background: 'var(--hero-secondary-button-bg)', backdropFilter: 'blur(8px)' }}>
                <BarChart2 className="w-4 h-4" />
                {vi ? 'Biểu đồ' : 'Charts'}
              </Link>
            </div>
            {typeCounts && (
              <p className="mt-8 text-xs" style={{ color: 'var(--hero-muted-text)' }}>
                <span style={{ color: 'rgba(129,140,248,0.65)' }}>{typeCounts.anime.toLocaleString()}</span> {vi ? 'anime' : 'anime'}
                {' · '}
                <span style={{ color: 'rgba(34,197,94,0.65)' }}>{typeCounts.manga.toLocaleString()}</span> {vi ? 'manga' : 'manga'}
                {' · '}
                <span style={{ color: 'rgba(236,72,153,0.65)' }}>{typeCounts.novel.toLocaleString()}</span> {vi ? 'light novel' : 'light novels'}
                {' '}{vi ? 'trong cơ sở dữ liệu' : 'in the database'}
              </p>
            )}
          </div>
        </div>

        {/* Scroll hint */}
        <div className="relative z-20 flex justify-center pb-8">
          <div className="flex flex-col items-center gap-1 opacity-30">
            <div className="w-px h-8" style={{ background: 'linear-gradient(to bottom, transparent, rgba(255,255,255,0.4))' }} />
            <div className="w-1 h-1 rounded-full bg-white" />
          </div>
        </div>
      </section>

      {/* ══ TOP 10 SECTION ════════════════════════════════════════════════════ */}
      <section className="py-14 sm:py-16">
        <div className="max-w-7xl mx-auto px-6 sm:px-10 lg:px-16">
          <div>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
              <div className="flex items-baseline gap-2">
                <span className="text-2xl sm:text-3xl font-black" style={{ color: 'var(--foreground)' }}>Top</span>
                <span className="text-2xl sm:text-3xl font-black transition-colors duration-300" style={{ color }}>10</span>
                <span className="text-base sm:text-lg font-bold ml-1 transition-colors duration-300" style={{ color }}>
                  {vi ? SECTION_CONFIG[activeSection].labelVI : SECTION_CONFIG[activeSection].label}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5 p-1 rounded-full" style={{ background: 'var(--glass-bg)', border: '1px solid var(--card-border)' }}>
                  {sections.map(s => (
                    <button key={s}
                      onClick={() => { setAutoRotate(false); goToSection(s) }}
                      className="px-3 py-1 rounded-full text-xs font-bold transition-all duration-200 whitespace-nowrap"
                      style={activeSection === s
                        ? { background: SECTION_CONFIG[s].color, color: '#fff', boxShadow: `0 2px 8px ${SECTION_CONFIG[s].color}44` }
                        : { color: 'var(--foreground-secondary)' }}>
                      {vi ? SECTION_CONFIG[s].labelVI : SECTION_CONFIG[s].label}
                    </button>
                  ))}
                </div>

                {autoRotate && (
                  <div className="hidden sm:flex gap-1">
                    {sections.map(s => (
                      <div key={s} className="h-0.5 rounded-full transition-all duration-300"
                        style={{ width: activeSection === s ? 20 : 6, background: activeSection === s ? SECTION_CONFIG[s].color : 'var(--card-border)' }} />
                    ))}
                  </div>
                )}

                <Link href={SECTION_CONFIG[activeSection].href}
                  className="hidden sm:flex items-center gap-1 text-xs font-semibold transition-all hover:gap-2"
                  style={{ color: 'var(--foreground-muted)' }}>
                  {vi ? 'Xem tất cả' : 'View all'}
                  <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
            </div>

            <div
              className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-x-2 sm:gap-x-4 gap-y-8 sm:gap-y-10"
              style={{ opacity: transitioning ? 0 : 1, transition: 'opacity 0.22s ease' }}
              onMouseEnter={stopTop10Rotation}
              onPointerDown={stopTop10Rotation}
              onFocus={stopTop10Rotation}
            >
              {!carouselReady ? (
                Array.from({ length: 10 }).map((_, i) => <CardSkeleton key={i} />)
              ) : items.length === 0 ? (
                <div className="col-span-5 flex items-center justify-center h-48">
                  <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--foreground-muted)' }} />
                </div>
              ) : items.map((item, i) => (
                <TopCard key={item.id} item={item} rank={i + 1}
                  accentColor={color}
                  scoreLabel={activeSection === 'novel' ? 'votes' : undefined}
                  onInteract={stopTop10Rotation} />
              ))}
            </div>

            <div className="flex justify-center mt-8 sm:hidden">
              <Link href={SECTION_CONFIG[activeSection].href}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all hover:scale-105"
                style={{ background: `${color}18`, color, border: `1px solid ${color}33` }}>
                {vi ? 'Xem tất cả' : 'View all'}
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      <HomeFeatureStrip vi={vi} />

      <HomeMissionBanner vi={vi} covers={trending} />

      <style>{`
        @keyframes scrollUp {
          0%   { transform: translateY(0); }
          100% { transform: translateY(-50%); }
        }
      `}</style>
    </div>
  )
}
