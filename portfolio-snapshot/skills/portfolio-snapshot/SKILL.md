---
name: portfolio-snapshot
description: 持倉快照：讀玉山證券 CTS（台股、複委託）與統一期貨（Future Assistant）的實際部位，寫成 portfolio/ 快照筆記、Google Sheets「交易紀錄」快照分頁與一張截圖。用於使用者要做持倉快照、記錄目前持倉，或調倉前後存檔。
---

# 持倉快照

把某一天的實際持倉存成三份互相對得上的紀錄：vault 筆記 `portfolio/<YYYY-MM-DD>_持倉快照.md`、Google Sheets 分頁「持倉快照 <YYYY-MM-DD>」、截圖 `portfolio/<YYYY-MM-DD>_持倉快照.png`。快照只記事實；看法留在對話裡。

## 紅線

- 券商一律唯讀：只讀帳務頁與部位 API，不點下單、刪單或任何送出鈕。
- 密碼、驗證碼由使用者自己輸入；Claude 只在使用者登入後讀頁面。
- 帳號、身分證字號、姓名不寫進筆記或試算表。FutureAssitant 的 `.env`、`.env.local` 不讀。
- 每個數字附來源與查詢時間（本庫 `CLAUDE.md` 的資料規則）。

## 步驟

1. **定日期與範圍。** 快照日期用今天。`portfolio/` 已有同日快照就更新那一份。問使用者是否有其他券商的部位（試算表的成本分頁可能列著 CTS 沒有的標的）。
   完成：日期、要讀的帳戶清單確定。

2. **讀證券帳戶（CTS）。** 照 [references/cts.md](references/cts.md) 讀「證券帳務 > 未實現損益」與「複委託帳務 > 未實現損益」。
   完成：兩頁每一列與合計列都抄下，附查詢時間；成本為 0、市值為 0 的異常列逐一列出並查明原因。

3. **讀期貨帳戶（統一期貨）。** 照 [references/futures.md](references/futures.md) 透過 FutureAssitant 讀部位、帳務與合約到期日。
   完成：每筆期貨與選擇權部位都有到期日與券商代碼，帳務欄位齊全；若是 Claude 啟動的後端，已關閉且 :8000 沒有在聽。

4. **補外部數字。** USD/TWD、停牌或分割中標的的最後成交價、各持股近 1／3／12 月報酬：跑 [scripts/perf.py](scripts/perf.py)（用法在檔頭）。期末價用 CTS 現價，不用 Yahoo 最新價（Yahoo 台股常晚一天）。
   完成：每一檔都有價格與報酬列，或寫明為什麼沒有。

5. **寫 vault 筆記。** 以 `portfolio/` 裡最新一份快照筆記為範本，段落順序相同：總覽、證券帳戶曝險分布、台股帳戶、複委託、期貨帳戶（帳務、期貨部位、選擇權部位、兩帳戶合計）、近期表現。
   完成：各表合計等於逐列加總；CTS 自己的合計照抄並註明與本表的差異原因。

6. **寫 Google Sheets 分頁。** 照 [references/sheets.md](references/sheets.md)，優先複製上一份快照分頁再改數字。
   完成：`get_values` 讀回整個分頁，沒有錯誤值，總市值、損益合計與筆記一致；與「股票成本統計&紀錄」的股數差異已列出（該分頁不改）。

7. **截圖。** 照 [references/screenshot.md](references/screenshot.md) 截成一張圖，存為 `portfolio/<YYYY-MM-DD>_持倉快照.png`，並在筆記標題下嵌入 `![[<YYYY-MM-DD>_持倉快照.png]]`。
   完成：用 Read 打開 PNG，所有區塊完整可讀；Sheets 縮放已回 100%、已退出全螢幕，Claude 開的分頁都已關閉。

8. **回報。** 給使用者：三份紀錄的位置、總覽數字、所有異常與資料限制（例如選擇權 delta 週末算不出來、部位最新價與帳務結算價基準不同）。commit 等使用者要求再做。
