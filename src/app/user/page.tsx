'use client'

import Link from 'next/link'
import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react'
import {
  BookOpen,
  Check,
  ChevronRight,
  LibraryBig,
  Loader2,
  Save,
  Search,
  Star,
  UserCircle,
  X,
} from 'lucide-react'
import supabase from '@/lib/supabaseClient'
import publicSupabase from '@/lib/publicSupabaseClient'
import { proxyImageUrl } from '@/lib/imageProxy'
import { useLocale } from '@/contexts/LocaleContext'
import type { Session } from '@supabase/supabase-js'

type ViewMode = 'series' | 'bookshelf'

type UserSeriesStatus = 'reading' | 'planned' | 'finished' | 'dropped'

type SeriesOption = {
  id: number
  title: string
  titleVi: string | null
  coverUrl: string | null
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

const STATUS_LABELS: Record<UserSeriesStatus, { vi: string; en: string; color: string }> = {
  reading: { vi: 'Đang đọc', en: 'Reading', color: '#22c55e' },
  planned: { vi: 'Định đọc', en: 'Planned', color: '#38bdf8' },
  finished: { vi: 'Hoàn thành', en: 'Finished', color: '#8b5cf6' },
  dropped: { vi: 'Bỏ', en: 'Dropped', color: '#ef4444' },
}

const STATUS_OPTIONS: UserSeriesStatus[] = ['reading', 'planned', 'finished', 'dropped']
const PAGE_SIZE = 24

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
  if (!status || !(status in STATUS_LABELS)) return isVI ? 'Chưa chọn' : 'No status'
  const meta = STATUS_LABELS[status as UserSeriesStatus]
  return isVI ? meta.vi : meta.en
}

function statusColor(status: string | null | undefined) {
  if (!status || !(status in STATUS_LABELS)) return '#94a3b8'
  return STATUS_LABELS[status as UserSeriesStatus].color
}

