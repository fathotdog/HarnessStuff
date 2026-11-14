# 讀統一期貨部位（Future Assistant）

Repo：`D:\git\finance\FutureAssitant`。架構與唯讀紅線見它的 `CLAUDE.md`；不讀 `.env`、`.env.local`。

## 啟動與關閉

1. 先看 `curl -s -m 5 http://127.0.0.1:8000/health`。已經在跑就是使用者自己的後端：直接讀，不要啟動也不要關閉。
2. 沒在跑：在 repo 目錄以背景執行 `uv run python scripts/run_prod.py`（與 `scripts/run_prod.bat` 同一個指令），再用 `curl -s -m 5 --retry 30 --retry-connrefused --retry-delay 2 http://127.0.0.1:8000/health` 等到 `status: ok`。
3. 讀完立刻停掉這個背景工作，確認 :8000 已不在聽。直接中止可能沒有正常登出，下次登入若報重複登入，稍等再試。

券商帳務 API 有頻率限制（約 20 次／分），每個端點讀一次就好。

## 端點

| 端點 | 用途 |
| --- | --- |
| `GET /api/positions` | 每筆部位：`code`、`direction`（Buy/Sell）、`quantity`、`price`（均價）、`last_price`、`pnl`（未扣費） |
| `GET /api/positions/detail` | 同上加 `fee`，`pnl` 已扣費 |
| `GET /api/account/margin` | 帳務（見下表），`date` 是帳務結算日 |
| `GET /api/contracts/catalog` | 到期日與券商代碼：`futures[].contracts[]` 有 `productid`→`expiry`；`options[].expiries[]` 有 `label`、`expiry`、`weekly_marker`，其下 `strikes[].call/put` 有 `display_code` 與 `productid` |

不用的：`/api/app-positions` 是 app 自己的舊快照（可能停在幾週前）；`/api/risk/portfolio` 在沒有即時報價時（週末、盤後）回 503，選擇權 delta 因此算不出來，要寫進限制。

## 代碼對照

- 期貨 `code` 就是券商代碼，例如 `TXFC7`（臺指期 2027 年 3 月）：月份字母 A–L 對 1–12 月，最後一碼是年份末位。到期日查 catalog。
- 選擇權 `code` 是 cockpit 格式 `TXO` + `YYYYMM` + 履約價 + `C`/`P`，前三碼是系列：`TXO` 月選；週選系列與週次的對照以 `backend/app/brokers/weekly_series.py` 為準（例：`TXX` = 週五 F3）。組成 catalog 的 `display_code`（`TXO-202611-F3-47000-CALL`）後查出 `productid` 與 `expiry`。

## 計算

- 每點價值：大台 TX 200、小台 MXF 50、微台 TMF 10、臺指選擇權 TXO 50。
- 未實現損益 = 方向（買 +1／賣 −1）×（最新價 − 均價）× 口數 × 每點價值，與 `/api/positions` 的 `pnl` 一致。
- 期貨名目本金 = 最新價 × 口數 × 每點價值；大台約當口數 = Σ(口數 × 每點價值) ÷ 200。
- 兩帳戶合計：證券總市值 + 期貨權益數；台股總曝險 = 股票部位槓桿調整後台股曝險 + 期貨名目本金（不含選擇權 delta）。

## 帳務欄位

| 欄位 | 中文 |
| --- | --- |
| `equity` | 權益數 |
| `equity_amount` | 權益總值（權益數 + 選擇權買方市值 − 賣方市值） |
| `initial_margin` / `maintenance_margin` | 原始保證金／維持保證金 |
| `available_margin` | 可動用保證金 |
| `risk_indicator` | 風險指標（%） |
| `deposit_withdrawal` | 當日存提（正數為存入） |
| `yesterday_balance` | 昨日餘額 |
| `option_opensell_market_value` | 選擇權賣方市值 |
| `option_open_position` | 選擇權未平倉損益 |

## 計價基準

部位的 `last_price` 是券商回報的最新價（可能含夜盤）；帳務是 `date` 那天的結算資料。兩者算出的選擇權損益會對不上，筆記與試算表都要註明，不要硬湊。
