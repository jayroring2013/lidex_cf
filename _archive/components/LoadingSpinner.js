import { Loader2 } from 'lucide-react'

export default function LoadingSpinner({ message = 'Loading...' }) {
  return (
    <div className="text-center py-12">
      <Loader2 className="w-8 h-8 text-primary-500 animate-spin mx-auto mb-4" />
      <p className="text-secondary">{message}</p>
    </div>
  )
}
