from __future__ import annotations

import json
import time
from datetime import date, timedelta
from pathlib import Path

import requests


START_DATE = date(2026, 5, 22)
END_DATE = date.today()
SSE_URL = "https://query.sse.com.cn/commonQuery.do"
SZSE_URL = "https://www.szse.cn/api/report/ShowReport/data"
SSE_SQL_ID = "COMMON_SSE_ZQPZ_ETFZL_XXPL_ETFGM_SEARCH_L"
OUTPUT = Path(__file__).resolve().parents[1] / "data" / "etf-boards.json"

BOARDS = {
    "csi300": {
        "title": "沪深300 ETF",
        "subtitle": "沪深交易所 · 日终基金份额",
        "source": {
            "name": "上交所 ETF 规模 / 深交所基金规模",
            "url": "https://www.sse.com.cn/market/funddata/volumn/etfvolumn/",
        },
        "series": [
            ("510300", "沪深300ETF华泰柏瑞", "华泰柏瑞", "上交所", "#cf2d1c"),
            ("510310", "沪深300ETF易方达", "易方达", "上交所", "#2f80c7"),
            ("159919", "沪深300ETF嘉实", "嘉实", "深交所", "#d89024"),
            ("510330", "沪深300ETF华夏", "华夏", "上交所", "#2db579"),
        ],
    },
    "csi500": {
        "title": "中证500 ETF",
        "subtitle": "沪深交易所 · 日终基金份额",
        "source": {
            "name": "上交所 ETF 规模 / 深交所基金规模",
            "url": "https://www.sse.com.cn/market/funddata/volumn/etfvolumn/",
        },
        "series": [
            ("510500", "中证500ETF南方", "南方", "上交所", "#cf2d1c"),
            ("159922", "中证500ETF嘉实", "嘉实", "深交所", "#2f80c7"),
            ("512500", "中证500ETF华夏", "华夏", "上交所", "#2db579"),
        ],
    },
    "a500": {
        "title": "中证A500 ETF",
        "subtitle": "沪深交易所 · 日终基金份额",
        "source": {
            "name": "上交所 ETF 规模 / 深交所基金规模",
            "url": "https://www.sse.com.cn/market/funddata/volumn/etfvolumn/",
        },
        "series": [
            ("563360", "中证A500ETF", "563360", "上交所", "#cf2d1c"),
            ("159352", "A500ETF南方", "南方", "深交所", "#2f80c7"),
            ("159361", "A500ETF易方达", "易方达", "深交所", "#d89024"),
            ("159338", "中证A500ETF国泰", "国泰", "深交所", "#2db579"),
            ("512050", "A500ETF华夏", "华夏", "上交所", "#8b6fc7"),
        ],
    },
    "sse50": {
        "title": "上证50 ETF",
        "subtitle": "上海证券交易所 · 日终基金份额",
        "source": {
            "name": "上交所 ETF 规模",
            "url": "https://www.sse.com.cn/market/funddata/volumn/etfvolumn/",
        },
        "series": [
            ("510050", "上证50ETF华夏", "华夏", "上交所", "#cf2d1c"),
            ("510100", "上证50ETF易方达", "易方达", "上交所", "#2f80c7"),
            ("530000", "上证50ETF", "530000", "上交所", "#2db579"),
        ],
    },
}

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 Chrome/136.0 Safari/537.36"
    ),
    "Accept": "application/json,text/plain,*/*",
}


def weekdays(start: date, end: date):
    current = start
    while current <= end:
        if current.weekday() < 5:
            yield current
        current += timedelta(days=1)


def request_json(session: requests.Session, url: str, params: dict, referer: str):
    last_error = None
    for attempt in range(3):
        try:
            response = session.get(
                url,
                params=params,
                headers={**HEADERS, "Referer": referer},
                timeout=30,
            )
            response.raise_for_status()
            text = response.text
            if text.startswith("jsonpCallback("):
                text = text[len("jsonpCallback(") : -1]
            return json.loads(text)
        except Exception as error:  # noqa: BLE001
            last_error = error
            time.sleep(0.5 + attempt)
    raise RuntimeError(f"请求失败 {url}: {last_error}")


def fetch_sse_day(session: requests.Session, day: date, codes: set[str]):
    payload = request_json(
        session,
        SSE_URL,
        {
            "jsonCallBack": "jsonpCallback",
            "isPagination": "true",
            "pageHelp.pageSize": 2000,
            "pageHelp.pageNo": 1,
            "pageHelp.beginPage": 1,
            "pageHelp.cacheSize": 1,
            "pageHelp.endPage": 1,
            "sqlId": SSE_SQL_ID,
            "STAT_DATE": day.isoformat(),
        },
        "https://www.sse.com.cn/market/funddata/volumn/etfvolumn/",
    )
    values = {}
    for row in payload.get("pageHelp", {}).get("data", []):
        code = str(row.get("SEC_CODE", "")).zfill(6)
        if code in codes and row.get("TOT_VOL") not in (None, "", "-"):
            values[code] = round(float(row["TOT_VOL"]) / 10000, 6)
    return values


