"""持股近期表現：近 1／3／12 月報酬與距一年高點。

用法：
    uv run --no-project --with yfinance --with pandas python -I perf.py holdings.json [--fx]

holdings.json 是陣列，每筆：
    {"code": "2317", "end_price": 200.0, "end_date": "2026-01-02", "yahoo": "2317.TW"}
- end_price / end_date：期末價與日期，台股用 CTS 現價（Yahoo 台股常晚一天），停牌標的用最後成交日。
- yahoo 可省略：台股代號先試 .TW 再試 .TWO；英文代號（美股）直接用。

期初取「end_date 往回 30／91／365 個日曆天」當天或之前最近的收盤價（Yahoo 還原權息價），
距一年高點以過去 365 天最高收盤價為準。輸出 Markdown 表格列；--fx 另印 USD/TWD 最近三天收盤。
"""

import json
import sys

import pandas as pd
import yfinance as yf


def history(code: str, yahoo: str | None) -> tuple[str, pd.Series]:
    candidates = [yahoo] if yahoo else (
        [code] if code.isalpha() else [code + ".TW", code + ".TWO"]
    )
    for sym in candidates:
        s = yf.Ticker(sym).history(period="2y", auto_adjust=True)["Close"].dropna()
        if len(s):
            s.index = s.index.tz_localize(None)
            return sym, s
    raise SystemExit(f"no Yahoo data for {code} (tried {candidates})")


def pct(x: float | None) -> str:
    return "–" if x is None else f"{x:+.1f}%"


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")  # Windows 終端機預設 cp950
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if "--fx" in sys.argv:
        fx = yf.Ticker("TWD=X").history(period="10d")["Close"].dropna()
        print("USD/TWD", {str(k.date()): round(v, 4) for k, v in fx.tail(3).items()})
    if not args:
        return
    print("| 代號 | Yahoo | 近 1 月 | 近 3 月 | 近 12 月 | 距一年高點 |")
    print("| --- | --- | ---: | ---: | ---: | ---: |")
    for h in json.load(open(args[0], encoding="utf-8")):
        sym, s = history(h["code"], h.get("yahoo"))
        end, p = pd.Timestamp(h["end_date"]), float(h["end_price"])
        s = s[s.index < end]  # 期末用給定價格，不用 Yahoo 當天價

        def ret(days: int, s=s, end=end, p=p) -> float | None:
            base = s[s.index <= end - pd.Timedelta(days=days)]
            return (p / base.iloc[-1] - 1) * 100 if len(base) else None

        window = s[s.index >= end - pd.Timedelta(days=365)]
        hi = max(window.max(), p) if len(window) else p
        print(f"| {h['code']} | {sym} | {pct(ret(30))} | {pct(ret(91))} | "
              f"{pct(ret(365))} | {pct((p / hi - 1) * 100)} |")


if __name__ == "__main__":
    main()
