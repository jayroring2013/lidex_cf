'use server'

import { sql } from './neonClient'
import { proxyImg } from './imageProxy'
import { calculateLiDexScore, buildPopulationStats } from './lidexScore'



function normalizeDbDate(value: any): string | null {
  if (!value) return null

  let date: Date | null = null
  if (value instanceof Date) {
    date = value
  } else {
    const raw = String(value).trim()
    if (!raw) return null

    const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (iso) return iso[0]

    const dmy = raw.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/)
    if (dmy) {
      const [, day, month, year] = dmy
      return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
    }

    date = new Date(raw)
  }

  if (!date || Number.isNaN(date.getTime())) return null
  return date.toISOString().slice(0, 10)
}

// ============================================
// SITE STATS
// ============================================
export async function getSiteStats() {
  try {
    const [animeCount, mangaCount, novelCount] = await Promise.all([
      sql(`
        SELECT COUNT(*)::int as count 
        FROM series s 
        JOIN anime_meta a ON s.id = a.series_id 
        WHERE s.item_type = 'anime' AND a.season_year = 2026 AND NOT ('Hentai' = ANY(s.genres))
      `),
      sql(`
        SELECT COUNT(*)::int as count 
        FROM series 
        WHERE item_type = 'manga' AND NOT ('Hentai' = ANY(genres))
      `),
      sql(`
        SELECT COUNT(*)::int as count 
        FROM series 
        WHERE item_type = 'novel' AND NOT ('Hentai' = ANY(genres))
      `)
    ])

    const totalAnime = animeCount[0]?.count ?? 0
    const totalManga = mangaCount[0]?.count ?? 0
    const totalNovels = novelCount[0]?.count ?? 0

    return {
      totalSeries: totalAnime + totalManga + totalNovels,
      totalAnime,
      totalManga,
      totalNovels,
      totalVotes: 0,
    }
  } catch (error) {
    console.error('Failed to get stats:', error)
    return { totalSeries: 0, totalAnime: 0, totalManga: 0, totalNovels: 0, totalVotes: 0 }
  }
}

// ============================================
// TRENDING SERIES
// ============================================
export async function getTrendingSeries({ limit = 10 } = {}) {
  try {
    const rows = await sql(`
      SELECT 
        a.series_id, a.trending, a.mean_score, a.popularity, a.format, a.episodes, a.season, a.season_year,
        s.id, s.title, s.title_vi, s.title_native, s.slug, s.cover_url, s.banner_url, s.status, s.genres, s.item_type
      FROM anime_meta a
      JOIN series s ON a.series_id = s.id
      WHERE a.trending IS NOT NULL AND NOT ('Hentai' = ANY(s.genres))
      ORDER BY a.trending ASC
      LIMIT $1
    `, [limit])

    const flat = rows.map(r => ({
      id: r.id,
      title: r.title,
      title_vi: r.title_vi,
      title_native: r.title_native,
      slug: r.slug,
      cover_url: proxyImg(r.cover_url),
      banner_url: r.banner_url,
      status: r.status,
      genres: r.genres,
      item_type: r.item_type,
      anime_trending: r.trending,
      anime_mean_score: r.mean_score,
      anime_popularity: r.popularity,
      anime_format: r.format,
      anime_episodes: r.episodes,
      anime_season: r.season,
      anime_season_year: r.season_year,
    }))

    return { data: flat, error: null }
  } catch (error) {
    console.error('Failed to get trending:', error)
    return { data: [], error }
  }
}

// ============================================
// TOP RATED SERIES
// ============================================
export async function getTopRatedSeries({ limit = 10 } = {}) {
  try {
    const rows = await sql(`
      SELECT 
        a.series_id, a.mean_score, a.average_score, a.popularity, a.favourites, a.format, a.episodes,
        s.id, s.title, s.title_vi, s.title_native, s.slug, s.cover_url, s.banner_url, s.status, s.genres, s.item_type
      FROM anime_meta a
      JOIN series s ON a.series_id = s.id
      WHERE a.season_year = 2026 AND a.mean_score IS NOT NULL AND NOT ('Hentai' = ANY(s.genres))
      ORDER BY a.mean_score DESC
      LIMIT $1
    `, [limit])

    const flat = rows.map(r => ({
      id: r.id,
      title: r.title,
      title_vi: r.title_vi,
      title_native: r.title_native,
      slug: r.slug,
      cover_url: proxyImg(r.cover_url),
      banner_url: r.banner_url,
      status: r.status,
      genres: r.genres,
      item_type: r.item_type,
      anime_mean_score: r.mean_score,
      anime_average_score: r.average_score,
      anime_popularity: r.popularity,
      anime_favourites: r.favourites,
      anime_format: r.format,
      anime_episodes: r.episodes,
    }))

    return { data: flat, error: null }
  } catch (error) {
    console.error('Failed to get top rated:', error)
    return { data: [], error }
  }
}

// ============================================
// SERIES COUNT BY TYPE
// ============================================
export async function getSeriesCountByType() {
  try {
    const [anime, manga, novel] = await Promise.all([
      sql(`
        SELECT COUNT(*)::int as count 
        FROM series s 
        JOIN anime_meta a ON s.id = a.series_id 
        WHERE s.item_type = 'anime' AND a.season_year = 2026 AND NOT ('Hentai' = ANY(s.genres))
      `),
      sql(`
        SELECT COUNT(*)::int as count 
        FROM series 
        WHERE item_type = 'manga' AND NOT ('Hentai' = ANY(genres))
      `),
      sql(`
        SELECT COUNT(*)::int as count 
        FROM series 
        WHERE item_type = 'novel' AND NOT ('Hentai' = ANY(genres))
      `),
    ])
    return {
      data: [anime[0]?.count ?? 0, manga[0]?.count ?? 0, novel[0]?.count ?? 0],
      error: null,
    }
  } catch (error) {
    console.error('Failed to get type distribution:', error)
    return { data: [0, 0, 0], error }
  }
}

// ============================================
// RECENT ACTIVITY
// ============================================
export async function getRecentActivity({ limit = 10 } = {}) {
  try {
    const rows = await sql(`
      SELECT 
        ss.id as snapshot_id, ss.week_start, ss.aired_episode,
        s.id, s.title, s.item_type, s.cover_url, s.slug
      FROM stat_snapshots ss
      JOIN series s ON ss.series_id = s.id
      ORDER BY ss.week_start DESC
      LIMIT $1
    `, [limit])

    const activities = rows.map(r => ({
      type: 'snapshot',
      series: {
        id: r.id,
        title: r.title,
        item_type: r.item_type,
        cover_url: proxyImg(r.cover_url),
        slug: r.slug,
      },
      week_start: r.week_start,
      episode: r.aired_episode,
    }))

    return { data: activities, error: null }
  } catch (error) {
    console.error('Failed to get activity:', error)
    return { data: [], error }
  }
}

