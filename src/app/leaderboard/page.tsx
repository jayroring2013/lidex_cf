'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowDown, ArrowUp, Loader2, Search } from 'lucide-react'
import supabase from '@/lib/supabaseClient'
import { useLocale } from '@/contexts/LocaleContext'

type Period = {
  id: number
  month: number
  year: number
  label: string
  sort: number
}

type VoteRow = {
  id: number
  series_id: number
  period_id: number
  votes: number
  rank: number | null
  period: Period
  title: string
  title_vi: string | null
  cover_url: string | null
  publisher: string
}

type LeaderboardRow = VoteRow & {
  displayRank: number
  previousRank: number | null
  change: number | null
  trend: Array<{ period: string; rank: number | null }>
}

function fmtPeriod(period: Period | null) {
  if (!period) return 'Unknown'
  return `${String(period.month).padStart(2, '0')}/${period.year}`
}

function rankLabel(rank: number) {
  if (rank === 1) return '# 1'
  if (rank === 2) return '# 2'
  if (rank === 3) return '# 3'
  return `# ${rank}`
}

function rankColor(rank: number) {
  if (rank === 1) return '#f59e0b'
  if (rank === 2) return '#94a3b8'
  if (rank === 3) return '#c084fc'
  return 'var(--foreground-secondary)'
}

function Sparkline({ points }: { points: Array<{ rank: number | null }> }) {
  const valid = points.map((p, i) => ({ ...p, i })).filter((p): p is { rank: number; i: number } => p.rank != null)
  if (valid.length <= 1) {
    return <span className="text-xs" style={{ color: 'var(--foreground-muted)' }}>-</span>
  }

  const w = 92
  const h = 28
  const minRank = Math.min(...valid.map(p => p.rank))
  const maxRank = Math.max(...valid.map(p => p.rank))
  const span = Math.max(1, maxRank - minRank)
  const lastIndex = Math.max(1, points.length - 1)
  const path = valid.map((p, idx) => {
    const x = (p.i / lastIndex) * (w - 8) + 4
    const y = 4 + ((p.rank - minRank) / span) * (h - 8)
    return `${idx === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`
  }).join(' ')

  const first = valid[0].rank
  const last = valid[valid.length - 1].rank
  const stroke = last < first ? '#22c55e' : last > first ? '#ef4444' : '#38bdf8'

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-[92px] h-7" aria-hidden="true">
      <path d={path} fill="none" stroke={stroke} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      {valid.map(p => {
        const x = (p.i / lastIndex) * (w - 8) + 4
        const y = 4 + ((p.rank - minRank) / span) * (h - 8)
        return <circle key={p.i} cx={x} cy={y} r="2.4" fill={stroke} opacity={p.i === valid[valid.length - 1].i ? 1 : 0.55} />
      })}
    </svg>
  )
}

function ChangeCell({ value, vi }: { value: number | null; vi: boolean }) {
  if (value == null) {
    return <span className="inline-flex items-center rounded-full px-2 py-1 text-xs font-black" style={{ color: '#38bdf8', background: 'rgba(56,189,248,.12)' }}>{vi ? 'Mới' : 'New'}</span>
  }
  if (value === 0) {
    return <span className="text-xs font-black" style={{ color: 'var(--foreground-muted)' }}>-</span>
  }
  const up = value > 0
  const Icon = up ? ArrowUp : ArrowDown
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-black" style={{ color: up ? '#22c55e' : '#ef4444', background: up ? 'rgba(34,197,94,.12)' : 'rgba(239,68,68,.12)' }}>
      <Icon className="w-3.5 h-3.5" />
      {Math.abs(value)}
    </span>
  )
}

