/**
 * update-db-to-r2.mjs
 *
 * Images are already uploaded to R2 at: covers/<filename>
 * This script just updates the DB rows where cover_url contains docln/hako
 * to point to the new R2 public URL.
 *
 * Usage:
 *   node scripts/update-db-to-r2.mjs
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

// ── ✏️  FILL THESE IN ──────────────────────────────────────────────────────────
const CF_PUBLIC_URL  = 'https://pub-2080c0fa70954a7e98e48daff887c4cf.r2.dev'  // no trailing slash
// ──────────────────────────────────────────────────────────────────────────────

const DRY_RUN = true  // set true to preview without touching DB

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

/** Extract filename from URL last path segment */
function urlToFilename(url) {
  try {
    return new URL(url).pathname.split('/').pop() || null
  } catch {
    return null
  }
}

/** Build the new R2 URL from the original docln/hako URL */
function buildR2Url(originalUrl) {
  const filename = urlToFilename(originalUrl)
  if (!filename) return null
  return `${CF_PUBLIC_URL}/covers/${filename}`
}

async function processTable(table) {
  console.log(`\n📋 Table: ${table}`)

  // Fetch all rows with docln or hako in the cover_url
  const all = []
  let from = 0
  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select('id, cover_url')
      .or('cover_url.ilike.%docln%,cover_url.ilike.%hako%')
      .range(from, from + 999)

    if (error) { console.error(`   ❌ Fetch error:`, error.message); break }
    if (!data || data.length === 0) break
    all.push(...data)
    if (data.length < 1000) break
    from += 1000
  }

  console.log(`   Found ${all.length} rows with docln/hako URLs`)
  if (all.length === 0) return

  let updated = 0, failed = 0

  for (const row of all) {
    const newUrl = buildR2Url(row.cover_url)
    if (!newUrl) {
      console.log(`   ⚠️  Could not parse: ${row.cover_url}`)
      failed++
      continue
    }

    if (DRY_RUN) {
      console.log(`   [DRY] ${row.cover_url}`)
      console.log(`       → ${newUrl}`)
      updated++
      continue
    }

    const { error } = await supabase
      .from(table)
      .update({ cover_url: newUrl })
      .eq('id', row.id)

    if (error) {
      console.error(`   ❌ Update failed for id ${row.id}:`, error.message)
      failed++
    } else {
      updated++
      process.stdout.write(`\r   Updated: ${updated} / ${all.length}`)
    }
  }

  console.log(`\n   ✅ ${updated} updated, ${failed} failed`)
}

async function main() {
  console.log('🔗 Updating DB cover_url: docln/hako → R2')
  console.log(`   R2 public URL : ${CF_PUBLIC_URL}`)
  console.log(`   Dry run       : ${DRY_RUN}`)

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
    process.exit(1)
  }

  if (CF_PUBLIC_URL.includes('XXXXXXXXXX')) {
    console.error('❌ Please fill in CF_PUBLIC_URL at the top of the script')
    process.exit(1)
  }

  await processTable('series')
  await processTable('volumes')

  console.log('\n✨ Done! All docln/hako URLs now point to R2.')
  console.log('   Images not in R2 (MAL, AniList, etc.) were left unchanged.')
}

main().catch(err => {
  console.error('Fatal:', err)
  process.exit(1)
})
