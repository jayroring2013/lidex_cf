import requests
import pandas as pd
import json
import re
from html import unescape

# ============================================================
# CONFIG
# ============================================================

BASE_URL = "https://pb.tana.moe/api/collections"
OUTPUT_FILE = "tana_latest_10_books.xlsx"

# only latest 10 books
PER_PAGE = 10
PAGE = 1

# ============================================================
# SESSION
# ============================================================

session = requests.Session()
session.verify = False

HEADERS = {
    "User-Agent": "Mozilla/5.0",
    "Accept": "application/json"
}

# ============================================================
# HELPERS
# ============================================================

def clean_html(text):
    """
    Remove HTML tags and clean formatting.
    """
    if not text:
        return ""

    text = unescape(text)

    # convert paragraph endings to linebreaks
    text = re.sub(r"</p>", "\n\n", text, flags=re.IGNORECASE)

    # remove all html tags
    text = re.sub(r"<[^>]+>", "", text)

    # cleanup excessive newlines
    text = re.sub(r"\n{3,}", "\n\n", text)

    return text.strip()


def safe_get(d, *keys):
    """
    Safe nested dictionary getter.
    """
    current = d

    for k in keys:
        if not isinstance(current, dict):
            return None
        current = current.get(k)

    return current


def extract_cover_urls(images):
    """
    Extract image URLs from metadata.images
    """
    if not images:
        return []

    urls = []

    # publication images = list
    if isinstance(images, list):
        for img in images:
            if isinstance(img, dict):
                if "1280w" in img:
                    urls.append(
                        "https://pb.tana.moe/api/files/"
                        + img["1280w"]
                    )

    # title images = dict
    elif isinstance(images, dict):
        if "1280w" in images:
            urls.append(
                "https://pb.tana.moe/api/files/"
                + images["1280w"]
            )

    return urls


# ============================================================
# FETCH LATEST BOOKS
# ============================================================

print("=" * 70)
print("FETCHING LATEST UPDATED BOOKS")
print("=" * 70)

BOOKS_URL = (
    f"{BASE_URL}/books/records"
    f"?page={PAGE}"
    f"&perPage={PER_PAGE}"
    f"&sort=-updated"
    f"&expand=publication"
)

print("URL:")
print(BOOKS_URL)
print()

response = session.get(
    BOOKS_URL,
    headers=HEADERS,
    timeout=60
)

print("HTTP:", response.status_code)

if response.status_code != 200:
    print(response.text)
    raise SystemExit()

books_json = response.json()
book_records = books_json.get("items", [])

print("Books returned:", len(book_records))
print()

# ============================================================
# CACHE
# ============================================================

release_cache = {}
title_cache = {}
publisher_cache = {}
partner_cache = {}

# ============================================================
# OUTPUT ROWS
# ============================================================

book_rows = []
publication_rows = []
release_rows = []
title_rows = []
publisher_rows = []

# ============================================================
# PROCESS BOOKS
# ============================================================

