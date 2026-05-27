'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Tooltip,
  Legend,
  type ChartOptions,
} from 'chart.js'
import { Bar } from 'react-chartjs-2'
import { Loader2, Building2 } from 'lucide-react'
import supabase from '@/lib/supabaseClient'
import { useLocale } from '@/contexts/LocaleContext'

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend)

interface StudioAggregate {
  studio: string
  count: number
  avgScore: number
}

export default function StudioLeaderboardPage() {
  const { locale } = useLocale()
  const vi = locale === 'vi'

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [rows, setRows] = useState<StudioAggregate[]>([])
  const [minTitles, setMinTitles] = useState(5)

  useEffect(() => {
    async function load() {
      setLoading(true)
      setError(null)

      const { data, error: qErr } = await supabase
        .from('series')
        .select('studio, anime_meta!inner(mean_score)')
        .eq('item_type', 'anime')
        .not('studio', 'is', null)
        .not('anime_meta.mean_score', 'is', null)
        .not('genres', 'cs', '{"Hentai"}')
        .limit(5000)

      if (qErr) {
        setError(qErr.message)
        setLoading(false)
        return
      }

      const grouped = new Map<string, { sum: number; count: number }>()

      ;(data || []).forEach((row: any) => {
        const studio = (row.studio || '').trim()
        const meta = Array.isArray(row.anime_meta) ? row.anime_meta[0] : row.anime_meta
        const meanScore = meta?.mean_score

        if (!studio || typeof meanScore !== 'number') return

        const curr = grouped.get(studio) || { sum: 0, count: 0 }
        curr.sum += meanScore
        curr.count += 1
        grouped.set(studio, curr)
      })

      const aggregates: StudioAggregate[] = Array.from(grouped.entries()).map(([studio, v]) => ({
        studio,
        count: v.count,
        avgScore: Number((v.sum / v.count).toFixed(2)),
      }))

      setRows(aggregates)
      setLoading(false)
    }

    load()
  }, [])

  const leaderboard = useMemo(() => {
    return [...rows]
      .filter(r => r.count >= minTitles)
      .sort((a, b) => b.avgScore - a.avgScore)
      .slice(0, 15)
  }, [rows, minTitles])

  const chartData = useMemo(() => {
    return {
      labels: leaderboard.map(s => s.studio),
      datasets: [
        {
          label: vi ? 'Điểm trung bình' : 'Average mean_score',
          data: leaderboard.map(s => s.avgScore),
          backgroundColor: 'rgba(99, 102, 241, 0.75)',
          borderColor: 'rgba(99, 102, 241, 1)',
          borderWidth: 1,
          borderRadius: 8,
        },
      ],
    }
  }, [leaderboard, vi])

  const chartOptions = useMemo<ChartOptions<'bar'>>(() => ({
    responsive: true,
    maintainAspectRatio: false,
    indexAxis: 'y',
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx) => {
            const studio = leaderboard[ctx.dataIndex]
            const score = ctx.parsed.x
            return vi
              ? `Điểm TB: ${score} · ${studio?.count ?? 0} tựa`
              : `Avg: ${score} · ${studio?.count ?? 0} titles`
          },
        },
      },
    },
    scales: {
      x: {
        min: 0,
        max: 100,
        title: {
          display: true,
          text: vi ? 'Trung bình anime_meta.mean_score' : 'Average anime_meta.mean_score',
        },
      },
      y: {
        ticks: {
          autoSkip: false,
        },
      },
    },
  }), [leaderboard, vi])

  return (
    <div className="min-h-screen" style={{ background: 'var(--background)' }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
        <div className="mb-6 sm:mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2" style={{ color: 'var(--foreground)' }}>
            <Building2 className="w-7 h-7 text-primary-500" />
            {vi ? 'BXH Studio' : 'Studio Leaderboard'}
          </h1>
          <p className="mt-2 text-sm" style={{ color: 'var(--foreground-secondary)' }}>
            {vi
              ? 'Xếp hạng studio theo điểm trung bình anime_meta.mean_score. Hiển thị top 15 studio sau khi lọc số tựa tối thiểu.'
              : 'Studios ranked by average anime_meta.mean_score. Shows top 15 after applying minimum title filter.'}
          </p>
        </div>

        <div
          className="rounded-2xl p-4 sm:p-5 mb-5"
          style={{ background: 'var(--glass-bg)', border: '1px solid var(--card-border)' }}
        >
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-5">
            <label className="text-sm font-semibold" style={{ color: 'var(--foreground)' }}>
              {vi ? 'Số tựa tối thiểu / studio' : 'Minimum titles per studio'}
            </label>
            <input
              type="number"
              min={1}
              step={1}
              value={minTitles}
              onChange={(e) => setMinTitles(Math.max(1, Number(e.target.value || 1)))}
              className="w-28 px-3 py-2 rounded-lg"
              style={{
                background: 'var(--background-secondary)',
                color: 'var(--foreground)',
                border: '1px solid var(--card-border)',
              }}
            />
            <p className="text-xs" style={{ color: 'var(--foreground-muted)' }}>
              {vi ? 'Khuyến nghị: 5+ để dữ liệu ổn định hơn.' : 'Recommended: 5+ for more meaningful averages.'}
            </p>
          </div>
        </div>

        <div
          className="rounded-2xl p-4 sm:p-6"
          style={{ background: 'var(--glass-bg)', border: '1px solid var(--card-border)' }}
        >
          {loading ? (
            <div className="h-[520px] flex items-center justify-center">
              <div className="flex items-center gap-2" style={{ color: 'var(--foreground-secondary)' }}>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>{vi ? 'Đang tải dữ liệu studio…' : 'Loading studio data…'}</span>
              </div>
            </div>
          ) : error ? (
            <div className="h-[520px] flex items-center justify-center text-center">
              <div>
                <p className="font-semibold text-red-400">{vi ? 'Không thể tải dữ liệu' : 'Failed to load data'}</p>
                <p className="text-xs mt-2" style={{ color: 'var(--foreground-muted)' }}>{error}</p>
              </div>
            </div>
          ) : leaderboard.length === 0 ? (
            <div className="h-[520px] flex items-center justify-center text-center">
              <p style={{ color: 'var(--foreground-secondary)' }}>
                {vi ? 'Không có studio nào thỏa bộ lọc hiện tại.' : 'No studios match the current filter.'}
              </p>
            </div>
          ) : (
            <>
              <div className="h-[520px]">
                <Bar data={chartData} options={chartOptions} />
              </div>
              <p className="text-xs mt-3" style={{ color: 'var(--foreground-muted)' }}>
                {vi
                  ? `Hiển thị ${leaderboard.length} studio hàng đầu (lọc: ≥ ${minTitles} tựa).`
                  : `Showing top ${leaderboard.length} studios (filter: ≥ ${minTitles} titles).`}
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