// ============================================
// RELEASE SCHEDULE
// ============================================
export async function getReleaseSchedule({ limit = 10 } = {}) {
  try {
    const today = new Date().toISOString().split('T')[0] // YYYY-MM-DD

    const rows = await sql(`
      SELECT 
        v.id as volume_id, v.volume_number, v.title as volume_title, v.release_date, v.price, v.currency, v.cover_url as volume_cover_url, v.is_special, v.is_digital, v.translator,
        s.id as series_id, s.title as series_title, s.title_vi as series_title_vi, s.item_type as series_item_type, s.cover_url as series_cover_url, s.slug as series_slug,
        p.id as publisher_id, p.name as publisher_name
      FROM volumes v
      JOIN series s ON v.series_id = s.id
      LEFT JOIN publishers p ON v.publisher_id = p.id
      WHERE v.release_date >= $1 AND v.is_special = false
      ORDER BY v.release_date ASC
      LIMIT $2
    `, [today, limit])

    const mapped = rows.map(r => ({
      id: r.volume_id,
      volume_number: r.volume_number,
      title: r.volume_title,
      release_date: normalizeDbDate(r.release_date),
      price: r.price == null ? null : Number(r.price),
      currency: r.currency,
      cover_url: proxyImg(r.volume_cover_url),
      is_special: r.is_special,
      is_digital: r.is_digital,
      translator: r.translator,
      series: {
        id: r.series_id,
        title: r.series_title,
        title_vi: r.series_title_vi,
        item_type: r.series_item_type,
        cover_url: proxyImg(r.series_cover_url),
        slug: r.series_slug,
      },
      publishers: r.publisher_id ? {
        id: r.publisher_id,
        name: r.publisher_name,
      } : null,
    }))

    return { data: mapped, error: null }
  } catch (error) {
    console.error('Failed to get releases:', error)
    return { data: [], error }
  }
}

// ============================================
// SERIES BY ID
// ============================================
export async function getSeriesById(id: number) {
  try {
    const rows = await sql(`SELECT * FROM series WHERE id = $1`, [id])
    if (rows.length === 0) return { data: null, error: new Error('Series not found') }
    return { data: rows[0], error: null }
  } catch (error) {
    console.error('Failed to get series:', error)
    return { data: null, error }
  }
}

// ============================================
// VOTE STATS & SUBMIT VOTE (STUBS)
// ============================================
export async function getVoteStats() {
  return { data: { labels: [], values: [] }, error: null }
}
export async function getVoteCount() {
  return 0
}
export async function submitVote() {
  return { data: null, error: new Error('Voting feature not yet available') }
}

// ============================================
// FETCH LATEST VOLUME COVERS
// ============================================
export async function fetchLatestVolCovers(ids: number[]) {
  if (!ids.length) return {}
  try {
    const rows = await sql(`
      SELECT series_id, cover_url 
      FROM (
        SELECT series_id, cover_url, ROW_NUMBER() OVER(PARTITION BY series_id ORDER BY volume_number DESC) as rn
        FROM volumes
        WHERE series_id = ANY($1) AND is_special = false AND cover_url IS NOT NULL
      ) t
      WHERE rn = 1
    `, [ids])

    const map: Record<number, string | null> = {}
    for (const r of rows) {
      map[Number(r.series_id)] = proxyImg(r.cover_url)
    }
    return map
  } catch (error) {
    console.error('Failed to fetch latest volume covers:', error)
    return {}
  }
}

// ============================================
// FETCH LATEST VOTING NOVELS (FOR CAROUSEL)
// ============================================
export async function fetchLatestVotingNovels() {
  try {
    const rows = await sql(`
      SELECT vr.series_id, vr.votes, s.title, s.cover_url
      FROM voting_results vr
      JOIN series s ON vr.series_id = s.id
      WHERE vr.period_id = (
        SELECT id FROM voting_periods 
        ORDER BY year DESC, month DESC 
        LIMIT 1
      ) AND s.item_type = 'novel' AND s.cover_url IS NOT NULL AND NOT ('Hentai' = ANY(s.genres))
      ORDER BY vr.rank ASC, vr.votes DESC
      LIMIT 10
    `)

    return rows.map((r: any) => ({
      id: r.series_id,
      title: r.title,
      cover_url: proxyImg(r.cover_url),
      score: Number(r.votes) || null,
      href: `/content/${r.series_id}`,
    }))
  } catch (error) {
    console.error('Failed to fetch voting novels:', error)
    return []
  }
}

// ============================================
// BROWSE SERIES
// ============================================
export async function fetchBrowseSeries({
  type,
  search,
  status,
  genre,
  sort,
  offset,
  limit
}: {
  type: string
  search?: string
  status?: string
  genre?: string
  sort?: string
  offset: number
  limit: number
}) {
  try {
    let query = ''
    let params: any[] = []

    if (type === 'anime') {
      query = `
        SELECT s.id, s.title, s.cover_url, s.status, s.studio, s.genres, s.item_type, s.updated_at,
               a.mean_score, a.popularity, a.format, a.season_year
        FROM series s
        JOIN anime_meta a ON s.id = a.series_id
        WHERE s.item_type = 'anime' AND a.season_year = 2026 AND NOT ('Hentai' = ANY(s.genres))
      `
      let paramIndex = 1
      if (search) {
        query += ` AND s.title ILIKE $${paramIndex}`
        params.push(`%${search}%`)
        paramIndex++
      }
      if (status && status !== 'all') {
        query += ` AND s.status ILIKE $${paramIndex}`
        params.push(status)
        paramIndex++
      }
      if (sort === 'score_desc') {
        query += ` ORDER BY a.mean_score DESC NULLS LAST`
      } else if (sort === 'popular_desc') {
        query += ` ORDER BY a.popularity DESC NULLS LAST`
      } else if (sort === 'year_desc') {
        query += ` ORDER BY s.updated_at DESC NULLS LAST`
      } else {
        query += ` ORDER BY s.title ASC`
      }
      query += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`
      params.push(limit, offset)
    } else {
      query = `
        SELECT s.id, s.title, s.cover_url, s.status, s.genres, s.item_type, s.updated_at
        FROM series s
        WHERE s.item_type = $1 AND NOT ('Hentai' = ANY(s.genres))
      `
      params.push(type)
      let paramIndex = 2
      if (search) {
        query += ` AND s.title ILIKE $${paramIndex}`
        params.push(`%${search}%`)
        paramIndex++
      }
      if (status && status !== 'all') {
        query += ` AND s.status ILIKE $${paramIndex}`
        params.push(status)
        paramIndex++
      }
      if (genre && genre !== 'all') {
        query += ` AND $${paramIndex} = ANY(s.genres)`
        params.push(genre)
        paramIndex++
      }
      if (sort === 'year_desc') {
        query += ` ORDER BY s.updated_at DESC`
      } else {
        query += ` ORDER BY s.title ASC`
      }
      query += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`
      params.push(limit, offset)
    }

    const rows = await sql(query, params)
    return rows.map((r: any) => ({
      ...r,
      cover_url: proxyImg(r.cover_url)
    }))
  } catch (error) {
    console.error('Failed to fetch browse series:', error)
    return []
  }
}

