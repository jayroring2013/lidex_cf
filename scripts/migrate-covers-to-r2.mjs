/**
 * migrate-covers-to-r2.mjs
 * 
 * Downloads all cover images from series + volumes tables and uploads them to Cloudflare R2.
 * Updates the database records with the new R2 URLs.
 * 
 * Usage:
 *   node migrate-covers-to-r2.mjs
 * 
 * Prerequisites:
 *   npm install @aws-sdk/client-s3 @supabase/supabase-js node-fetch dotenv
 */

import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3'
import { createClient } from '@supabase/supabase-js'
import fetch from 'node-fetch'
import { createReadStream } from 'fs'
import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

// ── Config — fill these in ────────────────────────────────────────────────────
const CF_ACCOUNT_ID   = 'YOUR_CLOUDFLARE_ACCOUNT_ID'
const CF_ACCESS_KEY   = 'YOUR_R2_ACCESS_KEY_ID'
const CF_SECRET_KEY   = 'YOUR_R2_SECRET_ACCESS_KEY'
const CF_BUCKET_NAME  = 'lidex-covers'
const CF_PUBLIC_URL   = 'https://pub-XXXXXXXXXXXXXXXXXX.r2.dev' // Your R2 public bucket URL

const SUPABASE_URL    = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY    = process.env.SUPABASE_SERVICE_ROLE_KEY  // Need service role to update rows
// ─────────────────────────────────────────────────────────────────────────────

const CONCURRENCY = 5   // How many images to upload at once
const DRY_RUN = false   // Set true to test without making changes

const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${CF_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: CF_ACCESS_KEY,
    secretAccessKey: CF_SECRET_KEY,
  },
})

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// ── Helpers ───────────────────────────────────────────────────────────────────

function shouldSkip(url) {
  if (!url) return true
  // Already on R2
  if (url.includes('r2.dev') || url.includes('cloudflarestorage.com')) return true
  // Already on Supabase storage (avatars etc — skip those)
  if (url.includes('supabase.co/storage')) return true
  return false
}

function urlToKey(url, prefix) {
  try {
    const parsed = new URL(url)
    // Use the last path segment + query hash as filename to avoid collisions
    const pathname = parsed.pathname.replace(/^\//, '')
    const ext = pathname.split('.').pop()?.split('?')[0] || 'jpg'
    const hash = Buffer.from(url).toString('base64url').slice(0, 16)
    return `${prefix}/${hash}.${ext}`
  } catch {
    return null
  }
}

async function fileAlreadyInR2(key) {
  try {
    await r2.send(new HeadObjectCommand({ Bucket: CF_BUCKET_NAME, Key: key }))
    return true
  } catch {
    return false
  }
}

async function downloadAndUpload(sourceUrl, key) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 20000)

  try {
    const res = await fetch(sourceUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; LiDex-Migrator/1.0)',
        'Accept': 'image/*,*/*;q=0.8',
      },
      redirect: 'follow',
    })

    if (!res.ok) throw new Error(`HTTP ${res.status}`)

    const buffer = await res.buffer()
    const contentType = res.headers.get('content-type') || 'image/jpeg'

    if (!contentType.startsWith('image/')) {
      throw new Error(`Not an image: ${contentType}`)
    }

    if (!DRY_RUN) {
      await r2.send(new PutObjectCommand({
        Bucket: CF_BUCKET_NAME,
        Key: key,
        Body: buffer,
        ContentType: contentType,
        CacheControl: 'public, max-age=31536000, immutable',
      }))
    }

    return `${CF_PUBLIC_URL}/${key}`
  } finally {
    clearTimeout(timeout)
  }
}

async function processBatch(items, processor) {
  const results = []
  for (let i = 0; i < items.length; i += CONCURRENCY) {
    const batch = items.slice(i, i + CONCURRENCY)
    const batchResults = await Promise.allSettled(batch.map(processor))
    results.push(...batchResults)
    process.stdout.write(`\r  Progress: ${Math.min(i + CONCURRENCY, items.length)}/${items.length}`)
  }
  console.log()
  return results
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function migrateSeries() {
  console.log('\n📚 Fetching series cover URLs...')

  const allRows = []
  let from = 0
  while (true) {
    const { data, error } = await supabase
      .from('series')
      .select('id, title, cover_url')
      .not('cover_url', 'is', null)
      .range(from, from + 999)

    if (error) { console.error('Failed to fetch series:', error.message); break }
    if (!data || data.length === 0) break
    allRows.push(...data)
    if (data.length < 1000) break
    from += 1000
  }

  console.log(`  Found ${allRows.length} series with cover URLs`)

  const toProcess = allRows.filter(r => !shouldSkip(r.cover_url))
  console.log(`  ${toProcess.length} need migration (${allRows.length - toProcess.length} already done/skipped)`)

  let success = 0, failed = 0

  await processBatch(toProcess, async (row) => {
    const key = urlToKey(row.cover_url, 'series')
    if (!key) { failed++; return }

    const alreadyUploaded = await fileAlreadyInR2(key)
    const newUrl = alreadyUploaded
      ? `${CF_PUBLIC_URL}/${key}`
      : await downloadAndUpload(row.cover_url, key)

    if (!DRY_RUN) {
      await supabase
        .from('series')
        .update({ cover_url: newUrl })
        .eq('id', row.id)
    }

    success++
    return newUrl
  })

  console.log(`  ✅ Series: ${success} migrated, ${failed} failed`)
}

async function migrateVolumes() {
  console.log('\n📖 Fetching volume cover URLs...')

  const allRows = []
  let from = 0
  while (true) {
    const { data, error } = await supabase
      .from('volumes')
      .select('id, cover_url')
      .not('cover_url', 'is', null)
      .range(from, from + 999)

    if (error) { console.error('Failed to fetch volumes:', error.message); break }
    if (!data || data.length === 0) break
    allRows.push(...data)
    if (data.length < 1000) break
    from += 1000
  }

  console.log(`  Found ${allRows.length} volumes with cover URLs`)

  const toProcess = allRows.filter(r => !shouldSkip(r.cover_url))
  console.log(`  ${toProcess.length} need migration`)

  let success = 0, failed = 0

  await processBatch(toProcess, async (row) => {
    const key = urlToKey(row.cover_url, 'volumes')
    if (!key) { failed++; return }

    const alreadyUploaded = await fileAlreadyInR2(key)
    const newUrl = alreadyUploaded
      ? `${CF_PUBLIC_URL}/${key}`
      : await downloadAndUpload(row.cover_url, key)

    if (!DRY_RUN) {
      await supabase
        .from('volumes')
        .update({ cover_url: newUrl })
        .eq('id', row.id)
    }

    success++
    return newUrl
  })

  console.log(`  ✅ Volumes: ${success} migrated, ${failed} failed`)
}

async function main() {
  console.log('🚀 LiDex Cover Migration → Cloudflare R2')
  console.log(`   Bucket: ${CF_BUCKET_NAME}`)
  console.log(`   Public URL: ${CF_PUBLIC_URL}`)
  console.log(`   Dry run: ${DRY_RUN}`)

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
    process.exit(1)
  }

  if (CF_ACCOUNT_ID === 'YOUR_CLOUDFLARE_ACCOUNT_ID') {
    console.error('❌ Please fill in the config values at the top of the script')
    process.exit(1)
  }

  await migrateSeries()
  await migrateVolumes()

  console.log('\n✨ Migration complete!')
  console.log('   Images are now on R2 and DB URLs have been updated.')
  console.log('   You can now update imageProxy.ts to skip proxying for r2.dev URLs.')
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
