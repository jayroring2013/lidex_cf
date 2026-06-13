/**
 * upload-covers-to-r2.mjs
 *
 * Uploads local cover images to Cloudflare R2 and updates Supabase DB
 * ONLY for rows where cover_url contains 'docln' or 'hako'.
 *
 * Filename matching:
 *   URL  → https://i.docln.net/lightnovel/covers/u2-0549dc6f-4e42-4611-aa12-597a38c33129.jpg
 *   File → u2-0549dc6f-4e42-4611-aa12-597a38c33129.jpg
 *
 * Usage:
 *   node scripts/upload-covers-to-r2.mjs
 *
 * Install deps first:
 *   npm install @aws-sdk/client-s3 @supabase/supabase-js dotenv
 */

import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3'
import { createClient } from '@supabase/supabase-js'
import { readdir, readFile } from 'fs/promises'
import { extname, join } from 'path'
import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

// ── ✏️  FILL THESE IN ──────────────────────────────────────────────────────────
const LOCAL_FOLDER    = 'C:/path/to/your/covers/folder'   // folder with your 900 images
const CF_ACCOUNT_ID   = 'YOUR_CLOUDFLARE_ACCOUNT_ID'
const CF_ACCESS_KEY   = 'YOUR_R2_ACCESS_KEY_ID'
const CF_SECRET_KEY   = 'YOUR_R2_SECRET_ACCESS_KEY'
const CF_BUCKET_NAME  = 'lidex-covers'
const CF_PUBLIC_URL   = 'https://pub-2080c0fa70954a7e98e48daff887c4cf.r2.dev'  // no trailing slash
// ──────────────────────────────────────────────────────────────────────────────

const DRY_RUN = false  // set true to preview without uploading or updating DB

const SUPABASE_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY

// ── Clients ───────────────────────────────────────────────────────────────────

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

/** Extract filename from a docln/hako URL */
function urlToFilename(url) {
  try {
    return new URL(url).pathname.split('/').pop() || null
  } catch {
    return null
  }
}

/** Only process docln / hako URLs */
function isTargetUrl(url) {
  if (!url) return false
  return url.includes('docln') || url.includes('hako')
}

/** Upload one file to R2 (skips if already there) */
async function uploadToR2(filename, localPath) {
  const key = `covers/${filename}`

  // Check if already uploaded
  try {
    await r2.send(new HeadObjectCommand({ Bucket: CF_BUCKET_NAME, Key: key }))
    return `${CF_PUBLIC_URL}/${key}` // already exists
  } catch {}

  const buffer = await readFile(localPath)
  const ext = extname(filename).toLowerCase().slice(1)
  const contentTypeMap = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif' }
  const contentType = contentTypeMap[ext] || 'image/jpeg'

  await r2.send(new PutObjectCommand({
    Bucket: CF_BUCKET_NAME,
    Key: key,
    Body: buffer,
    ContentType: contentType,
    CacheControl: 'public, max-age=31536000, immutable',
  }))

  return `${CF_PUBLIC_URL}/${key}`
}

/** Fetch all rows from a table where cover_url contains docln or hako */
async function fetchTargetRows(table) {
  const all = []
  let from = 0

  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select('id, cover_url')
      .or('cover_url.ilike.%docln%,cover_url.ilike.%hako%')
      .range(from, from + 999)

    if (error) { console.error(`[${table}] fetch error:`, error.message); break }
    if (!data || data.length === 0) break
    all.push(...data)
    if (data.length < 1000) break
    from += 1000
  }

  return all
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🚀 R2 Cover Uploader — docln/hako only')
  console.log(`   Folder : ${LOCAL_FOLDER}`)
  console.log(`   Bucket : ${CF_BUCKET_NAME}`)
  console.log(`   Dry run: ${DRY_RUN}\n`)

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
    process.exit(1)
  }

  // 1. Build a map of filename → full local path from your folder
  console.log('📂 Reading local folder...')
  const localFiles = await readdir(LOCAL_FOLDER)
  const fileMap = new Map() // filename → full path
  for (const f of localFiles) {
    fileMap.set(f.toLowerCase(), join(LOCAL_FOLDER, f))
  }
  console.log(`   Found ${fileMap.size} local images\n`)

  let uploaded = 0, updated = 0, notFound = 0, skipped = 0

  for (const table of ['series', 'volumes']) {
    console.log(`📋 Processing table: ${table}`)

    const rows = await fetchTargetRows(table)
    console.log(`   ${rows.length} rows with docln/hako URLs`)

    for (const row of rows) {
      const filename = urlToFilename(row.cover_url)
      if (!filename) { skipped++; continue }

      const localPath = fileMap.get(filename.toLowerCase())

      if (!localPath) {
        console.log(`   ⚠️  Not in local folder: ${filename}`)
        notFound++
        continue
      }

      if (DRY_RUN) {
        console.log(`   [DRY] Would upload: ${filename}`)
        uploaded++
        continue
      }

      try {
        const r2Url = await uploadToR2(filename, localPath)
        uploaded++

        await supabase
          .from(table)
          .update({ cover_url: r2Url })
          .eq('id', row.id)

        updated++
        process.stdout.write(`\r   Uploaded & updated: ${updated} / ${rows.length}`)
      } catch (err) {
        console.error(`\n   ❌ Failed for ${filename}:`, err.message)
        skipped++
      }
    }

    console.log(`\n   ✅ Done with ${table}\n`)
  }

  console.log('─────────────────────────────')
  console.log(`✨ Complete!`)
  console.log(`   Uploaded to R2 : ${uploaded}`)
  console.log(`   DB rows updated: ${updated}`)
  console.log(`   Not in folder  : ${notFound}  (these keep their original URLs)`)
  console.log(`   Skipped/errors : ${skipped}`)
}

main().catch(err => {
  console.error('Fatal:', err)
  process.exit(1)
})
