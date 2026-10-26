#!/usr/bin/env python3
"""
scripts/pipeline/evaluate_rankings.py
--------------------------------------------------------------------------------
Calculates market intelligence metrics, algorithmic LN scores, and publication
drop risk probabilities for Light Novels from LN_Sum_from_Kurano.xlsx.

Produces the evaluated dataset for the `ln_series_ranking` table.
Based on the validated LiDex evaluation formulas.
--------------------------------------------------------------------------------
"""

import math
import re
import numpy as np
import pandas as pd

COMPLETED_STATUSES = {
    "completed",
    "complete",
    "finished",
    "ended",
    "完結",
}


def normalize_id(v):
    if pd.isna(v):
        return ""
    if isinstance(v, float) and v.is_integer():
        return str(int(v))
    return str(v).strip()


def normalize_code(v):
    if pd.isna(v):
        return ""
    return str(v).strip()


def safe_float(v, default=None):
    try:
        if pd.isna(v):
            return default
        return float(v)
    except Exception:
        return default


def original_completed(status):
    return str(status or "").lower().strip() in COMPLETED_STATUSES


def calculate_months_since(d, today):
    d = pd.to_datetime(d, errors="coerce", dayfirst=True)
    if pd.isna(d):
        return 999.0
    return max(0.0, (today - d).days / 30.4375)


def release_status(evalution, original_status, vn_vols, jp_vols):
    jp_done = original_completed(original_status)
    caught_up_ongoing = (
        jp_vols
        and jp_vols > 0
        and vn_vols >= jp_vols
        and not jp_done
    )

    if evalution == "Completed":
        return "Hoàn thành"
    if caught_up_ongoing:
        return "Đã bắt kịp bản gốc JP"
    if evalution == "Dead":
        return "Lâu lắm rồi chưa có tập mới"
    if evalution == "Dropped":
        return "Drop"
    return "Đang phát hành"


