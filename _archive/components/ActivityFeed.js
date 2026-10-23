import Link from 'next/link'
import { Heart, Calendar, Tv, Book, BookOpen } from 'lucide-react'

export default function ActivityFeed({ activities, type = 'activity' }) {
  const getTypeIcon = (itemType) => {
    switch (itemType) {
      case 'anime': return Tv
      case 'manga': return Book
      case 'light_novel': return BookOpen
      default: return BookOpen
    }
  }

  const formatTime = (dateString) => {
    const date = new Date(dateString)
    const now = new Date()
    const diff = now - date
    
    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)
    const days = Math.floor(diff / 86400000)
    
    if (minutes < 60) return `${minutes}m ago`
    if (hours < 24) return `${hours}h ago`
    return `${days}d ago`
  }

  if (!activities || activities.length === 0) {
    return (
      <div className="text-center py-8 text-secondary">
        No recent activity
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {activities.slice(0, 8).map((activity, index) => (
        <div 
          key={index}
          className="flex items-center space-x-3 p-3 glass rounded-lg"
        >
          {type === 'release' ? (
            <Calendar className="w-4 h-4 text-primary-500 flex-shrink-0" />
          ) : (
            <Heart className="w-4 h-4 text-green-500 flex-shrink-0" />
          )}
          
          <div className="flex-1 min-w-0">
            {activity.series ? (
              <Link 
                href={`/content/${activity.series.id}`}
                className="text-sm text-primary hover:text-primary-600 truncate block"
              >
                {activity.series.title}
              </Link>
            ) : (
              <p className="text-sm text-secondary truncate">
                {activity.title || 'Unknown'}
              </p>
            )}
            <p className="text-xs text-secondary">
              {type === 'release' 
                ? `Releases ${new Date(activity.release_date).toLocaleDateString()}`
                : formatTime(activity.created_at)
              }
            </p>
          </div>
          
          {activity.series?.item_type && (
            <div className="flex-shrink-0">
              {(() => {
                const TypeIcon = getTypeIcon(activity.series.item_type)
                return <TypeIcon className="w-4 h-4 text-secondary" />
              })()}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
