#!/usr/bin/env python3
import os
import sys
import argparse
import urllib.request
import psycopg2
from datetime import datetime, timedelta
from PIL import Image, ImageDraw, ImageFont

# Neon DB Connection URL
db_url = "postgresql://neondb_owner:npg_m8HMX3QZNERs@ep-divine-poetry-aou08wpe-pooler.c-2.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require"

# Standard font paths on Windows
FONT_BOLD = "C:/Windows/Fonts/segoeuib.ttf"
FONT_REG = "C:/Windows/Fonts/segoeui.ttf"
FONT_SEMIBOLD = "C:/Windows/Fonts/segoeuisl.ttf"

# Create a local cache folder for cover thumbnails
CACHE_DIR = "./cover_cache"
os.makedirs(CACHE_DIR, exist_ok=True)

def get_vietnamese_day_name(date_obj):
    # Map weekday number to Vietnamese names
    day_map = {
        0: "THỨ HAI",
        1: "THỨ BA",
        2: "THỨ TƯ",
        3: "THỨ NĂM",
        4: "THỨ SÁU",
        5: "THỨ BẢY",
        6: "CHỦ NHẬT"
    }
    return day_map.get(date_obj.weekday(), "HÀNG NGÀY")

def format_vnd(price):
    if price is None or price == 0:
        return "Chưa rõ giá"
    try:
        val = int(price)
        return f"{val:,.0f}đ".replace(",", ".")
    except:
        return str(price)

def download_and_resize_cover(url, volume_id):
    if not url:
        return None
    
    local_path = os.path.join(CACHE_DIR, f"{volume_id}.jpg")
    
    # Download if not cached
    if not os.path.exists(local_path):
        try:
            # Set a 3-second timeout for downloading
            headers = {'User-Agent': 'Mozilla/5.0'}
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=3) as response:
                with open(local_path, 'wb') as out_file:
                    out_file.write(response.read())
        except Exception as e:
            # Silent fallback on download error
            return None
            
    # Try to load and resize
    try:
        with Image.open(local_path) as img:
            # Resize to cover thumb: 45 width, 65 height
            thumb = img.convert("RGBA").resize((45, 65), Image.Resampling.LANCZOS)
            return thumb
    except:
        return None

def fetch_calendar_data(week_str, limit=18):
    conn = psycopg2.connect(db_url)
    cursor = conn.cursor()
    
    query = """
        SELECT 
            v.id,
            s.title_vi as series_title_vi,
            s.title as series_title,
            s.author as series_author,
            s.artist as series_artist,
            s.item_type as series_item_type,
            v.volume_number,
            v.title as volume_title,
            v.release_date,
            p.name_vi as publisher_name_vi,
            p.name as publisher_name,
            v.price,
            v.cover_url as volume_cover_url,
            s.cover_url as series_cover_url
        FROM volumes v
        JOIN series s ON v.series_id = s.id
        LEFT JOIN publishers p ON v.publisher_id = p.id
        WHERE v.release_date IS NOT NULL
          AND TO_CHAR(v.release_date, 'IYYY-IW') = %s
        ORDER BY v.release_date ASC, s.title_vi ASC, v.volume_number ASC
        LIMIT %s
    """
    
    cursor.execute(query, (week_str, limit))
    rows = cursor.fetchall()
    
    # Get column names
    colnames = [desc[0] for desc in cursor.description]
    
    # Map to dicts
    data = []
    for r in rows:
        d = dict(zip(colnames, r))
        data.append(d)
        
    cursor.close()
    conn.close()
    return data

