'use server'

import { unstable_cache } from 'next/cache'
import { fetchSeriesEnrichmentData } from './db'

const ONE_HOUR = 3600

// Module-level cached function — Next.js automatically includes the serialized
// (seriesId, itemType) arguments in the cache key. Do NOT move this inside a
// function/closure or it will break Server Action caching.
const cachedSeriesEnrichmentData = unstable_cache(
  async (seriesId: number, itemType: string) => fetchSeriesEnrichmentData(seriesId, itemType),
  ['series-enrichment-v2'],
  {
    revalidate: ONE_HOUR,
    tags: ['series'],
  }
)

export async function getCachedSeriesEnrichmentData(seriesId: number, itemType: string) {
  return cachedSeriesEnrichmentData(seriesId, itemType)
}
