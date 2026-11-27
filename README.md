# affiliate-engine

聯盟行銷引擎。網站（Astro 靜態站，部署在 Cloudflare Pages）是它的第一個輸出，第一個主題是「租屋族居家清潔與收納」。

- `data/products.json`：所有商品事實（連結、價格、分潤率、庫存）的唯一來源。換品只改這裡。
- `data/backlog.json`：選題清單，上線後依 Search Console 數據重新排序。
- `src/content/posts/`：文章，用商品 id 引用商品。
- `scripts/check-data.mjs`：每個 PR 都會跑的檢查，包括商品欄位、關鍵字重複、內容過短、AI 套話。
- `scripts/daily-report.mjs`：晨報，內容有 GSC 衝前三候選、GA4 沒人點連結的頁面、蝦皮分潤、商品巡檢。
- `CLAUDE.md`：AI 營運者的手冊（每日、每週、每月要做什麼，什麼情況要停下來問人）。

## 本機

```bash
npm install
npm test          # 資料檢查 + 建置
npm run dev
```

## 一次性設定（需要 Jason）

1. **Cloudflare Pages**：Workers & Pages → Create → Pages → Connect to Git → 選這個 repo。
   Build command 填 `npm run build`，output 填 `dist`。之後在 Custom domains 加上 `shop.aceonhuang.com`（主網域與 www 已有其他網站，不要動）。
2. **GitHub Secrets / Variables**（Settings → Secrets and variables → Actions）：
   - Google 用免金鑰登入（Workload Identity Federation），不存任何 JSON 金鑰：
     - Variable `GCP_WIF_PROVIDER`：`projects/<專案編號>/locations/global/workloadIdentityPools/github/providers/github`
     - Variable `GCP_SERVICE_ACCOUNT`：服務帳號 email，需啟用 Search Console API 與 Analytics Data API。
     - 服務帳號要能被這個 repo 的 Actions 冒用（`roles/iam.workloadIdentityUser`，限定 `attribute.repository/aceonaceon/affiliate-engine`）。
     - 把服務帳號 email 加進 Search Console（使用者，權限選「完整」）和 GA4（檢視者）。
     - 本機測試可改設環境變數 `GOOGLE_SA_JSON`（服務帳號金鑰）。
   - Variable `GSC_SITE`：例如 `sc-domain:aceonhuang.com`
   - Variable `GA4_PROPERTY_ID`：GA4 資源編號（純數字）
   - Secret `SHOPEE_APP_ID`、`SHOPEE_APP_SECRET`：到蝦皮分潤計畫後台申請 Open API。
     如果台灣端點不是 `https://open-api.affiliate.shopee.tw/graphql`，另外加 Variable `SHOPEE_API_URL`。
3. GA4 為 `shop.aceonhuang.com` 建一個網頁資料串流，把評估 ID（G-…）填進 `data/site.json` 的 `ga4MeasurementId`。
   晨報會用 hostName 只取這個站的數據，GSC 也只取這個子網域的頁面。
4. 在 GA4 確認「加強型評估」的外連點擊有開啟，晨報要靠它判斷哪些頁面沒人點連結。