// ============================================
// LEADERBOARD
// ============================================
export async function fetchLeaderboardPeriods() {
  try {
    const rows = await sql(`
      SELECT id, month, year, label 
      FROM voting_periods 
      ORDER BY year DESC, month DESC
    `)
    return rows.map((r: any) => ({
      id: Number(r.id),
      month: Number(r.month),
      year: Number(r.year),
      label: r.label,
    }))
  } catch (error) {
    console.error('Failed to fetch leaderboard periods:', error)
    return []
  }
}

export async function fetchLeaderboardRows(periodIds: number[]) {
  if (!periodIds.length) return []
  try {
    const rows = await sql(`
      SELECT vr.id, vr.series_id, vr.period_id, vr.votes, vr.rank,
             s.title, s.title_vi, s.cover_url
      FROM voting_results vr
      JOIN series s ON vr.series_id = s.id
      WHERE vr.period_id = ANY($1)
      ORDER BY vr.rank ASC
      LIMIT 1000
    `, [periodIds])

    return rows.map((r: any) => ({
      id: Number(r.id),
      series_id: Number(r.series_id),
      period_id: Number(r.period_id),
      votes: Number(r.votes),
      rank: r.rank == null ? null : Number(r.rank),
      title: r.title,
      title_vi: r.title_vi,
      cover_url: proxyImg(r.cover_url),
    }))
  } catch (error) {
    console.error('Failed to fetch leaderboard rows:', error)
    return []
  }
}

export async function fetchLeaderboardPublishers(seriesIds: number[]) {
  if (!seriesIds.length) return []
  try {
    const rows = await sql(`
      SELECT lidex_series_id, publisher 
      FROM ln_series_ranking 
      WHERE lidex_series_id = ANY($1)
    `, [seriesIds])
    
    const map: Record<number, string> = {}
    for (const r of rows) {
      map[Number(r.lidex_series_id)] = r.publisher || '-'
    }
    return map
  } catch (error) {
    console.error('Failed to fetch leaderboard publishers:', error)
    return {}
  }
}

// ============================================
// COMPARE
// ============================================
export async function fetchCompareAllMeta() {
  try {
    const rows = await sql(`
      SELECT mean_score, popularity, favourites, episodes, duration_min 
      FROM anime_meta
      WHERE mean_score IS NOT NULL
    `)
    return rows.map((r: any) => ({
      mean_score: r.mean_score == null ? null : Number(r.mean_score),
      popularity: r.popularity == null ? null : Number(r.popularity),
      favourites: r.favourites == null ? null : Number(r.favourites),
      episodes: r.episodes == null ? null : Number(r.episodes),
      duration_min: r.duration_min == null ? null : Number(r.duration_min),
    }))
  } catch (error) {
    console.error('Failed to fetch compare meta:', error)
    return []
  }
}

export async function fetchCompareSearch(query: string) {
  try {
    const rows = await sql(`
      SELECT s.id, s.title, s.cover_url, s.studio
      FROM series s
      JOIN anime_meta a ON s.id = a.series_id
      WHERE s.item_type = 'anime' AND a.season_year = 2026 AND s.title ILIKE $1
      LIMIT 8
    `, [`%${query}%`])

    return rows.map((r: any) => ({
      id: Number(r.id),
      title: r.title,
      cover_url: proxyImg(r.cover_url),
      studio: r.studio,
    }))
  } catch (error) {
    console.error('Failed compare search:', error)
    return []
  }
}

export async function fetchCompareSeriesDetails(id: number) {
  try {
    const seriesRows = await sql(`SELECT * FROM series WHERE id = $1`, [id])
    if (!seriesRows.length) return null
    const s = seriesRows[0]

    let anime_meta = null
    if (s.item_type === 'anime') {
      const metaRows = await sql(`SELECT * FROM anime_meta WHERE series_id = $1`, [id])
      if (metaRows.length) anime_meta = metaRows[0]
    }

    return {
      id: Number(s.id),
      title: s.title,
      studio: s.studio,
      cover_url: proxyImg(s.cover_url),
      status: s.status,
      anime_meta: anime_meta ? {
        mean_score: anime_meta.mean_score == null ? null : Number(anime_meta.mean_score),
        popularity: anime_meta.popularity == null ? null : Number(anime_meta.popularity),
        favourites: anime_meta.favourites == null ? null : Number(anime_meta.favourites),
        episodes: anime_meta.episodes == null ? null : Number(anime_meta.episodes),
        duration_min: anime_meta.duration_min == null ? null : Number(anime_meta.duration_min),
        season: anime_meta.season,
        season_year: anime_meta.season_year == null ? null : Number(anime_meta.season_year),
        format: anime_meta.format,
        start_date: anime_meta.start_date || null,
        end_date: anime_meta.end_date || null,
      } : null,
    }
  } catch (error) {
    console.error('Failed compare series details:', error)
    return null
  }
}

export async function fetchCompareSnapshots(ids: number[]) {
  if (!ids.length) return []
  try {
    const rows = await sql(`
      SELECT series_id, week_start, aired_episode, payload 
      FROM stat_snapshots 
      WHERE series_id = ANY($1)
      ORDER BY week_start ASC
    `, [ids])
    return rows.map((r: any) => ({
      series_id: Number(r.series_id),
      week_start: r.week_start,
      aired_episode: r.aired_episode,
      payload: typeof r.payload === 'string' ? JSON.parse(r.payload) : r.payload,
    }))
  } catch (error) {
    console.error('Failed fetch compare snapshots:', error)
    return []
  }
}

// ============================================
// CHARTS
// ============================================
export async function fetchChartSnapshots(seriesId: number) {
  try {
    const rows = await sql(`
      SELECT week_start, aired_episode, payload 
      FROM stat_snapshots 
      WHERE series_id = $1
      ORDER BY week_start ASC
    `, [seriesId])
    return rows.map((r: any) => ({
      week_start: r.week_start,
      aired_episode: r.aired_episode,
      payload: typeof r.payload === 'string' ? JSON.parse(r.payload) : r.payload,
    }))
  } catch (error) {
    console.error('Failed fetch chart snapshots:', error)
    return []
  }
}

export async function fetchChartNovels() {
  try {
    const rows = await sql(`
      SELECT id, title 
      FROM series 
      WHERE item_type = 'novel' AND NOT ('Hentai' = ANY(genres))
    `)
    return rows.map((r: any) => ({
      id: Number(r.id),
      title: r.title,
    }))
  } catch (error) {
    console.error('Failed fetch chart novels:', error)
    return []
  }
}

