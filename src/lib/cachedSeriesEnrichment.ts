'use server'

import { unstable_cache } from 'next/cache'
import { fetchSeriesEnrichmentData } from './db'

const ONE_HOUR = 3600

const cachedSeriesEnrichmentData = unstable_cache(
  async (seriesId: number, itemType: string) => fetchSeriesEnrichmentData(seriesId, itemType),
  ['series-enrichment-v1'],
  {
    revalidate: ONE_HOUR,
    tags: ['series'],
  }
)

export async function getCachedSeriesEnrichmentData(seriesId: number, itemType: string) {
  return cachedSeriesEnrichmentData(seriesId, itemType)
}