export default function LeaderboardPage() {
  const { locale } = useLocale()
  const vi = locale === 'vi'

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [rows, setRows] = useState<VoteRow[]>([])
  const [periods, setPeriods] = useState<Period[]>([])
  const [selectedPeriodId, setSelectedPeriodId] = useState<number | null>(null)
  const [query, setQuery] = useState('')

  useEffect(() => {
    async function load() {
      setLoading(true)
      setError(null)

      const { data: periodData, error: periodError } = await supabase
        .from('voting_periods')
        .select('id, month, year, label')
        .order('year', { ascending: false })
        .order('month', { ascending: false })

      if (periodError) {
        setError(periodError.message)
        setLoading(false)
        return
      }

      const normalizedPeriods: Period[] = (periodData || [])
        .map((period: any) => ({
          id: Number(period.id),
          month: Number(period.month || 1),
          year: Number(period.year || 0),
          label: period.label || `${String(period.month || 1).padStart(2, '0')}/${period.year || 0}`,
          sort: Number(period.year || 0) * 100 + Number(period.month || 1),
        }))
        .sort((a, b) => b.sort - a.sort)

      setPeriods(normalizedPeriods)
      const periodById = new Map(normalizedPeriods.map(period => [period.id, period]))

      const raw: any[] = []
      for (let from = 0; ; from += 1000) {
        const { data: batch, error: voteError } = await supabase
          .from('voting_results')
          .select('id, series_id, period_id, votes, rank, series(id, title, title_vi, cover_url)')
          .order('period_id', { ascending: false })
          .order('rank', { ascending: true })
          .range(from, from + 999)

        if (voteError) {
          setError(voteError.message)
          setLoading(false)
          return
        }

        raw.push(...(batch || []))
        if (!batch || batch.length < 1000) break
      }

      const seriesIds = Array.from(new Set(raw.map((r: any) => Number(r.series_id)).filter(Boolean)))
      const publisherBySeries = new Map<number, string>()

      for (let i = 0; i < seriesIds.length; i += 500) {
        const chunk = seriesIds.slice(i, i + 500)
        const { data: rankingData } = await supabase
          .from('ln_series_ranking')
          .select('lidex_series_id, publisher')
          .in('lidex_series_id', chunk)

        for (const row of rankingData || []) {
          const id = Number((row as any).lidex_series_id)
          if (id && !publisherBySeries.has(id)) publisherBySeries.set(id, (row as any).publisher || '-')
        }
      }

      const mapped: VoteRow[] = raw.map((row: any) => {
        const seriesRaw = Array.isArray(row.series) ? row.series[0] : row.series
        const period: Period = periodById.get(Number(row.period_id)) || {
          id: Number(row.period_id),
          month: 1,
          year: 0,
          label: '',
          sort: 0,
        }

        return {
          id: Number(row.id),
          series_id: Number(row.series_id),
          period_id: Number(row.period_id),
          votes: Number(row.votes) || 0,
          rank: row.rank == null ? null : Number(row.rank),
          period,
          title: seriesRaw?.title || `Series ${row.series_id}`,
          title_vi: seriesRaw?.title_vi || null,
          cover_url: seriesRaw?.cover_url || null,
          publisher: publisherBySeries.get(Number(row.series_id)) || '-',
        }
      })

      setRows(mapped)
      setSelectedPeriodId(normalizedPeriods[0]?.id || null)
      setLoading(false)
    }

    load()
  }, [])

  const selectedPeriod = useMemo(() => periods.find(period => period.id === selectedPeriodId) || periods[0] || null, [periods, selectedPeriodId])
  const previousPeriod = useMemo(() => {
    if (!selectedPeriod) return null
    return periods.filter(period => period.sort < selectedPeriod.sort).sort((a, b) => b.sort - a.sort)[0] || null
  }, [periods, selectedPeriod])

  const rowsBySeries = useMemo(() => {
    const map = new Map<number, VoteRow[]>()
    for (const row of rows) {
      const list = map.get(row.series_id) || []
      list.push(row)
      map.set(row.series_id, list)
    }
    Array.from(map.values()).forEach(list => list.sort((a, b) => a.period.sort - b.period.sort))
    return map
  }, [rows])

  const leaderboard = useMemo<LeaderboardRow[]>(() => {
    if (!selectedPeriod) return []
    const prevRanks = new Map<number, number>()
    if (previousPeriod) {
      rows.filter(row => row.period.id === previousPeriod.id).forEach(row => {
        prevRanks.set(row.series_id, row.rank || 9999)
      })
    }

    const q = query.trim().toLowerCase()
    return rows
      .filter(row => row.period.id === selectedPeriod.id)
      .filter(row => {
        if (!q) return true
        return `${row.title} ${row.title_vi || ''} ${row.publisher}`.toLowerCase().includes(q)
      })
      .sort((a, b) => (a.rank || 9999) - (b.rank || 9999) || b.votes - a.votes)
      .map((row, index) => {
        const displayRank = row.rank || index + 1
        const previousRank = prevRanks.get(row.series_id) || null
        return {
          ...row,
          displayRank,
          previousRank,
          change: previousRank == null ? null : previousRank - displayRank,
          trend: periods
            .slice()
            .reverse()
            .map(period => ({
              period: period.label || fmtPeriod(period),
              rank: rowsBySeries.get(row.series_id)?.find(item => item.period.id === period.id)?.rank ?? null,
            })),
        }
      })
  }, [rows, selectedPeriod, previousPeriod, query, periods, rowsBySeries])

  const topCount = rows.filter(row => row.period.id === selectedPeriod?.id).length

  return (
    <div className="min-h-screen" style={{ background: 'var(--background)' }}>
      <div className="max-w-[1500px] mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
        <div className="grid grid-cols-1 lg:grid-cols-[170px_1fr_220px] gap-3 mb-6">
          <div className="rounded-2xl p-4 text-center" style={{ background: 'var(--glass-bg)', border: '1px solid rgba(248,113,113,.28)' }}>
            <p className="text-sm" style={{ color: 'var(--foreground-muted)' }}>{vi ? 'Kì bình chọn' : 'Poll Period'}</p>
            <select
              value={selectedPeriodId ?? ''}
              onChange={e => setSelectedPeriodId(Number(e.target.value))}
              className="mt-3 w-full rounded-xl px-3 py-2 text-lg font-black text-center outline-none"
              style={{ background: 'var(--background-secondary)', color: '#fb7185', border: '1px solid var(--card-border)' }}
            >
              {periods.map(period => <option key={period.id} value={period.id}>{fmtPeriod(period)}</option>)}
            </select>
          </div>

          <div className="rounded-2xl p-5 flex flex-col justify-center text-center" style={{ background: 'var(--glass-bg)', border: '1px solid var(--card-border)' }}>
            <h1 className="text-2xl sm:text-3xl font-black uppercase" style={{ color: '#fb7185' }}>
              {vi ? 'Light Novel được yêu thích nhất' : 'Favourite Light Novel Ranking'}
            </h1>
            <p className="mt-2 text-sm" style={{ color: 'var(--foreground)' }}>
              {vi ? 'Hạng mục có tổng cộng' : 'Category contains'} <span className="font-black text-red-400">{topCount.toLocaleString('vi-VN')}</span> {vi ? 'tác phẩm!' : 'titles!'}
            </p>
          </div>

          <div className="rounded-2xl p-4 flex flex-col justify-center items-center text-center" style={{ background: 'var(--glass-bg)', border: '1px solid rgba(248,113,113,.28)' }}>
            <p className="text-sm" style={{ color: 'var(--foreground-muted)' }}>{vi ? 'Kì tiếp theo' : 'Next Period'}</p>
            <p className="mt-3 text-lg font-black" style={{ color: '#ef4444' }}>{vi ? 'Chưa mở' : 'Not Open'}</p>
          </div>
        </div>

        <div className="rounded-2xl overflow-hidden shadow-xl" style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-end gap-3 p-4" style={{ borderBottom: '1px solid var(--card-border)' }}>
            <div className="relative w-full sm:w-[320px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--foreground-muted)' }} />
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder={vi ? 'Tìm tác phẩm hoặc nhà phát hành...' : 'Search title or publisher...'}
                className="w-full pl-10 pr-3 py-2 rounded-xl text-sm outline-none"
                style={{ background: 'var(--background-secondary)', color: 'var(--foreground)', border: '1px solid var(--card-border)' }}
              />
            </div>
          </div>

          {loading ? (
            <div className="h-[420px] flex items-center justify-center gap-2" style={{ color: 'var(--foreground-secondary)' }}>
              <Loader2 className="w-5 h-5 animate-spin" />
              {vi ? 'Đang tải bảng xếp hạng...' : 'Loading leaderboard...'}
            </div>
          ) : error ? (
            <div className="h-[420px] flex items-center justify-center text-center">
              <div>
                <p className="font-black text-red-400">{vi ? 'Không tải được dữ liệu' : 'Failed to load data'}</p>
                <p className="text-xs mt-2" style={{ color: 'var(--foreground-muted)' }}>{error}</p>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1100px] text-sm">
                <thead>
                  <tr style={{ background: 'var(--background-secondary)', color: '#e2695f' }}>
                    <th className="px-5 py-4 text-center text-lg font-black">{vi ? 'Xếp hạng' : 'Rank'}</th>
                    <th className="px-5 py-4 text-left text-lg font-black">{vi ? 'Tác phẩm' : 'Title'}</th>
                    <th className="px-5 py-4 text-center text-lg font-black">{vi ? 'Nhà phát hành' : 'Publisher'}</th>
                    <th className="px-5 py-4 text-center text-lg font-black">{vi ? 'Thay đổi' : 'Change'}</th>
                    <th className="px-5 py-4 text-center text-lg font-black">{vi ? 'Xu hướng' : 'Trend'}</th>
                    <th className="px-5 py-4 text-center text-lg font-black">{vi ? 'Số bình chọn' : 'Votes'}</th>
                  </tr>
                </thead>
                <tbody>
                  {leaderboard.map(row => (
                    <tr key={`${row.period_id}-${row.series_id}`} className="transition-colors hover:bg-black/[0.03] dark:hover:bg-white/[0.04]" style={{ borderTop: '1px solid var(--card-border)' }}>
                      <td className="px-5 py-3 text-center font-black text-base" style={{ color: rankColor(row.displayRank) }}>
                        {rankLabel(row.displayRank)}
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-4 min-w-0">
                          <div className="w-20 h-28 sm:w-24 sm:h-32 lg:w-24 lg:h-32 rounded-xl overflow-hidden shrink-0 shadow-md" style={{ background: 'var(--background-secondary)', border: '1px solid var(--card-border)' }}>
                            {row.cover_url ? (
                              <img src={row.cover_url} alt="" className="w-full h-full object-cover" loading="lazy" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-[10px] font-black" style={{ color: 'var(--foreground-muted)' }}>LN</div>
                            )}
                          </div>
                          <div className="min-w-0">
                            <Link href={`/content/${row.series_id}`} className="font-bold hover:underline line-clamp-2" style={{ color: row.displayRank <= 3 ? '#f59e0b' : 'var(--foreground)' }}>
                              {row.title_vi || row.title}
                            </Link>
                            {row.title_vi && row.title_vi !== row.title && <p className="text-xs mt-1 line-clamp-1" style={{ color: 'var(--foreground-muted)' }}>{row.title}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4 text-center" style={{ color: 'var(--foreground-secondary)' }}>{row.publisher}</td>
                      <td className="px-5 py-4 text-center"><ChangeCell value={row.change} vi={vi} /></td>
                      <td className="px-5 py-4 text-center"><div className="flex justify-center"><Sparkline points={row.trend} /></div></td>
                      <td className="px-5 py-4 text-center font-black tabular-nums" style={{ color: 'var(--foreground)' }}>{row.votes.toLocaleString('vi-VN')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {leaderboard.length === 0 && (
                <div className="h-[260px] flex items-center justify-center" style={{ color: 'var(--foreground-secondary)' }}>
                  {vi ? 'Không có tác phẩm phù hợp.' : 'No matching titles.'}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
