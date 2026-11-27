// Morning report. Deterministic data pulls only; the AI reads reports/<date>.md and decides what to change.
// Env: GOOGLE_SA_JSON (service account JSON), GSC_SITE (e.g. sc-domain:aceonhuang.com), GA4_PROPERTY_ID,
//      SHOPEE_APP_ID, SHOPEE_APP_SECRET, SHOPEE_API_URL (verify the TW endpoint in the affiliate console).
import fs from 'node:fs';
import crypto from 'node:crypto';
import { GoogleAuth } from 'google-auth-library';

const today = new Date().toISOString().slice(0, 10);
const daysAgo = (n) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
const out = [`# 晨報 ${today}`, ''];
const products = JSON.parse(fs.readFileSync('data/products.json', 'utf8'));
const site = JSON.parse(fs.readFileSync('data/site.json', 'utf8'));
// The GSC domain property and GA4 property can also hold other sites on aceonhuang.com; keep only this site's host.
const host = new URL(site.url).host;

async function google(url, body) {
  const auth = new GoogleAuth({
    credentials: JSON.parse(process.env.GOOGLE_SA_JSON),
    scopes: [
      'https://www.googleapis.com/auth/webmasters.readonly',
      'https://www.googleapis.com/auth/analytics.readonly',
    ],
  });
  const client = await auth.getClient();
  const res = await client.request({ url, method: 'POST', data: body });
  return res.data;
}

async function searchConsole() {
  if (!process.env.GOOGLE_SA_JSON || !process.env.GSC_SITE) {
    out.push('## Search Console', '未設定 GOOGLE_SA_JSON / GSC_SITE，略過。', '');
    return;
  }
  const url = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(process.env.GSC_SITE)}/searchAnalytics/query`;
  const data = await google(url, { startDate: daysAgo(30), endDate: daysAgo(2), dimensions: ['query', 'page'], rowLimit: 1000,
    dimensionFilterGroups: [{ filters: [{ dimension: 'page', operator: 'contains', expression: `//${host}/` }] }],
  });
  const rows = data.rows ?? [];
  const sum = (k) => rows.reduce((a, r) => a + r[k], 0);
  out.push('## Search Console（近 28 天）', `曝光 ${sum('impressions')}、點擊 ${sum('clicks')}`, '');
  const striking = rows
    .filter((r) => r.position >= 4 && r.position <= 20 && r.impressions >= 20)
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 15);
  out.push('### 衝前三候選（排名 4–20、曝光 ≥ 20）', '| 關鍵字 | 頁面 | 排名 | 曝光 | 點擊 |', '|---|---|---|---|---|');
  for (const r of striking) {
    out.push(`| ${r.keys[0]} | ${new URL(r.keys[1]).pathname} | ${r.position.toFixed(1)} | ${r.impressions} | ${r.clicks} |`);
  }
  out.push('');
}

async function analytics() {
  if (!process.env.GOOGLE_SA_JSON || !process.env.GA4_PROPERTY_ID) {
    out.push('## GA4', '未設定 GA4_PROPERTY_ID，略過。', '');
    return;
  }
  // GA4 enhanced measurement logs outbound link clicks as the "click" event.
  const data = await google(`https://analyticsdata.googleapis.com/v1beta/properties/${process.env.GA4_PROPERTY_ID}:runReport`, {
    dateRanges: [{ startDate: '28daysAgo', endDate: 'yesterday' }],
    dimensions: [{ name: 'pagePath' }, { name: 'eventName' }],
    metrics: [{ name: 'eventCount' }],
    dimensionFilter: {
      andGroup: {
        expressions: [
          { filter: { fieldName: 'eventName', inListFilter: { values: ['page_view', 'click'] } } },
          { filter: { fieldName: 'hostName', stringFilter: { matchType: 'EXACT', value: host } } },
        ],
      },
    },
    limit: 1000,
  });
  const pages = {};
  for (const r of data.rows ?? []) {
    const [page, ev] = r.dimensionValues.map((d) => d.value);
    pages[page] ??= { page_view: 0, click: 0 };
    pages[page][ev] = Number(r.metricValues[0].value);
  }
  const leaky = Object.entries(pages).filter(([, v]) => v.page_view >= 30 && v.click === 0);
  out.push('## GA4（近 28 天）', '### 有瀏覽但沒人點聯盟連結的頁面');
  out.push(leaky.length ? leaky.map(([p, v]) => `- ${p}（${v.page_view} 次瀏覽）`).join('\n') : '- 無', '');
}

async function shopee() {
  const { SHOPEE_APP_ID: id, SHOPEE_APP_SECRET: secret } = process.env;
  const url = process.env.SHOPEE_API_URL ?? 'https://open-api.affiliate.shopee.tw/graphql';
  if (!id || !secret) {
    out.push('## 蝦皮分潤', '未設定 SHOPEE_APP_ID / SHOPEE_APP_SECRET，略過。', '');
    return;
  }
  const end = Math.floor(Date.now() / 1000);
  const start = end - 7 * 86400;
  const payload = JSON.stringify({
    query: `{ conversionReport(purchaseTimeStart:${start}, purchaseTimeEnd:${end}, limit:500) { nodes { purchaseTime totalCommission } } }`,
  });
  const sig = crypto.createHash('sha256').update(id + end + payload + secret).digest('hex');
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `SHA256 Credential=${id}, Timestamp=${end}, Signature=${sig}` },
    body: payload,
  });
  const json = await res.json();
  if (json.errors) {
    out.push('## 蝦皮分潤', `API 回傳錯誤：${JSON.stringify(json.errors).slice(0, 300)}`, '');
    return;
  }
  const nodes = json.data?.conversionReport?.nodes ?? [];
  const total = nodes.reduce((a, n) => a + Number(n.totalCommission ?? 0), 0);
  out.push('## 蝦皮分潤（近 7 天）', `轉換 ${nodes.length} 筆、預估分潤 NT$${total.toFixed(1)}`, '');
}

async function productCheck() {
  out.push('## 商品巡檢');
  const issues = [];
  for (const p of products) {
    if (!p.inStock) issues.push(`- ${p.id} 標記缺貨，需要換品`);
    if (p.commissionRate < site.minCommissionRate) issues.push(`- ${p.id} 分潤 ${(p.commissionRate * 100).toFixed(1)}%，低於門檻`);
    for (const [label, u] of [['連結', p.url], ['主圖', p.image]]) {
      try {
        const r = await fetch(u, { redirect: 'follow' });
        if (r.status >= 400) issues.push(`- ${p.id} ${label} HTTP ${r.status}`);
      } catch (e) {
        issues.push(`- ${p.id} ${label} 無法連線：${e.message}`);
      }
    }
    const age = (Date.now() - new Date(p.checkedAt)) / 864e5;
    if (age > 14) issues.push(`- ${p.id} 已 ${Math.floor(age)} 天沒查價`);
  }
  out.push(issues.length ? issues.join('\n') : `- ${products.length} 件商品都正常`, '');
}

for (const step of [searchConsole, analytics, shopee, productCheck]) {
  try {
    await step();
  } catch (e) {
    out.push(`## ${step.name} 失敗`, String(e.message ?? e), '');
  }
}
fs.mkdirSync('reports', { recursive: true });
fs.writeFileSync(`reports/${today}.md`, out.join('\n'));
console.log(out.join('\n'));