def generate_image(week_str, output_path="release_calendar.jpg", limit=18):
    print(f"Fetching releases for week {week_str}...")
    # Fetch a larger pool to find enough releases
    raw_releases = fetch_calendar_data(week_str, limit=200)
    
    # Identify the top 7 series by volume count in this week
    from collections import Counter
    series_counts = Counter()
    for r in raw_releases:
        series_key = r.get('series_title_vi') or r.get('series_title')
        series_counts[series_key] += 1
        
    top_7_series = [item[0] for item in series_counts.most_common(7)]
    target_series_set = set(top_7_series)
    
    # Filter raw_releases to only include volumes from those 7 series
    releases = []
    for r in raw_releases:
        series_key = r.get('series_title_vi') or r.get('series_title')
        if series_key in target_series_set:
            releases.append(r)
        if len(releases) >= limit:
            break

    if not releases:
        print(f"No releases found for week {week_str}. Try another week, e.g. 2025-32")
        return False
        
    actual_series_count = len(set(r.get('series_title_vi') or r.get('series_title') for r in releases))
    print(f"Found {len(releases)} releases from {actual_series_count} different series. Generating image...")
    
    # Setup canvas dimensions
    width = 1600
    header_h = 160
    col_header_h = 60
    day_header_h = 60
    row_h = 85
    footer_h = 50
    
    # Group releases by date
    grouped = {}
    for r in releases:
        d = r['release_date']
        if d not in grouped:
            grouped[d] = []
        grouped[d].append(r)
        
    num_days = len(grouped)
    num_rows = len(releases)
    
    total_height = header_h + col_header_h + (num_days * day_header_h) + (num_rows * row_h) + footer_h
    
    # Create blank canvas
    img = Image.new("RGB", (width, total_height), "#0b0f19")
    draw = ImageDraw.Draw(img)
    
    # Load fonts
    try:
        font_title = ImageFont.truetype(FONT_BOLD, 36)
        font_subtitle = ImageFont.truetype(FONT_SEMIBOLD, 14)
        font_week = ImageFont.truetype(FONT_BOLD, 18)
        font_badge = ImageFont.truetype(FONT_BOLD, 14)
        font_col_header = ImageFont.truetype(FONT_BOLD, 13)
        font_day_header = ImageFont.truetype(FONT_BOLD, 14)
        font_row_title = ImageFont.truetype(FONT_BOLD, 15)
        font_row_subtitle = ImageFont.truetype(FONT_REG, 11)
        font_row_normal = ImageFont.truetype(FONT_REG, 14)
        font_row_bold = ImageFont.truetype(FONT_BOLD, 14)
        font_badge_text = ImageFont.truetype(FONT_BOLD, 10)
    except:
        print("Warning: Segoe UI fonts not found. Falling back to default system fonts.")
        font_title = font_subtitle = font_week = font_badge = font_col_header = font_day_header = font_row_title = font_row_subtitle = font_row_normal = font_row_bold = font_badge_text = ImageFont.load_default()

    # Draw header background (sleek gradient simulation)
    for y in range(header_h):
        # Linear interpolation from deep indigo to dark blue
        r_val = int(9 + (15 - 9) * (y / header_h))
        g_val = int(14 + (23 - 14) * (y / header_h))
        b_val = int(25 + (41 - 25) * (y / header_h))
        draw.line([(0, y), (width, y)], fill=(r_val, g_val, b_val))
        
    # Draw calendar icon in header
    draw.rectangle([50, 45, 100, 95], outline="#818cf8", width=3)
    draw.rectangle([50, 45, 100, 58], fill="#818cf8")
    for i in range(3):
        for j in range(3):
            draw.rectangle([60 + j*12, 68 + i*8, 64 + j*12, 72 + i*8], fill="#ffffff")
            
    # Draw header text
    draw.text((120, 42), "LỊCH PHÁT HÀNH", fill="#ffffff", font=font_title)
    draw.text((120, 87), "CẬP NHẬT MANGA & LIGHT NOVEL MỚI NHẤT", fill="#818cf8", font=font_subtitle)
    
    # Calculate dates of week
    start_date = min(grouped.keys())
    end_date = max(grouped.keys())
    week_range_text = f"{start_date.strftime('%d/%m/%Y')} – {end_date.strftime('%d/%m/%Y')}"
    
    # Week Box (Center-Right)
    draw.rectangle([1030, 45, 1330, 95], fill="#1e293b", outline="#243249", width=1)
    draw.text((1050, 52), "TUẦN PHÁT HÀNH", fill="#94a3b8", font=font_row_subtitle)
    draw.text((1050, 68), week_range_text, fill="#ffffff", font=font_week)
    
    # Total Releases Badge (Right)
    badge_x_start = 1350
    badge_width = 200
    draw.rectangle([badge_x_start, 45, badge_x_start + badge_width, 95], fill="#6366f1", outline="#818cf8", width=1)
    draw.text((badge_x_start + 20, 52), "TỔNG SỐ LƯỢNG", fill="#c7d2fe", font=font_row_subtitle)
    draw.text((badge_x_start + 20, 68), f"{len(releases)} PHÁT HÀNH", fill="#ffffff", font=font_badge)
    
    # Draw horizontal rule below header
    draw.line([(0, header_h), (width, header_h)], fill="#1e293b")
    
    # Column Header Layout
    col_y = header_h + 15
    draw.text((50, col_y), "#", fill="#e2695f", font=font_col_header)
    draw.text((130, col_y), "TÁC PHẨM", fill="#e2695f", font=font_col_header)
    draw.text((680, col_y), "PHÂN LOẠI", fill="#e2695f", font=font_col_header)
    draw.text((860, col_y), "TẬP", fill="#e2695f", font=font_col_header)
    draw.text((980, col_y), "NGÀY PHÁT HÀNH", fill="#e2695f", font=font_col_header)
    draw.text((1200, col_y), "NHÀ XUẤT BẢN", fill="#e2695f", font=font_col_header)
    draw.text((1430, col_y), "GIÁ BÁN", fill="#e2695f", font=font_col_header)
    
    draw.line([(0, header_h + col_header_h), (width, header_h + col_header_h)], fill="#1e293b")
    
    # Render loop grouped by days
    current_y = header_h + col_header_h
    row_index = 1
    
    sorted_dates = sorted(grouped.keys())
    for release_date in sorted_dates:
        day_releases = grouped[release_date]
        day_name = get_vietnamese_day_name(release_date)
        day_str = f"{day_name} · {release_date.strftime('%d/%m/%Y')}"
        
        # Draw Day Header
        draw.rectangle([0, current_y, width, current_y + day_header_h], fill="#0f172a")
        # Left accent dot
        draw.ellipse([50, current_y + 24, 60, current_y + 34], fill="#818cf8")
        draw.text((75, current_y + 20), day_str, fill="#818cf8", font=font_day_header)
        
        # Thin divider line
        draw.line([(350, current_y + 30), (width - 50, current_y + 30)], fill="#1e293b")
        
        current_y += day_header_h
        
        # Draw Rows for this day
        for r in day_releases:
            # Alternating background slightly
            if row_index % 2 == 0:
                draw.rectangle([0, current_y, width, current_y + row_h], fill="#0e1422")
            else:
                draw.rectangle([0, current_y, width, current_y + row_h], fill="#0b0f19")
                
            # Row index STT
            stt_str = f"{row_index:02d}"
            draw.text((50, current_y + 32), stt_str, fill="#94a3b8", font=font_row_bold)
            
            # Fetch and draw cover thumbnail
            cover_url = r['volume_cover_url'] or r['series_cover_url']
            thumb = download_and_resize_cover(cover_url, r['id'])
            
            thumb_x = 90
            thumb_y = current_y + 10
            if thumb:
                img.paste(thumb, (thumb_x, thumb_y), thumb)
            else:
                # Draw placeholder cover
                draw.rectangle([thumb_x, thumb_y, thumb_x + 45, thumb_y + 65], fill="#1e293b", outline="#243249")
                draw.text((thumb_x + 10, thumb_y + 22), "LN", fill="#475569", font=font_badge_text)
                
            # Title
            title_text = r['series_title_vi'] or r['series_title'] or 'Untitled'
            draw.text((150, current_y + 22), title_text, fill="#ffffff", font=font_row_title)
            
            # Author
            author_text = r['series_author'] or 'Chưa rõ tác giả'
            if r['series_artist']:
                author_text += f" / {r['series_artist']}"
            draw.text((150, current_y + 46), author_text, fill="#94a3b8", font=font_row_subtitle)
            
            # Type Badge
            item_type = (r['series_item_type'] or 'novel').lower()
            badge_text = "MANGA"
            badge_color = "#22c55e" # green
            if item_type == 'novel':
                badge_text = "LIGHT NOVEL"
                badge_color = "#a855f7" # purple
            
            # Draw badge box
            badge_w = 110 if badge_text == "LIGHT NOVEL" else 75
            bx = 680
            by = current_y + 28
            draw.rectangle([bx, by, bx + badge_w, by + 24], outline=badge_color, width=1)
            # Center badge text
            tx = bx + (badge_w - len(badge_text)*6) // 2
            draw.text((tx, by + 5), badge_text, fill=badge_color, font=font_badge_text)
            
            # Volume Number
            vol_num = r['volume_number']
            vol_str = f"Tập {vol_num}" if vol_num is not None else "Tập lẻ"
            draw.text((860, current_y + 32), vol_str, fill="#ffffff", font=font_row_bold)
            
            # Release Date (Simple format)
            date_str = release_date.strftime('%d/%m/%Y')
            draw.text((980, current_y + 32), date_str, fill="#94a3b8", font=font_row_normal)
            
            # Publisher
            pub_name = r['publisher_name_vi'] or r['publisher_name'] or 'Chưa rõ NPH'
            draw.text((1200, current_y + 32), pub_name, fill="#ffffff", font=font_row_bold)
            
            # Price
            price_str = format_vnd(r['price'])
            draw.text((1430, current_y + 32), price_str, fill="#818cf8", font=font_row_bold)
            
            # Subtle divider line below row
            draw.line([(50, current_y + row_h), (width - 50, current_y + row_h)], fill="#1e293b")
            
            current_y += row_h
            row_index += 1
            
    # Draw Footer
    draw.rectangle([0, current_y, width, current_y + footer_h], fill="#0b0f19")
    footer_text = "Dữ liệu được cập nhật từ hệ thống LiDex. Ngày phát hành có thể thay đổi tùy thuộc vào nhà xuất bản."
    draw.text((50, current_y + 18), footer_text, fill="#475569", font=font_row_subtitle)
    
    # Save Image
    img.save(output_path, "JPEG", quality=95)
    print(f"Success! Image saved to {output_path}")
    return True

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='Generate LiDex Publishing Calendar Image')
    parser.add_argument('--week', type=str, default='2025-32', help='Week in format YYYY-WW (default: 2025-32)')
    parser.add_argument('--out', type=str, default='release_calendar.jpg', help='Output file name')
    parser.add_argument('--limit', type=int, default=18, help='Max releases to display (default: 18)')
    args = parser.parse_args()
    
    generate_image(args.week, args.out, args.limit)
