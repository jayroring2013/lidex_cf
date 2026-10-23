import { TrendingUp, TrendingDown } from 'lucide-react'

export default function StatsCard({ icon: Icon, value, label, color = 'primary', loading = false, trend }) {
  const colorClasses = {
    primary: 'bg-primary-500/20 text-primary-500',
    purple: 'bg-purple-500/20 text-purple-500',
    pink: 'bg-pink-500/20 text-pink-500',
    green: 'bg-green-500/20 text-green-500',
  }

  if (loading) {
    return (
      <div className="glass p-6 text-center animate-pulse">
        <div className="w-12 h-12 bg-gray-700 rounded-lg mx-auto mb-4"></div>
        <div className="h-8 bg-gray-700 rounded mb-2"></div>
        <div className="h-4 bg-gray-700 rounded w-24 mx-auto"></div>
      </div>
    )
  }

  const isPositive = trend?.startsWith('+')

  return (
    <div className="stat-card glass p-6 text-center">
      <div className={`w-12 h-12 rounded-lg flex items-center justify-center mx-auto mb-4 ${colorClasses[color]}`}>
        <Icon className="w-6 h-6" />
      </div>
      <div className="text-3xl font-bold font-mono text-primary mb-1">{value}</div>
      <div className="text-sm text-secondary mb-2">{label}</div>
      {trend && (
        <div className={`text-xs flex items-center justify-center ${isPositive ? 'text-green-500' : 'text-red-500'}`}>
          {isPositive ? <TrendingUp className="w-3 h-3 mr-1" /> : <TrendingDown className="w-3 h-3 mr-1" />}
          {trend} this month
        </div>
      )}
    </div>
  )
}
