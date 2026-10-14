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

設定（`/plugin` → cache-timer → 設定）：

| 選項 | 說明 | 預設 |
|---|---|---|
| `ttl` | 起始 TTL，`1h` 或 `5m` | `1h` |
| `warnMinutes` | 剩幾分鐘時 toast 提醒 | `10` |

#### 開發

```
claude plugin validate ./cache-timer
claude plugin test ./cache-timer
```

本機直接載入開發中的版本：`claude --plugin-dir ./cache-timer`。
