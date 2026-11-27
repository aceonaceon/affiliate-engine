// Deterministic gate run on every PR: data integrity + content rules. Exits 1 on errors.
import fs from 'node:fs';
import path from 'node:path';

const site = JSON.parse(fs.readFileSync('data/site.json', 'utf8'));
const products = JSON.parse(fs.readFileSync('data/products.json', 'utf8'));
const errors = [];
const warnings = [];

const ids = new Set();
for (const p of products) {
  for (const k of ['id', 'platform', 'name', 'url', 'image', 'price', 'commissionRate', 'inStock', 'checkedAt']) {
    if (p[k] === undefined || p[k] === '') errors.push(`product ${p.id ?? '?'}: missing ${k}`);
  }
  if (ids.has(p.id)) errors.push(`duplicate product id ${p.id}`);
  ids.add(p.id);
  if (p.commissionRate < site.minCommissionRate) {
    warnings.push(`product ${p.id}: commission ${(p.commissionRate * 100).toFixed(1)}% below ${site.minCommissionRate * 100}%`);
  }
  if (!p.inStock) warnings.push(`product ${p.id}: out of stock`);
}

// Phrases that read as AI filler in zh-TW. The weekly review adds more as it finds them.
const AI_TELLS = ['總而言之', '綜上所述', '在當今', '不容錯過', '讓我們一起', '無論你是', '值得一提的是', '總的來說', '在這篇文章中'];

function frontMatter(src) {
  const block = src.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? '';
  const meta = {};
  let listKey = null;
  for (const line of block.split('\n')) {
    const item = line.match(/^\s+-\s*["']?(.+?)["']?\s*$/);
    if (item && listKey) { meta[listKey].push(item[1]); continue; }
    const kv = line.match(/^(\w+):\s*(.*)$/);
    if (!kv) continue;
    const value = kv[2].replace(/^["']|["']$/g, '');
    if (value === '') { listKey = kv[1]; meta[listKey] = []; } else { listKey = null; meta[kv[1]] = value; }
  }
  return meta;
}

const dir = 'src/content/posts';
const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.md')) : [];
const keywords = new Map();
for (const f of files) {
  const src = fs.readFileSync(path.join(dir, f), 'utf8');
  const meta = frontMatter(src);
  if (meta.draft === 'true') continue;
  const body = src.replace(/^---[\s\S]*?\n---/, '');
  if (meta.keyword) {
    if (keywords.has(meta.keyword)) errors.push(`${f}: keyword "${meta.keyword}" already targeted by ${keywords.get(meta.keyword)}`);
    keywords.set(meta.keyword, f);
  }
  for (const id of meta.products ?? []) if (!ids.has(id)) errors.push(`${f}: unknown product id ${id}`);
  const chars = body.replace(/\s/g, '').length;
  if (chars < 800) errors.push(`${f}: only ${chars} chars, too thin`);
  const tells = AI_TELLS.filter((t) => body.includes(t));
  if (tells.length >= 2) errors.push(`${f}: AI-sounding phrases: ${tells.join('、')}`);
  else if (tells.length) warnings.push(`${f}: AI-sounding phrase: ${tells[0]}`);
}

warnings.forEach((w) => console.warn('WARN ', w));
errors.forEach((e) => console.error('ERROR', e));
console.log(`checked ${products.length} products, ${keywords.size} posts: ${errors.length} errors, ${warnings.length} warnings`);
process.exit(errors.length ? 1 : 0);
