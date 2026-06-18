'use server'

import { unstable_cache } from 'next/cache'
import { fetchSeriesEnrichmentData } from './db'

const ONE_HOUR = 3600

export async function getCachedSeriesEnrichmentData(seriesId: number, itemType: string) {
  // Key includes seriesId + itemType so each series gets its own cache slot
  return unstable_cache(
    async () => fetchSeriesEnrichmentData(seriesId, itemType),
    ['series-enrichment-v1', String(seriesId), itemType],
    {
      revalidate: ONE_HOUR,
      tags: ['series'],
    }
  )()
}

