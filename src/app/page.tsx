import { createElement } from 'react'
import HomeClient from '@/components/HomeClient'
import { fetchHomeData } from '@/lib/db'

export const revalidate = 3600

export default async function Home() {
  const homeData = await fetchHomeData()
  return createElement(HomeClient, { initialData: homeData })
}
