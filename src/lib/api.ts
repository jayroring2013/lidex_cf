const API_BASE = '/api'

export async function fetchSeries(id?: number, options?: any) {
  const url = id
    ? `${API_BASE}/series/${id}`
    : `${API_BASE}/series?${new URLSearchParams(options as any)}`

  const res = await fetch(url)

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Failed to fetch' }))
    throw new Error(error.error || 'Failed to fetch')
  }

  return res.json()
}

export async function fetchVoteCount(seriesId: number) {
  const res = await fetch(`${API_BASE}/votes?seriesId=${seriesId}`)

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Failed to fetch votes' }))
    throw new Error(error.error || 'Failed to fetch votes')
  }

  return res.json()
}

export async function submitVote(seriesId: number) {
  const res = await fetch(`${API_BASE}/votes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ novel_id: seriesId }),
  })

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Failed to submit vote' }))
    throw new Error(error.error || 'Failed to submit vote')
  }

  return res.json()
}

export async function fetchStats() {
  const res = await fetch(`${API_BASE}/stats`)

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Failed to fetch stats' }))
    throw new Error(error.error || 'Failed to fetch stats')
  }

  return res.json()
}
