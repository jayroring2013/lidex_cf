'use client'

import Link from 'next/link'
import { useDeferredValue, useMemo, useState } from 'react'
import {
  Award,
  BookOpen,
  ChevronRight,
  Coins,
  LibraryBig,
  Search,
  ShoppingBag,
  Sparkles,
  Star,
  UserCircle,
  ExternalLink,
} from 'lucide-react'
import { proxyImageUrl } from '@/lib/imageProxy'
import { useLocale } from '@/contexts/LocaleContext'

type ViewMode = 'series' | 'bookshelf'

type UserSeriesStatus = 'reading' | 'planned' | 'finished' | 'dropped'

type SeriesOption = {
  id: number
  title: string
  titleVi: string | null
  coverUrl: string | null
  publisher?: string | null
}

type VolumeOption = {
  id: number
  seriesId: number
  volumeNumber: number | null
  title: string | null
  price: number | null
  currency: string
  coverUrl: string | null
  releaseDate: string | null
}

type PurchaseEntry = {
  volumeId: number
  seriesId: number
  volumeNumber: number | null
  title: string | null
  price: number | null
  currency: string
  coverUrl: string | null
  releaseDate: string | null
  series: {
    id: number
    title: string
    titleVi: string | null
    coverUrl: string | null
    publisher?: string | null
  } | null
}

type RatedEntry = {
  seriesId: number
  rating: number | null
  status: string | null
  updatedAt: string | null
  series: {
    id: number
    title: string
    titleVi: string | null
    coverUrl: string | null
  } | null
}

type UserProfile = {
  userId: string
  displayName: string | null
  avatarUrl: string | null
  isPremium: boolean
  premiumTier: string | null
  age?: string | null
  gender?: string | null
}

const STATUS_LABELS: Record<UserSeriesStatus, { vi: string; en: string; color: string }> = {
  reading: { vi: 'Đang đọc', en: 'Reading', color: '#22c55e' },
  planned: { vi: 'Định đọc', en: 'Planned', color: '#38bdf8' },
  finished: { vi: 'Hoàn thành', en: 'Finished', color: '#8b5cf6' },
  dropped: { vi: 'Bỏ', en: 'Dropped', color: '#ef4444' },
}

const PAGE_SIZE = 12

function formatVnd(value: number) {
  return `${Math.round(value).toLocaleString('vi-VN')} VNĐ`
}

function displayTitle(series: { title: string; titleVi?: string | null } | null | undefined, isVI: boolean) {
  if (!series) return 'Untitled'
  return (isVI && series.titleVi) ? series.titleVi : series.title
}

function volumeLabel(volume: VolumeOption | PurchaseEntry, isVI: boolean) {
  if (volume.volumeNumber == null) return isVI ? 'Tập không rõ' : 'Unknown volume'
  return isVI ? `Tập ${volume.volumeNumber}` : `Vol. ${volume.volumeNumber}`
}

function statusLabel(status: string | null | undefined, isVI: boolean) {
  if (!status || !(status in STATUS_LABELS)) return isVI ? 'Không trạng thái' : 'No status'
  const meta = STATUS_LABELS[status as UserSeriesStatus]
  return isVI ? meta.vi : meta.en
}

function statusColor(status: string | null | undefined) {
  if (!status || !(status in STATUS_LABELS)) return '#94a3b8'
  return STATUS_LABELS[status as UserSeriesStatus].color
}

interface PublicBookshelfClientProps {
  profile: UserProfile
  purchases: PurchaseEntry[]
  ratedList: RatedEntry[]
  avgSpending: number
}

