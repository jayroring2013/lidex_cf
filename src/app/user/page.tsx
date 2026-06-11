'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { BookOpen, Check, ChevronDown, LibraryBig, ListChecks, Loader2, Search, Star, UserCircle } from 'lucide-react'
import supabase from '@/lib/supabaseClient'
import publicSupabase from '@/lib/publicSupabaseClient'
import { proxyImageUrl } from '@/lib/imageProxy'
import { useLocale } from '@/contexts/LocaleContext'
import type { Session } from '@supabase/supabase-js'

type TabKey = 'general' | 'rated' | 'bookshelf'

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

const STATUS_LABELS: Record<string, { vi: string; en: string; color: string }> = {
  reading: { vi: 'Đang đọc', en: 'Reading', color: '#22c55e' },
  planned: { vi: 'Định đọc', en: 'Planned', color: '#38bdf8' },
  finished: { vi: 'Hoàn thành', en: 'Finished', color: '#8b5cf6' },
  dropped: { vi: 'Bỏ', en: 'Dropped', color: '#ef4444' },
}

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

export default function UserDashboardPage() {
  const { locale } = useLocale()
  const isVI = locale === 'vi'
  const [session, setSession] = useState<Session | null>(null)
  const [authReady, setAuthReady] = useState(false)
  const [activeTab, setActiveTab] = useState<TabKey>('general')
  const [seriesOptions, setSeriesOptions] = useState<SeriesOption[]>([])
  const [volumeOptions, setVolumeOptions] = useState<VolumeOption[]>([])
  const [ratedList, setRatedList] = useState<RatedEntry[]>([])
  const [selectedVolumeIds, setSelectedVolumeIds] = useState<number[]>([])
  const [selectedSeriesId, setSelectedSeriesId] = useState<number | null>(null)
  const [seriesQuery, setSeriesQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
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
      const [{ data: seriesData }, { data: volumeData }] = await Promise.all([
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
      if (!selectedSeriesId && series.length) setSelectedSeriesId(series[0].id)
    }

    loadCatalog()

    return () => {
      cancelled = true
    }
  }, [])

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
        setBookshelfAvailable(data.bookshelfAvailable !== false)
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

  const seriesById = useMemo(() => new Map(seriesOptions.map(series => [series.id, series])), [seriesOptions])
  const volumesById = useMemo(() => new Map(volumeOptions.map(volume => [volume.id, volume])), [volumeOptions])
  const selectedVolumes = selectedVolumeIds
    .map(id => volumesById.get(id))
    .filter(Boolean) as VolumeOption[]

  const totalPrice = selectedVolumes.reduce((sum, volume) => sum + (volume.price || 0), 0)
  const selectedVolumeSet = useMemo(() => new Set(selectedVolumeIds), [selectedVolumeIds])

  const filteredSeries = useMemo(() => {
    const q = seriesQuery.trim().toLowerCase()
    if (!q) return seriesOptions
    return seriesOptions.filter(series => `${series.title} ${series.titleVi || ''}`.toLowerCase().includes(q))
  }, [seriesOptions, seriesQuery])

  const selectedSeriesVolumes = selectedSeriesId
    ? volumeOptions.filter(volume => volume.seriesId === selectedSeriesId)
    : []

  const selectedSeries = selectedSeriesId ? seriesById.get(selectedSeriesId) : null

  const toggleVolume = (volumeId: number) => {
    setMessage(null)
    setSelectedVolumeIds(current => current.includes(volumeId)
      ? current.filter(id => id !== volumeId)
      : [...current, volumeId]
    )
  }

  const toggleSeriesVolumes = () => {
    const ids = selectedSeriesVolumes.map(volume => volume.id)
    const allSelected = ids.length > 0 && ids.every(id => selectedVolumeSet.has(id))
    setMessage(null)
    setSelectedVolumeIds(current => allSelected
      ? current.filter(id => !ids.includes(id))
      : Array.from(new Set([...current, ...ids]))
    )
  }

  const saveBookshelf = async () => {
    const accessToken = session?.access_token
    if (!accessToken) return
    if (!bookshelfAvailable) {
      setError(isVI ? 'Bookshelf chÆ°a kháº£ dá»¥ng.' : 'Bookshelf storage is not available yet.')
      return
    }
    setSaving(true)
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
      setSaving(false)
    }
  }

  const tabs = [
    { id: 'general' as const, icon: UserCircle, label: isVI ? 'Tổng quan' : 'General' },
    { id: 'rated' as const, icon: ListChecks, label: isVI ? 'Đã đánh giá' : 'Rated List' },
    { id: 'bookshelf' as const, icon: LibraryBig, label: 'Bookshelf' },
  ]

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
        <div className="mb-6">
          <p className="text-xs font-black uppercase tracking-[0.24em] text-primary-500">LiDex User</p>
          <h1 className="text-3xl sm:text-4xl font-black mt-2" style={{ color: 'var(--foreground)' }}>
            {isVI ? 'Dashboard cá nhân' : 'User Dashboard'}
          </h1>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[230px_minmax(0,1fr)] gap-5 items-start">
          <aside className="glass rounded-2xl p-2 lg:sticky lg:top-20">
            <div className="grid grid-cols-3 lg:grid-cols-1 gap-2">
              {tabs.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className="flex items-center justify-center lg:justify-start gap-2 rounded-xl px-3 py-3 text-sm font-black transition-all"
                  style={activeTab === tab.id
                    ? { background: '#6366f1', color: '#fff', boxShadow: '0 12px 28px rgba(99,102,241,.25)' }
                    : { color: 'var(--foreground-secondary)' }}
                >
                  <tab.icon className="w-4 h-4 shrink-0" />
                  <span className="truncate">{tab.label}</span>
                </button>
              ))}
            </div>
          </aside>

          <section className="space-y-5 min-w-0">
            {error && (
              <div className="rounded-xl px-4 py-3 text-sm font-bold" style={{ color: '#ef4444', background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.24)' }}>
                {error}
              </div>
            )}
            {message && (
              <div className="rounded-xl px-4 py-3 text-sm font-bold" style={{ color: '#22c55e', background: 'rgba(34,197,94,.08)', border: '1px solid rgba(34,197,94,.24)' }}>
                {message}
              </div>
            )}
            {!bookshelfAvailable && (
              <div className="rounded-xl px-4 py-3 text-sm font-bold" style={{ color: '#f59e0b', background: 'rgba(245,158,11,.08)', border: '1px solid rgba(245,158,11,.24)' }}>
                {isVI ? 'Bookshelf chÆ°a kháº£ dá»¥ng, nhÆ°ng danh sÃ¡ch Ä‘Ã¡nh giÃ¡ váº«n cÃ³ thá»ƒ xem.' : 'Bookshelf storage is not available yet, but your rated list can still load.'}
              </div>
            )}

            {activeTab === 'general' && (
              <>
                <div className="glass rounded-2xl p-5 sm:p-6">
                  <div className="rounded-2xl p-5 sm:p-6" style={{ background: 'linear-gradient(135deg, rgba(99,102,241,.16), rgba(34,197,94,.10))', border: '1px solid var(--card-border)' }}>
                    <p className="text-lg sm:text-2xl font-black leading-relaxed" style={{ color: 'var(--foreground)' }}>
                      {isVI
                        ? `Bạn đã mua ${selectedVolumes.length.toLocaleString('vi-VN')} quyển LN với tổng tiền là ${formatVnd(totalPrice)}.`
                        : `User ${displayName} has bought ${selectedVolumes.length.toLocaleString('en-US')} novels for ${formatVnd(totalPrice)}.`}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] gap-5">
                  <div className="glass min-w-0 rounded-2xl p-4 sm:p-5">
                    <div className="flex items-center justify-between gap-3 mb-4">
                      <div>
                        <h2 className="text-lg font-black" style={{ color: 'var(--foreground)' }}>
                          {isVI ? 'Chọn series' : 'Choose series'}
                        </h2>
                        <p className="text-xs mt-1" style={{ color: 'var(--foreground-muted)' }}>
                          {isVI ? 'Tìm và chọn bộ LN để đánh dấu tập đã mua.' : 'Find a light novel and mark owned volumes.'}
                        </p>
                      </div>
                      <ChevronDown className="w-5 h-5 text-primary-500" />
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

                    <div className="max-h-[420px] overflow-y-auto pr-1 space-y-1">
                      {filteredSeries.map(series => (
                        <button
                          key={series.id}
                          onClick={() => setSelectedSeriesId(series.id)}
                          className="w-full flex items-center gap-3 rounded-xl p-2 text-left transition-all"
                          style={{
                            background: selectedSeriesId === series.id ? 'rgba(99,102,241,.14)' : 'transparent',
                            color: 'var(--foreground)',
                            border: selectedSeriesId === series.id ? '1px solid rgba(99,102,241,.32)' : '1px solid transparent',
                          }}
                        >
                          <div className="w-10 h-14 rounded-lg overflow-hidden shrink-0" style={{ background: 'var(--background-secondary)' }}>
                            {series.coverUrl ? <img src={proxyImageUrl(series.coverUrl) || ''} alt="" className="w-full h-full object-cover" loading="lazy" /> : null}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-black truncate">{displayTitle(series, isVI)}</p>
                            <p className="text-[11px]" style={{ color: 'var(--foreground-muted)' }}>
                              {volumeOptions.filter(volume => volume.seriesId === series.id).length} {isVI ? 'tập' : 'volumes'}
                            </p>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="glass min-w-0 overflow-hidden rounded-2xl p-4 sm:p-5">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
                      <div className="min-w-0">
                        <h2 className="text-lg font-black truncate" style={{ color: 'var(--foreground)' }}>
                          {selectedSeries ? displayTitle(selectedSeries, isVI) : (isVI ? 'Chưa chọn series' : 'No series selected')}
                        </h2>
                        <p className="text-xs mt-1" style={{ color: 'var(--foreground-muted)' }}>
                          {selectedSeriesVolumes.length} {isVI ? 'tập trong dữ liệu' : 'volumes in database'}
                        </p>
                      </div>
                      <button
                        onClick={toggleSeriesVolumes}
                        disabled={!selectedSeriesVolumes.length}
                        className="rounded-xl px-4 py-2 text-sm font-black disabled:opacity-50"
                        style={{ background: 'var(--background-secondary)', color: 'var(--foreground)', border: '1px solid var(--card-border)' }}
                      >
                        {isVI ? 'Chọn/Bỏ tất cả' : 'Toggle all'}
                      </button>
                    </div>

                    <div className="grid grid-cols-1 2xl:grid-cols-2 gap-3 max-h-[420px] overflow-y-auto pr-1">
                      {selectedSeriesVolumes.map(volume => {
                        const selected = selectedVolumeSet.has(volume.id)
                        return (
                          <button
                            key={volume.id}
                            onClick={() => toggleVolume(volume.id)}
                            className="flex items-center gap-3 rounded-xl p-2 text-left transition-all"
                            style={{
                              background: selected ? 'rgba(34,197,94,.12)' : 'var(--content-detail-tile-bg)',
                              border: selected ? '1px solid rgba(34,197,94,.36)' : '1px solid var(--content-detail-tile-border)',
                              color: 'var(--foreground)',
                            }}
                          >
                            <div className="w-12 h-16 rounded-lg overflow-hidden shrink-0" style={{ background: 'var(--background-secondary)' }}>
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
                      })}
                    </div>

                    <div className="flex justify-end mt-4">
                      <button
                        onClick={saveBookshelf}
                        disabled={saving || !bookshelfAvailable}
                        className="max-w-full rounded-xl px-5 py-3 text-sm font-black disabled:opacity-60"
                        style={{ background: '#6366f1', color: '#fff' }}
                      >
                        {saving ? (isVI ? 'Đang lưu...' : 'Saving...') : (isVI ? 'Lưu bookshelf' : 'Save bookshelf')}
                      </button>
                    </div>
                  </div>
                </div>
              </>
            )}

            {activeTab === 'rated' && (
              <div className="glass rounded-2xl overflow-hidden">
                <div className="p-5 border-b" style={{ borderColor: 'var(--card-border)' }}>
                  <h2 className="text-xl font-black" style={{ color: 'var(--foreground)' }}>
                    {isVI ? 'Series đã đánh giá / theo dõi' : 'Rated / Status List'}
                  </h2>
                </div>
                {ratedList.length ? (
                  <div className="divide-y" style={{ borderColor: 'var(--card-border)' }}>
                    {ratedList.map(entry => {
                      const status = entry.status ? STATUS_LABELS[entry.status] : null
                      const series = entry.series || seriesById.get(entry.seriesId) || null
                      return (
                        <Link
                          key={entry.seriesId}
                          href={`/content/${entry.seriesId}`}
                          className="flex items-center gap-4 p-4 transition-colors"
                          style={{ color: 'var(--foreground)', borderColor: 'var(--card-border)' }}
                        >
                          <div className="w-14 h-20 rounded-lg overflow-hidden shrink-0" style={{ background: 'var(--background-secondary)' }}>
                            {series?.coverUrl ? <img src={proxyImageUrl(series.coverUrl) || ''} alt="" className="w-full h-full object-cover" loading="lazy" /> : null}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="font-black line-clamp-2">{displayTitle(series, isVI)}</p>
                            <div className="flex flex-wrap items-center gap-2 mt-2">
                              {entry.rating != null && (
                                <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-black" style={{ background: 'rgba(245,158,11,.12)', color: '#f59e0b', border: '1px solid rgba(245,158,11,.26)' }}>
                                  <Star className="w-3.5 h-3.5 fill-current" /> {entry.rating}
                                </span>
                              )}
                              {status && (
                                <span className="rounded-full px-2.5 py-1 text-xs font-black" style={{ background: `${status.color}18`, color: status.color, border: `1px solid ${status.color}44` }}>
                                  {isVI ? status.vi : status.en}
                                </span>
                              )}
                            </div>
                          </div>
                        </Link>
                      )
                    })}
                  </div>
                ) : (
                  <div className="p-10 text-center" style={{ color: 'var(--foreground-muted)' }}>
                    {isVI ? 'Bạn chưa đánh giá hoặc chọn trạng thái cho series nào.' : 'No rated or tracked series yet.'}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'bookshelf' && (
              <div className="glass rounded-2xl p-5 sm:p-6 overflow-hidden">
                <div className="flex items-center justify-between gap-3 mb-6">
                  <div>
                    <h2 className="text-xl font-black" style={{ color: 'var(--foreground)' }}>Bookshelf</h2>
                    <p className="text-sm mt-1" style={{ color: 'var(--foreground-muted)' }}>
                      {isVI ? 'Các tập LN bạn đã chọn ở tab Tổng quan.' : 'Volumes selected from the General tab.'}
                    </p>
                  </div>
                  <span className="rounded-full px-3 py-1 text-xs font-black" style={{ background: 'var(--background-secondary)', color: 'var(--foreground-secondary)', border: '1px solid var(--card-border)' }}>
                    {selectedVolumes.length} {isVI ? 'tập' : 'volumes'}
                  </span>
                </div>

                {selectedVolumes.length ? (
                  <div className="space-y-8">
                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 xl:grid-cols-7 gap-x-4 gap-y-8">
                      {selectedVolumes.map(volume => {
                        const series = seriesById.get(volume.seriesId)
                        const cover = proxyImageUrl(volume.coverUrl || series?.coverUrl)
                        return (
                          <div key={volume.id} className="group">
                            <div className="relative aspect-[2/3] rounded-xl overflow-hidden shadow-xl transition-transform group-hover:-translate-y-1" style={{ background: 'var(--background-secondary)', border: '1px solid var(--card-border)' }}>
                              {cover ? <img src={cover} alt="" className="w-full h-full object-cover" loading="lazy" /> : <BookOpen className="absolute left-1/2 top-1/2 w-8 h-8 -translate-x-1/2 -translate-y-1/2 opacity-40 text-primary-400" />}
                            </div>
                            <div className="h-3 rounded-b-full mx-2" style={{ background: 'linear-gradient(90deg, rgba(99,102,241,.45), rgba(34,197,94,.35))' }} />
                            <p className="text-xs font-black mt-2 line-clamp-2" style={{ color: 'var(--foreground)' }}>{displayTitle(series, isVI)}</p>
                            <p className="text-[11px]" style={{ color: 'var(--foreground-muted)' }}>{volumeLabel(volume, isVI)}</p>
                          </div>
                        )
                      })}
                    </div>
                    <div className="h-5 rounded-full" style={{ background: 'linear-gradient(180deg, rgba(15,23,42,.18), rgba(15,23,42,.04))', border: '1px solid var(--card-border)' }} />
                  </div>
                ) : (
                  <div className="rounded-2xl p-10 text-center" style={{ background: 'var(--background-secondary)', border: '1px solid var(--card-border)', color: 'var(--foreground-muted)' }}>
                    {isVI ? 'Chưa có tập nào trong bookshelf.' : 'No volumes in your bookshelf yet.'}
                  </div>
                )}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}
