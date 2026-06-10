import { createClient } from '@supabase/supabase-js'

// Public read client. It intentionally does not persist or attach a logged-in
// session, so public dashboard/detail queries keep using the anon role.
const publicSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  }
)

export default publicSupabase