for idx, book in enumerate(book_records, start=1):

    print(f"[{idx:02d}] BOOK {book.get('id')}")

    publication = safe_get(book, "expand", "publication")

    if not publication:
        print("   -> NO PUBLICATION")
        continue

    release_id = publication.get("release")

    # ========================================================
    # FETCH RELEASE
    # ========================================================

    if release_id not in release_cache:

        release_url = (
            f"{BASE_URL}/releases/records/{release_id}"
            f"?expand=publisher,title,partner"
        )

        r = session.get(
            release_url,
            headers=HEADERS,
            timeout=60
        )

        if r.status_code == 200:
            release_cache[release_id] = r.json()
        else:
            release_cache[release_id] = {}

    release = release_cache[release_id]

    # ========================================================
    # FETCH TITLE
    # ========================================================

    title_id = release.get("title")

    if title_id and title_id not in title_cache:

        title_url = (
            f"{BASE_URL}/titles/records/{title_id}"
            f"?expand=genres,demographic,format"
        )

        r = session.get(
            title_url,
            headers=HEADERS,
            timeout=60
        )

        if r.status_code == 200:
            title_cache[title_id] = r.json()
        else:
            title_cache[title_id] = {}

    title = title_cache.get(title_id, {})

    # ========================================================
    # EXPANDED OBJECTS
    # ========================================================

    publisher = safe_get(release, "expand", "publisher") or {}
    partner = safe_get(release, "expand", "partner") or {}

    # ========================================================
    # TITLE INFO
    # ========================================================

    genres = safe_get(title, "expand", "genres") or []

    genre_names = [
        g.get("name")
        for g in genres
        if g.get("name")
    ]

    demographic = safe_get(
        title,
        "expand",
        "demographic",
        "name"
    )

    format_name = safe_get(
        title,
        "expand",
        "format",
        "name"
    )

    # ========================================================
    # CLEAN DESCRIPTION
    # ========================================================

    title_description = clean_html(
        title.get("description", "")
    )

    publication_description = clean_html(
        publication.get("description", "")
    )

    # ========================================================
    # REAL VOLUME NUMBER
    # ========================================================

    raw_volume = publication.get("volume")

    volume_number = None

    if isinstance(raw_volume, int):
        volume_number = raw_volume // 10000

    # ========================================================
    # IMAGE URLS
    # ========================================================

    publication_images = extract_cover_urls(
        safe_get(publication, "metadata", "images")
    )

    title_images = extract_cover_urls(
        safe_get(title, "metadata", "images")
    )

    # ========================================================
    # BOOK ROW
    # ========================================================

    book_rows.append({
        "book_id": book.get("id"),
        "publication_id": publication.get("id"),
        "release_id": release.get("id"),
        "title_id": title.get("id"),

        "book_title": publication.get("name"),
        "series_title": title.get("name"),

        "edition": book.get("edition"),
        "volume_index_raw": raw_volume,
        "volume_number": volume_number,

        "publisher": publisher.get("name"),
        "imprint": partner.get("name"),

        "release_name": release.get("name"),
        "release_type": release.get("type"),
        "release_status": release.get("status"),

        "demographic": demographic,
        "format": format_name,
        "genres": ", ".join(genre_names),

        "price": book.get("price"),
        "publish_date": book.get("publishDate"),

        "title_description": title_description,
        "publication_description": publication_description,
        "note": book.get("note"),

        "publication_cover_urls": "\n".join(publication_images),
        "title_cover_urls": "\n".join(title_images),

        "slug": title.get("slug"),
        "slug_group": title.get("slugGroup"),

        "created": book.get("created"),
        "updated": book.get("updated")
    })

    # ========================================================
    # PUBLICATION ROW
    # ========================================================

    publication_rows.append({
        "publication_id": publication.get("id"),
        "name": publication.get("name"),
        "release_id": publication.get("release"),
        "default_book": publication.get("defaultBook"),
        "volume_raw": raw_volume,
        "volume_number": volume_number,
        "subtitle": publication.get("subtitle"),
        "description": publication_description,
        "updated": publication.get("updated")
    })

    # ========================================================
    # RELEASE ROW
    # ========================================================

    release_rows.append({
        "release_id": release.get("id"),
        "name": release.get("name"),
        "title_id": release.get("title"),
        "publisher_id": release.get("publisher"),
        "partner_id": release.get("partner"),

        "publisher_name": publisher.get("name"),
        "partner_name": partner.get("name"),

        "type": release.get("type"),
        "status": release.get("status"),
        "digital": release.get("digital"),

        "updated": release.get("updated")
    })

    # ========================================================
    # TITLE ROW
    # ========================================================

    title_rows.append({
        "title_id": title.get("id"),
        "name": title.get("name"),
        "slug": title.get("slug"),
        "slug_group": title.get("slugGroup"),

        "demographic": demographic,
        "format": format_name,
        "genres": ", ".join(genre_names),

        "description": title_description,

        "updated": title.get("updated")
    })

    # ========================================================
    # PUBLISHER ROW
    # ========================================================

    if publisher:
        publisher_rows.append({
            "publisher_id": publisher.get("id"),
            "publisher_name": publisher.get("name"),
            "slug": publisher.get("slug")
        })

    print("   Series :", title.get("name"))
    print("   Volume :", publication.get("name"))
    print("   Publisher :", publisher.get("name"))
    print("   Imprint :", partner.get("name"))
    print()