def calculate_drop_risk(row, score, evalution, months, ratio, jp_done, trang_thai):
    vn = safe_float(row.get("Number of Volumes"), 0) or 0
    jp = safe_float(row.get("Original Volumes"), None)
    avg_gap = safe_float(row.get("Average Gap Months"), None)
    recent_gap = safe_float(row.get("Recent Gap Months"), None)
    pub24 = safe_float(row.get("Publisher Releases Last 24M"), 0) or 0
    pub12 = safe_float(row.get("Publisher Releases Last 12M"), 0) or 0
    series24 = safe_float(row.get("Series Releases Last 24M"), 0) or 0
    series12 = safe_float(row.get("Series Releases Last 12M"), 0) or 0

    if recent_gap is not None and avg_gap is not None:
        effective_gap = round(0.4 * avg_gap + 0.6 * recent_gap, 1)
    elif recent_gap is not None:
        effective_gap = recent_gap
    else:
        effective_gap = avg_gap

    if evalution == "Completed":
        return 0.0, "Series đã hoàn thành: 0%"

    if trang_thai == "Đã bắt kịp bản gốc JP":
        return 0.05, "VN đã bắt kịp JP: 5%"

    risk = (10 - score) * 7.5
    components = [f"Từ Điểm LN {score:.1f}/10: {risk:.0f}%"]

    # Release recency
    if months <= 6:
        risk -= 8
        components.append("Tập mới trong 6 tháng: -8%")
    elif months <= 12:
        components.append("Trong vòng 1 năm: +0%")
    elif months <= 18:
        risk += 10
        components.append("12–18 tháng chưa có tập: +10%")
    elif months <= 21:
        risk += 16
        components.append("18–21 tháng chưa có tập: +16%")
    elif months <= 24:
        risk += 22
        components.append("21–24 tháng chưa có tập: +22%")
    elif months <= 36:
        risk += 35
        components.append("2–3 năm chưa có tập: +35%")
    else:
        risk += 45
        components.append("Hơn 3 năm chưa có tập: +45%")

    # Catch-up ratio
    if ratio is not None:
        if ratio < 0.25:
            risk += 12
            components.append("Còn rất xa JP: +12%")
        elif ratio < 0.4:
            risk += 8
            components.append("Còn xa JP: +8%")
        elif ratio >= 0.8:
            risk -= 5
            components.append("Gần bắt kịp JP: -5%")

    # One-volume risk
    if vn <= 1 and jp and jp > 1:
        risk += 10
        components.append("Mới có 1 tập VN: +10%")

    # Effective release gap
    if effective_gap is not None:
        if effective_gap <= 6:
            risk -= 4
            components.append("Nhịp ra tập nhanh (≤6 tháng): -4%")
        elif effective_gap <= 12:
            risk -= 2
            components.append("Nhịp ra tập ổn định (6–12 tháng): -2%")
        elif effective_gap <= 18:
            risk += 6
            components.append("Nhịp ra tập chậm (12–18 tháng): +6%")
        else:
            risk += 12
            components.append("Nhịp ra tập rất chậm (>18 tháng): +12%")

    # Publisher activity
    if pub24 >= 5:
        risk -= 5
        components.append("Nhà phát hành còn hoạt động (24M): -5%")
    elif pub24 <= 0:
        risk += 8
        components.append("Nhà phát hành ít hoạt động (24M): +8%")

    if pub12 <= 2 and pub24 >= 5:
        risk += 6
        components.append("Nhà phát hành đang chậm lại trong 12M gần nhất: +6%")

    # Series release activity
    if series24 >= 3:
        risk -= 6
        components.append("Series ra ≥3 tập trong 24M: -6%")
    elif series24 == 0 and months > 12:
        risk += 5
        components.append("Series không có tập nào trong 24M: +5%")

    if series12 == 0 and months > 6:
        risk += 5
        components.append("Series không có tập nào trong 12M gần nhất: +5%")

    # JP completed but VN unfinished penalty after 18 months
    if jp_done and ratio is not None and ratio < 1 and months > 18:
        risk += 5
        components.append("JP đã hoàn thành nhưng VN chưa xong và quá 18 tháng: +5%")

    # Evaluation band clamp
    if evalution == "Good":
        risk = max(10, min(55, risk))
        components.append("Khung nhóm Tốt: giữ trong 10–55%")
    elif evalution == "Limping":
        risk = max(30, min(70, risk))
        components.append("Khung nhóm Cầm chừng: giữ trong 30–70%")
    elif evalution == "Dead":
        risk = max(60, min(88, risk))
        components.append("Khung nhóm Gần chết: giữ trong 60–88%")
    elif evalution == "Dropped":
        risk = max(84, min(99, risk))
        components.append("Khung nhóm Đã drop: giữ trong 84–99%")

    return round(risk / 100, 2), "\n".join(components)