def fetch_szse_code(
    session: requests.Session,
    code: str,
    start_date: date,
    end_date: date,
):
    values = {}
    page = 1
    while True:
        payload = request_json(
            session,
            SZSE_URL,
            {
                "SHOWTYPE": "JSON",
                "CATALOGID": "scsj_fund_jjgm",
                "TABKEY": "tab1",
                "jjlb": "ETF",
                "txtStart": start_date.isoformat(),
                "txtEnd": end_date.isoformat(),
                "txtDm": code,
                "PAGENO": page,
                "random": time.time(),
            },
            "https://www.szse.cn/market/fund/volume/etf/index.html",
        )
        if not isinstance(payload, list) or not payload:
            raise RuntimeError(f"深交所接口返回异常: {code}")
        report = payload[0]
        if report.get("error"):
            raise RuntimeError(f"深交所业务错误 {code}: {report['error']}")
        for row in report.get("data", []):
            row_code = str(row.get("fund_code", "")).strip().zfill(6)
            if row_code != code:
                continue
            values[row["size_date"]] = round(
                float(str(row["current_size"]).replace(",", "")) / 10000,
                6,
            )
        page_count = int(report.get("metadata", {}).get("pagecount") or 0)
        if page >= page_count:
            break
        page += 1
    return values


def build_board(
    board_id: str,
    config: dict,
    records: dict[tuple[str, str], float],
    end_date: date,
):
    series = [
        {
            "code": code,
            "name": name,
            "short": short,
            "exchange": exchange,
            "color": color,
        }
        for code, name, short, exchange, color in config["series"]
    ]
    codes = [item["code"] for item in series]
    observations = []
    for day in weekdays(START_DATE, end_date):
        key_date = day.isoformat()
        if all((key_date, code) in records for code in codes):
            observation = {"date": key_date}
            observation.update({code: records[(key_date, code)] for code in codes})
            observations.append(observation)
    if not observations:
        raise RuntimeError(f"{board_id} 没有完整观测数据")
    return {
        "id": board_id,
        "title": config["title"],
        "subtitle": config["subtitle"],
        "badge": f"{len(series)}只 · {len(observations)}个交易日",
        "source": config["source"],
        "series": series,
        "observations": observations,
        "latestChanges": {
            code: round(
                observations[-1][code] - observations[-2][code],
                6,
            )
            for code in codes
        },
    }


def main():
    session = requests.Session()
    sh_codes = {
        code
        for config in BOARDS.values()
        for code, _, _, exchange, _ in config["series"]
        if exchange == "上交所"
    }
    sz_codes = {
        code
        for config in BOARDS.values()
        for code, _, _, exchange, _ in config["series"]
        if exchange == "深交所"
    }
    records: dict[tuple[str, str], float] = {}
    existing = None
    if OUTPUT.is_file():
        existing = json.loads(OUTPUT.read_text(encoding="utf-8"))
        for board in existing.get("boards", {}).values():
            for observation in board.get("observations", []):
                day = observation["date"]
                for series in board.get("series", []):
                    code = series["code"]
                    if code in observation:
                        records[(day, code)] = observation[code]

    refresh_start = START_DATE
    if existing:
        latest = date.fromisoformat(existing["meta"]["latestDate"])
        refresh_start = max(START_DATE, latest - timedelta(days=14))
    days = list(weekdays(refresh_start, END_DATE))
    for index, day in enumerate(days, start=1):
        values = fetch_sse_day(session, day, sh_codes)
        for code, value in values.items():
            records[(day.isoformat(), code)] = value
        if index % 20 == 0 or index == len(days):
            print(f"上交所 {index}/{len(days)}", flush=True)

    for code in sorted(sz_codes):
        values = fetch_szse_code(session, code, refresh_start, END_DATE)
        for day, value in values.items():
            records[(day, code)] = value
        print(f"深交所 {code} {len(values)} 个观测", flush=True)

    boards = {
        board_id: build_board(board_id, config, records, END_DATE)
        for board_id, config in BOARDS.items()
    }
    actual_latest = max(
        board["observations"][-1]["date"] for board in boards.values()
    )
    actual_start = min(
        board["observations"][0]["date"] for board in boards.values()
    )
    payload = {
        "meta": {
            "startDate": actual_start,
            "latestDate": actual_latest,
            "unit": "亿份",
            "source": "上海证券交易所、深圳证券交易所公开基金规模接口",
        },
        "boards": boards,
    }
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(
        json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    summary = {
        board_id: len(board["observations"])
        for board_id, board in payload["boards"].items()
    }
    print(f"已写入 {OUTPUT}: {summary}")


if __name__ == "__main__":
    main()
