# Content detail page optimization patch

Apply these small edits to `src/app/content/[id]/page.tsx` if you want the detail page to use the cached enrichment helper directly.

## 1. Replace the enrichment import

Find:

```ts
import { fetchSeriesEnrichmentData } from '@/lib/db'
```

Replace with:

```ts
import { getCachedSeriesEnrichmentData } from '@/lib/cachedSeriesEnrichment'
```

## 2. Replace the enrichment fetch call

Find:

```ts
const data = await fetchSeriesEnrichmentData(seriesId!, series.item_type)
```

Replace with:

```ts
const data = await getCachedSeriesEnrichmentData(seriesId!, series.item_type)
```

## 3. Stop reloading public enrichment when the user changes private rating/status

Find:

```ts
  }, [series, seriesId, userLibraryEntry.rating, userLibraryEntry.status, userLibrarySaving])
```

Replace with:

```ts
  }, [series, seriesId])
```

This prevents the page from re-running the whole public enrichment query after private user rating/status changes.

## 4. Add safer image decoding/loading hints

Find the hero banner image:

```tsx
<img src={bannerImage} alt="" className="w-full h-full object-cover object-center" />
```

Replace with:

```tsx
<img
  src={bannerImage}
  alt=""
  loading="eager"
  decoding="async"
  className="w-full h-full object-cover object-center"
/>
```

Find the main cover image:

```tsx
<img
  src={coverSrc}
  alt={series.title}
  className="w-full h-auto block"
  onError={() => setImageError(true)}
/>
```

Replace with:

```tsx
<img
  src={coverSrc}
  alt={series.title}
  loading="eager"
  decoding="async"
  className="w-full h-auto block"
  onError={() => setImageError(true)}
/>
```

## Expected impact

- Public series enrichment can be reused for one hour.
- User rating/status updates no longer trigger the expensive public enrichment reload.
- Main content images decode asynchronously.
- User-private library calls remain uncached/no-store.