export async function fetchChartVolumes() {
  try {
    const rows = await sql(`
      SELECT series_id, cover_url, release_date 
      FROM volumes 
      WHERE is_special = false AND cover_url IS NOT NULL
    `)
    return rows.map((r: any) => ({
      series_id: Number(r.series_id),
      cover_url: proxyImg(r.cover_url),
      release_date: normalizeDbDate(r.release_date),
    }))
  } catch (error) {
    console.error('Failed fetch chart volumes:', error)
    return []
  }
}

export async function fetchChartVotes(tbl: string) {
  // Validate table name to avoid injection since table names cannot be parameterized
  if (tbl !== 'voting_results') return []
  try {
    const rows = await sql(`
      SELECT s.title, vr.votes, p.label as period
      FROM voting_results vr
      JOIN series s ON vr.series_id = s.id
      JOIN voting_periods p ON vr.period_id = p.id
      ORDER BY p.year DESC, p.month DESC, vr.votes DESC
    `)
    return rows.map((r: any) => ({
      title: r.title,
      votes: Number(r.votes),
      period: r.period,
    }))
  } catch (error) {
    console.error('Failed fetch chart votes:', error)
    return []
  }
}

// ============================================
// BOARD (DASHBOARD) CODES
// ============================================
export async function fetchBoardStats() {
  try {
    const [anime, novel, manga] = await Promise.all([
      sql(`
        SELECT COUNT(*)::int as count 
        FROM series s 
        JOIN anime_meta a ON s.id = a.series_id 
        WHERE s.item_type = 'anime' AND a.season_year = 2026 AND NOT ('Hentai' = ANY(s.genres))
      `),
      sql(`
        SELECT COUNT(*)::int as count 
        FROM series 
        WHERE item_type = 'novel' AND NOT ('Hentai' = ANY(genres))
      `),
      sql(`
        SELECT COUNT(*)::int as count 
        FROM series 
        WHERE item_type = 'manga' AND NOT ('Hentai' = ANY(genres))
      `)
    ])

    return {
      anime: anime[0]?.count ?? 0,
      novel: novel[0]?.count ?? 0,
      manga: manga[0]?.count ?? 0,
    }
  } catch (error) {
    console.error('Failed fetch board stats:', error)
    return { anime: 0, novel: 0, manga: 0 }
  }
}

export async function fetchBoardRecent(itemType: string) {
  try {
    const rows = await sql(`
      SELECT id, title, cover_url 
      FROM series 
      WHERE item_type = $1 AND cover_url IS NOT NULL AND NOT ('Hentai' = ANY(genres))
      ORDER BY updated_at DESC 
      LIMIT 10
    `, [itemType])
    return rows.map((r: any) => ({
      id: Number(r.id),
      title: r.title,
      cover_url: proxyImg(r.cover_url),
    }))
  } catch (error) {
    console.error('Failed fetch board recent:', error)
    return []
  }
}

// ============================================
// COMBINED HOME PAGE DATA FETCH
// ============================================
export async function fetchHomeData() {
  try {
    // 1. Fetch cover wall (60 series with cover_url)
    const coversRows = await sql(`
      SELECT id, title, cover_url 
      FROM series 
      WHERE cover_url IS NOT NULL AND NOT ('Hentai' = ANY(genres)) 
      LIMIT 60
    `)

    // 2. Fetch trending (3 anime, 3 manga, 3 novel)
    const [trendingAnime, trendingManga, trendingNovels] = await Promise.all([
      sql(`
        SELECT s.id, s.title, s.cover_url
        FROM anime_meta a
        JOIN series s ON a.series_id = s.id
        WHERE a.season_year = 2026 AND a.trending IS NOT NULL AND NOT ('Hentai' = ANY(s.genres))
        ORDER BY a.trending ASC
        LIMIT 3
      `),
      sql(`
        SELECT s.id, s.title, s.cover_url
        FROM manga_meta m
        JOIN series s ON m.series_id = s.id
        WHERE s.cover_url IS NOT NULL AND NOT ('Hentai' = ANY(s.genres))
        ORDER BY m.md_follows DESC NULLS LAST
        LIMIT 3
      `),
      sql(`
        SELECT s.id, s.title, s.cover_url
        FROM novel_meta n
        JOIN series s ON n.series_id = s.id
        WHERE s.cover_url IS NOT NULL AND NOT ('Hentai' = ANY(s.genres))
        ORDER BY s.updated_at DESC
        LIMIT 3
      `)
    ])

    // 3. Type counts
    const typeCounts = await getSeriesCountByType()

    // 4. Carousel data
    const topAnime = await getTopRatedSeries({ limit: 10 })
    const recentManga = await sql(`
      SELECT id, title, cover_url
      FROM series
      WHERE item_type = 'manga' AND cover_url IS NOT NULL AND NOT ('Hentai' = ANY(genres))
      ORDER BY updated_at DESC
      LIMIT 10
    `)
    const recentNovels = await sql(`
      SELECT id, title, cover_url
      FROM series
      WHERE item_type = 'novel' AND NOT ('Hentai' = ANY(genres))
      ORDER BY updated_at DESC
      LIMIT 10
    `)

    const votingNovels = await fetchLatestVotingNovels()

    // 5. Volume covers
    const mangaIds = recentManga.map((m: any) => Number(m.id))
    const novelIds = votingNovels.length > 0 
      ? votingNovels.map((n: any) => Number(n.id)) 
      : recentNovels.map((n: any) => Number(n.id))

    const [mangaVolCovers, novelVolCovers] = await Promise.all([
      fetchLatestVolCovers(mangaIds),
      fetchLatestVolCovers(novelIds),
    ])

    return {
      covers: coversRows.map(r => ({ id: r.id, title: r.title, cover_url: proxyImg(r.cover_url) })),
      trendingAnime: trendingAnime.map(r => ({ id: r.id, title: r.title, cover_url: proxyImg(r.cover_url) })),
      trendingManga: trendingManga.map(r => ({ id: r.id, title: r.title, cover_url: proxyImg(r.cover_url) })),
      trendingNovels: trendingNovels.map(r => ({ id: r.id, title: r.title, cover_url: proxyImg(r.cover_url) })),
      typeCounts: typeCounts.data || [0, 0, 0],
      topAnime: topAnime.data || [],
      recentManga: recentManga.map(r => ({ id: r.id, title: r.title, cover_url: proxyImg(r.cover_url) })),
      recentNovels: recentNovels.map(r => ({ id: r.id, title: r.title, cover_url: proxyImg(r.cover_url) })),
      votingNovels,
      mangaVolCovers,
      novelVolCovers,
    }
  } catch (error) {
    console.error('Failed fetchHomeData Server Action:', error)
    return {
      covers: [],
      trendingAnime: [],
      trendingManga: [],
      trendingNovels: [],
      typeCounts: [0, 0, 0],
      topAnime: [],
      recentManga: [],
      recentNovels: [],
      votingNovels: [],
      mangaVolCovers: {},
      novelVolCovers: {},
    }
  }
}

