import { fetchPublicBookshelfData } from '@/lib/db'
import { notFound } from 'next/navigation'
import PublicBookshelfClient from './PublicBookshelfClient'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: {
    userId: string
  }
}

export async function generateMetadata({ params }: PageProps) {
  const data = await fetchPublicBookshelfData(params.userId)
  if (!data || !data.profile) {
    return {
      title: 'Kệ sách không tồn tại - LiDex',
    }
  }

  const name = data.profile.displayName || 'Thành viên'
  return {
    title: `Kệ sách của ${name} - LiDex`,
    description: `Xem bộ sưu tập và đánh giá Light Novel & Manga của ${name} trên LiDex.`,
    openGraph: {
      title: `Kệ sách của ${name} - LiDex`,
      description: `Xem bộ sưu tập và đánh giá Light Novel & Manga của ${name} trên LiDex.`,
      type: 'profile',
      username: name,
    }
  }
}

export default async function PublicBookshelfPage({ params }: PageProps) {
  const data = await fetchPublicBookshelfData(params.userId)
  
  if (!data || !data.profile) {
    notFound()
  }

  return (
    <PublicBookshelfClient
      profile={data.profile}
      purchases={data.purchases}
      ratedList={data.ratedList}
      avgSpending={data.avgSpending}
    />
  )
}
