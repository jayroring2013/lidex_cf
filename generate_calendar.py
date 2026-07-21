#!/usr/bin/env python3
import os
import sys
import argparse
import urllib.request
import ssl
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

# Disable SSL verification for downloading images from pb.tana.moe
ssl_context = ssl._create_unverified_context()

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
            with urllib.request.urlopen(req, timeout=3, context=ssl_context) as response:
                with open(local_path, 'wb') as out_file:
                    out_file.write(response.read())
        except Exception as e:
            # Silent fallback on download error
            return None
            
    # Try to load and resize
    try:
        with Image.open(local_path) as img:
            # Resize to cover thumb: 56 width, 80 height
            thumb = img.convert("RGBA").resize((56, 80), Image.Resampling.LANCZOS)
            return thumb
    except:
        return None

def download_and_resize_logo(url, publisher_id):
    if not url or not publisher_id:
        return None
        
    local_path = os.path.join(CACHE_DIR, f"pub_logo_{publisher_id}.png")
    
    if not os.path.exists(local_path):
        try:
            headers = {'User-Agent': 'Mozilla/5.0'}
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=3, context=ssl_context) as response:
                with open(local_path, 'wb') as out_file:
                    out_file.write(response.read())
        except Exception as e:
            return None
            
    try:
        with Image.open(local_path) as img:
            logo = img.convert("RGBA").resize((26, 26), Image.Resampling.LANCZOS)
            return logo
    except Exception as e:
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
            s.cover_url as series_cover_url,
            p.logo_url as publisher_logo_url,
            p.id as publisher_id
        FROM volumes v
        JOIN series s ON v.series_id = s.id
        LEFT JOIN publishers p ON v.publisher_id = p.id
        WHERE v.release_date IS NOT NULL
          AND LOWER(s.item_type) = 'novel'
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
    
    # Setup canvas dimensions (Optimized for 1920 width)
    width = 1920
    header_h = 180
    col_header_h = 70
    day_header_h = 70
    row_h = 100
    footer_h = 60
    
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
    
    # Load fonts with increased size for high resolution crispness
    try:
        font_title = ImageFont.truetype(FONT_BOLD, 44)
        font_subtitle = ImageFont.truetype(FONT_SEMIBOLD, 18)
        font_week = ImageFont.truetype(FONT_BOLD, 22)
        font_badge = ImageFont.truetype(FONT_BOLD, 18)
        font_col_header = ImageFont.truetype(FONT_BOLD, 15)
        font_day_header = ImageFont.truetype(FONT_BOLD, 16)
        font_row_title = ImageFont.truetype(FONT_BOLD, 18)
        font_row_subtitle = ImageFont.truetype(FONT_REG, 14)
        font_row_normal = ImageFont.truetype(FONT_REG, 16)
        font_row_bold = ImageFont.truetype(FONT_BOLD, 16)
        font_badge_text = ImageFont.truetype(FONT_BOLD, 12)
    except:
        print("Warning: Segoe UI fonts not found. Falling back to default system fonts.")
        font_title = font_subtitle = font_week = font_badge = font_col_header = font_day_header = font_row_title = font_row_subtitle = font_row_normal = font_row_bold = font_badge_text = ImageFont.load_default()

    # Draw header background (sleek gradient simulation)
    for y in range(header_h):
        r_val = int(9 + (15 - 9) * (y / header_h))
        g_val = int(14 + (23 - 14) * (y / header_h))
        b_val = int(25 + (41 - 25) * (y / header_h))
        draw.line([(0, y), (width, y)], fill=(r_val, g_val, b_val))
        
    # Draw calendar icon in header
    draw.rectangle([80, 55, 150, 125], outline="#818cf8", width=4)
    draw.rectangle([80, 55, 150, 73], fill="#818cf8")
    for i in range(3):
        for j in range(3):
            draw.rectangle([94 + j*16, 85 + i*11, 100 + j*16, 91 + i*11], fill="#ffffff")
            
    # Draw header text
    draw.text((180, 52), "LỊCH PHÁT HÀNH", fill="#ffffff", font=font_title)
    draw.text((180, 105), "CẬP NHẬT MANGA & LIGHT NOVEL MỚI NHẤT", fill="#818cf8", font=font_subtitle)
    
    # Calculate dates of week
    start_date = min(grouped.keys())
    end_date = max(grouped.keys())
    week_range_text = f"{start_date.strftime('%d/%m/%Y')} – {end_date.strftime('%d/%m/%Y')}"
    
    # Week Box (Center-Right)
    draw.rectangle([1200, 55, 1520, 125], fill="#1e293b", outline="#243249", width=1)
    draw.text((1220, 62), "TUẦN PHÁT HÀNH", fill="#94a3b8", font=font_row_subtitle)
    draw.text((1220, 83), week_range_text, fill="#ffffff", font=font_week)
    
    # Total Releases Badge (Right)
    badge_x_start = 1550
    badge_width = 290
    draw.rectangle([badge_x_start, 55, badge_x_start + badge_width, 125], fill="#6366f1", outline="#818cf8", width=1)
    draw.text((badge_x_start + 20, 62), "TỔNG SỐ LƯỢNG", fill="#c7d2fe", font=font_row_subtitle)
    draw.text((badge_x_start + 20, 83), f"{len(releases)} PHÁT HÀNH", fill="#ffffff", font=font_badge)
    
    # Draw horizontal rule below header
    draw.line([(0, header_h), (width, header_h)], fill="#1e293b")
    
    # Column Header Layout (Optimized spacing for 1920 width)
    col_y = header_h + 23
    draw.text((80, col_y), "#", fill="#e2695f", font=font_col_header)
    draw.text((160, col_y), "TÁC PHẨM", fill="#e2695f", font=font_col_header)
    draw.text((850, col_y), "PHÂN LOẠI", fill="#e2695f", font=font_col_header)
    draw.text((1040, col_y), "TẬP", fill="#e2695f", font=font_col_header)
    draw.text((1180, col_y), "NGÀY PHÁT HÀNH", fill="#e2695f", font=font_col_header)
    draw.text((1420, col_y), "NHÀ XUẤT BẢN", fill="#e2695f", font=font_col_header)
    draw.text((1720, col_y), "GIÁ BÁN", fill="#e2695f", font=font_col_header)
    
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
        draw.ellipse([80, current_y + 29, 92, current_y + 41], fill="#818cf8")
        draw.text((115, current_y + 24), day_str, fill="#818cf8", font=font_day_header)
        
        # Thin divider line
        draw.line([(380, current_y + 35), (width - 80, current_y + 35)], fill="#1e293b")
        
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
            draw.text((80, current_y + 39), stt_str, fill="#94a3b8", font=font_row_bold)
            
            # Fetch and draw cover thumbnail
            cover_url = r['volume_cover_url'] or r['series_cover_url']
            thumb = download_and_resize_cover(cover_url, r['id'])
            
            thumb_x = 150
            thumb_y = current_y + 10
            if thumb:
                img.paste(thumb, (thumb_x, thumb_y), thumb)
            else:
                # Draw placeholder cover
                draw.rectangle([thumb_x, thumb_y, thumb_x + 56, thumb_y + 80], fill="#1e293b", outline="#243249")
                draw.text((thumb_x + 16, thumb_y + 30), "LN", fill="#475569", font=font_badge_text)
                
            # Title (Positioned nicely at x=230)
            title_text = r['series_title_vi'] or r['series_title'] or 'Untitled'
            draw.text((230, current_y + 26), title_text, fill="#ffffff", font=font_row_title)
            
            # Author
            author_text = r['series_author'] or 'Chưa rõ tác giả'
            if r['series_artist']:
                author_text += f" / {r['series_artist']}"
            draw.text((230, current_y + 54), author_text, fill="#94a3b8", font=font_row_subtitle)
            
            # Type Badge (Positioned at x=850)
            item_type = (r['series_item_type'] or 'novel').lower()
            badge_text = "MANGA"
            badge_color = "#22c55e" # green
            if item_type == 'novel':
                badge_text = "LIGHT NOVEL"
                badge_color = "#a855f7" # purple
            
            # Draw badge box
            badge_w = 120 if badge_text == "LIGHT NOVEL" else 80
            bx = 850
            by = current_y + 35
            draw.rectangle([bx, by, bx + badge_w, by + 30], outline=badge_color, width=1)
            # Center badge text
            tx = bx + (badge_w - len(badge_text)*7) // 2
            draw.text((tx, by + 7), badge_text, fill=badge_color, font=font_badge_text)
            
            # Volume Number (Positioned at x=1040)
            vol_num = r['volume_number']
            vol_str = f"Tập {vol_num}" if vol_num is not None else "Tập lẻ"
            draw.text((1040, current_y + 39), vol_str, fill="#ffffff", font=font_row_bold)
            
            # Release Date (Simple format) (Positioned at x=1180)
            date_str = release_date.strftime('%d/%m/%Y')
            draw.text((1180, current_y + 39), date_str, fill="#94a3b8", font=font_row_normal)
            
            # Publisher and Logo (Positioned at x=1420)
            pub_name = r['publisher_name_vi'] or r['publisher_name'] or 'Chưa rõ NPH'
            pub_logo_url = r.get('publisher_logo_url')
            pub_id = r.get('publisher_id')
            
            logo = download_and_resize_logo(pub_logo_url, pub_id)
            if logo:
                # Draw a white backing rectangle for the logo to stand out
                logo_bg_x = 1420
                logo_bg_y = current_y + 33
                draw.rounded_rectangle([logo_bg_x, logo_bg_y, logo_bg_x + 34, logo_bg_y + 34], radius=5, fill="#ffffff")
                
                # Center the 26x26 logo inside the 34x34 white box
                logo_paste_x = logo_bg_x + (34 - logo.width) // 2
                logo_paste_y = logo_bg_y + (34 - logo.height) // 2
                img.paste(logo, (logo_paste_x, logo_paste_y), logo)
                
                # Write the text shifted to the right
                draw.text((1468, current_y + 39), pub_name, fill="#ffffff", font=font_row_bold)
            else:
                draw.text((1420, current_y + 39), pub_name, fill="#ffffff", font=font_row_bold)
            
            # Price (Positioned at x=1720)
            price_str = format_vnd(r['price'])
            draw.text((1720, current_y + 39), price_str, fill="#818cf8", font=font_row_bold)
            
            # Subtle divider line below row
            draw.line([(80, current_y + row_h), (width - 80, current_y + row_h)], fill="#1e293b")
            
            current_y += row_h
            row_index += 1
            
    # Draw Footer
    draw.rectangle([0, current_y, width, current_y + footer_h], fill="#0b0f19")
    footer_text = "Dữ liệu được cập nhật từ hệ thống LiDex. Ngày phát hành có thể thay đổi tùy thuộc vào nhà xuất bản."
    draw.text((80, current_y + 20), footer_text, fill="#475569", font=font_row_subtitle)
    
    # Save Image
    img.save(output_path, "JPEG", quality=100)
    print(f"Success! Image saved to {output_path}")
    return True

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='Generate LiDex Publishing Calendar Image')
    parser.add_argument('--week', type=str, default='2025-32', help='Week in format YYYY-WW (default: 2025-32)')
    parser.add_argument('--out', type=str, default='release_calendar.jpg', help='Output file name')
    parser.add_argument('--limit', type=int, default=18, help='Max releases to display (default: 18)')
    args = parser.parse_args()
    
    generate_image(args.week, args.out, args.limit)