// ============================================
// BROWSE DISCOVERY & CARDS FETCH
// ============================================
export async function fetchBrowseDiscovery({ type }: { type: string }) {
  try {
    let popularRows: any[] = []
    let recentRows: any[] = []
    
    if (type === 'anime') {
      popularRows = await sql(`
        SELECT s.id, s.title, s.cover_url, s.status, s.studio,
               a.mean_score, a.popularity, a.season_year
        FROM series s
        JOIN anime_meta a ON s.id = a.series_id
        WHERE s.item_type = 'anime' AND a.season_year = 2026 AND s.cover_url IS NOT NULL AND NOT ('Hentai' = ANY(s.genres))
        ORDER BY a.popularity DESC NULLS LAST
        LIMIT 14
      `)
      recentRows = await sql(`
        SELECT s.id, s.title, s.cover_url, s.status, s.studio,
               a.mean_score, a.season_year
        FROM series s
        JOIN anime_meta a ON s.id = a.series_id
        WHERE s.item_type = 'anime' AND a.season_year = 2026 AND s.cover_url IS NOT NULL AND NOT ('Hentai' = ANY(s.genres))
        ORDER BY s.updated_at DESC NULLS LAST
        LIMIT 14
      `)
    } else if (type === 'manga') {
      popularRows = await sql(`
        SELECT id, title, cover_url, status, genres
        FROM series
        WHERE item_type = 'manga' AND NOT ('Hentai' = ANY(genres))
        ORDER BY updated_at DESC
        LIMIT 14
      `)
      recentRows = await sql(`
        SELECT id, title, cover_url, status, genres
        FROM series
        WHERE item_type = 'manga' AND NOT ('Hentai' = ANY(genres))
        ORDER BY created_at DESC
        LIMIT 14
      `)
    } else {
      popularRows = await sql(`
        SELECT id, title, cover_url, status, genres
        FROM series
        WHERE item_type = 'novel' AND NOT ('Hentai' = ANY(genres))
        ORDER BY updated_at DESC
        LIMIT 14
      `)
      recentRows = await sql(`
        SELECT id, title, cover_url, status, genres
        FROM series
        WHERE item_type = 'novel' AND NOT ('Hentai' = ANY(genres))
        ORDER BY created_at DESC
        LIMIT 14
      `)
    }

    // Proxy cover urls
    popularRows = popularRows.map(r => ({ ...r, cover_url: proxyImg(r.cover_url) }))
    recentRows = recentRows.map(r => ({ ...r, cover_url: proxyImg(r.cover_url) }))

    let volCovers: Record<number, string | null> = {}
    if (type !== 'anime') {
      const allIds = Array.from(new Set([
        ...popularRows.map(r => Number(r.id)),
        ...recentRows.map(r => Number(r.id))
      ]))
      volCovers = await fetchLatestVolCovers(allIds)
    }

    return { popularRows, recentRows, volCovers }
  } catch (error) {
    console.error('Failed to fetch browse discovery:', error)
    return { popularRows: [], recentRows: [], volCovers: {} }
  }
}

export async function fetchBrowseCards(params: {
  type: string
  search?: string
  status?: string
  genre?: string
  sort?: string
  offset: number
  limit: number
}) {
  try {
    const rows = await fetchBrowseSeries(params)
    
    let volCovers: Record<number, string | null> = {}
    if (params.type !== 'anime' && rows.length > 0) {
      const ids = rows.map(r => Number(r.id))
      volCovers = await fetchLatestVolCovers(ids)
    }
    
    return { rows, volCovers }
  } catch (error) {
    console.error('Failed to fetch browse cards:', error)
    return { rows: [], volCovers: {} }
  }
}

// ============================================
// CHARTS DATA
// ============================================
export async function fetchChartAnime() {
  try {
    const rows = await sql(`
      SELECT s.id, s.title, 
             a.popularity, a.favourites, a.mean_score, a.format, a.season, a.season_year, a.score_distribution
      FROM series s
      JOIN anime_meta a ON s.id = a.series_id
      WHERE s.item_type = 'anime' AND a.season_year = 2026 AND NOT ('Hentai' = ANY(s.genres))
      LIMIT 2000
    `)
    return rows.map((r: any) => ({
      id: Number(r.id),
      title: r.title,
      anime_meta: {
        popularity: r.popularity == null ? null : Number(r.popularity),
        favourites: r.favourites == null ? null : Number(r.favourites),
        mean_score: r.mean_score == null ? null : Number(r.mean_score),
        format: r.format,
        season: r.season,
        season_year: r.season_year == null ? null : Number(r.season_year),
        score_distribution: typeof r.score_distribution === 'string' ? JSON.parse(r.score_distribution) : r.score_distribution,
      }
    }))
  } catch (error) {
    console.error('Failed fetchChartAnime:', error)
    return []
  }
}

