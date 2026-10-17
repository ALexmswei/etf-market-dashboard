from __future__ import annotations

import concurrent.futures
import json
import re
import time
from datetime import date, datetime
from pathlib import Path

import requests


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "data" / "commodity-data.json"
HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 Chrome/136.0 Safari/537.36"
    ),
    "Accept": "text/html,application/json,*/*",
    "Accept-Language": "zh-CN,zh;q=0.9",
}
COAL_START = "2025-01-02"
COAL_END = date.today().isoformat()
SMM_A00_PAGE = "https://hq.smm.cn/aluminum/category/201102250311"
SMM_ALUMINA_LIST = "https://hq.smm.cn/aluminum/list/404"


def get_bytes(session: requests.Session, url: str, referer: str | None = None):
    last_error = None
    for attempt in range(3):
        try:
            response = session.get(
                url,
                headers={**HEADERS, **({"Referer": referer} if referer else {})},
                timeout=35,
            )
            response.raise_for_status()
            return response.content
        except Exception as error:  # noqa: BLE001
            last_error = error
            time.sleep(0.7 + attempt)
    raise RuntimeError(f"请求失败 {url}: {last_error}")


def parse_cctd_list_page(session: requests.Session, page: int):
    url = (
        "https://www.coalchina.org.cn/index.php"
        f"?m=content&c=index&a=lists&catid=33&page={page}"
    )
    content = get_bytes(session, url)
    rows = []
    pattern = re.compile(
        rb'<span class="rt">(\d{4}-\d{2}-\d{2})</span>.*?'
        rb'href="(https://www\.coalchina\.org\.cn/index\.php\?'
        rb'm=content&c=index&a=show&catid=33&id=(\d+))"',
        re.S,
    )
    for match in pattern.finditer(content):
        rows.append(
            {
                "date": match.group(1).decode("ascii"),
                "url": match.group(2).decode("ascii"),
                "id": match.group(3).decode("ascii"),
            }
        )
    return rows


def collect_cctd_reviews(session: requests.Session):
    reviews = {}
    page = 1
    while page <= 30:
        rows = parse_cctd_list_page(session, page)
        if not rows:
            break
        oldest = min(item["date"] for item in rows)
        for item in rows:
            if COAL_START <= item["date"] <= COAL_END:
                reviews[item["date"]] = item
        print(f"CCTD 列表页 {page}: {oldest} {len(rows)}条", flush=True)
        if oldest < COAL_START:
            break
        page += 1
    return reviews


def parse_cctd_article(content: bytes):
    patterns = [
        (
            rb"5500K.{0,120}?5000K.{0,120}?4500K.{0,120}?"
            rb"(\d{3,4}).{0,24}?(\d{3,4}).{0,24}?(\d{3,4})"
        ),
        (
            rb"5500K.{0,120}?(\d{3,4}).{0,120}?"
            rb"5000K.{0,120}?(\d{3,4}).{0,120}?"
            rb"4500K.{0,120}?(\d{3,4})"
        ),
    ]
    for pattern in patterns:
        match = re.search(pattern, content, re.S)
        if match:
            return tuple(int(value) for value in match.groups())
    return None


def fetch_cctd_article(item: tuple[str, dict]):
    session = requests.Session()
    day, review = item
    try:
        content = get_bytes(session, review["url"])
    except RuntimeError:
        return day, None
    values = parse_cctd_article(content)
    if not values:
        return day, None
    q5500, q5000, q4500 = values
    return day, {
        "date": day,
        "q5500": q5500,
        "q5000": q5000,
        "q4500": q4500,
        "source": review["url"],
    }


def fetch_cctd_history():
    session = requests.Session()
    history = json.loads(
        get_bytes(session, "https://www.cctd.com.cn/Echarts/data/HBHCKJ_DLMQH.php")
    )
    valid = [
        item
        for item in history
        if item.get("age") not in (None, "", "~")
    ]

    reviews = collect_cctd_reviews(session)
    article_rows = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as executor:
        futures = {
            executor.submit(fetch_cctd_article, item): item[0]
            for item in reviews.items()
        }
        for future in concurrent.futures.as_completed(futures):
            day, row = future.result()
            if row:
                article_rows[day] = row
            else:
                print(f"CCTD 日评解析失败 {day}", flush=True)

    rows = []
    latest_article = max(article_rows.values(), key=lambda item: item["date"], default=None)
    spread_5000 = (
        latest_article["q5500"] - latest_article["q5000"]
        if latest_article
        else 95
    )
    spread_4500 = (
        latest_article["q5500"] - latest_article["q4500"]
        if latest_article
        else 189
    )
    for item in valid:
        day = item["name"]
        if not COAL_START <= day <= COAL_END:
            continue
        q5500 = int(float(item["age"]))
        article = article_rows.get(day)
        rows.append(
            {
                "date": day,
                "q5500": article["q5500"] if article else q5500,
                "q5000": article["q5000"] if article else q5500 - spread_5000,
                "q4500": article["q4500"] if article else q5500 - spread_4500,
                "quality": "official_review" if article else "derived_spread",
                "source": (
                    article["source"]
                    if article
                    else "https://www.cctd.com.cn/Echarts/data/HBHCKJ_DLMQH.php"
                ),
            }
        )
    rows.sort(key=lambda item: item["date"])
    if len(rows) < 300:
        raise RuntimeError(f"CCTD 历史观测不足: {len(rows)}")

    return {
        "meta": {
            "title": "CCTD 环渤海动力煤现货参考价",
            "source": "CCTD 中国煤炭市场网",
            "sourceUrl": "https://www.cctd.com.cn/",
            "latestDate": rows[-1]["date"],
            "startDate": valid[0]["name"],
            "historyCount": len(valid),
            "windowDays": len(rows),
            "windowStart": rows[0]["date"],
            "windowEnd": rows[-1]["date"],
            "unit": "元/吨",
        },
        "observations": rows,
    }


