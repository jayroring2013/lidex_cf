'use client'

import { useState, useMemo } from 'react'
import { Search, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react'
import { useLocale } from '@/contexts/LocaleContext'
import predictions from '@/data/license_predictions.json'

type PredictionRow = {
  rank: number
  title: string
  publisher: string
  logo_url: string
  cover_url: string
  coming: number
  success: number
  volume_count?: number | null
  status?: string | null
  jp_publisher?: string | null
  coming_factors?: string[]
  success_factors?: string[]
  strategic_fit_en?: string
  strategic_fit_vi?: string
}

type SortField = 'rank' | 'coming' | 'success'
type SortOrder = 'asc' | 'desc'

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

function CoverThumb({ coverUrl }: { coverUrl: string }) {
  return (
    <div 
      className="w-16 h-24 sm:w-[72px] sm:h-[104px] lg:w-20 lg:h-28 rounded-lg overflow-hidden shrink-0 shadow-md" 
      style={{ background: 'var(--background-secondary)', border: '1px solid var(--card-border)' }}
    >
      {coverUrl ? (
        <img src={coverUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-[10px] font-black" style={{ color: 'var(--foreground-muted)' }}>LN</div>
      )}
    </div>
  )
}

function MobilePredictionCard({ 
  row, 
  vi, 
  index,
  showOriginal,
  showFactors,
  showStrategicFit
}: { 
  row: PredictionRow
  vi: boolean
  index: number
  showOriginal: boolean
  showFactors: boolean
  showStrategicFit: boolean
}) {
  const statusLabel = row.status
    ? (vi
        ? (row.status === 'completed' ? 'Hoàn thành' : 'Đang ra')
        : (row.status.charAt(0).toUpperCase() + row.status.slice(1)))
    : ''

  return (
    <article className="rounded-2xl p-4 shadow-sm" style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}>
      <div className="flex items-start gap-4">
        {/* Rank & Cover Thumb */}
        <div className="flex flex-col items-center gap-2 shrink-0">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-black tabular-nums"
            style={{
              color: index <= 3 ? '#0f172a' : 'var(--foreground)',
              background: rankBadgeBg(index),
              border: '1px solid var(--card-border)',
            }}
          >
            #{index}
          </div>
          <CoverThumb coverUrl={row.cover_url} />
        </div>

        {/* Title & Details */}
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-black leading-snug line-clamp-2" style={{ color: 'var(--foreground)' }}>
            {row.title}
          </h2>

          {/* Original JP publisher, volumes & status */}
          {showOriginal && (row.jp_publisher || row.volume_count) && (
            <p className="text-xs font-semibold mt-1" style={{ color: 'var(--foreground-muted)' }}>
              {row.jp_publisher && <span>JP: {row.jp_publisher}</span>}
              {row.volume_count && <span> · {row.volume_count} {vi ? 'tập' : 'vols'} ({statusLabel})</span>}
            </p>
          )}

          <div className="mt-3 flex items-center gap-2">
            {row.logo_url ? (
              <img
                src={row.logo_url}
                alt=""
                className="w-5 h-5 object-contain rounded-full shadow-sm bg-white"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = 'none'
                }}
              />
            ) : (
              <div className="w-5 h-5 rounded-full bg-gray-200 flex items-center justify-center text-[8px] font-black">
                LN
              </div>
            )}
            <span className="text-xs font-bold" style={{ color: 'var(--foreground-secondary)' }}>
              {vi ? 'NPH Việt:' : 'VN Publisher:'} {row.publisher}
            </span>
          </div>

          {/* Strategic Fit */}
          {showStrategicFit && (row.strategic_fit_vi || row.strategic_fit_en) && (
            <p className="text-xs mt-2.5 font-medium italic border-l-2 pl-2" style={{ color: 'var(--foreground-secondary)', borderColor: '#818cf8' }}>
              {vi ? row.strategic_fit_vi : row.strategic_fit_en}
            </p>
          )}

          <div className="mt-4 grid grid-cols-2 gap-2">
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

          {/* Mobile Drivers list */}
          {showFactors && ((row.coming_factors && row.coming_factors.length > 0) || (row.success_factors && row.success_factors.length > 0)) && (
            <div className="mt-3.5 pt-3.5" style={{ borderTop: '1px dashed var(--card-border)' }}>
              <p className="text-[10px] font-black uppercase tracking-wider mb-2" style={{ color: 'var(--foreground-muted)' }}>
                {vi ? 'Yếu tố đánh giá' : 'Evaluation Factors'}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {row.coming_factors?.map((f, idx) => (
                  <span key={idx} className="px-2 py-0.5 rounded text-[10px] font-semibold" style={{ background: 'rgba(99, 102, 241, 0.1)', color: '#818cf8' }}>
                    {f}
                  </span>
                ))}
                {row.success_factors?.map((f, idx) => (
                  <span key={idx} className="px-2 py-0.5 rounded text-[10px] font-semibold" style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#34d399' }}>
                    {f}
                  </span>
                ))}
              </div>
            </div>
          )}
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
  const [sortBy, setSortBy] = useState<SortField>('success')
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc')
  const [selectedPublisher, setSelectedPublisher] = useState<string>('')

  // Column Visibility States
  const [showOriginal, setShowOriginal] = useState(true)
  const [showFactors, setShowFactors] = useState(true)
  const [showStrategicFit, setShowStrategicFit] = useState(true)

  const uniquePublishers = useMemo(() => {
    const pubs = predictions.map((p) => p.publisher)
    return Array.from(new Set(pubs)).sort()
  }, [])

  const handleSort = (field: SortField) => {
    if (sortBy === field) {
      setSortOrder(o => o === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(field)
      setSortOrder(field === 'rank' ? 'asc' : 'desc') // default Rank to ascending, chances to descending
    }
    setPage(0)
  }

  const sortedPredictions = useMemo(() => {
    const q = query.trim().toLowerCase()
    const filtered = (predictions as PredictionRow[]).filter((row) => {
      const matchesQuery = !q || `${row.title} ${row.publisher}`.toLowerCase().includes(q)
      const matchesPublisher = !selectedPublisher || row.publisher === selectedPublisher
      return matchesQuery && matchesPublisher
    })

    return filtered.sort((a, b) => {
      let valA = a[sortBy]
      let valB = b[sortBy]

      const multiplier = sortOrder === 'desc' ? -1 : 1
      if (valA < valB) return -1 * multiplier
      if (valA > valB) return 1 * multiplier
      return 0
    })
  }, [query, sortBy, sortOrder, selectedPublisher])

  const pageCount = Math.max(1, Math.ceil(sortedPredictions.length / pageSize))
  const safePage = Math.min(page, pageCount - 1)
  const pageStart = safePage * pageSize
  const pagedPredictions = sortedPredictions.slice(pageStart, pageStart + pageSize)

  const SortHeader = ({ field, children, className = "" }: { field: SortField; children: React.ReactNode; className?: string }) => {
    const active = sortBy === field
    return (
      <button
        type="button"
        onClick={() => handleSort(field)}
        className={`flex items-center gap-1 hover:text-primary-400 transition-colors font-black text-base outline-none uppercase ${className}`}
      >
        {children}
        {active ? (
          sortOrder === 'asc' ? <ArrowUp className="w-4 h-4 text-primary-500" /> : <ArrowDown className="w-4 h-4 text-primary-500" />
        ) : (
          <ArrowUpDown className="w-4 h-4 opacity-40" />
        )}
      </button>
    )
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--background)' }}>
      <div className="max-w-[1550px] mx-auto px-3 sm:px-6 lg:px-8 py-5 sm:py-10">
        
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
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 p-4" style={{ borderBottom: '1px solid var(--card-border)' }}>
            
            {/* Column Toggles */}
            <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
              <span className="text-xs font-black uppercase tracking-wider mr-1" style={{ color: 'var(--foreground-muted)' }}>
                {vi ? 'Hiển thị cột:' : 'Show Columns:'}
              </span>
              <button
                type="button"
                onClick={() => setShowOriginal(!showOriginal)}
                className="px-3 py-1.5 rounded-xl text-xs font-bold transition-all border border-card-border"
                style={{
                  background: showOriginal ? 'var(--primary-color, #6366f1)' : 'var(--background-secondary)',
                  color: showOriginal ? '#ffffff' : 'var(--foreground-secondary)'
                }}
              >
                {vi ? 'Bản gốc (JP)' : 'Original (JP)'}
              </button>
              <button
                type="button"
                onClick={() => setShowStrategicFit(!showStrategicFit)}
                className="px-3 py-1.5 rounded-xl text-xs font-bold transition-all border border-card-border"
                style={{
                  background: showStrategicFit ? 'var(--primary-color, #6366f1)' : 'var(--background-secondary)',
                  color: showStrategicFit ? '#ffffff' : 'var(--foreground-secondary)'
                }}
              >
                {vi ? 'Đề xuất chiến lược' : 'Strategic Fit'}
              </button>
              <button
                type="button"
                onClick={() => setShowFactors(!showFactors)}
                className="px-3 py-1.5 rounded-xl text-xs font-bold transition-all border border-card-border"
                style={{
                  background: showFactors ? 'var(--primary-color, #6366f1)' : 'var(--background-secondary)',
                  color: showFactors ? '#ffffff' : 'var(--foreground-secondary)'
                }}
              >
                {vi ? 'Yếu tố đánh giá' : 'Evaluation Factors'}
              </button>
            </div>

            {/* Filter & Search Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 w-full md:w-auto">
              {/* Publisher Filter */}
              <select
                value={selectedPublisher}
                onChange={(e) => {
                  setSelectedPublisher(e.target.value)
                  setPage(0)
                }}
                className="px-3 py-2 rounded-xl text-sm outline-none font-bold cursor-pointer w-full sm:w-auto"
                style={{ background: 'var(--background-secondary)', color: 'var(--foreground)', border: '1px solid var(--card-border)' }}
              >
                <option value="">{vi ? 'Tất cả NPH' : 'All Publishers'}</option>
                {uniquePublishers.map(pub => (
                  <option key={pub} value={pub}>{pub}</option>
                ))}
              </select>

              {/* Search input */}
              <div className="relative w-full sm:w-[280px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--foreground-muted)' }} />
                <input
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value)
                    setPage(0)
                  }}
                  placeholder={vi ? 'Tìm kiếm...' : 'Search...'}
                  className="w-full pl-10 pr-3 py-2 rounded-xl text-sm outline-none"
                  style={{ background: 'var(--background-secondary)', color: 'var(--foreground)', border: '1px solid var(--card-border)' }}
                />
              </div>
            </div>
          </div>

          {/* Pagination Top */}
          {sortedPredictions.length > pageSize && (
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-3" style={{ borderBottom: '1px solid var(--card-border)' }}>
              <p className="text-xs font-semibold" style={{ color: 'var(--foreground-muted)' }}>
                {vi ? 'Hiển thị' : 'Showing'} {pageStart + 1}-{Math.min(pageStart + pageSize, sortedPredictions.length)} / {sortedPredictions.length.toLocaleString('vi-VN')}
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
            {pagedPredictions.map((row, i) => (
              <MobilePredictionCard 
                key={row.rank} 
                row={row} 
                vi={vi} 
                index={pageStart + i + 1}
                showOriginal={showOriginal}
                showFactors={showFactors}
                showStrategicFit={showStrategicFit}
              />
            ))}

            {sortedPredictions.length === 0 && (
              <div className="h-[240px] flex items-center justify-center text-sm" style={{ color: 'var(--foreground-secondary)' }}>
                {vi ? 'Không có tác phẩm phù hợp.' : 'No matching titles.'}
              </div>
            )}
          </div>

          {/* Desktop Layout */}
          <div className="hidden lg:block overflow-x-auto">
            <table className="w-full min-w-[1200px] text-sm">
              <thead>
                <tr style={{ background: 'var(--background-secondary)', color: '#e2695f' }}>
                  <th className="px-6 py-3 text-center w-28">
                    <div className="flex justify-center">
                      <SortHeader field="rank">{vi ? 'Index' : 'Index'}</SortHeader>
                    </div>
                  </th>
                  <th className="px-6 py-3 text-left text-base font-black">{vi ? 'Tác phẩm' : 'Title'}</th>
                  
                  {showOriginal && (
                    <th className="px-6 py-3 text-left text-base font-black w-[220px]">{vi ? 'Bản gốc (JP)' : 'Original (JP)'}</th>
                  )}
                  
                  <th className="px-6 py-3 text-left text-base font-black w-[250px]">{vi ? 'NPH có thể thầu' : 'Likely Publisher'}</th>
                  
                  <th className="px-6 py-3 w-[150px]">
                    <div className="flex justify-center">
                      <SortHeader field="coming">{vi ? 'Khả năng mua' : '% Coming'}</SortHeader>
                    </div>
                  </th>
                  
                  <th className="px-6 py-3 w-[180px]">
                    <div className="flex justify-center">
                      <SortHeader field="success">{vi ? 'Tỷ lệ thành công' : '% Success'}</SortHeader>
                    </div>
                  </th>

                  {showStrategicFit && (
                    <th className="px-6 py-3 text-left text-base font-black w-[300px]">{vi ? 'Đề xuất chiến lược' : 'Strategic Fit'}</th>
                  )}

                  {showFactors && (
                    <th className="px-6 py-3 text-left text-base font-black w-[350px]">{vi ? 'Yếu tố đánh giá' : 'Evaluation Factors'}</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {pagedPredictions.map((row, i) => {
                  const displayIndex = pageStart + i + 1
                  const statusLabel = row.status
                    ? (vi
                        ? (row.status === 'completed' ? 'Hoàn thành' : 'Đang ra')
                        : (row.status.charAt(0).toUpperCase() + row.status.slice(1)))
                    : ''
                  return (
                    <tr key={row.rank} className="transition-colors" style={{ borderTop: '1px solid var(--card-border)' }}>
                      {/* Rank */}
                      <td className="px-6 py-4 text-center font-black text-base" style={{ color: rankColor(displayIndex) }}>
                        #{displayIndex}
                      </td>

                      {/* Title & Cover Thumbnail */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-4">
                          <CoverThumb coverUrl={row.cover_url} />
                          <div className="font-bold text-sm sm:text-base leading-snug line-clamp-2" style={{ color: displayIndex <= 3 ? '#f59e0b' : 'var(--foreground)' }}>
                            {row.title}
                          </div>
                        </div>
                      </td>

                      {/* Original JP details */}
                      {showOriginal && (
                        <td className="px-6 py-4">
                          <div className="flex flex-col gap-0.5">
                            {row.jp_publisher ? (
                              <span className="font-bold text-sm" style={{ color: 'var(--foreground)' }}>
                                {row.jp_publisher}
                              </span>
                            ) : (
                              <span className="text-xs italic" style={{ color: 'var(--foreground-muted)' }}>
                                {vi ? 'Chưa rõ NXB JP' : 'Unknown JP Pub'}
                              </span>
                            )}
                            {row.volume_count && (
                              <span className="text-xs font-semibold" style={{ color: 'var(--foreground-secondary)' }}>
                                {row.volume_count} {vi ? 'tập' : 'vols'} ({statusLabel})
                              </span>
                            )}
                          </div>
                        </td>
                      )}

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

                      {/* Strategic Fit */}
                      {showStrategicFit && (
                        <td className="px-6 py-4">
                          <div className="text-xs font-semibold leading-relaxed border-l-2 pl-2" style={{ color: 'var(--foreground-secondary)', borderColor: 'var(--primary-color, #6366f1)' }}>
                            {vi ? (row.strategic_fit_vi || '—') : (row.strategic_fit_en || '—')}
                          </div>
                        </td>
                      )}

                      {/* Evaluation Factors / Key Drivers */}
                      {showFactors && (
                        <td className="px-6 py-4">
                          <div className="flex flex-wrap gap-1 max-w-[320px]">
                            {row.coming_factors?.map((f, idx) => (
                              <span key={idx} className="px-2 py-0.5 rounded text-[10px] font-bold" style={{ background: 'rgba(99, 102, 241, 0.12)', color: '#818cf8', border: '1px solid rgba(99, 102, 241, 0.2)' }}>
                                {f}
                              </span>
                            ))}
                            {row.success_factors?.map((f, idx) => (
                              <span key={idx} className="px-2 py-0.5 rounded text-[10px] font-bold" style={{ background: 'rgba(16, 185, 129, 0.12)', color: '#34d399', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
                                {f}
                              </span>
                            ))}
                            {!row.coming_factors?.length && !row.success_factors?.length && (
                              <span className="text-xs italic" style={{ color: 'var(--foreground-muted)' }}>—</span>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>

            {sortedPredictions.length === 0 && (
              <div className="h-[260px] flex items-center justify-center text-sm" style={{ color: 'var(--foreground-secondary)' }}>
                {vi ? 'Không có tác phẩm phù hợp.' : 'No matching titles.'}
              </div>
            )}
          </div>

          {/* Pagination Bottom */}
          {sortedPredictions.length > pageSize && (
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-3" style={{ borderTop: '1px solid var(--card-border)' }}>
              <p className="text-xs font-semibold" style={{ color: 'var(--foreground-muted)' }}>
                {vi ? 'Hiển thị' : 'Showing'} {pageStart + 1}-{Math.min(pageStart + pageSize, sortedPredictions.length)} / {sortedPredictions.length.toLocaleString('vi-VN')}
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
