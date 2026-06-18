import { unstable_cache } from 'next/cache'
import { fetchHomeData } from './db'

export const getCachedHomeData = unstable_cache(
  async () => fetchHomeData(),
  ['home-data-v1'],
  {
    revalidate: 3600,
    tags: ['home-data'],
  }
)
