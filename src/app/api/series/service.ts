import { supabase } from '@/lib/supabase'

export interface SeriesFilters {
  limit?: number
  offset?: number
  type?: string
  search?: string
}

export class SeriesService {
  async findAll(filters: SeriesFilters = {}) {
    const { limit = 20, offset = 0, type, search } = filters
    
    let query = supabase.from('series').select('*', { count: 'exact' })

    if (type) {
      query = query.eq('item_type', type)
    }

    if (search) {
      query = query.ilike('title', `%${search}%`)
    }

    query = query.order('created_at', { ascending: false })
    query = query.range(offset, offset + limit - 1)

    const { data, error, count } = await query

    if (error) throw new Error('Unable to load series')

    return { data, count: count || 0 }
  }

  async findOne(id: number) {
    const { data, error } = await supabase
      .from('series')
      .select('*')
      .eq('id', id)
      .single()

    if (error || !data) {
      throw new Error(`Series with ID ${id} not found`)
    }

    return data
  }

  async create(data: any) {
    const { data: result, error } = await supabase
      .from('series')
      .insert([data])
      .select()
      .single()

    if (error) throw new Error('Unable to create series')

    return result
  }

  async update(id: number, data: any) {
    const { data: result, error } = await supabase
      .from('series')
      .update(data)
      .eq('id', id)
      .select()
      .single()

    if (error || !result) {
      throw new Error(`Series with ID ${id} not found`)
    }

    return result
  }

  async delete(id: number) {
    const { error } = await supabase
      .from('series')
      .delete()
      .eq('id', id)

    if (error) throw new Error('Unable to delete series')

    return { success: true }
  }

  async findTrending(limit: number = 10) {
    const { data, error } = await supabase
      .from('series')
      .select('*')
      .order('is_featured', { ascending: false })
      .limit(limit)

    if (error) throw new Error('Unable to load trending series')
    return data
  }

  async findTopRated(limit: number = 10) {
    const { data, error } = await supabase
      .from('series')
      .select('*')
      .not('score', 'is', null)
      .order('score', { ascending: false })
      .limit(limit)

    if (error) throw new Error('Unable to load top-rated series')
    return data
  }
}

export const seriesService = new SeriesService()
