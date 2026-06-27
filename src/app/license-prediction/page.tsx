'use client'

import { useState, useMemo } from 'react'
import { Search } from 'lucide-react'
import { useLocale } from '@/contexts/LocaleContext'
import predictions from '@/data/license_predictions.json'

type PredictionRow = {
  rank: number
  title: string
  publisher: string
  logo_url: string
  coming: number
  success: number
}

function rankColor(rank: number) {
  if (rank === 1) return '#f59e0b'
  if (rank === 2) return '#94a3b8'
  if (rank === 3) return '#c084fc'
  return 'var(--foreground-secondary)'
}

function rankBadgeBg(rank: number) {
  if (rank === 1) return '#facc15'
  if (rank === 2) return '#cbd5e1'
  if (rank === 3) return '#f59e0b'
  return 'var(--background-secondary)'
}

function MobilePredictionCard({ row, vi }: { row: PredictionRow; vi: boolean }) {
  return (
    <article className="rounded-2xl p-4 shadow-sm" style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}>
      <div className="flex items-start gap-4">
        {/* Rank Badge */}
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-black tabular-nums shrink-0"
          style={{
            color: row.rank <= 3 ? '#0f172a' : 'var(--foreground)',
            background: rankBadgeBg(row.rank),
            border: '1px solid var(--card-border)',
          }}
        >
          #{row.rank}
        </div>

        {/* Title & Details */}
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-black leading-snug" style={{ color: 'var(--foreground)' }}>
            {row.title}
          </h2>

          <div className="mt-3 flex items-center gap-2">
            {row.logo_url && (
              <img
                src={row.logo_url}
                alt=""
                className="w-5 h-5 object-contain rounded-full shadow-sm bg-white"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = 'none'
                }}
              />
            )}
            <span className="text-xs font-bold" style={{ color: 'var(--foreground-secondary)' }}>
              {row.publisher}
            </span>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="rounded-xl px-2.5 py-2" style={{ background: 'var(--background-secondary)', border: '1px solid var(--card-border)' }}>
              <p className="text-[9px] font-black uppercase tracking-wide" style={{ color: 'var(--foreground-muted)' }}>
                {vi ? 'Khả năng mua' : '% Coming'}
              </p>
              <p className="text-xs font-black tabular-nums mt-0.5 text-primary-500">
                {(row.coming * 100).toFixed(1)}%
              </p>
            </div>
            <div className="rounded-xl px-2.5 py-2" style={{ background: 'var(--background-secondary)', border: '1px solid var(--card-border)' }}>
              <p className="text-[9px] font-black uppercase tracking-wide" style={{ color: 'var(--foreground-muted)' }}>
                {vi ? 'Tỉ lệ thành công' : '% Success'}
              </p>
              <p className="text-xs font-black tabular-nums mt-0.5 text-green-500">
                {(row.success * 100).toFixed(1)}%
              </p>
            </div>
          </div>
        </div>
      </div>
    </article>
  )
}