export async function fetchChartNovelsData() {
  try {
    // 1. Fetch novel series
    const seriesRows = await sql(`
      SELECT id, title, publisher
      FROM series
      WHERE item_type = 'novel' AND NOT ('Hentai' = ANY(genres))
    `)

    // 2. Fetch volumes
    const volRows = await sql(`
      SELECT series_id, release_date, price
      FROM volumes
      WHERE is_special = false OR is_special IS NULL
    `)

    // 3. Fetch votes
    const voteRows = await sql(`
      SELECT s.title, vr.votes, p.label as period
      FROM voting_results vr
      JOIN series s ON vr.series_id = s.id
      JOIN voting_periods p ON vr.period_id = p.id
    `)

    // Build rawVols
    const rawVols: Record<number, { year: number | null, price: number }[]> = {}
    const volMap: Record<number, { count: number; price: number; maxYear: number | null }> = {}
    for (const v of volRows) {
      const sid = Number(v.series_id)
      const price = Number(v.price) || 0
      const yr = v.release_date ? new Date(v.release_date).getFullYear() : null
      
      if (!rawVols[sid]) rawVols[sid] = []
      rawVols[sid].push({ year: yr, price })

      if (!volMap[sid]) volMap[sid] = { count: 0, price: 0, maxYear: null }
      volMap[sid].count++
      volMap[sid].price += price
      if (yr != null) {
        if (!volMap[sid].maxYear || yr > volMap[sid].maxYear!) {
          volMap[sid].maxYear = yr
        }
      }
    }

    // Build sortedPeriods
    const periodSet = new Set<string>()
    for (const vr of voteRows) {
      if (vr.period) periodSet.add(vr.period)
    }
    const parsePeriodSort = (p: string) => {
      const parts = p.split('/')
      if (parts.length !== 2) return 0
      return parseInt(parts[1]) * 100 + parseInt(parts[0])
    }
    const sortedPeriods = ['All', ...Array.from(periodSet).sort((a, b) => parsePeriodSort(b) - parsePeriodSort(a))]

    // Build byPeriod
    const byPeriod: Record<string, Record<string, number>> = {}
    for (const vr of voteRows) {
      if (!vr.period) continue
      if (!byPeriod[vr.period]) byPeriod[vr.period] = {}
      byPeriod[vr.period][vr.title] = Number(vr.votes) || 0
    }

    // Build voteMap (keep latest period votes)
    const parsePeriod = (p: string | null): number => {
      if (!p) return 0
      const parts = p.split('/')
      if (parts.length !== 2) return 0
      const mm = parseInt(parts[0]), yyyy = parseInt(parts[1])
      return isNaN(mm) || isNaN(yyyy) ? 0 : yyyy * 100 + mm
    }
    const voteMap: Record<string, { votes: number; period: string }> = {}
    for (const vr of voteRows) {
      const existing = voteMap[vr.title]
      if (!existing || parsePeriod(vr.period) > parsePeriod(existing.period)) {
        voteMap[vr.title] = { votes: Number(vr.votes) || 0, period: vr.period }
      }
    }

    // Build rows
    const rows = seriesRows.map((s: any) => {
      const sid = Number(s.id)
      const vol = volMap[sid]
      const count = vol?.count ?? 0
      const price = vol?.price ? vol.price : null
      return {
        id: sid,
        title: s.title,
        publisher: s.publisher,
        volume_count: count,
        price: price,
        avg_price: price != null && count > 0 ? Math.round(price / count) : null,
        latest_year: vol?.maxYear ?? null,
        votes: voteMap[s.title]?.votes ?? null,
        period: voteMap[s.title]?.period ?? null,
      }
    })

    return {
      allNovels: rows,
      rawVolsBySeriesId: rawVols,
      allPeriods: sortedPeriods,
      votesByPeriod: byPeriod,
    }
  } catch (error) {
    console.error('Failed to fetch chart novels data:', error)
    return {
      allNovels: [],
      rawVolsBySeriesId: {},
      allPeriods: ['All'],
      votesByPeriod: {},
    }
  }
}

// ============================================
// SERIES ENRICHMENT / DETAIL DATA
// ============================================
async function optionalEnrichmentRows(label: string, query: string, params: any[] = []) {
  try {
    return await sql(query, params)
  } catch (error) {
    console.warn(`Optional enrichment query failed (${label}):`, error)
    return []
  }
}

export async function fetchSeriesEnrichmentData(seriesId: number, itemType: string) {
  try {
    const [ratingData, libraryData] = await Promise.all([
      optionalEnrichmentRows('rating summary', `SELECT * FROM get_series_rating_summary($1)`, [seriesId]),
      optionalEnrichmentRows('library summary', `SELECT * FROM get_series_library_summary($1)`, [seriesId])
    ])

    let mangaMeta = null
    let publisherName = null
    let novelMeta = null
    let vols: any[] = []
    let links: any[] = []
    let lnRanking = null
    let lnMarketRows: any[] = []
    let fanVoteHistory: any[] = []
    let lidexScore = null

    if (itemType === 'manga') {
      const mangaMetaRows = await optionalEnrichmentRows('manga metadata', `
        SELECT series_id, demographic, original_language, vn_licensed, vn_publisher_id, updated_at
        FROM manga_meta
        WHERE series_id = $1
      `, [seriesId])
      if (mangaMetaRows.length) {
        mangaMeta = mangaMetaRows[0]
        if (mangaMeta.vn_publisher_id) {
          const pub = await optionalEnrichmentRows('manga publisher', `SELECT name, name_vi FROM publishers WHERE id = $1`, [mangaMeta.vn_publisher_id])
          if (pub.length) publisherName = pub[0].name_vi || pub[0].name
        }
      }
    } else if (itemType === 'novel') {
      const novelMetaRows = await optionalEnrichmentRows('novel metadata', `SELECT * FROM novel_meta WHERE series_id = $1`, [seriesId])
      if (novelMetaRows.length) novelMeta = novelMetaRows[0]
    }

    if (itemType === 'manga' || itemType === 'novel') {
      vols = await optionalEnrichmentRows('volumes', `
        SELECT id, volume_number, release_date, cover_url, price, currency, page_count, is_special
        FROM volumes
        WHERE series_id = $1 AND is_special = false AND volume_number IS NOT NULL
        ORDER BY volume_number DESC
      `, [seriesId])

      if (vols.length > 0) {
        const latestVolId = vols[0].id
        links = await optionalEnrichmentRows('volume links', `
          SELECT link_type, label, url
          FROM series_links
          WHERE series_id = $1 AND volume_id = $2 AND is_active = true
          ORDER BY sort_order ASC
        `, [seriesId, latestVolId])
      }
    } else if (itemType === 'anime') {
      links = await optionalEnrichmentRows('anime links', `
        SELECT link_type, label, url
        FROM series_links
        WHERE series_id = $1 AND is_active = true
        ORDER BY sort_order ASC
      `, [seriesId])
    }

    if (itemType === 'novel') {
      // 1. Fetch ranking rows
      const rankingRows = await optionalEnrichmentRows('LN ranking', `
        SELECT id, series_title, series_id, lidex_series_id, series_code, number_of_volumes, average_price, max_release_at, publisher, original_volumes, original_status, evalution, evaluation_basis, ln_score, trang_thai, drop_percent, drop_basis, average_gap_months, months_since_last_release, completion_ratio, publisher_activity, publisher_releases_last_24m, score_components, drop_components, cover_url, cover_source_title
        FROM ln_series_ranking
        ORDER BY ln_score DESC
      `)
      
      // 2. Fetch vote history
      const votesRows = await optionalEnrichmentRows('fan vote history', `
        SELECT vr.votes, vr.rank, vp.month, vp.year, vp.label
        FROM voting_results vr
        JOIN voting_periods vp ON vr.period_id = vp.id
        WHERE vr.series_id = $1
      `, [seriesId])

      lnMarketRows = rankingRows.map((r: any) => ({
        ...r,
        id: Number(r.id),
        lidex_series_id: r.lidex_series_id == null ? null : Number(r.lidex_series_id),
        cover_url: proxyImg(r.cover_url),
        number_of_volumes: r.number_of_volumes == null ? null : Number(r.number_of_volumes),
        average_price: r.average_price == null ? null : Number(r.average_price),
        max_release_at: normalizeDbDate(r.max_release_at),
        original_volumes: r.original_volumes == null ? null : Number(r.original_volumes),
        ln_score: r.ln_score == null ? null : Number(r.ln_score),
        drop_percent: r.drop_percent == null ? null : Number(r.drop_percent),
        average_gap_months: r.average_gap_months == null ? null : Number(r.average_gap_months),
        months_since_last_release: r.months_since_last_release == null ? null : Number(r.months_since_last_release),
        completion_ratio: r.completion_ratio == null ? null : Number(r.completion_ratio),
        publisher_releases_last_24m: r.publisher_releases_last_24m == null ? null : Number(r.publisher_releases_last_24m),
      }))

      // Find matching ranking row
      const seriesDetails = await optionalEnrichmentRows('series titles for LN matching', `SELECT title, title_vi, title_native FROM series WHERE id = $1`, [seriesId])
      if (seriesDetails.length) {
        const s = seriesDetails[0]
        const normalizedTitle = String(s.title || '').trim().toLowerCase()
        const normalizedTitleVI = String(s.title_vi || '').trim().toLowerCase()
        const normalizedNative = String(s.title_native || '').trim().toLowerCase()

        lnRanking = lnMarketRows.find(row => Number(row.lidex_series_id) === seriesId)
          || lnMarketRows.find(row => {
            const title = String(row.series_title || '').trim().toLowerCase()
            return Boolean(title) && [normalizedTitle, normalizedTitleVI, normalizedNative].filter(Boolean).includes(title)
          })
          || null
      }

      fanVoteHistory = votesRows.map((row: any) => {
        const month = Number(row.month || 0)
        const year = Number(row.year || 0)
        return {
          period: row.label || (month && year ? `${String(month).padStart(2, '0')}/${year}` : '—'),
          sort: year * 100 + month,
          votes: Number(row.votes) || 0,
          rank: row.rank == null ? null : Number(row.rank),
        }
      }).filter(point => point.sort > 0).sort((a, b) => a.sort - b.sort)
    }

    if (itemType === 'anime') {
      const animeDetails = await optionalEnrichmentRows('anime details', `SELECT * FROM series WHERE id = $1`, [seriesId])
      let anime_meta: any = null
      if (animeDetails.length) {
        const metaRows = await optionalEnrichmentRows('anime metadata', `SELECT * FROM anime_meta WHERE series_id = $1`, [seriesId])
        if (metaRows.length) anime_meta = metaRows[0]
      }

      if (animeDetails.length && anime_meta) {
        const statsData = await optionalEnrichmentRows('anime population stats', `
          SELECT 
            a.mean_score, a.popularity, a.favourites, s.studio
          FROM anime_meta a
          LEFT JOIN series s ON a.series_id = s.id
          WHERE a.mean_score IS NOT NULL AND a.popularity IS NOT NULL AND a.favourites IS NOT NULL
          LIMIT 3000
        `)
        
        const animeSeries: any = {
          ...animeDetails[0],
          anime_meta: {
            ...anime_meta,
            score_distribution: typeof anime_meta.score_distribution === 'string' 
              ? JSON.parse(anime_meta.score_distribution) 
              : anime_meta.score_distribution
          }
        }
        
        const popRows = statsData.map((r: any) => ({
          mean_score: r.mean_score == null ? null : Number(r.mean_score),
          popularity: r.popularity == null ? null : Number(r.popularity),
          favourites: r.favourites == null ? null : Number(r.favourites),
          studio: r.studio || null
        }))

        const stats = buildPopulationStats(popRows)
        lidexScore = calculateLiDexScore(animeSeries.anime_meta, animeSeries.studio, stats)
      }
    }

    return {
      ratingSummary: ratingData[0] || null,
      librarySummary: libraryData[0] || null,
      mangaMeta,
      publisherName,
      novelMeta,
      vols: vols.map((v: any) => ({ ...v, id: Number(v.id), volume_number: v.volume_number == null ? null : Number(v.volume_number), release_date: normalizeDbDate(v.release_date), price: Number(v.price) || 0 })),
      links: links.map((l: any) => ({ ...l })),
      lnRanking,
      lnMarketRows,
      fanVoteHistory,
      lidexScore
    }
  } catch (error) {
    console.error('Failed to fetch series enrichment data:', error)
    return null
  }
}