def score_single_series(row, today):
    vn = safe_float(row.get("Number of Volumes"), 0) or 0
    jp = safe_float(row.get("Original Volumes"), None)
    original_status = row.get("Original Status")
    latest = row.get("Max Release At")

    avg_gap = safe_float(row.get("Average Gap Months"), None)
    recent_gap = safe_float(row.get("Recent Gap Months"), None)
    pub24 = safe_float(row.get("Publisher Releases Last 24M"), 0) or 0
    pub12 = safe_float(row.get("Publisher Releases Last 12M"), 0) or 0
    series24 = safe_float(row.get("Series Releases Last 24M"), 0) or 0
    series12 = safe_float(row.get("Series Releases Last 12M"), 0) or 0

    months = calculate_months_since(latest, today)
    jp_done = original_completed(original_status)

    ratio = vn / jp if jp and jp > 0 else None
    caught_up = jp and jp > 0 and vn >= jp

    if recent_gap is not None and avg_gap is not None:
        effective_gap = round(0.4 * avg_gap + 0.6 * recent_gap, 1)
    elif recent_gap is not None:
        effective_gap = recent_gap
    else:
        effective_gap = avg_gap

    components = []

    # Case 0: Unreleased
    if vn <= 0:
        return (
            "Unreleased",
            np.nan,
            "Có bản quyền nhưng chưa phát hành",
            0.50,
            "Đã có bản quyền nhưng chưa phát hành tập nào: LN Score = N/A.",
            "Chưa phát hành tập nào: Drop % mặc định = 50%.",
            "",
            ""
        )

    # Case 1: VN completed & JP completed
    if caught_up and jp_done:
        evalution = "Completed"
        trang_thai = "Hoàn thành"
        drop = 0.0

        if months <= 12:
            score = 9.5
            score_basis = "VN đã hoàn thành gần đây (≤12 tháng): LN Score = 9.5."
        elif months <= 24:
            score = 9.3
            score_basis = "VN đã hoàn thành trong 1–2 năm: LN Score = 9.3."
        elif months <= 36:
            score = 9.0
            score_basis = "VN đã hoàn thành trong 2–3 năm: LN Score = 9.0."
        else:
            score = 8.7
            score_basis = "VN đã hoàn thành nhưng đã lâu (>3 năm): LN Score = 8.7."

        drop_basis = "Series đã hoàn thành tại VN: Drop % = 0%"
        return (evalution, score, trang_thai, drop, score_basis, drop_basis, "\n".join(components), "")

    # Case 2: VN caught up but JP still ongoing
    if caught_up and not jp_done:
        evalution = "Good"
        score = 9.0
        components.append("Điểm nền nhóm bắt kịp JP: 9.0")

        if months <= 6:
            score += 0.2
            components.append("Tập mới gần đây: +0.2")
        elif months > 18:
            score -= 0.5
            components.append("Bắt kịp JP nhưng đã lâu chưa có tập mới: -0.5")

        score = round(max(8.0, min(9.2, score)), 1)
        trang_thai = "Đã bắt kịp bản gốc JP"
        drop = 0.05
        return (
            evalution,
            score,
            trang_thai,
            drop,
            "\n".join(components),
            "VN đã bắt kịp JP, rủi ro thấp nhưng JP vẫn đang tiếp tục.",
            "\n".join(components),
            ""
        )

    # Base score from recency
    if months <= 3:
        score = 6.8
        components.append("Tập mới trong 3 tháng: 6.8")
    elif months <= 6:
        score = 6.2
        components.append("Tập mới trong 3–6 tháng: 6.2")
    elif months <= 12:
        score = 5.7
        components.append("Có tập mới trong vòng 1 năm: 5.7")
    elif months <= 18:
        score = 5.0
        components.append("1–1.5 năm chưa có tập mới: 5.0")
    elif months <= 24:
        score = 3.8
        components.append("Gần 2 năm chưa có tập mới: 3.8")
    elif months <= 36:
        score = 2.5
        components.append("2–3 năm chưa có tập mới: 2.5")
    else:
        score = 1.5
        components.append("Hơn 3 năm chưa có tập mới: 1.5")

    # Catch-up ratio
    if ratio is not None:
        if ratio >= 0.8:
            score += 0.5
            components.append("Gần bắt kịp JP: +0.5")
        elif ratio >= 0.5:
            score += 0.2
            components.append("Đã đi được ít nhất nửa bản gốc: +0.2")
        elif ratio < 0.25:
            score -= 0.8
            components.append("Còn rất xa bản gốc: -0.8")
        elif ratio < 0.4:
            score -= 0.5
            components.append("Còn khá xa bản gốc: -0.5")
        elif ratio < 0.5:
            score -= 0.2
            components.append("Tỷ lệ bắt kịp 40–49%: -0.2")

    # Penalty for JP completed but VN unfinished > 18 months
    if jp_done and ratio is not None and ratio < 1 and months > 18:
        score -= 0.5
        components.append("Bản gốc đã hoàn thành nhưng VN chưa xong và đã quá 18 tháng: -0.5")

    # Effective gap adjustment
    if effective_gap is None:
        if vn <= 1:
            score -= 0.2
            components.append("Chưa đủ dữ liệu nhịp ra tập: -0.2")
    elif effective_gap <= 6:
        if series12 >= 2:
            score += 0.3
            components.append("Nhịp ra tập nhanh + series active gần đây: +0.3")
        else:
            components.append("Nhịp ra tập nhanh (lịch sử) nhưng series chưa active 12M: +0.0")
    elif effective_gap <= 12:
        if series12 >= 2:
            score += 0.1
            components.append("Nhịp ra tập bình thường + series active gần đây: +0.1")
        else:
            components.append("Nhịp ra tập bình thường (lịch sử) nhưng series chưa active 12M: +0.0")
    elif effective_gap <= 18:
        score -= 0.4
        components.append("Nhịp ra tập chậm: -0.4")
    else:
        score -= 0.8
        components.append("Nhịp ra tập rất chậm: -0.8")

    # Publisher activity
    if pub24 >= 5:
        score += 0.2
        components.append("Nhà phát hành còn hoạt động (24M): +0.2")
    elif pub24 <= 0:
        score -= 0.5
        components.append("Nhà phát hành không có release trong 24 tháng: -0.5")

    if pub12 <= 2 and pub24 >= 5:
        score -= 0.4
        components.append("Nhà phát hành đang chậm lại trong 12M gần nhất: -0.4")

    # Series activity
    if series24 >= 3 and series12 >= 2:
        score += 0.3
        components.append("Series ra ≥3 tập trong 24M và active trong 12M: +0.3")
    elif series24 >= 3 and series12 <= 1:
        components.append("Series ra ≥3 tập trong 24M nhưng chậm lại trong 12M: +0.0")
    elif series24 == 0 and months > 12:
        score -= 0.2
        components.append("Series không có tập nào trong 24M: -0.2")

    if series12 == 0 and months > 6:
        score -= 0.3
        components.append("Series không có tập nào trong 12M gần nhất: -0.3")

    if vn <= 1 and jp and jp > 1 and months > 6:
        score -= 0.3
        components.append("Mới có 1 tập VN trong khi JP có nhiều tập: -0.3")

    # Strong / Near active close-to-JP exception
    strong_active_close_to_jp = (
        months <= 18
        and ratio is not None
        and ratio >= 0.80
        and effective_gap is not None
        and effective_gap <= 6
        and pub24 >= 5
    )

    near_active_close_to_jp = (
        not strong_active_close_to_jp
        and months <= 18
        and ratio is not None
        and ratio >= 0.75
        and effective_gap is not None
        and effective_gap <= 8
        and pub24 >= 3
    )

    # Staleness caps
    if months > 36:
        score = min(score, 2.5)
        components.append("Hơn 3 năm chưa có tập mới: cap 2.5")
    elif months > 24:
        score = min(score, 3.5)
        components.append("Hơn 2 năm chưa có tập mới: cap 3.5")
    elif months > 21:
        score = min(score, 4.5)
        components.append("Gần 2 năm chưa có tập mới: cap 4.5")
    elif months > 18:
        score = min(score, 5.2)
        components.append("Hơn 1.5 năm chưa có tập mới: cap 5.2")
    elif months > 12 and strong_active_close_to_jp:
        score = max(score, 7.1)
        components.append("Gần bắt kịp JP + nhịp ra nhanh + nhà phát hành active: giữ điểm tối thiểu 7.1")
    elif months > 12 and near_active_close_to_jp:
        score = max(score, 6.5)
        components.append("Gần bắt kịp JP + nhịp ra hợp lý (near exception): giữ điểm tối thiểu 6.5")
    elif months > 12:
        score = min(score, 6.0)
        components.append("Hơn 1 năm chưa có tập mới: cap 6.0")

    score = round(max(1.0, min(10.0, score)), 1)

    # Classification
    if months > 36 or score <= 2.5:
        evalution = "Dropped"
    elif months > 21 or score <= 4.5:
        evalution = "Dead"
    elif strong_active_close_to_jp:
        evalution = "Good"
        components.append("Gần bắt kịp JP + nhịp ra nhanh + nhà phát hành active: giữ nhóm Good")
    elif months > 12 or score <= 6.3:
        evalution = "Limping"
    else:
        evalution = "Good"

    trang_thai = release_status(evalution, original_status, vn, jp)
    drop, drop_basis = calculate_drop_risk(row, score, evalution, months, ratio, jp_done, trang_thai)

    score_components = "\n".join(components)
    return (evalution, score, trang_thai, drop, score_components, drop_basis, score_components, drop_basis)


