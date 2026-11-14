# 讀玉山證券 CTS

## 進入與登入

- 入口：`https://cts.esunsec.com.tw/ESUNWEB/`，登入後是 `default.aspx`（多層 frame）。
- 使用 Claude in Chrome。連著多個 Chrome 時，用 `list_connected_browsers` 列出並以 AskUserQuestion 問使用者是哪一個；不要自己挑。
- CTS 的登入狀態不會帶到新分頁。新分頁停在登入頁時，請使用者二選一：在 Claude 分頁群組裡的那個分頁登入，或把已登入的 CTS 分頁拖進 Claude 分頁群組。
- 帳號下拉選單含帳號與遮蔽姓名：只讀，不抄。

## 要讀的頁面

| 頁面 | 位置 | 內容 |
| --- | --- | --- |
| 證券未實現損益 | 上方「證券帳務」→ 子選單「未實現損益」（frame `TS0207.aspx`） | 每列：商品名稱(代號)、類別、成交價、股數、投資成本（負數）、現價、現值、預估收入、預估損益、預估獲利率、損益平衡價；底部總成本、總市值、總庫存損益、總報酬率 |
| 複委託未實現損益 | 「複委託帳務」→「未實現損益」 | 市場別、名稱(代號)、現價、均價、股數、成本、市值、損益、報酬率、幣別；底部預估總市值、總成本 |

複委託「即時庫存」每列有「下單」鈕，讀「未實現損益」頁就好。頁面右上角有「查詢時間」，盤後的現價是前一交易日收盤。

## 讀取方式

`get_page_text` 讀不到 frame 內容。用 `javascript_tool` 走 frame 找到目標頁再讀表格：

```js
function find(win, key){ try{ if(win.document.location.href.includes(key)) return win;
  for(let i=0;i<win.frames.length;i++){ const r=find(win.frames[i], key); if(r) return r; } }catch(e){} return null; }
const f = find(window, 'TS0207');
const rows = [...f.document.querySelectorAll('tr')].map(tr=>[...tr.children].map(td=>td.innerText.trim()))
  .filter(c=>c.length>=10 && /現股/.test(c[1]));
rows.map(r=>r.join('|')).join('\n') + '\n' + (f.document.body.innerText.match(/總成本[\s\S]{0,80}/)||[''])[0]
```

輸出太長會被截斷：用 `rows.slice(9)` 分段讀。frame 的 URL 不確定時，先列出所有 frame 的 `location.href` 與文字長度。

## 已知異常

- **成本顯示 0、獲利率 0%**：分割、合併等非交易性匯入的股票（CTS 頁面說明第 4 點）。「預估損益」此時等於整個市值，不可當損益用；試算表的成本分頁若有記錄，在備註寫出。
- **代號帶 O 後綴、現價與市值 0**：ETF 分割暫停交易期間，CTS 暫以「原代號 + O」顯示。市值用分割前最後成交價估（Yahoo `.TW` 歷史價），查分割公告寫明恢復交易日與分割後單位數。CTS 總市值、總報酬率因此失真，筆記要寫明。
- **現值捨去小數**：CTS 現值 = 股數 × 現價後捨去；試算表用公式會差 1 元以內。
- 預估損益已扣預估賣出手續費與證交稅；複委託成本已含手續費與稅費。