export async function fetchDashboardWatchlistData() {
  try {
    const rankingRows = await sql(`
      SELECT 
        r.id, r.series_title, r.series_id, r.lidex_series_id, r.series_code, r.number_of_volumes, 
        r.average_price, r.max_release_at, r.publisher, r.original_volumes, r.original_status, 
        r.evalution, r.evaluation_basis, r.ln_score, r.trang_thai, r.drop_percent, r.drop_basis, 
        r.average_gap_months, r.months_since_last_release, r.completion_ratio, r.publisher_activity, 
        r.publisher_releases_last_24m, r.score_components, r.drop_components, 
        COALESCE(r.cover_url, s.cover_url) as cover_url, r.cover_source_title,
        s.title as canonical_title,
        COALESCE(s.description_vi, s.description) as canonical_description
      FROM ln_series_ranking r
      LEFT JOIN series s ON r.lidex_series_id = s.id
      ORDER BY r.ln_score DESC, r.max_release_at DESC
    `)

    const ids = Array.from(new Set(rankingRows.map((r: any) => Number(r.lidex_series_id)).filter(Boolean)))

    let voteRows: any[] = []
    if (ids.length > 0) {
      voteRows = await sql(`
        SELECT DISTINCT ON (vr.series_id) 
               vr.series_id, vr.votes, vr.rank, vp.month, vp.year, vp.label
        FROM voting_results vr
        JOIN voting_periods vp ON vr.period_id = vp.id
        WHERE vr.series_id = ANY($1)
        ORDER BY vr.series_id, vp.year DESC, vp.month DESC
      `, [ids])
    }

    return {
      rankingRows: rankingRows.map((r: any) => ({
        ...r,
        id: Number(r.id),
        lidex_series_id: r.lidex_series_id == null ? null : Number(r.lidex_series_id),
        number_of_volumes: r.number_of_volumes == null ? null : Number(r.number_of_volumes),
        average_price: r.average_price == null ? null : Number(r.average_price),
        max_release_at: normalizeDbDate(r.max_release_at),
        original_volumes: r.original_volumes == null ? null : Number(r.original_volumes),
        ln_score: r.ln_score == null ? null : Number(r.ln_score),
        drop_percent: r.drop_percent == null ? null : Number(r.drop_percent),
        average_gap_months: r.average_gap_months == null ? null : Number(r.average_gap_months),
        months_since_last_release: r.months_since_last_release == null ? null : Number(r.months_since_last_release),
        completion_ratio: r.completion_ratio == null ? null : Number(r.completion_ratio),
        publisher_releases_last_24m: r.publisher_releases_last_24m == null ? null : Number(r.publisher_releases_last_24m),
        series_title: r.series_title || r.canonical_title || r.series_title,
        cover_url: proxyImg(r.cover_url),
        description: r.canonical_description || null
      })),
      canonicalList: [],
      voteRows: voteRows.map((r: any) => ({
        series_id: Number(r.series_id),
        votes: Number(r.votes) || 0,
        rank: r.rank == null ? null : Number(r.rank),
        voting_periods: {
          month: Number(r.month || 0),
          year: Number(r.year || 0),
          label: r.label
        }
      }))
    }
  } catch (error) {
    console.error('Failed to fetch dashboard watchlist data:', error)
    return null
  }
}

