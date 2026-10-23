import Link from 'next/link'
import { Star, Heart, Tv, Book, BookOpen } from 'lucide-react'

export default function SeriesCard({ series, rank }) {
  const typeIcon = {
    anime: Tv,
    manga: Book,
    light_novel: BookOpen,
  }[series.item_type] || BookOpen

  return (
    <Link href={`/content/${series.id}`} className="glass rounded-xl overflow-hidden stat-card block">
      <div className="relative h-40 bg-gradient-to-br from-primary-600 to-purple-700">
        {series.cover_url && (
          <img src={series.cover_url} alt={series.title} className="w-full h-full object-cover" />
        )}
        <div className="absolute top-3 left-3 bg-black/60 backdrop-blur px-2 py-1 rounded text-xs text-white">
          {typeIcon && <typeIcon className="w-3 h-3 inline mr-1" />}
          {(series.item_type || 'Series').charAt(0).toUpperCase() + (series.item_type || 'series').slice(1)}
        </div>
        <div className="absolute top-3 right-3 bg-green-500/90 px-2 py-1 rounded text-xs font-mono text-white">
          #{rank}
        </div>
      </div>
      <div className="p-5">
        <h3 className="text-lg font-bold text-primary mb-2">{series.title}</h3>
        <div className="flex items-center space-x-3 text-sm text-secondary mb-3">
          <span className="flex items-center">
            <Star className="w-3 h-3 inline mr-1 text-yellow-500" />
            {series.score || 'N/A'}
          </span>
        </div>
        <span className="text-primary-500 hover:text-primary-600 text-sm font-medium flex items-center">
          View Details →
        </span>
      </div>
    </Link>
  )
}
