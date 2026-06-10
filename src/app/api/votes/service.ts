import { supabase } from '@/lib/supabase'

export class VotesService {
  async getStats(days: number = 30) {
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - days)

    const { data, error } = await supabase
      .from('novel_votes')
      .select('created_at')
      .gte('created_at', startDate.toISOString())
      .order('created_at', { ascending: true })

    if (error) throw new Error('Unable to load vote stats')

    // Group by day
    const votesByDay: Record<string, number> = {}
    data?.forEach(vote => {
      const date = new Date(vote.created_at).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric'
      })
      votesByDay[date] = (votesByDay[date] || 0) + 1
    })

    return {
      labels: Object.keys(votesByDay),
      values: Object.values(votesByDay),
      total: data?.length || 0
    }
  }

  async getCount(seriesId: number) {
    const { count, error } = await supabase
      .from('novel_votes')
      .select('*', { count: 'exact', head: true })
      .eq('novel_id', seriesId)

    if (error) throw new Error('Unable to load vote count')

    return { seriesId, count: count || 0 }
  }

  async create(seriesId: number) {
    const { data, error } = await supabase
      .from('novel_votes')
      .insert([{
        novel_id: seriesId,
        created_at: new Date().toISOString()
      }])
      .select()
      .single()

    if (error) throw new Error('Unable to save vote')

    return data
  }

  async findRecent(limit: number = 20) {
    const { data, error } = await supabase
      .from('novel_votes')
      .select(`
        *,
        series (
          id,
          title,
          item_type,
          cover_url
        )
      `)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) throw new Error('Unable to load recent votes')

    return data
  }
}

export const votesService = new VotesService()
