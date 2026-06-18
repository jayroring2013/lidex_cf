import { createElement } from 'react'
import HomeClient from '@/components/HomeClient'
import { getCachedHomeData } from '@/lib/cachedHomeData'

export const revalidate = 3600

export default async function Home() {
  const homeData = await getCachedHomeData()
  return createElement(HomeClient, { initialData: homeData })
}
