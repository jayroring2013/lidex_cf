import Link from 'next/link'
import { Star, Tv, Book, BookOpen, TrendingUp } from 'lucide-react'

export default function SeriesTable({ series, type = 'trending' }) {
  const getTypeIcon = (itemType) => {
    switch (itemType) {
      case 'anime': return Tv
      case 'manga': return Book
      case 'light_novel': return BookOpen
      default: return BookOpen
    }
  }

  if (!series || series.length === 0) {
    return (
      <div className="text-center py-8 text-secondary">
        No data available
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-gray-200 dark:border-dark-700">
            <th className="text-left py-3 px-4 text-xs font-medium text-secondary uppercase">#</th>
            <th className="text-left py-3 px-4 text-xs font-medium text-secondary uppercase">Title</th>
            <th className="text-left py-3 px-4 text-xs font-medium text-secondary uppercase">Type</th>
            <th className="text-left py-3 px-4 text-xs font-medium text-secondary uppercase">
              {type === 'rated' ? 'Score' : 'Votes'}
            </th>
          </tr>
        </thead>
        <tbody>
          {series.map((item, index) => {
            const TypeIcon = getTypeIcon(item.item_type)
            return (
              <tr 
                key={item.id} 
                className="border-b border-gray-200 dark:border-dark-700 hover:bg-gray-50 dark:hover:bg-dark-800/50"
              >
                <td className="py-3 px-4 text-sm font-mono text-primary">
                  {type === 'trending' ? (
                    <span className="flex items-center">
                      {index + 1}
                      {index < 3 && <TrendingUp className="w-3 h-3 ml-1 text-green-500" />}
                    </span>
                  ) : (
                    index + 1
                  )}
                </td>
                <td className="py-3 px-4">
                  <Link 
                    href={`/content/${item.id}`}
                    className="text-sm text-primary hover:text-primary-600 font-medium"
                  >
                    {item.title}
                  </Link>
                </td>
                <td className="py-3 px-4">
                  <span className="inline-flex items-center space-x-1 text-xs">
                    <TypeIcon className="w-3 h-3 text-secondary" />
                    <span className="text-secondary capitalize">
                      {(item.item_type || 'series').replace('_', ' ')}
                    </span>
                  </span>
                </td>
                <td className="py-3 px-4 text-sm font-mono">
                  {type === 'rated' ? (
                    <span className="flex items-center text-yellow-500">
                      <Star className="w-3 h-3 mr-1" />
                      {item.score || 'N/A'}
                    </span>
                  ) : (
                    <span className="text-secondary">{item.vote_count || 0}</span>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
