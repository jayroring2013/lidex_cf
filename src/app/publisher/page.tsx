'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { Loader2, AlertTriangle, RefreshCw } from 'lucide-react'
import {
  PublisherFocusView,
  LNRow,
  VolumeReleaseRow,
  PublisherLogoMap,
  Card,
} from '@/components/PublisherFocusView'
type RawRankingRow = any
import { useLocale } from '@/contexts/LocaleContext'

function num(v: unknown, fallback = 0) {
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

function mapRows(raw: RawRankingRow[]): LNRow[] {
  return raw.map((r, idx) => {
    const volumes = Math.max(0, num(r.number_of_volumes, 0))
    const score = num(r.ln_score, 0)
    const dropPct = num(r.drop_percent, 0)
    const title = r.series_title || 'Untitled'
    const key = r.series_code || `id-${r.id}`

    const releasePaceScore = Math.max(0, Math.min(10, (score * 0.4) + (volumes * 0.2)))
    const catchUpScore = Math.max(0, Math.min(10, 10 - (dropPct / 10)))
    const demandScore = Math.max(0, Math.min(10, score))
    const publisherSupportScore = Math.max(0, Math.min(10, num(r.publisher_releases_last_24m, 0)))
    const completionSafetyScore = Math.max(0, Math.min(10, 10 - (dropPct / 10)))
    const momentumScore = Math.max(0, Math.min(10, score))

    return {
      raw_rank: idx + 1,
      source_row_id: r.id,
      series_key: key,
      series_title: title,
      series_id: r.series_id,
      lidex_series_id: r.lidex_series_id,
      series_code: r.series_code,
      number_of_volumes: volumes,
      average_price: num(r.average_price, 0),
      max_release_at: r.max_release_at,
      average_view_count: num(r.average_view_count, 0),
      publisher: r.publisher,
      original_volumes: Math.max(0, num(r.original_volumes, 0)),
      original_status: r.original_status,
      evalution: r.evalution,
      evaluation_basis: r.evaluation_basis,
      ln_score: score,
      trang_thai: r.trang_thai,
      drop_percent: dropPct,
      drop_basis: r.drop_basis,
      average_gap_months: r.average_gap_months,
      months_since_last_release: r.months_since_last_release,
      completion_ratio: r.completion_ratio,
      publisher_activity: r.publisher_activity,
      publisher_releases_last_24m: num(r.publisher_releases_last_24m, 0),
      score_components: r.score_components,
      drop_components: r.drop_components,
      cover_url: r.cover_url,
      cover_source_title: r.cover_source_title,
      description: r.description || null,
      fan_vote_rank: null,
      fan_vote_votes: null,
      fan_vote_period: null,
      fan_vote_year: null,

      release_pace_score: releasePaceScore,
      catch_up_score: catchUpScore,
      demand_score: demandScore,
      publisher_support_score: publisherSupportScore,
      completion_safety_score: completionSafetyScore,
      momentum_score: momentumScore,
    }
  })
}

function publisherKey(name: string | null | undefined): string {
  if (!name) return ''
  return name.toLowerCase().trim().replace(/[^a-z0-9]/g, '')
}

function buildPublishers(rows: LNRow[], volumeRows: VolumeReleaseRow[]) {
  const map: Record<string, { publisher: string; rows: LNRow[]; volumeRows: VolumeReleaseRow[] }> = {}
  for (const r of rows) {
    const p = r.publisher || 'Unknown'
    if (!map[p]) map[p] = { publisher: p, rows: [], volumeRows: [] }
    map[p].rows.push(r)
  }
  for (const v of volumeRows) {
    const p = v.publisher || 'Unknown'
    if (!map[p]) map[p] = { publisher: p, rows: [], volumeRows: [] }
    map[p].volumeRows.push(v)
  }

  const totalReleases24 = volumeRows.length || 1

  return Object.values(map).map(({ publisher, rows: pRows, volumeRows: pVols }) => {
    const releases24 = pVols.length
    const marketShare = (releases24 / totalReleases24) * 100
    return {
      publisher,
      rows: pRows,
      volumeRows: pVols,
      releases24,
      marketShare,
    }
  }).sort((a, b) => b.releases24 - a.releases24 || a.publisher.localeCompare(b.publisher))
}

export default function PublisherPage() {
  const [rows, setRows] = useState<LNRow[]>([])
  const [volumeRows, setVolumeRows] = useState<VolumeReleaseRow[]>([])
  const [publisherLogos, setPublisherLogos] = useState<PublisherLogoMap>({})
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [selectedPublisher, setSelectedPublisher] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/dashboard?mode=watchlist')
      if (!res.ok) {
        setError('Không tải được dữ liệu nhà phát hành.')
        setLoading(false)
        return
      }
      const watchlistData = await res.json()
      if (!watchlistData) {
        setError('Không tải được dữ liệu nhà phát hành.')
        setLoading(false)
        return
      }

      const { rankingRows, voteRows } = watchlistData
      const mapped = mapRows(rankingRows as RawRankingRow[])

      const latestVotesMap = new Map<number, { votes: number; rank: number | null; period: string | null; year: number | null; sort: number }>()
      for (const vote of voteRows) {
        const seriesId = vote.series_id
        const sortVal = vote.voting_periods.year * 12 + vote.voting_periods.month
        const existing = latestVotesMap.get(seriesId)
        if (!existing || sortVal > existing.sort) {
          latestVotesMap.set(seriesId, {
            votes: vote.votes,
            rank: vote.rank,
            period: vote.voting_periods.label,
            year: vote.voting_periods.year,
            sort: sortVal
          })
        }
      }

      const fanHydrated = mapped.map(row => {
        if (!row.lidex_series_id) return row
        const votes = latestVotesMap.get(row.lidex_series_id)
        if (!votes) return row
        return {
          ...row,
          fan_vote_rank: votes.rank,
          fan_vote_votes: votes.votes,
          fan_vote_period: votes.period,
          fan_vote_year: votes.year
        }
      })

      setRows(fanHydrated)
      setSelectedKey((fanHydrated.find(r => r.evalution === 'Good') || fanHydrated[0])?.series_key || null)

      fetch('/api/dashboard?mode=stats')
        .then(async (statsRes) => {
          if (!statsRes.ok) return
          const statsData = await statsRes.json()
          if (!statsData) return

          const { volumeRows, publisherRows } = statsData
          const volumeReleases = (volumeRows as any[])
            .filter((v: any) => v.is_special === false || String(v.is_special).toLowerCase() !== 'true')
            .map((v: any) => ({
              series_id: v.series_id,
              publisher: v.publisher || 'Unknown',
              release_date: String(v.release_date).slice(0, 10)
            }))

          const logos: PublisherLogoMap = {}
          for (const row of publisherRows) {
            if (!row.logo_url) continue
            if (row.name) logos[publisherKey(row.name)] = row.logo_url
            if (row.name_vi) logos[publisherKey(row.name_vi)] = row.logo_url
          }

          setVolumeRows(volumeReleases)
          setPublisherLogos(logos)
          setSelectedPublisher(null)
          setLoading(false)
        })
        .catch(err => {
          console.warn('[PublisherPage] stats load failed:', err)
          setLoading(false)
        })

    } catch (e) {
      console.error('[PublisherPage] load failed:', e)
      setError('Không tải được dữ liệu nhà phát hành.')
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  return (
    <div className="min-h-screen relative overflow-hidden" style={{ background: 'var(--background)' }}>
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-40 left-20 w-96 h-96 rounded-full blur-3xl" style={{ background: 'rgba(124,106,245,.10)' }} />
        <div className="absolute top-48 right-0 w-96 h-96 rounded-full blur-3xl" style={{ background: 'rgba(236,72,153,.07)' }} />
      </div>

      <div className="relative max-w-[1440px] mx-auto px-3 sm:px-4 lg:px-6 py-4 sm:py-5">
        <div className="flex items-center justify-between gap-2 mb-4">
          <h1 className="text-xl sm:text-2xl font-black" style={{ color: 'var(--foreground)' }}>Nhà phát hành</h1>
          <button onClick={load} className="p-1.5 rounded-lg transition-all hover:scale-110" style={{ background: 'var(--glass-bg)', border: '1px solid var(--card-border)' }} title="Làm mới">
            <RefreshCw className="w-4 h-4" style={{ color: 'var(--foreground-secondary)' }} />
          </button>
        </div>

        {loading ? (
          <div className="h-[60vh] flex items-center justify-center">
            <div className="flex items-center gap-3 text-sm" style={{ color: 'var(--foreground-secondary)' }}>
              <Loader2 className="w-5 h-5 animate-spin" />
              Đang tải thông tin nhà phát hành...
            </div>
          </div>
        ) : error ? (
          <Card className="p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 mt-0.5" style={{ color: '#f59e0b' }} />
              <div>
                <p className="font-bold" style={{ color: 'var(--foreground)' }}>Không tải được dữ liệu nhà phát hành</p>
                <p className="text-sm mt-1" style={{ color: 'var(--foreground-secondary)' }}>{error}</p>
              </div>
            </div>
          </Card>
        ) : (
          <PublisherFocusView
            rows={rows}
            volumeRows={volumeRows}
            publisherLogos={publisherLogos}
            selectedPublisher={selectedPublisher}
            setSelectedPublisher={setSelectedPublisher}
            selectedKey={selectedKey}
            onSelectSeries={(row) => setSelectedKey(row.series_key)}
            vi={true}
          />
        )}
      </div>
    </div>
  )
}
