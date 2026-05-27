'use client'

import { useEffect, useMemo, useState } from 'react'
import { Loader2, Grid3X3 } from 'lucide-react'
import supabase from '@/lib/supabaseClient'
import { useLocale } from '@/contexts/LocaleContext'

const SCORE_BUCKETS = [
  { key: 'lt60', label: '<60', min: -Infinity, max: 60 },
  { key: '60s',  label: '60–69', min: 60, max: 70 },
  { key: '70s',  label: '70–79', min: 70, max: 80 },
  { key: '80s',  label: '80–89', min: 80, max: 90 },
  { key: '90p',  label: '90+', min: 90, max: Infinity },
] as const

type BucketKey = typeof SCORE_BUCKETS[number]['key']

interface GenreAggregate {
  genre: string
  count: number
  avgScore: number
  bucketCounts: Record<BucketKey, number>
}

function bucketKeyForScore(score: number): BucketKey {
  const hit = SCORE_BUCKETS.find(b => score >= b.min && score < b.max)
  return hit ? hit.key : 'lt60'
}

function cellBg(opacity: number): string {
  return `rgba(236, 72, 153, ${Math.max(0.08, Math.min(opacity, 0.95)).toFixed(2)})`
}

export default function GenreMatrixPage() {
  const { locale } = useLocale()
  const vi = locale === 'vi'

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [genreRows, setGenreRows] = useState<GenreAggregate[]>([])
  const [minTitles, setMinTitles] = useState(5)

  useEffect(() => {
    async function loadGenreStats() {
      setLoading(true)
      setError(null)

      const { data, error: qErr } = await supabase
        .from('series')
        .select('genres, anime_meta!inner(mean_score)')
        .eq('item_type', 'anime')
        .not('anime_meta.mean_score', 'is', null)
        .not('genres', 'cs', '{"Hentai"}')
        .limit(5000)

      if (qErr) {
        setError(qErr.message)
        setLoading(false)
        return
      }

      const grouped = new Map<string, { sum: number; count: number; buckets: Record<BucketKey, number> }>()

      ;(data || []).forEach((row: any) => {
        const meta = Array.isArray(row.anime_meta) ? row.anime_meta[0] : row.anime_meta
        const meanScore = meta?.mean_score
        const genres = Array.isArray(row.genres) ? row.genres : []

        if (typeof meanScore !== 'number' || genres.length === 0) return

        const bucket = bucketKeyForScore(meanScore)

        genres.forEach((g: string) => {
          const genre = (g || '').trim()
          if (!genre) return

          const curr = grouped.get(genre) || {
            sum: 0,
            count: 0,
            buckets: { lt60: 0, '60s': 0, '70s': 0, '80s': 0, '90p': 0 },
          }

          curr.sum += meanScore
          curr.count += 1
          curr.buckets[bucket] += 1
          grouped.set(genre, curr)
        })
      })

      const aggregated: GenreAggregate[] = Array.from(grouped.entries()).map(([genre, v]) => ({
        genre,
        count: v.count,
        avgScore: Number((v.sum / v.count).toFixed(2)),
        bucketCounts: v.buckets,
      }))

      setGenreRows(aggregated)
      setLoading(false)
    }

    loadGenreStats()
  }, [])

  const topGenres = useMemo(() => {
    return [...genreRows]
      .filter(g => g.count >= minTitles)
      .sort((a, b) => b.avgScore - a.avgScore)
      .slice(0, 15)
  }, [genreRows, minTitles])

  return (
    <div className="min-h-screen" style={{ background: 'var(--background)' }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
        <div className="mb-6 sm:mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2" style={{ color: 'var(--foreground)' }}>
            <Grid3X3 className="w-7 h-7 text-pink-500" />
            {vi ? 'Ma trận điểm theo thể loại' : 'Genre Score Matrix'}
          </h1>
          <p className="mt-2 text-sm" style={{ color: 'var(--foreground-secondary)' }}>
            {vi
              ? 'Ma trận heatmap: hàng là thể loại, cột là dải điểm anime_meta.mean_score. Màu đậm hơn = tỷ trọng tựa cao hơn trong dải điểm đó.'
              : 'Heatmap matrix: rows are genres, columns are anime_meta.mean_score ranges. Darker cells = higher share of titles in that score band.'}
          </p>
        </div>

        <div className="rounded-2xl p-4 sm:p-5 mb-5" style={{ background: 'var(--glass-bg)', border: '1px solid var(--card-border)' }}>
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-5">
            <label className="text-sm font-semibold" style={{ color: 'var(--foreground)' }}>
              {vi ? 'Số tựa tối thiểu / thể loại' : 'Minimum titles per genre'}
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
              {vi ? 'Mặc định 5+ để giảm nhiễu mẫu nhỏ.' : 'Default 5+ to reduce small-sample noise.'}
            </p>
          </div>
        </div>

        <div className="rounded-2xl p-4 sm:p-6" style={{ background: 'var(--glass-bg)', border: '1px solid var(--card-border)' }}>
          {loading ? (
            <div className="h-[460px] flex items-center justify-center">
              <div className="flex items-center gap-2" style={{ color: 'var(--foreground-secondary)' }}>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>{vi ? 'Đang tải dữ liệu thể loại…' : 'Loading genre data…'}</span>
              </div>
            </div>
          ) : error ? (
            <div className="h-[460px] flex items-center justify-center text-center">
              <div>
                <p className="font-semibold text-red-400">{vi ? 'Không thể tải dữ liệu' : 'Failed to load data'}</p>
                <p className="text-xs mt-2" style={{ color: 'var(--foreground-muted)' }}>{error}</p>
              </div>
            </div>
          ) : topGenres.length === 0 ? (
            <div className="h-[460px] flex items-center justify-center text-center">
              <p style={{ color: 'var(--foreground-secondary)' }}>
                {vi ? 'Không có thể loại nào thỏa bộ lọc hiện tại.' : 'No genres match the current filter.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ color: 'var(--foreground-secondary)' }}>
                    <th className="text-left py-2 pr-3">{vi ? 'Thể loại' : 'Genre'}</th>
                    <th className="text-right py-2 pr-3">{vi ? 'Số tựa' : 'Titles'}</th>
                    <th className="text-right py-2 pr-3">{vi ? 'Điểm TB' : 'Avg'}</th>
                    {SCORE_BUCKETS.map(b => (
                      <th key={b.key} className="text-center py-2 px-2">{b.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {topGenres.map((g) => (
                    <tr key={g.genre} style={{ borderTop: '1px solid var(--card-border)' }}>
                      <td className="py-2 pr-3 font-medium" style={{ color: 'var(--foreground)' }}>{g.genre}</td>
                      <td className="py-2 pr-3 text-right">{g.count}</td>
                      <td className="py-2 pr-3 text-right">{g.avgScore.toFixed(2)}</td>
                      {SCORE_BUCKETS.map((b) => {
                        const hits = g.bucketCounts[b.key]
                        const pct = g.count > 0 ? hits / g.count : 0
                        return (
                          <td key={b.key} className="py-2 px-2">
                            <div
                              className="rounded-md h-9 flex items-center justify-center text-xs font-semibold"
                              title={`${g.genre} · ${b.label}: ${hits} (${(pct * 100).toFixed(1)}%)`}
                              style={{
                                background: cellBg(pct),
                                color: pct > 0.45 ? 'white' : 'var(--foreground)',
                                border: '1px solid var(--card-border)',
                                minWidth: '66px',
                              }}
                            >
                              {hits}
                            </div>
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>

              <p className="text-xs mt-4" style={{ color: 'var(--foreground-muted)' }}>
                {vi
                  ? `Hiển thị ${topGenres.length} thể loại có điểm TB cao nhất (lọc: ≥ ${minTitles} tựa).`
                  : `Showing top ${topGenres.length} highest-average genres (filter: ≥ ${minTitles} titles).`}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