export default function UserDashboardPage() {
  const { locale } = useLocale()
  const isVI = locale === 'vi'

  const [session, setSession] = useState<Session | null>(null)
  const [authReady, setAuthReady] = useState(false)
  const [seriesOptions, setSeriesOptions] = useState<SeriesOption[]>([])
  const [volumeOptions, setVolumeOptions] = useState<VolumeOption[]>([])
  const [ratedList, setRatedList] = useState<RatedEntry[]>([])
  const [selectedVolumeIds, setSelectedVolumeIds] = useState<number[]>([])
  const [selectedSeriesId, setSelectedSeriesId] = useState<number | null>(null)
  const [seriesQuery, setSeriesQuery] = useState('')
  const deferredSeriesQuery = useDeferredValue(seriesQuery)
  const [viewMode, setViewMode] = useState<ViewMode>('series')
  const [selectorExpanded, setSelectorExpanded] = useState(false)
  const [seriesPage, setSeriesPage] = useState(1)
  const [bookshelfPage, setBookshelfPage] = useState(1)
  const [modalSeriesId, setModalSeriesId] = useState<number | null>(null)
  const [modalRating, setModalRating] = useState<number | null>(null)
  const [modalStatus, setModalStatus] = useState<string | null>(null)

  const [catalogLoading, setCatalogLoading] = useState(true)
  const [loading, setLoading] = useState(true)
  const [savingBookshelf, setSavingBookshelf] = useState(false)
  const [savingRatingId, setSavingRatingId] = useState<number | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [bookshelfAvailable, setBookshelfAvailable] = useState(true)

  const displayName =
    session?.user.user_metadata?.full_name ||
    session?.user.user_metadata?.name ||
    session?.user.email?.split('@')[0] ||
    'User'

  useEffect(() => {
    let mounted = true

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return
      setSession(data.session)
      setAuthReady(true)
    })

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      setAuthReady(true)
    })

    return () => {
      mounted = false
      authListener.subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    async function loadCatalog() {
      setCatalogLoading(true)

      const [{ data: seriesData, error: seriesError }, { data: volumeData, error: volumeError }] = await Promise.all([
        publicSupabase
          .from('series')
          .select('id, title, title_vi, cover_url')
          .eq('item_type', 'novel')
          .order('title', { ascending: true })
          .limit(1500),
        publicSupabase
          .from('volumes')
          .select('id, series_id, volume_number, title, price, currency, cover_url, release_date, is_special')
          .eq('is_special', false)
          .not('volume_number', 'is', null)
          .order('series_id', { ascending: true })
          .order('volume_number', { ascending: true })
          .limit(5000),
      ])

      if (cancelled) return

      if (seriesError || volumeError) {
        setError(isVI ? 'Không tải được danh mục Light Novel.' : 'Unable to load light novel catalog.')
        setCatalogLoading(false)
        return
      }

      const series = (seriesData || []).map((row: any) => ({
        id: Number(row.id),
        title: row.title || 'Untitled',
        titleVi: row.title_vi || null,
        coverUrl: row.cover_url || null,
      }))

      const validSeries = new Set(series.map(item => item.id))
      const volumes = (volumeData || [])
        .filter((row: any) => validSeries.has(Number(row.series_id)))
        .map((row: any) => ({
          id: Number(row.id),
          seriesId: Number(row.series_id),
          volumeNumber: row.volume_number == null ? null : Number(row.volume_number),
          title: row.title || null,
          price: row.price == null ? null : Number(row.price),
          currency: row.currency || 'VND',
          coverUrl: row.cover_url || null,
          releaseDate: row.release_date || null,
        }))

      setSeriesOptions(series)
      setVolumeOptions(volumes)
      setSelectedSeriesId(current => current ?? (series.length ? series[0].id : null))
      setCatalogLoading(false)
    }

    loadCatalog()

    return () => {
      cancelled = true
    }
  }, [isVI])

  useEffect(() => {
    const accessToken = session?.access_token

    if (!authReady || !accessToken) {
      if (authReady) setLoading(false)
      return
    }

    let cancelled = false

    async function loadUserDashboard() {
      setLoading(true)
      setError(null)

      try {
        const response = await fetch('/api/user-dashboard', {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        })

        if (!response.ok) throw new Error('Unable to load dashboard')
        const data = await response.json()
        if (cancelled) return

        const nextPurchases = (data.purchases || []) as PurchaseEntry[]
        setRatedList((data.ratedList || []) as RatedEntry[])
        setSelectedVolumeIds(nextPurchases.map(item => item.volumeId))
        setBookshelfAvailable(true)
      } catch {
        if (!cancelled) setError(isVI ? 'Không tải được dashboard người dùng.' : 'Unable to load user dashboard.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadUserDashboard()

    return () => {
      cancelled = true
    }
  }, [authReady, session?.access_token, isVI])

  useEffect(() => {
    setSeriesPage(1)
  }, [deferredSeriesQuery, viewMode])

  useEffect(() => {
    setBookshelfPage(1)
  }, [selectedVolumeIds.length, viewMode])

  const seriesById = useMemo(() => new Map(seriesOptions.map(series => [series.id, series])), [seriesOptions])
  const volumesById = useMemo(() => new Map(volumeOptions.map(volume => [volume.id, volume])), [volumeOptions])
  const ratedBySeries = useMemo(() => new Map(ratedList.map(entry => [entry.seriesId, entry])), [ratedList])
  const selectedVolumeSet = useMemo(() => new Set(selectedVolumeIds), [selectedVolumeIds])

  const volumesBySeries = useMemo(() => {
    const map = new Map<number, VolumeOption[]>()
    for (const volume of volumeOptions) {
      const next = map.get(volume.seriesId) || []
      next.push(volume)
      map.set(volume.seriesId, next)
    }
    return map
  }, [volumeOptions])

  const ownedCountsBySeries = useMemo(() => {
    const map = new Map<number, number>()
    for (const id of selectedVolumeIds) {
      const volume = volumesById.get(id)
      if (!volume) continue
      map.set(volume.seriesId, (map.get(volume.seriesId) || 0) + 1)
    }
    return map
  }, [selectedVolumeIds, volumesById])

  const selectedVolumes = useMemo(() => {
    return selectedVolumeIds
      .map(id => volumesById.get(id))
      .filter(Boolean) as VolumeOption[]
  }, [selectedVolumeIds, volumesById])

  const totalPrice = useMemo(() => {
    return selectedVolumes.reduce((sum, volume) => sum + (volume.price || 0), 0)
  }, [selectedVolumes])

  const filteredSeries = useMemo(() => {
    const q = deferredSeriesQuery.trim().toLowerCase()
    const base = q
      ? seriesOptions.filter(series => `${series.title} ${series.titleVi || ''}`.toLowerCase().includes(q))
      : seriesOptions

    return [...base].sort((a, b) => {
      const aWeight = (ownedCountsBySeries.get(a.id) || 0) + (ratedBySeries.has(a.id) ? 1000 : 0)
      const bWeight = (ownedCountsBySeries.get(b.id) || 0) + (ratedBySeries.has(b.id) ? 1000 : 0)
      if (aWeight !== bWeight) return bWeight - aWeight
      return displayTitle(a, isVI).localeCompare(displayTitle(b, isVI))
    })
  }, [deferredSeriesQuery, seriesOptions, ownedCountsBySeries, ratedBySeries, isVI])

  const seriesTotalPages = Math.max(1, Math.ceil(filteredSeries.length / PAGE_SIZE))
  const safeSeriesPage = Math.min(seriesPage, seriesTotalPages)
  const paginatedSeries = useMemo(() => {
    const start = (safeSeriesPage - 1) * PAGE_SIZE
    return filteredSeries.slice(start, start + PAGE_SIZE)
  }, [filteredSeries, safeSeriesPage])

  const bookshelfTotalPages = Math.max(1, Math.ceil(selectedVolumes.length / PAGE_SIZE))
  const safeBookshelfPage = Math.min(bookshelfPage, bookshelfTotalPages)
  const paginatedSelectedVolumes = useMemo(() => {
    const start = (safeBookshelfPage - 1) * PAGE_SIZE
    return selectedVolumes.slice(start, start + PAGE_SIZE)
  }, [selectedVolumes, safeBookshelfPage])

  const selectedSeries = selectedSeriesId ? seriesById.get(selectedSeriesId) : null
  const selectedSeriesVolumes = selectedSeriesId ? (volumesBySeries.get(selectedSeriesId) || []) : []
  const selectedSeriesOwnedCount = selectedSeriesId ? (ownedCountsBySeries.get(selectedSeriesId) || 0) : 0
  const selectedSeriesAllSelected =
    selectedSeriesVolumes.length > 0 &&
    selectedSeriesVolumes.every(volume => selectedVolumeSet.has(volume.id))

  const modalSeries = modalSeriesId ? seriesById.get(modalSeriesId) : null
  const modalEntry = modalSeriesId ? ratedBySeries.get(modalSeriesId) : undefined

  const toggleVolume = useCallback((volumeId: number) => {
    setMessage(null)
    setSelectedVolumeIds(current => current.includes(volumeId)
      ? current.filter(id => id !== volumeId)
      : [...current, volumeId]
    )
  }, [])

  const toggleSeriesVolumes = useCallback(() => {
    const ids = selectedSeriesVolumes.map(volume => volume.id)
    const allSelected = ids.length > 0 && ids.every(id => selectedVolumeSet.has(id))
    setMessage(null)
    setSelectedVolumeIds(current => allSelected
      ? current.filter(id => !ids.includes(id))
      : Array.from(new Set([...current, ...ids]))
    )
  }, [selectedSeriesVolumes, selectedVolumeSet])

  const saveBookshelf = async () => {
    const accessToken = session?.access_token
    if (!accessToken) return
    if (!bookshelfAvailable) {
      setError(isVI ? 'Bookshelf chưa khả dụng.' : 'Bookshelf storage is not available yet.')
      return
    }

    setSavingBookshelf(true)
    setError(null)
    setMessage(null)

    try {
      const response = await fetch('/api/user-dashboard', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ volumeIds: selectedVolumeIds }),
      })

      if (!response.ok) throw new Error('Unable to save bookshelf')
      setMessage(isVI ? 'Đã lưu bookshelf.' : 'Bookshelf saved.')
    } catch {
      setError(isVI ? 'Không lưu được bookshelf.' : 'Unable to save bookshelf.')
    } finally {
      setSavingBookshelf(false)
    }
  }

  const openSeriesModal = (seriesId: number) => {
    const entry = ratedBySeries.get(seriesId)
    setModalSeriesId(seriesId)
    setModalRating(entry?.rating == null ? null : Number(entry.rating))
    setModalStatus(entry?.status || null)
    setError(null)
    setMessage(null)
  }

  const closeSeriesModal = () => {
    if (savingRatingId) return
    setModalSeriesId(null)
    setModalRating(null)
    setModalStatus(null)
  }

  const saveModalEntry = async () => {
    const accessToken = session?.access_token
    if (!accessToken || !modalSeriesId || savingRatingId === modalSeriesId) return

    const series = seriesById.get(modalSeriesId) || null

    setSavingRatingId(modalSeriesId)
    setError(null)
    setMessage(null)

    try {
      const response = await fetch('/api/series-library', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          seriesId: modalSeriesId,
          rating: modalRating,
          status: modalStatus,
        }),
      })

      if (!response.ok) throw new Error('Unable to save rating')

      setRatedList(current => {
        const nextEntry: RatedEntry = {
          seriesId: modalSeriesId,
          rating: modalRating,
          status: modalStatus,
          updatedAt: new Date().toISOString(),
          series: series
            ? {
                id: series.id,
                title: series.title,
                titleVi: series.titleVi,
                coverUrl: series.coverUrl,
              }
            : null,
        }

        const exists = current.some(item => item.seriesId === modalSeriesId)
        return exists
          ? current.map(item => item.seriesId === modalSeriesId ? nextEntry : item)
          : [nextEntry, ...current]
      })

      setMessage(isVI ? 'Đã cập nhật đánh giá.' : 'Rating updated.')
      setModalSeriesId(null)
      setModalRating(null)
      setModalStatus(null)
    } catch {
      setError(isVI ? 'Không lưu được đánh giá.' : 'Unable to save rating.')
    } finally {
      setSavingRatingId(null)
    }
  }

  if (!authReady || loading) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center">
        <div className="flex items-center gap-3" style={{ color: 'var(--foreground-muted)' }}>
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm font-bold">{isVI ? 'Đang tải...' : 'Loading...'}</span>
        </div>
      </div>
    )
  }

  if (!session) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center px-4">
        <div className="glass max-w-md rounded-2xl p-7 text-center">
          <UserCircle className="w-12 h-12 mx-auto mb-4 text-primary-500" />
          <h1 className="text-2xl font-black mb-2" style={{ color: 'var(--foreground)' }}>
            {isVI ? 'Bạn cần đăng nhập' : 'Sign in required'}
          </h1>
          <p className="text-sm" style={{ color: 'var(--foreground-muted)' }}>
            {isVI ? 'Hãy đăng nhập từ thanh điều hướng để mở dashboard cá nhân.' : 'Use the navbar login button to open your personal dashboard.'}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen overflow-x-hidden px-4 py-8 sm:px-6 lg:px-8" style={{ background: 'var(--background)' }}>
      <div className="max-w-7xl mx-auto">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.24em] text-primary-500">LiDex User</p>
            <h1 className="text-3xl sm:text-4xl font-black mt-2" style={{ color: 'var(--foreground)' }}>
              {isVI ? 'Dashboard cá nhân' : 'User Dashboard'}
            </h1>
          </div>
          <div className="flex items-center gap-2 text-sm font-bold" style={{ color: 'var(--foreground-secondary)' }}>
            <UserCircle className="w-5 h-5 text-primary-500" />
            <span className="truncate max-w-[220px]">{displayName}</span>
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-xl px-4 py-3 text-sm font-bold" style={{ color: '#ef4444', background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.24)' }}>
            {error}
          </div>
        )}
        {message && (
          <div className="mb-4 rounded-xl px-4 py-3 text-sm font-bold" style={{ color: '#22c55e', background: 'rgba(34,197,94,.08)', border: '1px solid rgba(34,197,94,.24)' }}>
            {message}
          </div>
        )}
        {!bookshelfAvailable && (
          <div className="mb-4 rounded-xl px-4 py-3 text-sm font-bold" style={{ color: '#f59e0b', background: 'rgba(245,158,11,.08)', border: '1px solid rgba(245,158,11,.24)' }}>
            {isVI ? 'Bookshelf chưa khả dụng, nhưng danh sách đánh giá vẫn có thể xem.' : 'Bookshelf storage is not available yet, but your rated list can still load.'}
          </div>
        )}

        <div className="glass rounded-2xl p-5 sm:p-6 mb-5">
          <div className="rounded-2xl p-5 sm:p-6" style={{ background: 'linear-gradient(135deg, rgba(99,102,241,.16), rgba(34,197,94,.10))', border: '1px solid var(--card-border)' }}>
            <p className="text-lg sm:text-2xl font-black leading-relaxed" style={{ color: 'var(--foreground)' }}>
              {isVI
                ? `Bạn đã mua ${selectedVolumes.length.toLocaleString('vi-VN')} quyển LN với tổng tiền là ${formatVnd(totalPrice)}.`
                : `User ${displayName} has bought ${selectedVolumes.length.toLocaleString('en-US')} novels for ${formatVnd(totalPrice)}.`}
            </p>
          </div>
        </div>

        <div className={`grid grid-cols-1 ${selectorExpanded ? 'xl:grid-cols-[minmax(420px,520px)_minmax(0,1fr)]' : 'xl:grid-cols-[330px_minmax(0,1fr)]'} gap-5 items-start`}>
          <aside className="glass rounded-2xl p-4 sm:p-5 xl:sticky xl:top-20">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <h2 className="text-lg font-black" style={{ color: 'var(--foreground)' }}>
                  {isVI ? 'Chọn LN đã mua' : 'Select owned LN'}
                </h2>
                <p className="text-xs mt-1" style={{ color: 'var(--foreground-muted)' }}>
                  {isVI ? 'Tìm series, đánh dấu tập đã mua rồi lưu bookshelf.' : 'Find a series, mark owned volumes, then save.'}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {catalogLoading && <Loader2 className="w-4 h-4 animate-spin text-primary-500" />}
                <button
                  type="button"
                  onClick={() => setSelectorExpanded(current => !current)}
                  className="hidden xl:inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-black"
                  style={{ background: selectorExpanded ? 'rgba(239,68,68,.10)' : 'rgba(99,102,241,.12)', color: selectorExpanded ? '#ef4444' : '#6366f1', border: selectorExpanded ? '1px solid rgba(239,68,68,.26)' : '1px solid rgba(99,102,241,.28)' }}
                >
                  {selectorExpanded ? <X className="w-3.5 h-3.5" /> : <BookOpen className="w-3.5 h-3.5" />}
                  {selectorExpanded ? (isVI ? 'Đóng' : 'Close') : (isVI ? 'Mở rộng' : 'Expand')}
                </button>
              </div>
            </div>

            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--foreground-muted)' }} />
              <input
                value={seriesQuery}
                onChange={event => setSeriesQuery(event.target.value)}
                placeholder={isVI ? 'Tìm series...' : 'Search series...'}
                className="w-full rounded-xl pl-10 pr-4 py-3 text-sm outline-none"
                style={{ background: 'var(--background-secondary)', color: 'var(--foreground)', border: '1px solid var(--card-border)' }}
              />
            </div>

            <div className="max-h-[240px] overflow-y-auto pr-1 space-y-1 mb-4">
              {filteredSeries.slice(0, 80).map(series => {
                const active = selectedSeriesId === series.id
                const ownedCount = ownedCountsBySeries.get(series.id) || 0
                const totalVolumes = volumesBySeries.get(series.id)?.length || 0

                return (
                  <button
                    key={series.id}
                    onClick={() => setSelectedSeriesId(series.id)}
                    className="w-full flex items-center gap-3 rounded-xl p-2 text-left transition-all"
                    style={{
                      background: active ? 'rgba(99,102,241,.14)' : 'transparent',
                      color: 'var(--foreground)',
                      border: active ? '1px solid rgba(99,102,241,.32)' : '1px solid transparent',
                    }}
                  >
                    <div className="w-9 h-12 rounded-lg overflow-hidden shrink-0" style={{ background: 'var(--background-secondary)' }}>
                      {series.coverUrl ? <img src={proxyImageUrl(series.coverUrl) || ''} alt="" className="w-full h-full object-cover" loading="lazy" /> : null}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-black truncate">{displayTitle(series, isVI)}</p>
                      <p className="text-[11px]" style={{ color: 'var(--foreground-muted)' }}>
                        {ownedCount}/{totalVolumes} {isVI ? 'tập đã mua' : 'owned'}
                      </p>
                    </div>
                    <ChevronRight className="w-4 h-4 shrink-0" style={{ color: active ? '#6366f1' : 'var(--foreground-muted)' }} />
                  </button>
                )
              })}
              {filteredSeries.length > 80 && (
                <p className="px-2 py-2 text-[11px]" style={{ color: 'var(--foreground-muted)' }}>
                  {isVI ? 'Nhập thêm từ khóa để thu hẹp kết quả.' : 'Type more to narrow the result list.'}
                </p>
              )}
            </div>

            <div className="rounded-2xl p-3" style={{ background: 'var(--background-secondary)', border: '1px solid var(--card-border)' }}>
              <div className="flex items-start gap-3 mb-3">
                <div className="w-14 h-20 rounded-xl overflow-hidden shrink-0" style={{ background: 'var(--content-detail-tile-bg)' }}>
                  {selectedSeries?.coverUrl ? <img src={proxyImageUrl(selectedSeries.coverUrl) || ''} alt="" className="w-full h-full object-cover" loading="lazy" /> : null}
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-black line-clamp-2" style={{ color: 'var(--foreground)' }}>
                    {selectedSeries ? displayTitle(selectedSeries, isVI) : (isVI ? 'Chưa chọn series' : 'No series selected')}
                  </h3>
                  <p className="text-[11px] mt-1" style={{ color: 'var(--foreground-muted)' }}>
                    {selectedSeriesOwnedCount}/{selectedSeriesVolumes.length} {isVI ? 'tập đã mua' : 'owned volumes'}
                  </p>
                </div>
              </div>

              <div className="flex gap-2 mb-3">
                <button
                  onClick={toggleSeriesVolumes}
                  disabled={!selectedSeriesVolumes.length}
                  className="flex-1 rounded-xl px-3 py-2 text-xs font-black disabled:opacity-50"
                  style={{ background: selectedSeriesAllSelected ? 'rgba(239,68,68,.12)' : 'rgba(34,197,94,.12)', color: selectedSeriesAllSelected ? '#ef4444' : '#22c55e', border: selectedSeriesAllSelected ? '1px solid rgba(239,68,68,.28)' : '1px solid rgba(34,197,94,.28)' }}
                >
                  {selectedSeriesAllSelected ? (isVI ? 'Bỏ tất cả' : 'Clear all') : (isVI ? 'Chọn tất cả' : 'Select all')}
                </button>
                <button
                  onClick={saveBookshelf}
                  disabled={savingBookshelf}
                  className="rounded-xl px-3 py-2 text-xs font-black disabled:opacity-60"
                  style={{ background: '#6366f1', color: '#fff' }}
                >
                  {savingBookshelf ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                </button>
              </div>

              <div className={`${selectorExpanded ? 'max-h-[520px] xl:grid xl:grid-cols-2 xl:gap-2 xl:space-y-0' : 'max-h-[330px] space-y-2'} overflow-y-auto pr-1`}>
                {selectedSeriesVolumes.length ? selectedSeriesVolumes.map(volume => {
                  const selected = selectedVolumeSet.has(volume.id)
                  return (
                    <button
                      key={volume.id}
                      onClick={() => toggleVolume(volume.id)}
                      className="w-full flex items-center gap-3 rounded-xl p-2 text-left transition-all"
                      style={{
                        background: selected ? 'rgba(34,197,94,.12)' : 'var(--content-detail-tile-bg)',
                        border: selected ? '1px solid rgba(34,197,94,.36)' : '1px solid var(--content-detail-tile-border)',
                        color: 'var(--foreground)',
                      }}
                    >
                      <div className="w-10 h-14 rounded-lg overflow-hidden shrink-0" style={{ background: 'var(--background-secondary)' }}>
                        {volume.coverUrl ? <img src={proxyImageUrl(volume.coverUrl) || ''} alt="" className="w-full h-full object-cover" loading="lazy" /> : null}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-black truncate">{volumeLabel(volume, isVI)}</p>
                        <p className="text-[11px]" style={{ color: 'var(--foreground-muted)' }}>
                          {volume.price ? formatVnd(volume.price) : (isVI ? 'Chưa có giá' : 'No price')}
                        </p>
                      </div>
                      <span
                        className="w-6 h-6 rounded-full flex items-center justify-center shrink-0"
                        style={{ background: selected ? '#22c55e' : 'var(--background-secondary)', color: selected ? '#fff' : 'var(--foreground-muted)', border: '1px solid var(--card-border)' }}
                      >
                        {selected && <Check className="w-4 h-4" />}
                      </span>
                    </button>
                  )
                }) : (
                  <p className="text-xs py-8 text-center" style={{ color: 'var(--foreground-muted)' }}>
                    {isVI ? 'Series này chưa có tập trong dữ liệu.' : 'No volumes available for this series.'}
                  </p>
                )}
              </div>
            </div>
          </aside>

          <main className="glass rounded-2xl p-4 sm:p-5 min-w-0">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-5">
              <div>
                <h2 className="text-xl font-black" style={{ color: 'var(--foreground)' }}>
                  {viewMode === 'series'
                    ? (isVI ? 'Tất cả Light Novel' : 'All Light Novels')
                    : 'Bookshelf'}
                </h2>
                <p className="text-xs mt-1" style={{ color: 'var(--foreground-muted)' }}>
                  {viewMode === 'series'
                    ? (isVI ? 'Hover vào bìa để mở hộp chỉnh rating/trạng thái.' : 'Hover a cover to manage rating/status.')
                    : (isVI ? 'Tất cả tập bạn đã đánh dấu là đã mua.' : 'All volumes you marked as owned.')}
                </p>
              </div>

              <button
                onClick={() => setViewMode(current => current === 'series' ? 'bookshelf' : 'series')}
                className="inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-black"
                style={{ background: '#6366f1', color: '#fff', boxShadow: '0 12px 28px rgba(99,102,241,.22)' }}
              >
                {viewMode === 'series' ? <LibraryBig className="w-4 h-4" /> : <BookOpen className="w-4 h-4" />}
                {viewMode === 'series'
                  ? (isVI ? 'Xem Bookshelf' : 'Bookshelf view')
                  : (isVI ? 'Xem Series' : 'Series view')}
              </button>
            </div>

            {viewMode === 'series' ? (
              <>
                <SeriesCoverGrid
                  series={paginatedSeries}
                  volumesBySeries={volumesBySeries}
                  ownedCountsBySeries={ownedCountsBySeries}
                  ratedBySeries={ratedBySeries}
                  isVI={isVI}
                  onManage={openSeriesModal}
                />
                <PaginationControls
                  page={safeSeriesPage}
                  totalPages={seriesTotalPages}
                  totalItems={filteredSeries.length}
                  pageSize={PAGE_SIZE}
                  isVI={isVI}
                  onPageChange={setSeriesPage}
                />
              </>
            ) : (
              <>
                <BookshelfGrid
                  selectedVolumes={paginatedSelectedVolumes}
                  seriesById={seriesById}
                  isVI={isVI}
                />
                <PaginationControls
                  page={safeBookshelfPage}
                  totalPages={bookshelfTotalPages}
                  totalItems={selectedVolumes.length}
                  pageSize={PAGE_SIZE}
                  isVI={isVI}
                  onPageChange={setBookshelfPage}
                />
              </>
            )}
          </main>
        </div>
      </div>

      {modalSeries && (
        <RatingStatusModal
          series={modalSeries}
          entry={modalEntry}
          rating={modalRating}
          status={modalStatus}
          saving={savingRatingId === modalSeries.id}
          isVI={isVI}
          onRatingChange={setModalRating}
          onStatusChange={setModalStatus}
          onClose={closeSeriesModal}
          onSave={saveModalEntry}
        />
      )}
    </div>
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
    <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
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

function SeriesCoverGrid({
  series,
  volumesBySeries,
  ownedCountsBySeries,
  ratedBySeries,
  isVI,
  onManage,
}: {
  series: SeriesOption[]
  volumesBySeries: Map<number, VolumeOption[]>
  ownedCountsBySeries: Map<number, number>
  ratedBySeries: Map<number, RatedEntry>
  isVI: boolean
  onManage: (seriesId: number) => void
}) {
  if (!series.length) {
    return (
      <div className="rounded-2xl p-10 text-center" style={{ background: 'var(--background-secondary)', border: '1px solid var(--card-border)', color: 'var(--foreground-muted)' }}>
        {isVI ? 'Không tìm thấy series phù hợp.' : 'No matching series found.'}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
      {series.map(item => {
        const cover = proxyImageUrl(item.coverUrl)
        const entry = ratedBySeries.get(item.id)
        const rating = entry?.rating == null ? null : Number(entry.rating)
        const status = entry?.status || null
        const totalVolumes = volumesBySeries.get(item.id)?.length || 0
        const ownedCount = ownedCountsBySeries.get(item.id) || 0

        return (
          <div
            key={item.id}
            className="group relative min-w-0 overflow-hidden rounded-2xl"
            style={{ background: 'var(--content-detail-tile-bg)', border: '1px solid var(--content-detail-tile-border)' }}
          >
            <div className="relative aspect-[2/3] overflow-hidden" style={{ background: 'var(--background-secondary)' }}>
              {cover ? (
                <img src={cover} alt="" className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" loading="lazy" />
              ) : (
                <BookOpen className="absolute left-1/2 top-1/2 w-9 h-9 -translate-x-1/2 -translate-y-1/2 opacity-40 text-primary-400" />
              )}

              <div className="absolute inset-x-0 top-0 p-2 flex items-start justify-between gap-2">
                <span className="rounded-full px-2 py-1 text-[10px] font-black text-white backdrop-blur" style={{ background: 'rgba(15,23,42,.68)' }}>
                  {ownedCount}/{totalVolumes}
                </span>
                {rating != null && (
                  <span className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-black text-white backdrop-blur" style={{ background: 'rgba(245,158,11,.82)' }}>
                    <Star className="w-3 h-3 fill-white" />
                    {rating.toFixed(1).replace('.0', '')}
                  </span>
                )}
              </div>

              <div className="absolute inset-0 flex flex-col justify-end gap-2 p-3 opacity-0 transition-opacity duration-200 group-hover:opacity-100" style={{ background: 'linear-gradient(to top, rgba(2,6,23,.78), rgba(2,6,23,.28), transparent)' }}>
                <button
                  type="button"
                  onClick={() => onManage(item.id)}
                  className="rounded-xl px-3 py-2 text-xs font-black text-white"
                  style={{ background: '#6366f1', boxShadow: '0 10px 24px rgba(99,102,241,.28)' }}
                >
                  {isVI ? 'Rating / Trạng thái' : 'Rate / Status'}
                </button>
                <Link
                  href={`/content/${item.id}`}
                  className="rounded-xl px-3 py-2 text-center text-xs font-black"
                  style={{ background: 'rgba(255,255,255,.10)', color: '#fff', border: '1px solid rgba(255,255,255,.14)' }}
                >
                  {isVI ? 'Mở chi tiết' : 'Open detail'}
                </Link>
              </div>
            </div>

            <div className="p-3">
              <h3 className="text-xs font-black line-clamp-2 min-h-[32px]" style={{ color: 'var(--foreground)' }}>
                {displayTitle(item, isVI)}
              </h3>
              <div className="mt-2 flex items-center justify-between gap-2">
                <span className="truncate text-[10px] font-bold" style={{ color: statusColor(status) }}>
                  {statusLabel(status, isVI)}
                </span>
                <span className="text-[10px]" style={{ color: 'var(--foreground-muted)' }}>
                  {totalVolumes} {isVI ? 'tập' : 'vols'}
                </span>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function BookshelfGrid({
  selectedVolumes,
  seriesById,
  isVI,
}: {
  selectedVolumes: VolumeOption[]
  seriesById: Map<number, SeriesOption>
  isVI: boolean
}) {
  if (!selectedVolumes.length) {
    return (
      <div className="rounded-2xl p-10 text-center" style={{ background: 'var(--background-secondary)', border: '1px solid var(--card-border)', color: 'var(--foreground-muted)' }}>
        {isVI ? 'Chưa có tập nào trong bookshelf.' : 'No volumes in your bookshelf yet.'}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-7 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
      {selectedVolumes.map(volume => {
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
              {cover ? <img src={cover} alt="" className="w-full h-full object-cover" loading="lazy" /> : <BookOpen className="absolute left-1/2 top-1/2 w-8 h-8 -translate-x-1/2 -translate-y-1/2 opacity-40 text-primary-400" />}
              <div className="absolute inset-y-0 left-0 w-4 bg-gradient-to-r from-black/25 to-transparent" />
              <div className="absolute left-2 top-2 rounded-full px-2 py-1 text-[10px] font-black text-white" style={{ background: 'rgba(15,23,42,.72)' }}>
                {volumeLabel(volume, isVI)}
              </div>
            </div>
            <p className="text-xs font-black mt-3 line-clamp-2" style={{ color: 'var(--foreground)' }}>{displayTitle(series, isVI)}</p>
            <p className="text-[11px] font-semibold" style={{ color: 'var(--foreground-muted)' }}>
              {volume.price ? formatVnd(volume.price) : (isVI ? 'Chưa có giá' : 'No price')}
            </p>
          </Link>
        )
      })}
    </div>
  )
}

function RatingStatusModal({
  series,
  entry,
  rating,
  status,
  saving,
  isVI,
  onRatingChange,
  onStatusChange,
  onClose,
  onSave,
}: {
  series: SeriesOption
  entry: RatedEntry | undefined
  rating: number | null
  status: string | null
  saving: boolean
  isVI: boolean
  onRatingChange: (rating: number | null) => void
  onStatusChange: (status: string | null) => void
  onClose: () => void
  onSave: () => void
}) {
  const cover = proxyImageUrl(series.coverUrl)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(2,6,23,.72)', backdropFilter: 'blur(8px)' }}>
      <div className="w-full max-w-lg overflow-hidden rounded-3xl" style={{ background: 'var(--background)', border: '1px solid var(--card-border)', boxShadow: '0 30px 80px rgba(0,0,0,.45)' }}>
        <div className="flex items-start justify-between gap-3 p-5 border-b" style={{ borderColor: 'var(--card-border)' }}>
          <div className="flex min-w-0 gap-3">
            <div className="w-16 h-24 rounded-xl overflow-hidden shrink-0" style={{ background: 'var(--background-secondary)' }}>
              {cover ? <img src={cover} alt="" className="w-full h-full object-cover" /> : null}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-primary-500">
                {isVI ? 'Cập nhật series' : 'Update series'}
              </p>
              <h2 className="text-lg font-black mt-1 line-clamp-2" style={{ color: 'var(--foreground)' }}>
                {displayTitle(series, isVI)}
              </h2>
              <p className="text-xs mt-1" style={{ color: 'var(--foreground-muted)' }}>
                {entry?.updatedAt
                  ? `${isVI ? 'Cập nhật lần cuối' : 'Last updated'}: ${new Date(entry.updatedAt).toLocaleDateString('vi-VN')}`
                  : (isVI ? 'Chưa có rating/trạng thái.' : 'No rating/status yet.')}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="w-9 h-9 rounded-full flex items-center justify-center disabled:opacity-50"
            style={{ background: 'var(--background-secondary)', color: 'var(--foreground-secondary)', border: '1px solid var(--card-border)' }}
            aria-label={isVI ? 'Đóng' : 'Close'}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          <div>
            <div className="flex items-center justify-between gap-3 mb-2">
              <p className="text-sm font-black" style={{ color: 'var(--foreground)' }}>
                {isVI ? 'Điểm cá nhân' : 'Personal rating'}
              </p>
              <button
                type="button"
                onClick={() => onRatingChange(null)}
                className="text-xs font-bold"
                style={{ color: 'var(--foreground-muted)' }}
              >
                {isVI ? 'Xóa điểm' : 'Clear'}
              </button>
            </div>
            <EditableRatingStars
              value={rating}
              disabled={saving}
              onChange={onRatingChange}
              large
            />
          </div>

          <div>
            <div className="flex items-center justify-between gap-3 mb-2">
              <p className="text-sm font-black" style={{ color: 'var(--foreground)' }}>
                {isVI ? 'Trạng thái đọc' : 'Reading status'}
              </p>
              <button
                type="button"
                onClick={() => onStatusChange(null)}
                className="text-xs font-bold"
                style={{ color: 'var(--foreground-muted)' }}
              >
                {isVI ? 'Xóa trạng thái' : 'Clear'}
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {STATUS_OPTIONS.map(statusKey => {
                const meta = STATUS_LABELS[statusKey]
                const active = status === statusKey

                return (
                  <button
                    key={statusKey}
                    type="button"
                    disabled={saving}
                    onClick={() => onStatusChange(statusKey)}
                    className="rounded-xl px-2.5 py-2.5 text-xs font-black transition-all disabled:opacity-50"
                    style={{
                      background: active ? `${meta.color}18` : 'var(--background-secondary)',
                      color: active ? meta.color : 'var(--foreground-secondary)',
                      border: active ? `1px solid ${meta.color}44` : '1px solid var(--card-border)',
                    }}
                  >
                    {isVI ? meta.vi : meta.en}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-xl px-4 py-3 text-sm font-black disabled:opacity-50"
              style={{ background: 'var(--background-secondary)', color: 'var(--foreground-secondary)', border: '1px solid var(--card-border)' }}
            >
              {isVI ? 'Hủy' : 'Cancel'}
            </button>
            <button
              type="button"
              onClick={onSave}
              disabled={saving}
              className="rounded-xl px-5 py-3 text-sm font-black text-white disabled:opacity-60"
              style={{ background: '#6366f1' }}
            >
              {saving ? (isVI ? 'Đang lưu...' : 'Saving...') : (isVI ? 'Lưu thay đổi' : 'Save changes')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function EditableRatingStars({
  value,
  disabled,
  onChange,
  large = false,
}: {
  value: number | null
  disabled: boolean
  onChange: (rating: number) => void
  large?: boolean
}) {
  const rating = Number(value || 0)
  const sizeClass = large ? 'h-10 w-10' : 'h-7 w-7'

  const pickRating = (event: any, index: number) => {
    const rect = event.currentTarget.getBoundingClientRect()
    const half = event.clientX - rect.left < rect.width / 2 ? 0.5 : 1
    onChange(index + half)
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1">
        {[0, 1, 2, 3, 4].map(index => {
          const fill = Math.max(0, Math.min(1, rating - index))
          return (
            <button
              key={index}
              type="button"
              disabled={disabled}
              onClick={event => pickRating(event, index)}
              className={`relative ${sizeClass} disabled:opacity-50`}
              title={`${index + 0.5} / ${index + 1}`}
            >
              <Star className={`absolute inset-0 ${sizeClass} text-slate-300`} />
              <span className="absolute inset-0 overflow-hidden" style={{ width: `${fill * 100}%` }}>
                <Star className={`${sizeClass} fill-amber-400 text-amber-400`} />
              </span>
            </button>
          )
        })}
      </div>
      <span className="rounded-full px-2 py-1 text-xs font-black" style={{ color: '#f59e0b', background: 'rgba(245,158,11,.12)', border: '1px solid rgba(245,158,11,.28)' }}>
        {rating ? rating.toFixed(1).replace('.0', '') : '-'} / 5
      </span>
    </div>
  )
}
