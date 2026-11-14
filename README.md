# HarnessStuff

Claude Code 的自製 mod（plugin）與 harness 相關設定。這個 repo 本身就是一個 plugin marketplace（`.claude-plugin/marketplace.json`，名稱 `nornor-mods`），在任何一台電腦的 Claude Code 裡一行就能安裝。

## 安裝

在 Claude Code 對話中輸入：

```
/plugin install cache-timer --marketplace fathotdog/HarnessStuff
```

接著按 `y` 加入 marketplace，再選安裝範圍（建議 user，所有專案都生效）。

或在 shell：

```
claude plugin install cache-timer --marketplace fathotdog/HarnessStuff
```

更新：

```
/plugin marketplace update nornor-mods
/plugin update cache-timer@nornor-mods
```

## 內容

### cache-timer

狀態列顯示主對話的 prompt cache 還剩幾分鐘過期（`快取剩 N 分`），到期前 toast 提醒一次。

- 每次主執行緒的請求拿到回應就重新倒數（cache 的 TTL 會在每次讀寫時重設）；子代理的請求不影響。
- TTL 預設 1 小時；帳號進入超額用量後會縮成 5 分鐘。切換模型時引擎會回報實際 TTL，蓋過設定值。
- 閒置超過 7 分鐘後下一則請求若仍有 cache 命中，判定 TTL 為 1 小時；若沒命中，toast 提示 TTL 可能已縮成 5 分鐘（只提示一次）。
- `/clear` 會清掉倒數。

#### 自動續命（`/cache-keepalive`）

`/cache-keepalive` 開關（也可帶 `on` / `off`），只對目前這個 session 有效，新 session 或 mod 重載後回到關閉。開啟時狀態列顯示 `快取剩 N 分 · 自動續命`，到期前 2 分鐘自動送一則短訊息（模型只回「ok」）讓快取重新計時。

- 1h TTL：約 58 分鐘送一次，每次只花一次讀快取的錢（約原價 0.1 倍），比過期後重寫（約 2 倍）便宜得多。
- 5m TTL：約每 3 分鐘送一次，一小時約 20 次讀取 ≈ 2 倍，比回來時重寫一次（約 1.25 倍）還貴；只在短暫離開時划算，所以這時閒置上限固定最多 30 分鐘（`keepAliveHours` 設更短則以設定為準）。
- 每次續命都會在對話裡多一個回合（Remote Control 的手機端也看得到）。
- 超過 `keepAliveHours` 小時沒有你自己的訊息就停止續命並 toast 通知；你下一則訊息會讓它恢復。
- 5m TTL 下續命讓閒置間隔一直短於 7 分鐘，`ttl` 不會被自動校正回 1h，需要時手動改設定。

設定（`/plugin` → cache-timer → 設定）：

| 選項 | 說明 | 預設 |
|---|---|---|
| `ttl` | 起始 TTL，`1h` 或 `5m` | `1h` |
| `warnMinutes` | 剩幾分鐘時 toast 提醒 | `10` |
| `keepAliveHours` | 自動續命在你閒置幾小時後停止（5m TTL 時最多 30 分鐘） | `3` |

#### 開發

```
claude plugin validate ./cache-timer
claude plugin test ./cache-timer
```

本機直接載入開發中的版本：`claude --plugin-dir ./cache-timer`。

### portfolio-snapshot

一個 skill：把某一天的實際持倉存成三份對得上的紀錄，包括 Obsidian 筆記 `portfolio/<日期>_持倉快照.md`、Google Sheets「交易紀錄」的快照分頁，以及一張截圖。資料來源是玉山證券 CTS（台股、複委託）與統一期貨（透過本機的 Future Assistant 後端，唯讀）。

安裝時範圍選 project，裝在股票研究的 vault 裡（skill 會寫入該專案的 `portfolio/`）：

```
/plugin install portfolio-snapshot --marketplace fathotdog/HarnessStuff
```

使用：在 vault 裡說「做持倉快照」，或輸入 `/portfolio-snapshot:portfolio-snapshot`。

需要：

- Claude in Chrome（CTS 由使用者自己登入，Claude 只讀帳務頁）
- Google Sheets 連接器；專案 `CLAUDE.md` 寫上「交易紀錄」試算表 ID（沒寫時會用 Drive 搜尋）
- Future Assistant 本機 repo 與它的 `.env.local`（統一期貨正式帳號，唯讀）
- [uv](https://docs.astral.sh/uv/)（跑報酬計算與截圖拼接腳本）