# ============================================================
# DATAFRAMES
# ============================================================

books_df = pd.DataFrame(book_rows)
publications_df = pd.DataFrame(publication_rows)
releases_df = pd.DataFrame(release_rows)
titles_df = pd.DataFrame(title_rows)
publishers_df = pd.DataFrame(publisher_rows)

# deduplicate
publications_df = publications_df.drop_duplicates()
releases_df = releases_df.drop_duplicates()
titles_df = titles_df.drop_duplicates()
publishers_df = publishers_df.drop_duplicates()

# ============================================================
# MARKDOWN EXPLANATION
# ============================================================

markdown_text = r"""
# Tana.moe API Relationship Structure

## Core Relationship

The actual structure is:

titles
  └── releases
        └── publications
              └── books

---

# 1. titles

Represents the SERIES.

Example:
- Blue Lock
- Frieren
- Sousou no Frieren

Contains:
- series title
- genres
- demographic
- format
- series description
- slug

Collection:
`/collections/titles`

---

# 2. releases

Represents a PUBLISHING RELEASE of a title.

Contains:
- publisher
- imprint / partner
- release type
- release status

Collection:
`/collections/releases`

Relationships:
- release.title -> titles.id
- release.publisher -> publishers.id
- release.partner -> imprints / company

---

# 3. publications

Represents a SPECIFIC VOLUME.

Examples:
- Blue Lock - Tập 1
- Blue Lock - Tập 2

Contains:
- volume name
- volume numeric index
- release relationship
- cover images

Collection:
`/collections/publications`

Relationships:
- publication.release -> releases.id

---

# 4. books

Represents a SALE VERSION / EDITION.

Examples:
- Standard edition
- Special edition
- Limited edition

Contains:
- edition
- price
- notes
- publication relationship

Collection:
`/collections/books`

Relationships:
- book.publication -> publications.id

---

# Why volume values are 10000, 20000, 30000

The API stores volume as a sortable numeric index.

Examples:

10000 = Volume 1
20000 = Volume 2
30000 = Volume 3

This allows stable sorting and future insertion.

For example:

15000 could become:
- Volume 1.5
- Side story
- Extra chapter

Without needing to renumber everything.

The crawler converts:

real_volume = volume // 10000

---

# Crawl Flow

The crawler works in this order:

1. Fetch latest books
   sort=-updated

2. Expand publication
   expand=publication

3. Fetch release
   expand=publisher,title,partner

4. Fetch title
   expand=genres,demographic,format

5. Merge everything into final rows

This reconstructs the full relationship tree entirely from API data.

No HTML scraping is used.
"""

# ============================================================
# SAVE EXCEL
# ============================================================

with pd.ExcelWriter(OUTPUT_FILE, engine="openpyxl") as writer:

    books_df.to_excel(
        writer,
        sheet_name="books",
        index=False
    )

    publications_df.to_excel(
        writer,
        sheet_name="publications",
        index=False
    )

    releases_df.to_excel(
        writer,
        sheet_name="releases",
        index=False
    )

    titles_df.to_excel(
        writer,
        sheet_name="titles",
        index=False
    )

    publishers_df.to_excel(
        writer,
        sheet_name="publishers",
        index=False
    )

    pd.DataFrame({
        "markdown": [markdown_text]
    }).to_excel(
        writer,
        sheet_name="relationship_explained",
        index=False
    )

print("=" * 70)
print("DONE")
print("=" * 70)
print("Books:", len(books_df))
print("Publications:", len(publications_df))
print("Releases:", len(releases_df))
print("Titles:", len(titles_df))
print("Publishers:", len(publishers_df))
print()
print("Saved:", OUTPUT_FILE)