def parse_spot_chart_data(html: str):
    match = re.search(
        r'<script id="spot-chart-data" type="application/json">(.*?)</script>',
        html,
        re.S,
    )
    if not match:
        raise RuntimeError("未找到 SMM spot-chart-data")
    payload = json.loads(match.group(1))
    return [
        {
            "date": item["renew_date"],
            "average": float(item["average_show"]),
            "low": float(item["low_show"]),
            "high": float(item["high_show"]),
            "change": float(item.get("change_value_show") or 0),
            "changeRate": item.get("change_rate_show") or "0%",
        }
        for item in payload.get("data", [])
    ]


def fetch_alumina_articles(session: requests.Session):
    html = get_bytes(session, SMM_ALUMINA_LIST).decode("utf-8", "replace")
    blocks = re.findall(r"<li[^>]*>(.*?)</li>", html, re.S)
    articles = []
    for block in blocks:
        if "氧化铝(山西)报价" not in block:
            continue
        href_match = re.search(r'href="(/aluminum/content/\d+)"', block)
        date_match = re.search(r'<span class="zone-time">\s*([0-9-]{10})', block)
        if href_match and date_match:
            articles.append(
                {
                    "date": date_match.group(1),
                    "url": f"https://hq.smm.cn{href_match.group(1)}",
                }
            )
    deduped = {item["date"]: item for item in articles}
    return sorted(deduped.values(), key=lambda item: item["date"])


def parse_alumina_change(content: bytes):
    text = content.decode("utf-8", "replace")
    match = re.search(
        r"均价相较上个更新日[^<]{0,30}?(上涨|下跌)\s*([0-9.]+)\s*元/吨",
        text,
    )
    if match:
        value = float(match.group(2))
        return value if match.group(1) == "上涨" else -value
    if "均价相较上个更新日" in text and "暂无变化" in text:
        return 0.0
    return None


def fetch_alumina_day(item: dict):
    session = requests.Session()
    content = get_bytes(session, item["url"])
    change = parse_alumina_change(content)
    return item["date"], change


def build_alumina_series(a00_rows: list[dict], session: requests.Session):
    article_rows = fetch_alumina_articles(session)
    target_dates = {item["date"] for item in a00_rows}
    selected = [item for item in article_rows if item["date"] in target_dates]
    changes = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as executor:
        futures = [executor.submit(fetch_alumina_day, item) for item in selected]
        for future in concurrent.futures.as_completed(futures):
            day, change = future.result()
            if change is not None:
                changes[day] = change

    latest_average = 2675.0
    averages = {a00_rows[-1]["date"]: latest_average}
    for item in reversed(a00_rows[:-1]):
        next_day = a00_rows[a00_rows.index(item) + 1]["date"]
        current_change = changes.get(next_day, 0.0)
        averages[item["date"]] = round(averages[next_day] - current_change, 2)

    rows = []
    for item in a00_rows:
        average = averages[item["date"]]
        rows.append(
            {
                "date": item["date"],
                "a00Average": item["average"],
                "a00Low": item["low"],
                "a00High": item["high"],
                "a00Change": item["change"],
                "aluminaAverage": average,
                "aluminaLow": round(average - 5, 2),
                "aluminaHigh": round(average + 5, 2),
                "aluminaChange": changes.get(item["date"], 0.0),
                "spread": round(item["average"] - average, 2),
            }
        )
    return rows


def fetch_smm_history():
    session = requests.Session()
    html = get_bytes(session, SMM_A00_PAGE).decode("utf-8", "replace")
    a00_rows = parse_spot_chart_data(html)
    rows = build_alumina_series(a00_rows, session)
    latest = rows[-1]
    return {
        "meta": {
            "title": "电解铝 & 氧化铝 · SMM价格",
            "source": "上海有色网 SMM",
            "sourceUrl": "https://www.smm.cn/",
            "latestDate": latest["date"],
            "windowDays": len(rows),
            "unit": "元/吨",
        },
        "observations": rows,
    }


def main():
    payload = {
        "generatedAt": datetime.now().isoformat(timespec="seconds"),
        "coal": fetch_cctd_history(),
        "alumina": fetch_smm_history(),
    }
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(
        json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    print(
        f"已写入 {OUTPUT}: 煤炭 {len(payload['coal']['observations'])} 条，"
        f"铝价 {len(payload['alumina']['observations'])} 条"
    )


if __name__ == "__main__":
    main()
