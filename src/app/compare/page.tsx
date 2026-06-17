'use client'

import { useEffect, useState, useRef, useMemo } from 'react'
import { Radar } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  RadialLinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend,
} from 'chart.js'
import { Plus, X, Search, Loader2, GitCompare } from 'lucide-react'
import { useLocale } from '@/contexts/LocaleContext'
import { fetchCompareAllMeta, fetchCompareSearch, fetchCompareSeriesDetails } from '@/lib/db'
import Link from 'next/link'

ChartJS.register(RadialLinearScale, PointElement, LineElement, Filler, Tooltip, Legend)

// ── Constants ─────────────────────────────────────────────────────────────────
const SERIES_COLORS = [
  { line: 'rgba(99,102,241,1)',  fill: 'rgba(99,102,241,0.15)',  text: '#818cf8' },
  { line: 'rgba(236,72,153,1)', fill: 'rgba(236,72,153,0.15)', text: '#f472b6' },
  { line: 'rgba(34,197,94,1)',  fill: 'rgba(34,197,94,0.15)',  text: '#4ade80' },
  { line: 'rgba(251,191,36,1)', fill: 'rgba(251,191,36,0.15)', text: '#fbbf24' },
]

const RADAR_LABELS = ['Score', 'Popularity', 'Favourites', 'Episodes', 'Duration', 'Completion']

function buildStatCols(t: (k: any) => string) {
  return [
    { key: 'mean_score',   label: t('mean_score') },
    { key: 'popularity',   label: t('popularity')  },
    { key: 'favourites',   label: t('favourites')  },
    { key: 'episodes',     label: t('episodes')    },
    { key: 'duration_min', label: t('duration')    },
    { key: 'status',       label: t('status')      },
    { key: 'format',       label: t('format')      },
    { key: 'season',       label: t('season')      },
  ]
}

// ── Types ─────────────────────────────────────────────────────────────────────
interface AnimeMeta {
  mean_score:   number | null
  popularity:   number | null
  favourites:   number | null
  episodes:     number | null
  duration_min: number | null
  format:       string | null
  season:       string | null
  season_year:  number | null
  start_date:   string | null
  end_date:     string | null
}

interface AnimeEntry {
  id:        number
  title:     string
  studio:    string | null
  cover_url: string | null
  status:    string | null
  anime_meta: AnimeMeta | null
}

interface SearchResult {
  id:        number
  title:     string
  cover_url: string | null
  studio:    string | null
}

// ── Percentile helpers ────────────────────────────────────────────────────────
function toPercentile(value: number | null, allValues: number[], invert = false): number {
  if (value == null) return 0
  const sorted = [...allValues].sort((a, b) => a - b)
  const rank   = sorted.filter(v => v <= value).length
  const pct    = (rank / sorted.length) * 100
  return invert ? 100 - pct : pct
}