export async function fetchDashboardStatsData() {
  try {
    const rankingRows = await sql(`
      SELECT lidex_series_id, publisher
      FROM ln_series_ranking
      WHERE lidex_series_id IS NOT NULL AND publisher IS NOT NULL
    `)

    const ids = Array.from(new Set(rankingRows.map((r: any) => Number(r.lidex_series_id))))
    const publisherBySeriesId = new Map<number, string>()
    for (const row of rankingRows) {
      publisherBySeriesId.set(Number(row.lidex_series_id), row.publisher)
    }

    let volumeRows: any[] = []
    if (ids.length > 0) {
      volumeRows = await sql(`
        SELECT v.series_id, v.release_date, v.is_special
        FROM volumes v
        WHERE v.series_id = ANY($1) AND v.release_date IS NOT NULL
      `, [ids])
    }

    const publisherRows = await sql(`
      SELECT name, name_vi, logo_url
      FROM publishers
      WHERE logo_url IS NOT NULL
    `)

    return {
      volumeRows: volumeRows.map((r: any) => ({
        series_id: Number(r.series_id),
        release_date: normalizeDbDate(r.release_date),
        is_special: r.is_special,
        publisher: publisherBySeriesId.get(Number(r.series_id)) || null
      })),
      publisherRows: publisherRows.map((r: any) => ({
        name: r.name,
        name_vi: r.name_vi,
        logo_url: proxyImg(r.logo_url)
      }))
    }
  } catch (error) {
    console.error('Failed to fetch dashboard stats data:', error)
    return null
  }
}

export async function fetchDashboardEnrichmentData() {
  const watchlist = await fetchDashboardWatchlistData()
  const stats = await fetchDashboardStatsData()
  if (!watchlist || !stats) return null
  return {
    ...watchlist,
    ...stats
  }
}

export async function fetchGenreMatrix() {
  try {
    const rows = await sql(`
      SELECT s.genres, a.mean_score
      FROM series s
      JOIN anime_meta a ON s.id = a.series_id
      WHERE s.item_type = 'anime' AND a.mean_score IS NOT NULL AND NOT ('Hentai' = ANY(s.genres))
      LIMIT 5000
    `)
    return rows.map((r: any) => ({
      genres: r.genres,
      anime_meta: {
        mean_score: r.mean_score == null ? null : Number(r.mean_score)
      }
    }))
  } catch (error) {
    console.error('Failed fetchGenreMatrix:', error)
    return []
  }
}

export async function fetchStudioMatrix() {
  try {
    const rows = await sql(`
      SELECT s.studio, a.mean_score
      FROM series s
      JOIN anime_meta a ON s.id = a.series_id
      WHERE s.item_type = 'anime' AND s.studio IS NOT NULL AND a.mean_score IS NOT NULL AND NOT ('Hentai' = ANY(s.genres))
      LIMIT 5000
    `)
    return rows.map((r: any) => ({
      studio: r.studio,
      anime_meta: {
        mean_score: r.mean_score == null ? null : Number(r.mean_score)
      }
    }))
  } catch (error) {
    console.error('Failed fetchStudioMatrix:', error)
    return []
  }
}

export async function fetchUserCatalog() {
  try {
    const [series, volumes] = await Promise.all([
      sql(`
        SELECT s.id, s.title, s.title_vi, s.cover_url, p.name as publisher
        FROM series s
        LEFT JOIN publishers p ON s.publisher_id = p.id
        WHERE s.item_type = 'novel' 
        ORDER BY title ASC 
        LIMIT 1500
      `),
      sql(`
        SELECT id, series_id, volume_number 
        FROM volumes 
        WHERE is_special = false AND volume_number IS NOT NULL 
        ORDER BY series_id ASC, volume_number ASC 
        LIMIT 5000
      `)
    ])

    return {
      series: series.map((r: any) => ({
        id: Number(r.id),
        title: r.title,
        title_vi: r.title_vi,
        cover_url: proxyImg(r.cover_url),
        publisher: r.publisher || null
      })),
      volumes: volumes.map((r: any) => ({
        id: Number(r.id),
        series_id: Number(r.series_id),
        volume_number: r.volume_number !== null ? Number(r.volume_number) : null
      }))
    }
  } catch (error) {
    console.error('Failed to fetch user catalog:', error)
    return { series: [], volumes: [] }
  }
}

export async function getUserProfile(userId: string) {
  try {
    const rows = await sql(`
      SELECT user_id, display_name, avatar_url, is_premium, premium_tier 
      FROM user_profiles 
      WHERE user_id = $1 
      LIMIT 1
    `, [userId])
    return rows[0] || null
  } catch (error) {
    console.error('Failed to get user profile:', error)
    return null
  }
}

export async function upsertUserProfile(userId: string, displayName: string | null, avatarUrl: string | null) {
  try {
    // Ensure user exists in Neon auth.users (fallback for broken replication)
    await sql(`
      INSERT INTO auth.users (id)
      VALUES ($1)
      ON CONFLICT (id) DO NOTHING
    `, [userId])

    await sql(`
      INSERT INTO user_profiles (user_id, display_name, avatar_url, updated_at)
      VALUES ($1, $2, $3, NOW())
      ON CONFLICT (user_id) DO UPDATE 
      SET display_name = EXCLUDED.display_name, avatar_url = EXCLUDED.avatar_url, updated_at = EXCLUDED.updated_at
    `, [userId, displayName, avatarUrl])
    return { success: true }
  } catch (error) {
    console.error('Failed to upsert user profile:', error)
    return { success: false, error: String(error) }
  }
}

export async function fetchSeriesVolumeDetails(seriesId: number) {
  try {
    const rows = await sql(`
      SELECT id, series_id, volume_number, title, price, currency, cover_url, release_date, is_special 
      FROM volumes 
      WHERE series_id = $1 AND is_special = false AND volume_number IS NOT NULL 
      ORDER BY volume_number ASC
    `, [seriesId])

    return rows.map((r: any) => ({
      id: Number(r.id),
      seriesId: Number(r.series_id),
      volumeNumber: r.volume_number !== null ? Number(r.volume_number) : null,
      title: r.title,
      price: r.price !== null ? Number(r.price) : null,
      currency: r.currency || 'VND',
      coverUrl: proxyImg(r.cover_url),
      releaseDate: normalizeDbDate(r.release_date)
    }))
  } catch (error) {
    console.error('Failed to fetch series volume details:', error)
    return []
  }
}