export default function LicensePredictionPage() {
  const { locale } = useLocale()
  const vi = locale === 'vi'
  const pageSize = 25

  const [query, setQuery] = useState('')
  const [page, setPage] = useState(0)

  const filteredPredictions = useMemo(() => {
    const q = query.trim().toLowerCase()
    return predictions.filter((row) => {
      if (!q) return true
      return `${row.title} ${row.publisher}`.toLowerCase().includes(q)
    })
  }, [query])

  const pageCount = Math.max(1, Math.ceil(filteredPredictions.length / pageSize))
  const safePage = Math.min(page, pageCount - 1)
  const pageStart = safePage * pageSize
  const pagedPredictions = filteredPredictions.slice(pageStart, pageStart + pageSize)

  return (
    <div className="min-h-screen" style={{ background: 'var(--background)' }}>
      <div className="max-w-[1500px] mx-auto px-3 sm:px-6 lg:px-8 py-5 sm:py-10">
        
        {/* Header Hero Card */}
        <div className="rounded-2xl p-5 sm:p-8 text-center mb-6 sm:mb-8 shadow-md" style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}>
          <h1 className="text-xl sm:text-4xl font-black uppercase leading-tight gradient-text">
            {vi ? 'Dự đoán bản quyền Light Novel' : 'Light Novel License Predictions'}
          </h1>
          <p className="mt-2 text-xs sm:text-base max-w-3xl mx-auto" style={{ color: 'var(--foreground-secondary)' }}>
            {vi 
              ? 'Dự báo khả năng được các nhà phát hành Việt Nam mua bản quyền và tỷ lệ thành công dựa trên phân tích chuyên sâu về danh mục đối tác, xu hướng thể loại 2 năm qua và độ dài tác phẩm.'
              : 'Predicting the likelihood of Vietnamese publishers acquiring licenses and their success rates based on publisher affinity portfolios, 2-year genre activity, and volume count analysis.'}
          </p>
        </div>

        {/* Search & Stats Card */}
        <div className="rounded-2xl overflow-hidden shadow-xl" style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 sm:p-4" style={{ borderBottom: '1px solid var(--card-border)' }}>
            <p className="text-xs font-semibold" style={{ color: 'var(--foreground-muted)' }}>
              {vi ? 'Hạng mục có tổng cộng' : 'Category contains'} <span className="font-black text-primary-500">{predictions.length}</span> {vi ? 'tác phẩm!' : 'titles!'}
            </p>
            <div className="relative w-full sm:w-[360px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--foreground-muted)' }} />
              <input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value)
                  setPage(0)
                }}
                placeholder={vi ? 'Tìm tác phẩm hoặc nhà phát hành...' : 'Search title or publisher...'}
                className="w-full pl-10 pr-3 py-2 rounded-xl text-sm outline-none"
                style={{ background: 'var(--background-secondary)', color: 'var(--foreground)', border: '1px solid var(--card-border)' }}
              />
            </div>
          </div>

          {/* Pagination Top */}
          {filteredPredictions.length > pageSize && (
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-3" style={{ borderBottom: '1px solid var(--card-border)' }}>
              <p className="text-xs font-semibold" style={{ color: 'var(--foreground-muted)' }}>
                {vi ? 'Hiển thị' : 'Showing'} {pageStart + 1}-{Math.min(pageStart + pageSize, filteredPredictions.length)} / {filteredPredictions.length.toLocaleString('vi-VN')}
              </p>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={safePage === 0}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  className="px-3 py-1.5 rounded-lg text-xs font-black disabled:opacity-40"
                  style={{ background: 'var(--background-secondary)', color: 'var(--foreground-secondary)', border: '1px solid var(--card-border)' }}
                >
                  {vi ? 'Trước' : 'Prev'}
                </button>
                <span className="px-2 text-xs font-black tabular-nums" style={{ color: 'var(--foreground-secondary)' }}>
                  {safePage + 1} / {pageCount}
                </span>
                <button
                  type="button"
                  disabled={safePage >= pageCount - 1}
                  onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                  className="px-3 py-1.5 rounded-lg text-xs font-black disabled:opacity-40"
                  style={{ background: 'var(--background-secondary)', color: 'var(--foreground-secondary)', border: '1px solid var(--card-border)' }}
                >
                  {vi ? 'Sau' : 'Next'}
                </button>
              </div>
            </div>
          )}

          {/* Mobile Layout */}
          <div className="lg:hidden p-3 space-y-3">
            {pagedPredictions.map((row) => (
              <MobilePredictionCard key={row.rank} row={row} vi={vi} />
            ))}

            {filteredPredictions.length === 0 && (
              <div className="h-[240px] flex items-center justify-center text-sm" style={{ color: 'var(--foreground-secondary)' }}>
                {vi ? 'Không có tác phẩm phù hợp.' : 'No matching titles.'}
              </div>
            )}
          </div>

          {/* Desktop Layout */}
          <div className="hidden lg:block overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead>
                <tr style={{ background: 'var(--background-secondary)', color: '#e2695f' }}>
                  <th className="px-6 py-3 text-center text-base font-black w-24">{vi ? 'Hạng' : 'Rank'}</th>
                  <th className="px-6 py-3 text-left text-base font-black">{vi ? 'Tác phẩm' : 'Title'}</th>
                  <th className="px-6 py-3 text-left text-base font-black w-72">{vi ? 'Nhà phát hành' : 'Publisher'}</th>
                  <th className="px-6 py-3 text-center text-base font-black w-48">{vi ? 'Khả năng mua' : '% Coming'}</th>
                  <th className="px-6 py-3 text-center text-base font-black w-48">{vi ? 'Tỉ lệ thành công' : '% Success'}</th>
                </tr>
              </thead>
              <tbody>
                {pagedPredictions.map((row) => (
                  <tr key={row.rank} className="transition-colors" style={{ borderTop: '1px solid var(--card-border)' }}>
                    {/* Rank */}
                    <td className="px-6 py-4 text-center font-black text-base" style={{ color: rankColor(row.rank) }}>
                      #{row.rank}
                    </td>

                    {/* Title (Romaji / English) */}
                    <td className="px-6 py-4">
                      <div className="font-bold text-sm sm:text-base leading-snug" style={{ color: row.rank <= 3 ? '#f59e0b' : 'var(--foreground)' }}>
                        {row.title}
                      </div>
                    </td>

                    {/* Publisher Name + Logo (Transfermarkt style) */}
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2.5">
                        {row.logo_url ? (
                          <img
                            src={row.logo_url}
                            alt=""
                            className="w-7 h-7 object-contain rounded-full shadow-sm bg-white border border-gray-100 p-0.5"
                            onError={(e) => {
                              (e.target as HTMLElement).style.display = 'none'
                            }}
                          />
                        ) : (
                          <div className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center text-[10px] font-black">
                            LN
                          </div>
                        )}
                        <span className="font-semibold text-sm" style={{ color: 'var(--foreground-secondary)' }}>
                          {row.publisher}
                        </span>
                      </div>
                    </td>

                    {/* % Coming */}
                    <td className="px-6 py-4 text-center font-black tabular-nums text-primary-500 text-sm">
                      {(row.coming * 100).toFixed(1)}%
                    </td>

                    {/* % Success */}
                    <td className="px-6 py-4 text-center font-black tabular-nums text-green-500 text-sm">
                      {(row.success * 100).toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {filteredPredictions.length === 0 && (
              <div className="h-[260px] flex items-center justify-center text-sm" style={{ color: 'var(--foreground-secondary)' }}>
                {vi ? 'Không có tác phẩm phù hợp.' : 'No matching titles.'}
              </div>
            )}
          </div>

          {/* Pagination Bottom */}
          {filteredPredictions.length > pageSize && (
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-3" style={{ borderTop: '1px solid var(--card-border)' }}>
              <p className="text-xs font-semibold" style={{ color: 'var(--foreground-muted)' }}>
                {vi ? 'Hiển thị' : 'Showing'} {pageStart + 1}-{Math.min(pageStart + pageSize, filteredPredictions.length)} / {filteredPredictions.length.toLocaleString('vi-VN')}
              </p>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={safePage === 0}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  className="px-3 py-1.5 rounded-lg text-xs font-black disabled:opacity-40"
                  style={{ background: 'var(--background-secondary)', color: 'var(--foreground-secondary)', border: '1px solid var(--card-border)' }}
                >
                  {vi ? 'Trước' : 'Prev'}
                </button>
                <span className="px-2 text-xs font-black tabular-nums" style={{ color: 'var(--foreground-secondary)' }}>
                  {safePage + 1} / {pageCount}
                </span>
                <button
                  type="button"
                  disabled={safePage >= pageCount - 1}
                  onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                  className="px-3 py-1.5 rounded-lg text-xs font-black disabled:opacity-40"
                  style={{ background: 'var(--background-secondary)', color: 'var(--foreground-secondary)', border: '1px solid var(--card-border)' }}
                >
                  {vi ? 'Sau' : 'Next'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