def evaluate_dataset(excel_path: str, as_of_date=None) -> pd.DataFrame:
    """
    Reads Sheet1 and Kurano Enriched from excel_path, executes the complete
    evaluation mathematical model, and returns an evaluated DataFrame ready
    for upserting into ln_series_ranking.
    """
    today = pd.Timestamp(as_of_date) if as_of_date else pd.Timestamp.now()

    series_df = pd.read_excel(excel_path, sheet_name="Sheet1")
    books_df = pd.read_excel(excel_path, sheet_name="Kurano Enriched")

    # Normalize keys
    series_df["series_key"] = (
        series_df["Series ID"].apply(normalize_id)
        + "|"
        + series_df["Series Code"].apply(normalize_code)
    )
    books_df["series_key"] = (
        books_df["Series ID"].apply(normalize_id)
        + "|"
        + books_df["Series Code"].apply(normalize_code)
    )

    books_df["Released At"] = pd.to_datetime(books_df["Released At"], errors="coerce", dayfirst=True)

    # 1. Calculate Average Gap & Recent Gap
    gap_map = {}
    recent_gap_map = {}

    for key, g in books_df.groupby("series_key"):
        dates = sorted(g["Released At"].dropna().dt.date.unique())
        if len(dates) >= 2:
            gaps = [(dates[i] - dates[i - 1]).days / 30.4375 for i in range(1, len(dates))]
            gap_map[key] = round(sum(gaps) / len(gaps), 1)

            last_dates = dates[-min(3, len(dates)):]
            recent_gaps = [(last_dates[i] - last_dates[i - 1]).days / 30.4375 for i in range(1, len(last_dates))]
            recent_gap_map[key] = round(sum(recent_gaps) / len(recent_gaps), 1)
        else:
            gap_map[key] = np.nan
            recent_gap_map[key] = np.nan

    series_df["Average Gap Months"] = series_df["series_key"].map(gap_map)
    series_df["Recent Gap Months"] = series_df["series_key"].map(recent_gap_map)

    # 2. Months Since Last Release
    series_df["Months Since Last Release"] = series_df["Max Release At"].apply(lambda d: calculate_months_since(d, today))

    # 3. Completion Ratio
    series_df["Completion Ratio"] = series_df.apply(
        lambda r: (
            safe_float(r.get("Number of Volumes"), 0) / safe_float(r.get("Original Volumes"), np.nan)
            if safe_float(r.get("Original Volumes"), 0) else np.nan
        ),
        axis=1,
    )

    # 4. Publisher Releases 24M / 12M
    publisher_map = series_df.set_index("series_key")["Publisher"].to_dict()
    books_df["Publisher"] = books_df["series_key"].map(publisher_map)

    cutoff24 = today - pd.DateOffset(months=24)
    cutoff12 = today - pd.DateOffset(months=12)

    pub24 = books_df[books_df["Released At"] >= cutoff24].groupby("Publisher").size()
    series_df["Publisher Releases Last 24M"] = series_df["Publisher"].map(pub24).fillna(0).astype(int)

    pub12 = books_df[books_df["Released At"] >= cutoff12].groupby("Publisher").size()
    series_df["Publisher Releases Last 12M"] = series_df["Publisher"].map(pub12).fillna(0).astype(int)

    # Series Releases 24M / 12M
    series24_count = books_df[books_df["Released At"] >= cutoff24].groupby("series_key").size()
    series_df["Series Releases Last 24M"] = series_df["series_key"].map(series24_count).fillna(0).astype(int)

    series12_count = books_df[books_df["Released At"] >= cutoff12].groupby("series_key").size()
    series_df["Series Releases Last 12M"] = series_df["series_key"].map(series12_count).fillna(0).astype(int)

    series_df["Publisher Activity"] = pd.cut(
        series_df["Publisher Releases Last 24M"],
        bins=[-1, 0, 4, 999],
        labels=["Inactive", "Low", "Active"],
    ).astype(str)

    # 5. Execute Evaluation
    results = series_df.apply(lambda r: score_single_series(r, today), axis=1)

    series_df["Evalution"] = [x[0] for x in results]
    series_df["LN Score"] = [x[1] for x in results]
    series_df["Trạng thái"] = [x[2] for x in results]
    series_df["Khả năng drop (Drop %)"] = [x[3] for x in results]
    series_df["Evaluation Basis"] = [x[4] for x in results]
    series_df["Drop % Basis"] = [x[5] for x in results]
    series_df["Score Components"] = [x[6] for x in results]
    series_df["Drop Components"] = [x[7] for x in results]

    # 6. Latest Cover Art from Kurano Enriched
    latest_covers = (
        books_df.dropna(subset=["Cover URL"])
        .sort_values("Released At")
        .groupby("series_key", as_index=False)
        .tail(1)[["series_key", "Cover URL", "Title"]]
        .rename(columns={"Cover URL": "Cover URL", "Title": "Cover Source Title"})
    )

    series_df = series_df.merge(latest_covers, on="series_key", how="left")

    return series_df
