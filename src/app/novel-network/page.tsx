import { getCachedNovelNetworkData } from '@/lib/cachedDb'
import NovelNetworkClient from './NovelNetworkClient'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Mạng Lưới Bản Quyền Light Novel - LiDex',
  description: 'Sơ đồ mạng lưới tương tác phân tích tất cả các bộ Light Novel đang được xuất bản tại Việt Nam phân loại theo Nhà xuất bản và Thể loại.',
  openGraph: {
    title: 'Mạng Lưới Bản Quyền Light Novel - LiDex',
    description: 'Sơ đồ mạng lưới tương tác phân tích tất cả các bộ Light Novel đang được xuất bản tại Việt Nam.',
  }
}

export default async function NovelNetworkPage() {
  const data = await getCachedNovelNetworkData()
  return <NovelNetworkClient initialData={data || []} />
}
