'use server'

import { unstable_cache } from 'next/cache'
import {
  getTopRatedSeries,
  fetchBoardStats,
  fetchBoardRecent,
  fetchBrowseDiscovery,
  fetchLeaderboardPeriods,
  fetchLeaderboardRows,
  fetchLeaderboardPublishers,
  fetchDashboardEnrichmentData,
  fetchGenreMatrix,
  fetchStudioMatrix,
  fetchChartAnime,
  fetchChartNovels,
  fetchChartVolumes,
  fetchChartVotes,
  fetchCompareAllMeta,
  fetchSeriesVolumeDetails,
} from './db'
// NOTE: fetchUserCatalog is intentionally NOT imported here.
// User-specific data must never be cached globally (no user ID in key = data leak).
// Call fetchUserCatalog() directly from the page/action that has the userId.

const ONE_HOUR = 3600
const SIX_HOURS = 21600

const cachedTopRatedSeries = unstable_cache(
  async (limit: number) => getTopRatedSeries({ limit }),
  ['top-rated-series-v1'],
  { revalidate: ONE_HOUR, tags: ['series'] }
)

export async function getCachedTopRatedSeries({ limit = 10 } = {}) {
  return cachedTopRatedSeries(limit)
}

const cachedBoardStats = unstable_cache(
  async () => fetchBoardStats(),
  ['board-stats-v1'],
  { revalidate: ONE_HOUR, tags: ['board'] }
)

export async function getCachedBoardStats() {
  return cachedBoardStats()
}

const cachedBoardRecent = unstable_cache(
  async (itemType: string) => fetchBoardRecent(itemType),
  ['board-recent-v1'],
  { revalidate: ONE_HOUR, tags: ['board'] }
)

export async function getCachedBoardRecent(itemType: string) {
  return cachedBoardRecent(itemType)
}

const cachedBrowseDiscovery = unstable_cache(
  async (type: string) => fetchBrowseDiscovery({ type }),
  ['browse-discovery-v1'],
  { revalidate: ONE_HOUR, tags: ['browse'] }
)

export async function getCachedBrowseDiscovery({ type }: { type: string }) {
  return cachedBrowseDiscovery(type)
}

const cachedLeaderboardPeriods = unstable_cache(
  async () => fetchLeaderboardPeriods(),
  ['leaderboard-periods-v1'],
  { revalidate: SIX_HOURS, tags: ['leaderboard'] }
)

export async function getCachedLeaderboardPeriods() {
  return cachedLeaderboardPeriods()
}

const cachedLeaderboardRows = unstable_cache(
  async (periodIds: number[]) => fetchLeaderboardRows(periodIds),
  ['leaderboard-rows-v1'],
  { revalidate: ONE_HOUR, tags: ['leaderboard'] }
)

export async function getCachedLeaderboardRows(periodIds: number[]) {
  return cachedLeaderboardRows(periodIds)
}

const cachedLeaderboardPublishers = unstable_cache(
  async (seriesIds: number[]) => fetchLeaderboardPublishers(seriesIds),
  ['leaderboard-publishers-v1'],
  { revalidate: SIX_HOURS, tags: ['leaderboard'] }
)

export async function getCachedLeaderboardPublishers(seriesIds: number[]) {
  return cachedLeaderboardPublishers(seriesIds)
}

const cachedDashboardEnrichmentData = unstable_cache(
  async () => fetchDashboardEnrichmentData(),
  ['dashboard-enrichment-v1'],
  { revalidate: ONE_HOUR, tags: ['dashboard'] }
)

export async function getCachedDashboardEnrichmentData() {
  return cachedDashboardEnrichmentData()
}

const cachedGenreMatrix = unstable_cache(
  async () => fetchGenreMatrix(),
  ['genre-matrix-v1'],
  { revalidate: SIX_HOURS, tags: ['analytics'] }
)

export async function getCachedGenreMatrix() {
  return cachedGenreMatrix()
}

const cachedStudioMatrix = unstable_cache(
  async () => fetchStudioMatrix(),
  ['studio-matrix-v1'],
  { revalidate: SIX_HOURS, tags: ['analytics'] }
)

export async function getCachedStudioMatrix() {
  return cachedStudioMatrix()
}

const cachedChartAnime = unstable_cache(
  async () => fetchChartAnime(),
  ['chart-anime-v1'],
  { revalidate: SIX_HOURS, tags: ['charts'] }
)

export async function getCachedChartAnime() {
  return cachedChartAnime()
}

const cachedChartNovels = unstable_cache(
  async () => fetchChartNovels(),
  ['chart-novels-v1'],
  { revalidate: SIX_HOURS, tags: ['charts'] }
)

export async function getCachedChartNovels() {
  return cachedChartNovels()
}

const cachedChartVolumes = unstable_cache(
  async () => fetchChartVolumes(),
  ['chart-volumes-v1'],
  { revalidate: SIX_HOURS, tags: ['charts'] }
)

export async function getCachedChartVolumes() {
  return cachedChartVolumes()
}

const cachedChartVotes = unstable_cache(
  async (tableName: string) => fetchChartVotes(tableName),
  ['chart-votes-v1'],
  { revalidate: SIX_HOURS, tags: ['charts'] }
)

export async function getCachedChartVotes(tableName: string) {
  return cachedChartVotes(tableName)
}

const cachedCompareAllMeta = unstable_cache(
  async () => fetchCompareAllMeta(),
  ['compare-all-meta-v1'],
  { revalidate: SIX_HOURS, tags: ['compare'] }
)

export async function getCachedCompareAllMeta() {
  return cachedCompareAllMeta()
}

export async function getCachedSeriesVolumeDetails(seriesId: number) {
  // Key includes seriesId so each series gets its own cache slot
  return unstable_cache(
    async () => fetchSeriesVolumeDetails(seriesId),
    ['series-volume-details-v1', String(seriesId)],
    { revalidate: SIX_HOURS, tags: ['series'] }
  )()
}