function fmtStat(key: string, val: any): string {
  if (val == null || val === '') return '—'
  if (key === 'mean_score')   return String(val)
  if (key === 'popularity')   return Number(val).toLocaleString()
  if (key === 'favourites')   return Number(val).toLocaleString()
  if (key === 'episodes')     return String(val)
  if (key === 'duration_min') return `${val} min`
  if (key === 'season')       return val
  if (key === 'format')       return val
  if (key === 'status')       return String(val).toUpperCase()
  return String(val)
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function ComparePage() {
  const { t } = useLocale()
  const STAT_COLS = buildStatCols(t)
  const [query,        setQuery]        = useState('')
  const [searchResults,setSearchResults]= useState<SearchResult[]>([])
  const [searching,    setSearching]    = useState(false)
  const [selected,     setSelected]     = useState<AnimeEntry[]>([])
  const [allMeta,      setAllMeta]      = useState<AnimeMeta[]>([])
  const [isDark,       setIsDark]       = useState(false)
  const [showDropdown, setShowDropdown] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Dark mode
  useEffect(() => {
    const update = () => setIsDark(document.documentElement.classList.contains('dark'))
    update()
    const obs = new MutationObserver(update)
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => obs.disconnect()
  }, [])

  // Fetch all anime_meta for percentile baselines
  useEffect(() => {
    fetchCompareAllMeta().then((data) => { if (data) setAllMeta(data as AnimeMeta[]) })
  }, [])

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!dropdownRef.current?.contains(e.target as Node)) setShowDropdown(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Debounced search
  useEffect(() => {
    if (!query.trim()) { setSearchResults([]); setShowDropdown(false); return }
    const timer = setTimeout(async () => {
      setSearching(true)
      const data = await fetchCompareSearch(query)
      setSearchResults(data)
      setShowDropdown(true)
      setSearching(false)
    }, 300)
    return () => clearTimeout(timer)
  }, [query])

  async function addSeries(result: SearchResult) {
    if (selected.length >= 4) return
    if (selected.find(s => s.id === result.id)) return
    setQuery('')
    setShowDropdown(false)

    const data = await fetchCompareSeriesDetails(result.id)

    if (data) {
      setSelected(prev => [...prev, data])
    }
  }

  function removeSeries(id: number) {
    setSelected(prev => prev.filter(s => s.id !== id))
  }

  // Percentile baselines
  const allScores = allMeta.map(m => m.mean_score   ?? 0).filter(Boolean)
  const allPop    = allMeta.map(m => m.popularity   ?? 0).filter(Boolean)
  const allFavs   = allMeta.map(m => m.favourites   ?? 0).filter(Boolean)
  const allEps    = allMeta.map(m => m.episodes     ?? 0).filter(Boolean)
  const allDur    = allMeta.map(m => m.duration_min ?? 0).filter(Boolean)

  function getRadarValues(entry: AnimeEntry): number[] {
    const m = entry.anime_meta
    return [
      toPercentile(m?.mean_score   ?? null, allScores),
      toPercentile(m?.popularity   ?? null, allPop, true),
      toPercentile(m?.favourites   ?? null, allFavs),
      toPercentile(m?.episodes     ?? null, allEps),
      toPercentile(m?.duration_min ?? null, allDur),
      m?.end_date ? 100 : m?.start_date ? 50 : 0,
    ]
  }

  const gridColor  = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'
  const labelColor = isDark ? 'rgba(148,163,184,1)'    : 'rgba(71,85,105,1)'

  const radarData = {
    labels: RADAR_LABELS,
    datasets: selected.map((entry, i) => {
      const c = SERIES_COLORS[i]
      return {
        label:                entry.title,
        data:                 getRadarValues(entry),
        backgroundColor:      c.fill,
        borderColor:          c.line,
        borderWidth:          2,
        pointBackgroundColor: c.line,
        pointBorderColor:     isDark ? '#0f172a' : '#fff',
        pointRadius:          5,
        pointHoverRadius:     7,
      }
    }),
  }

  const radarOptions = {
    responsive:          true,
    maintainAspectRatio: false,
    scales: {
      r: {
        min: 0, max: 100,
        angleLines: { color: gridColor },
        grid:       { color: gridColor },
        pointLabels: { color: labelColor, font: { size: 13, weight: 600 as any } },
        ticks: {
          display:       true,
          stepSize:      25,
          color:         isDark ? 'rgba(148,163,184,0.5)' : 'rgba(100,116,139,0.5)',
          backdropColor: 'transparent',
          font:          { size: 9 },
        },
      },
    },
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx: any) => ` ${ctx.dataset.label}: ${ctx.parsed.r.toFixed(1)}th pct`,
        },
        backgroundColor: isDark ? 'rgba(15,23,42,0.96)' : 'rgba(255,255,255,0.97)',
        titleColor:      isDark ? '#f8fafc' : '#0f172a',
        bodyColor:       isDark ? '#94a3b8' : '#475569',
        borderColor:     isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)',
        borderWidth: 1, padding: 10,
      },
    },
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--background)' }}>
      <div className="max-w-5xl mx-auto px-4 py-8">

        {/* ── Header ── */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold mb-1 flex items-center gap-2" style={{ color: 'var(--foreground)' }}>
              <GitCompare className="w-8 h-8 text-primary-500" />
              {t('compare_title')}
            </h1>
            <p className="text-sm" style={{ color: 'var(--foreground-secondary)' }}>
              {t('compare_subtitle')}
            </p>
          </div>
        </div>

        {/* ── Search input ── */}
        <div className="relative mb-6" ref={dropdownRef}>
          <div
            className="flex items-center gap-3 rounded-xl px-4 py-3"
            style={{ background: 'var(--glass-bg)', border: '1px solid var(--card-border)' }}
          >
            {searching
              ? <Loader2 className="w-5 h-5 animate-spin flex-shrink-0" style={{ color: 'var(--foreground-muted)' }} />
              : <Search className="w-5 h-5 flex-shrink-0" style={{ color: 'var(--foreground-muted)' }} />
            }
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              onFocus={() => searchResults.length > 0 && setShowDropdown(true)}
              placeholder={t('compare_placeholder')}
              className="flex-1 bg-transparent outline-none text-base"
              style={{ color: 'var(--foreground)' }}
              disabled={selected.length >= 4}
            />
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors"
              style={{ background: selected.length < 4 ? '#6366f1' : 'var(--background-secondary)' }}
            >
              <Plus className="w-4 h-4 text-white" />
            </div>
          </div>

          {/* Dropdown results */}
          {showDropdown && searchResults.length > 0 && (
            <div
              className="absolute left-0 right-0 top-full mt-2 rounded-xl overflow-hidden z-50 shadow-2xl"
              style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}
            >
              {searchResults.map(r => (
                <button
                  key={r.id}
                  onClick={() => addSeries(r)}
                  disabled={!!selected.find(s => s.id === r.id) || selected.length >= 4}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors"
                  style={{
                    borderBottom: '1px solid var(--card-border)',
                    opacity: (selected.find(s => s.id === r.id) || selected.length >= 4) ? 0.4 : 1,
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--background-secondary)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  {r.cover_url && (
                    <img src={r.cover_url} alt="" className="w-8 h-11 object-cover rounded flex-shrink-0" />
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate" style={{ color: 'var(--foreground)' }}>{r.title}</p>
                    {r.studio && <p className="text-xs truncate" style={{ color: 'var(--foreground-muted)' }}>{r.studio}</p>}
                  </div>
                  {selected.find(s => s.id === r.id) && (
                    <span className="ml-auto text-xs text-primary-400 flex-shrink-0">{t('compare_added')}</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {selected.length === 0 ? (
          /* ── Empty state ── */
          <div
            className="rounded-2xl flex flex-col items-center justify-center py-24 text-center"
            style={{ background: 'var(--glass-bg)', border: '1px solid var(--card-border)' }}
          >
            <GitCompare className="w-12 h-12 mb-4" style={{ color: 'var(--foreground-muted)' }} />
            <p className="text-lg font-semibold mb-1" style={{ color: 'var(--foreground)' }}>{t('compare_empty')}</p>
            <p className="text-sm" style={{ color: 'var(--foreground-muted)' }}>{t('compare_empty_sub')}</p>
          </div>
        ) : (
          <>
            {/* ── Stats table ── */}
            <div
              className="rounded-2xl overflow-hidden mb-6"
              style={{ background: 'var(--glass-bg)', border: '1px solid var(--card-border)' }}
            >
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--card-border)' }}>
                      <th className="text-left px-5 py-3 font-semibold italic" style={{ color: 'var(--foreground-muted)', minWidth: 160 }}>
                        {t('percentiles')}
                      </th>
                      {STAT_COLS.map(c => (
                        <th key={c.key} className="px-4 py-3 font-semibold text-center whitespace-nowrap" style={{ color: 'var(--foreground-muted)' }}>
                          {c.label}
                        </th>
                      ))}
                      <th className="w-8" />
                    </tr>
                  </thead>
                  <tbody>
                    {selected.map((entry, i) => {
                      const m   = entry.anime_meta
                      const col = SERIES_COLORS[i]
                      const vals: Record<string, any> = {
                        mean_score:   m?.mean_score,
                        popularity:   m?.popularity,
                        favourites:   m?.favourites,
                        episodes:     m?.episodes,
                        duration_min: m?.duration_min,
                        format:       m?.format,
                        status:       entry.status,
                        season:       m?.season ? `${m.season} ${m.season_year ?? ''}`.trim() : null,
                      }
                      const pcts: Record<string, number> = {
                        mean_score:   toPercentile(m?.mean_score   ?? null, allScores),
                        popularity:   toPercentile(m?.popularity   ?? null, allPop, true),
                        favourites:   toPercentile(m?.favourites   ?? null, allFavs),
                        episodes:     toPercentile(m?.episodes     ?? null, allEps),
                        duration_min: toPercentile(m?.duration_min ?? null, allDur),
                      }

                      return (
                        <tr key={entry.id} style={{ borderBottom: '1px solid var(--card-border)' }}>
                          <td className="px-5 py-4">
                            <div className="flex items-center gap-3">
                              {entry.cover_url && (
                                <img src={entry.cover_url} alt="" className="w-7 h-10 object-cover rounded flex-shrink-0" />
                              )}
                              <div className="min-w-0">
                                <Link href={`/content/${entry.id}`}>
                                  <p className="font-bold text-sm truncate hover:underline" style={{ color: col.text }}>
                                    {entry.title}
                                  </p>
                                </Link>
                                {entry.studio && (
                                  <p className="text-xs truncate" style={{ color: 'var(--foreground-muted)' }}>{entry.studio}</p>
                                )}
                              </div>
                            </div>
                          </td>

                          {STAT_COLS.map(c => {
                            const isNumeric = c.key in pcts
                            const pct       = pcts[c.key] ?? 50
                            const cellColor = isNumeric
                              ? pct >= 75 ? col.text : pct >= 40 ? 'var(--foreground)' : 'var(--foreground-muted)'
                              : 'var(--foreground)'
                            return (
                              <td key={c.key} className="px-4 py-4 text-center">
                                <span className="font-semibold text-sm" style={{ color: cellColor }}>
                                  {fmtStat(c.key, vals[c.key])}
                                </span>
                              </td>
                            )
                          })}

                          <td className="pr-4 text-center">
                            <button
                              onClick={() => removeSeries(entry.id)}
                              className="text-sm transition-colors hover:text-red-400"
                              style={{ color: 'var(--foreground-muted)' }}
                            >
                              ×
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* ── Radar chart ── */}
            <div
              className="rounded-2xl p-6"
              style={{ background: 'var(--glass-bg)', border: '1px solid var(--card-border)' }}
            >
              <div className="flex flex-wrap items-center justify-center gap-6 mb-6">
                {selected.map((entry, i) => (
                  <div key={entry.id} className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full" style={{ background: SERIES_COLORS[i].line }} />
                    <span className="text-sm font-medium" style={{ color: SERIES_COLORS[i].text }}>
                      {entry.title.length > 30 ? entry.title.slice(0, 30) + '…' : entry.title}
                    </span>
                  </div>
                ))}
              </div>

              <div style={{ height: 420 }}>
                <Radar data={radarData} options={radarOptions as any} />
              </div>

              <p className="text-center text-xs mt-4" style={{ color: 'var(--foreground-muted)' }}>
                {t('radar_note')}
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