export default function PublicBookshelfClient({
  profile,
  purchases,
  ratedList,
  avgSpending,
}: PublicBookshelfClientProps) {
  const { locale } = useLocale()
  const isVI = locale === 'vi'

  const [viewMode, setViewMode] = useState<ViewMode>('bookshelf')
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query)
  
  const [bookshelfPage, setBookshelfPage] = useState(1)
  const [seriesPage, setSeriesPage] = useState(1)

  // Map utilities
  const seriesById = useMemo(() => {
    const map = new Map<number, SeriesOption>()
    
    // Add from rated list
    ratedList.forEach(entry => {
      if (entry.series) {
        map.set(entry.seriesId, {
          id: entry.seriesId,
          title: entry.series.title,
          titleVi: entry.series.titleVi,
          coverUrl: entry.series.coverUrl,
        })
      }
    })

    // Add/override from purchases
    purchases.forEach(entry => {
      if (entry.series) {
        map.set(entry.seriesId, {
          id: entry.seriesId,
          title: entry.series.title,
          titleVi: entry.series.titleVi,
          coverUrl: entry.series.coverUrl,
          publisher: entry.series.publisher,
        })
      }
    })

    return map
  }, [ratedList, purchases])

  const volumesById = useMemo(() => {
    const map = new Map<number, VolumeOption>()
    purchases.forEach(p => {
      map.set(p.volumeId, {
        id: p.volumeId,
        seriesId: p.seriesId,
        volumeNumber: p.volumeNumber,
        title: p.title,
        price: p.price,
        currency: p.currency,
        coverUrl: p.coverUrl,
        releaseDate: p.releaseDate,
      })
    })
    return map
  }, [purchases])

  const ratedBySeries = useMemo(() => new Map(ratedList.map(entry => [entry.seriesId, entry])), [ratedList])

  const selectedVolumes = useMemo(() => {
    return purchases.map(p => ({
      id: p.volumeId,
      seriesId: p.seriesId,
      volumeNumber: p.volumeNumber,
      title: p.title,
      price: p.price,
      currency: p.currency,
      coverUrl: p.coverUrl,
      releaseDate: p.releaseDate,
    }))
  }, [purchases])

  const totalPrice = useMemo(() => {
    return selectedVolumes.reduce((sum, volume) => sum + (volume.price || 0), 0)
  }, [selectedVolumes])

  // Publisher Fanboy Calculation
  const publisherStats = useMemo(() => {
    const publisherStatsMap = new Map<string, { volumeCount: number; seriesIds: Set<number> }>()
    selectedVolumes.forEach(volume => {
      const series = seriesById.get(volume.seriesId)
      const pub = series?.publisher || null
      if (pub) {
        let stat = publisherStatsMap.get(pub)
        if (!stat) {
          stat = { volumeCount: 0, seriesIds: new Set<number>() }
          publisherStatsMap.set(pub, stat)
        }
        stat.volumeCount += 1
        stat.seriesIds.add(volume.seriesId)
      }
    })

    const pubList = Array.from(publisherStatsMap.entries()).map(([name, stat]) => ({
      name,
      volumeCount: stat.volumeCount,
      seriesCount: stat.seriesIds.size
    }))

    if (pubList.length === 0) {
      return { name: null, count: 0, total: 0, percent: 0, badge: null }
    }

    pubList.sort((a, b) => {
      if (b.volumeCount !== a.volumeCount) {
        return b.volumeCount - a.volumeCount
      }
      return b.seriesCount - a.seriesCount
    })

    const topPub = pubList[0]
    const tiedPubs = pubList.filter(
      p => p.volumeCount === topPub.volumeCount && p.seriesCount === topPub.seriesCount
    )

    const sortedTiedNames = tiedPubs.map(p => p.name).sort((a, b) => a.localeCompare(b))
    const topPubName = sortedTiedNames.join(' + ')

    const seriesIds = Array.from(new Set(selectedVolumes.map(v => v.seriesId)))
    const ownedSeriesCount = seriesIds.filter(id => {
      const s = seriesById.get(id)
      return s?.publisher && sortedTiedNames.includes(s.publisher)
    }).length

    // Define a fallback static total for percentage indicators if database fails or is offline
    const totalInCatalog = 40 
    const percent = Math.min(100, Math.round((ownedSeriesCount / totalInCatalog) * 100))

    let badge = 'Top 50%'
    if (ownedSeriesCount >= 8) badge = 'Top 1%'
    else if (ownedSeriesCount >= 5) badge = 'Top 5%'
    else if (ownedSeriesCount >= 3) badge = 'Top 10%'
    else if (ownedSeriesCount >= 2) badge = 'Top 25%'

    return {
      name: topPubName,
      count: ownedSeriesCount,
      total: totalInCatalog,
      percent,
      badge
    }
  }, [selectedVolumes, seriesById])

  // Spending comparison Calculation
  const spendingStats = useMemo(() => {
    if (!avgSpending || avgSpending <= 0) {
      return { diffPercent: 0, isAbove: false, badge: 'Standard' }
    }
    const diffPercent = Math.round(((totalPrice - avgSpending) / avgSpending) * 100)
    const isAbove = totalPrice > avgSpending
    let badge = 'Smart Saver'
    if (totalPrice === 0) badge = 'Newbie'
    else if (totalPrice > avgSpending * 2) badge = 'Whale Collector'
    else if (totalPrice > avgSpending) badge = 'Dedicated Collector'
    
    return {
      diffPercent: Math.abs(diffPercent),
      isAbove,
      badge
    }
  }, [totalPrice, avgSpending])

  // Love New Novels Calculation
  const loveNewNovelsStats = useMemo(() => {
    if (selectedVolumes.length === 0) {
      return { percent: 0, count: 0, badge: 'Newbie' }
    }
    const recent = selectedVolumes.filter(v => {
      if (!v.releaseDate) return false
      const year = new Date(v.releaseDate).getFullYear()
      return year >= 2026
    })
    const percent = Math.round((recent.length / selectedVolumes.length) * 100)
    
    let badge = 'Traditionalist'
    if (percent >= 85) badge = 'Vanguard Trendsetter'
    else if (percent >= 60) badge = 'Modern Reader'
    else if (percent >= 30) badge = 'Balanced Reader'

    return {
      percent,
      count: recent.length,
      badge
    }
  }, [selectedVolumes])

  // Filters & Searching
  const filteredVolumes = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase()
    if (!q) return selectedVolumes

    return selectedVolumes.filter(v => {
      const series = seriesById.get(v.seriesId)
      return (
        `${v.title || ''} ${displayTitle(series, isVI)}`.toLowerCase().includes(q)
      )
    })
  }, [deferredQuery, selectedVolumes, seriesById, isVI])

  const filteredSeries = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase()
    const baseList = Array.from(seriesById.values()).filter(series => ratedBySeries.has(series.id))
    if (!q) return baseList

    return baseList.filter(series => 
      `${series.title} ${series.titleVi || ''}`.toLowerCase().includes(q)
    )
  }, [deferredQuery, seriesById, ratedBySeries])

  // Pagination
  const bookshelfTotalPages = Math.max(1, Math.ceil(filteredVolumes.length / PAGE_SIZE))
  const safeBookshelfPage = Math.min(bookshelfPage, bookshelfTotalPages)
  const paginatedVolumes = useMemo(() => {
    const start = (safeBookshelfPage - 1) * PAGE_SIZE
    return filteredVolumes.slice(start, start + PAGE_SIZE)
  }, [filteredVolumes, safeBookshelfPage])

  const seriesTotalPages = Math.max(1, Math.ceil(filteredSeries.length / PAGE_SIZE))
  const safeSeriesPage = Math.min(seriesPage, seriesTotalPages)
  const paginatedSeries = useMemo(() => {
    const start = (safeSeriesPage - 1) * PAGE_SIZE
    return filteredSeries.slice(start, start + PAGE_SIZE)
  }, [filteredSeries, safeSeriesPage])

  return (
    <div className="min-h-screen overflow-x-hidden px-4 py-8 sm:px-6 lg:px-8" style={{ background: 'var(--background)' }}>
      <div className="max-w-7xl mx-auto">
        
        {/* Header section */}
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b pb-6" style={{ borderColor: 'var(--card-border)' }}>
          <div className="flex items-center gap-4">
            <UserAvatar src={profile.avatarUrl} name={profile.displayName || 'User'} size="md" />
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-2xl sm:text-3xl font-black uppercase tracking-tight" style={{ color: 'var(--foreground)' }}>
                  {isVI ? `Kệ sách của ${profile.displayName}` : `${profile.displayName}'s Bookshelf`}
                </h1>
                {profile.isPremium && <PremiumBadge tier={profile.premiumTier} />}
              </div>
              <p className="text-xs sm:text-sm mt-1" style={{ color: 'var(--foreground-muted)' }}>
                {isVI ? 'Danh mục Light Novel & Manga được sưu tầm và đánh giá' : 'Public Light Novel & Manga collection and ratings'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              {isVI ? 'Chế độ người xem' : 'Viewer Mode'}
            </span>
          </div>
        </div>

        {/* Statistics Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5 mb-8">
          {/* Card 1: Bookshelf Total */}
          <div className="glass relative overflow-hidden rounded-2xl p-4 sm:p-5 transition-all hover:scale-[1.02]" style={{ border: '1px solid var(--card-border)' }}>
            <div className="flex items-center justify-between mb-3">
              <span className="p-1.5 sm:p-2 rounded-xl bg-indigo-500/10 text-indigo-400">
                <ShoppingBag className="w-4 h-4 sm:w-5 sm:h-5" />
              </span>
              <span className="text-[9px] sm:text-[10px] font-black uppercase tracking-wider text-indigo-400 bg-indigo-400/10 px-1.5 sm:px-2 py-0.5 rounded-full">
                Bookshelf
              </span>
            </div>
            <p className="text-[10px] sm:text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--foreground-muted)' }}>
              {isVI ? 'Sở hữu' : 'Owned'}
            </p>
            <h3 className="text-xl sm:text-2xl font-black mt-1" style={{ color: 'var(--foreground)' }}>
              {selectedVolumes.length} <span className="text-[11px] sm:text-xs font-bold" style={{ color: 'var(--foreground-muted)' }}>{isVI ? 'quyển' : 'vols'}</span>
            </h3>
            <div className="mt-3 sm:mt-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
              <span className="text-[10px] sm:text-xs" style={{ color: 'var(--foreground-muted)' }}>{isVI ? 'Tổng giá trị' : 'Total Value'}</span>
              <span className="text-xs sm:text-sm font-black text-indigo-400">{formatVnd(totalPrice)}</span>
            </div>
          </div>

          {/* Card 2: Publisher Fanboy */}
          <div className="glass relative overflow-hidden rounded-2xl p-4 sm:p-5 transition-all hover:scale-[1.02]" style={{ border: '1px solid var(--card-border)' }}>
            <div className="flex items-center justify-between mb-3">
              <span className="p-1.5 sm:p-2 rounded-xl bg-amber-500/10 text-amber-400">
                <Award className="w-4 h-4 sm:w-5 sm:h-5" />
              </span>
              {publisherStats.badge && (
                <span className="text-[9px] sm:text-[10px] font-black uppercase tracking-wider text-amber-400 bg-amber-400/10 px-1.5 sm:px-2 py-0.5 rounded-full">
                  {publisherStats.badge}
                </span>
              )}
            </div>
            <p className="text-[10px] sm:text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--foreground-muted)' }}>
              {isVI ? 'Fanboy NPH' : 'Publisher Fanboy'}
            </p>
            <h3 className="text-lg sm:text-xl font-black mt-1 truncate" style={{ color: 'var(--foreground)' }} title={publisherStats.name || 'N/A'}>
              {publisherStats.name ? publisherStats.name : (isVI ? 'Chưa rõ' : 'None Yet')}
            </h3>
            <div className="mt-2.5">
              <div className="flex items-center justify-between text-[10px] sm:text-xs mb-1">
                <span className="truncate max-w-[70%]" style={{ color: 'var(--foreground-muted)' }}>
                  {publisherStats.name 
                    ? `${publisherStats.count} series` 
                    : (isVI ? 'Chưa có' : 'No data')}
                </span>
                <span className="font-bold" style={{ color: 'var(--foreground-secondary)' }}>{publisherStats.percent}%</span>
              </div>
              <div className="w-full h-1 sm:h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--background-secondary)' }}>
                <div 
                  className="bg-amber-500 h-full rounded-full transition-all duration-500" 
                  style={{ width: `${publisherStats.percent}%` }}
                />
              </div>
            </div>
          </div>

          {/* Card 3: Spending Comparison */}
          <div className="glass relative overflow-hidden rounded-2xl p-4 sm:p-5 transition-all hover:scale-[1.02]" style={{ border: '1px solid var(--card-border)' }}>
            <div className="flex items-center justify-between mb-3">
              <span className={`p-1.5 sm:p-2 rounded-xl ${spendingStats.isAbove ? 'bg-emerald-500/10 text-emerald-400' : 'bg-sky-500/10 text-sky-400'}`}>
                <Coins className="w-4 h-4 sm:w-5 sm:h-5" />
              </span>
              <span className={`text-[9px] sm:text-[10px] font-black uppercase tracking-wider px-1.5 sm:px-2 py-0.5 rounded-full ${spendingStats.isAbove ? 'text-emerald-400 bg-emerald-400/10' : 'text-sky-400 bg-sky-400/10'}`}>
                {spendingStats.badge.split(' ')[0]}
              </span>
            </div>
            <p className="text-[10px] sm:text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--foreground-muted)' }}>
              {isVI ? 'Chi Tiêu' : 'Spending'}
            </p>
            <h3 className="text-xl sm:text-2xl font-black mt-1 flex items-center gap-1" style={{ color: 'var(--foreground)' }}>
              {spendingStats.isAbove ? '+' : '-'} {spendingStats.diffPercent}%
              <span className="text-[10px] sm:text-xs font-normal" style={{ color: 'var(--foreground-muted)' }}>
                {isVI ? 'TB' : 'avg'}
              </span>
            </h3>
            <div className="mt-3 sm:mt-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 text-[10px] sm:text-xs">
              <span style={{ color: 'var(--foreground-muted)' }}>{isVI ? 'Trung bình' : 'Average'}</span>
              <span className="font-bold text-emerald-400">{formatVnd(avgSpending)}</span>
            </div>
          </div>

          {/* Card 4: Love New Novels */}
          <div className="glass relative overflow-hidden rounded-2xl p-4 sm:p-5 transition-all hover:scale-[1.02]" style={{ border: '1px solid var(--card-border)' }}>
            <div className="flex items-center justify-between mb-3">
              <span className="p-1.5 sm:p-2 rounded-xl bg-purple-500/10 text-purple-400">
                <Sparkles className="w-4 h-4 sm:w-5 sm:h-5" />
              </span>
              <span className="text-[9px] sm:text-[10px] font-black uppercase tracking-wider text-purple-400 bg-purple-400/10 px-1.5 sm:px-2 py-0.5 rounded-full">
                {loveNewNovelsStats.badge.split(' ')[0]}
              </span>
            </div>
            <p className="text-[10px] sm:text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--foreground-muted)' }}>
              {isVI ? 'Novel Mới' : 'New Novels'}
            </p>
            <h3 className="text-xl sm:text-2xl font-black mt-1" style={{ color: 'var(--foreground)' }}>
              {loveNewNovelsStats.percent}%
              <span className="text-[10px] sm:text-xs font-normal ml-1" style={{ color: 'var(--foreground-muted)' }}>
                {isVI ? '≥ 2026' : '≥ 2026'}
              </span>
            </h3>
            <div className="mt-2.5">
              <div className="flex items-center justify-between text-[10px] sm:text-xs mb-1">
                <span style={{ color: 'var(--foreground-muted)' }}>
                  {isVI ? `${loveNewNovelsStats.count} quyển` : `${loveNewNovelsStats.count} vols`}
                </span>
                <span className="font-bold" style={{ color: 'var(--foreground-secondary)' }}>{loveNewNovelsStats.percent}%</span>
              </div>
              <div className="w-full h-1 sm:h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--background-secondary)' }}>
                <div 
                  className="bg-purple-500 h-full rounded-full transition-all duration-500" 
                  style={{ width: `${loveNewNovelsStats.percent}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Bookshelf Content Area */}
        <div className="glass rounded-3xl p-5 sm:p-7 relative z-10" style={{ border: '1px solid var(--card-border)' }}>
          
          {/* Controls Bar */}
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-6">
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-black" style={{ color: 'var(--foreground)' }}>
                {viewMode === 'bookshelf'
                  ? (isVI ? 'Tập sách đã mua' : 'Owned Volumes')
                  : (isVI ? 'Đánh giá series' : 'Series Ratings')}
              </h2>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              {/* Search Bar */}
              <div className="relative w-full sm:w-[260px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--foreground-muted)' }} />
                <input
                  value={query}
                  onChange={e => {
                    setQuery(e.target.value)
                    setBookshelfPage(1)
                    setSeriesPage(1)
                  }}
                  placeholder={viewMode === 'bookshelf' ? (isVI ? 'Tìm tập sách...' : 'Search volumes...') : (isVI ? 'Tìm series...' : 'Search series...')}
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl text-xs sm:text-sm outline-none font-bold"
                  style={{ background: 'var(--background-secondary)', color: 'var(--foreground)', border: '1px solid var(--card-border)' }}
                />
              </div>

              {/* View Mode Toggle */}
              <div className="flex p-1 rounded-xl shrink-0" style={{ background: 'var(--background-secondary)', border: '1px solid var(--card-border)' }}>
                <button
                  onClick={() => setViewMode('bookshelf')}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-black transition-all"
                  style={{
                    background: viewMode === 'bookshelf' ? '#6366f1' : 'transparent',
                    color: viewMode === 'bookshelf' ? '#ffffff' : 'var(--foreground-muted)',
                  }}
                >
                  <LibraryBig className="w-3.5 h-3.5" />
                  {isVI ? 'Tập sách' : 'Volumes'}
                </button>
                <button
                  onClick={() => setViewMode('series')}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-black transition-all"
                  style={{
                    background: viewMode === 'series' ? '#6366f1' : 'transparent',
                    color: viewMode === 'series' ? '#ffffff' : 'var(--foreground-muted)',
                  }}
                >
                  <BookOpen className="w-3.5 h-3.5" />
                  {isVI ? 'Series' : 'Series'}
                </button>
              </div>
            </div>
          </div>

          {/* Grids rendering */}
          {viewMode === 'bookshelf' ? (
            <>
              {paginatedVolumes.length ? (
                <div className="grid grid-cols-2 gap-x-4 gap-y-7 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                  {paginatedVolumes.map(volume => {
                    const series = seriesById.get(volume.seriesId)
                    const cover = proxyImageUrl(volume.coverUrl || series?.coverUrl || null)

                    return (
                      <Link key={volume.id} href={`/content/${volume.seriesId}`} className="group min-w-0">
                        <div
                          className="relative aspect-[2/3] overflow-hidden rounded-2xl shadow-2xl transition-transform duration-200 group-hover:-translate-y-1 group-hover:rotate-[-1deg]"
                          style={{
                            background: 'var(--background-secondary)',
                            border: '1px solid var(--card-border)',
                            boxShadow: '0 18px 30px rgba(15,23,42,.20), 10px 0 18px rgba(15,23,42,.10)',
                          }}
                        >
                          {cover ? (
                            <img src={cover} alt="" className="w-full h-full object-cover" loading="lazy" decoding="async" />
                          ) : (
                            <BookOpen className="absolute left-1/2 top-1/2 w-8 h-8 -translate-x-1/2 -translate-y-1/2 opacity-40 text-primary-400" />
                          )}
                          <div className="absolute inset-y-0 left-0 w-4 bg-gradient-to-r from-black/25 to-transparent" />
                          <div className="absolute left-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-black text-white" style={{ background: 'rgba(15,23,42,.72)' }}>
                            {volumeLabel(volume, isVI)}
                          </div>
                        </div>
                        <p className="text-xs font-black mt-3 line-clamp-2" style={{ color: 'var(--foreground)' }}>
                          {displayTitle(series, isVI)}
                        </p>
                        <p className="text-[11px] font-semibold mt-1" style={{ color: 'var(--foreground-muted)' }}>
                          {volume.price ? formatVnd(volume.price) : (isVI ? 'Chưa có giá' : 'No price')}
                        </p>
                      </Link>
                    )
                  })}
                </div>
              ) : (
                <div className="rounded-2xl p-16 text-center" style={{ background: 'var(--background-secondary)', border: '1px solid var(--card-border)', color: 'var(--foreground-muted)' }}>
                  {isVI ? 'Không tìm thấy tập sách nào.' : 'No volumes found.'}
                </div>
              )}

              <PaginationControls
                page={safeBookshelfPage}
                totalPages={bookshelfTotalPages}
                totalItems={filteredVolumes.length}
                pageSize={PAGE_SIZE}
                isVI={isVI}
                onPageChange={setBookshelfPage}
              />
            </>
          ) : (
            <>
              {paginatedSeries.length ? (
                <div className="grid grid-cols-2 gap-x-4 gap-y-7 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                  {paginatedSeries.map(item => {
                    const cover = proxyImageUrl(item.coverUrl)
                    const entry = ratedBySeries.get(item.id)
                    const rating = entry?.rating == null ? null : Number(entry.rating)
                    const status = entry?.status || null

                    return (
                      <div
                        key={item.id}
                        className="group relative min-w-0 overflow-hidden rounded-2xl flex flex-col"
                        style={{ background: 'var(--content-detail-tile-bg)', border: '1px solid var(--content-detail-tile-border)' }}
                      >
                        <div className="relative aspect-[2/3] overflow-hidden" style={{ background: 'var(--background-secondary)' }}>
                          {cover ? (
                            <img src={cover} alt="" className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" loading="lazy" decoding="async" />
                          ) : (
                            <BookOpen className="absolute left-1/2 top-1/2 w-9 h-9 -translate-x-1/2 -translate-y-1/2 opacity-40 text-primary-400" />
                          )}

                          <div className="absolute inset-x-0 top-0 p-2 flex items-start justify-end">
                            {rating != null && (
                              <span className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-black text-white backdrop-blur" style={{ background: 'rgba(245,158,11,.85)' }}>
                                <Star className="w-3 h-3 fill-white" />
                                {rating.toFixed(1).replace('.0', '')}
                              </span>
                            )}
                          </div>

                          <div className="absolute inset-0 flex flex-col justify-end p-3 opacity-0 transition-opacity duration-200 group-hover:opacity-100" style={{ background: 'linear-gradient(to top, rgba(2,6,23,.82), rgba(2,6,23,.30), transparent)' }}>
                            <Link
                              href={`/content/${item.id}`}
                              className="rounded-xl px-3 py-2 text-center text-xs font-black text-white flex items-center justify-center gap-1.5"
                              style={{ background: '#6366f1', boxShadow: '0 10px 24px rgba(99,102,241,.28)' }}
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                              {isVI ? 'Xem chi tiết' : 'Open details'}
                            </Link>
                          </div>
                        </div>

                        <div className="p-3 flex-1 flex flex-col justify-between">
                          <h3 className="text-xs font-black line-clamp-2 min-h-[32px]" style={{ color: 'var(--foreground)' }}>
                            {displayTitle(item, isVI)}
                          </h3>
                          <div className="mt-2 flex items-center justify-between gap-2 border-t pt-2 border-slate-800">
                            <span className="truncate text-[10px] font-bold" style={{ color: statusColor(status) }}>
                              {statusLabel(status, isVI)}
                            </span>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="rounded-2xl p-16 text-center" style={{ background: 'var(--background-secondary)', border: '1px solid var(--card-border)', color: 'var(--foreground-muted)' }}>
                  {isVI ? 'Không tìm thấy series nào.' : 'No series found.'}
                </div>
              )}

              <PaginationControls
                page={safeSeriesPage}
                totalPages={seriesTotalPages}
                totalItems={filteredSeries.length}
                pageSize={PAGE_SIZE}
                isVI={isVI}
                onPageChange={setSeriesPage}
              />
            </>
          )}

        </div>
      </div>
    </div>
  )
}

function UserAvatar({ src, name, size = 'md' }: { src: string | null; name: string; size?: 'sm' | 'md' }) {
  const sizeClass = size === 'sm' ? 'w-10 h-10' : 'w-12 h-12'
  const initial = name?.trim()?.[0]?.toUpperCase() || 'U'

  return (
    <div
      className={`${sizeClass} relative overflow-hidden rounded-full flex items-center justify-center shrink-0`}
      style={{ background: 'linear-gradient(135deg, rgba(99,102,241,.22), rgba(139,92,246,.14))', border: '1px solid var(--card-border)' }}
    >
      {src ? (
        <img src={src} alt="" className="w-full h-full object-cover" loading="lazy" decoding="async" />
      ) : (
        <span className="text-sm font-black text-primary-500">{initial}</span>
      )}
    </div>
  )
}

function PremiumBadge({ tier }: { tier?: string | null }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wide"
      style={{ background: 'linear-gradient(135deg, rgba(245,158,11,.20), rgba(139,92,246,.18))', color: '#f59e0b', border: '1px solid rgba(245,158,11,.32)' }}
      title={tier ? `Premium: ${tier}` : 'Premium user'}
    >
      <Star className="w-3 h-3 fill-current" />
      {tier || 'Premium'}
    </span>
  )
}

function PaginationControls({
  page,
  totalPages,
  totalItems,
  pageSize,
  isVI,
  onPageChange,
}: {
  page: number
  totalPages: number
  totalItems: number
  pageSize: number
  isVI: boolean
  onPageChange: (page: number) => void
}) {
  if (totalPages <= 1) {
    return (
      <div className="mt-5 text-center text-xs font-bold" style={{ color: 'var(--foreground-muted)' }}>
        {totalItems.toLocaleString(isVI ? 'vi-VN' : 'en-US')} {isVI ? 'mục' : 'items'}
      </div>
    )
  }

  const start = totalItems === 0 ? 0 : (page - 1) * pageSize + 1
  const end = Math.min(totalItems, page * pageSize)
  const pages = Array.from(new Set([
    1,
    Math.max(1, page - 1),
    page,
    Math.min(totalPages, page + 1),
    totalPages,
  ])).sort((a, b) => a - b)

  return (
    <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-t pt-4" style={{ borderColor: 'var(--card-border)' }}>
      <p className="text-xs font-bold" style={{ color: 'var(--foreground-muted)' }}>
        {isVI
          ? `Hiển thị ${start}-${end} / ${totalItems.toLocaleString('vi-VN')}`
          : `Showing ${start}-${end} of ${totalItems.toLocaleString('en-US')}`}
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page <= 1}
          className="rounded-xl px-3 py-2 text-xs font-black disabled:opacity-40"
          style={{ background: 'var(--background-secondary)', color: 'var(--foreground-secondary)', border: '1px solid var(--card-border)' }}
        >
          {isVI ? 'Trước' : 'Prev'}
        </button>

        {pages.map((item, index) => {
          const previous = pages[index - 1]
          const needsGap = previous != null && item - previous > 1
          return (
            <div key={item} className="flex items-center gap-2">
              {needsGap && <span className="text-xs" style={{ color: 'var(--foreground-muted)' }}>…</span>}
              <button
                type="button"
                onClick={() => onPageChange(item)}
                className="min-w-9 rounded-xl px-3 py-2 text-xs font-black"
                style={item === page
                  ? { background: '#6366f1', color: '#fff' }
                  : { background: 'var(--background-secondary)', color: 'var(--foreground-secondary)', border: '1px solid var(--card-border)' }}
              >
                {item}
              </button>
            </div>
          )
        })}

        <button
          type="button"
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          disabled={page >= totalPages}
          className="rounded-xl px-3 py-2 text-xs font-black disabled:opacity-40"
          style={{ background: 'var(--background-secondary)', color: 'var(--foreground-secondary)', border: '1px solid var(--card-border)' }}
        >
          {isVI ? 'Sau' : 'Next'}
        </button>
      </div>
    </div>
  )
}
