import { bangkokDate } from './db.js';

export const basketDefaults = Object.freeze({ min_bills: 20, min_pair_count: 3, min_support: 0.01, min_confidence: 0.2, min_lift: 1.01 });

// Exact pair counting; deliberately limited to one-item antecedents/consequents.
export function analyzeBaskets(transactions, options = {}) {
  const thresholds = { ...basketDefaults, ...options };
  for (const key of ['min_bills', 'min_pair_count']) {
    if (!Number.isSafeInteger(thresholds[key]) || thresholds[key] < 1) throw Error('จำนวนบิลขั้นต่ำต้องเป็นจำนวนเต็มบวก');
  }
  for (const key of ['min_support', 'min_confidence']) {
    if (!Number.isFinite(thresholds[key]) || thresholds[key] < 0 || thresholds[key] > 1) throw Error('Support และ Confidence ต้องอยู่ระหว่าง 0 ถึง 1');
  }
  if (!Number.isFinite(thresholds.min_lift) || thresholds.min_lift < 1) throw Error('Lift ขั้นต่ำต้องไม่น้อยกว่า 1');
  const baskets = new Map();
  for (const transaction of transactions) {
    if (!baskets.has(transaction.id)) baskets.set(transaction.id, new Set());
    for (const item of transaction.items) baskets.get(transaction.id).add(item);
  }
  const singles = new Map(), pairs = new Map();
  let multi = 0;
  for (const basket of baskets.values()) {
    const items = [...basket].sort((a,b) => a-b);
    if (items.length > 1) multi++;
    for (const id of items) singles.set(id, (singles.get(id) || 0) + 1);
    for (let i=0; i<items.length; i++) for (let j=i+1; j<items.length; j++) {
      const key = `${items[i]}:${items[j]}`;
      pairs.set(key, (pairs.get(key) || 0) + 1);
    }
  }
  const total = baskets.size, rules = [];
  if (total >= thresholds.min_bills) for (const [key,count] of pairs) {
    const support = count / total;
    if (count < thresholds.min_pair_count || support < thresholds.min_support) continue;
    const [a,b] = key.split(':').map(Number);
    for (const [from,to] of [[a,b],[b,a]]) {
      const confidence = count / singles.get(from);
      const consequentSupport = singles.get(to) / total;
      const lift = confidence / consequentSupport;
      if (confidence >= thresholds.min_confidence && lift >= thresholds.min_lift) rules.push({
        from, to, pair_count:count, from_count:singles.get(from), to_count:singles.get(to),
        support, confidence, lift, consequent_support:consequentSupport
      });
    }
  }
  rules.sort((a,b)=> b.lift-a.lift || b.pair_count-a.pair_count || a.from-b.from || a.to-b.to);
  return { total_bills:total, multi_item_bills:multi, observed_pairs:pairs.size, thresholds, rules,
    status:total < thresholds.min_bills ? 'insufficient' : rules.length ? 'ok' : 'no-rules' };
}

export function basketReport(db, days=28, options={}, now=new Date()) {
  if (!Number.isSafeInteger(days) || days<1 || days>90) throw Error('ช่วงย้อนหลังต้องเป็นจำนวนเต็ม 1–90 วัน');
  const end = new Date(bangkokDate(now)+'T00:00:00+07:00');
  const start = new Date(end.getTime()-days*86400_000);
  // All successful bills, including single-item bills, form the denominator.
  const rows = db.prepare(`SELECT s.id, s.request_key, i.product_id FROM sales s
    LEFT JOIN sale_items i ON i.sale_id=s.id WHERE s.created_at>=? AND s.created_at<? ORDER BY s.id`).all(start.toISOString(),end.toISOString());
  const transactions = new Map();
  let demo=0;
  for (const row of rows) {
    if (!transactions.has(row.id)) {
      transactions.set(row.id,{id:row.id,items:[]});
      if (row.request_key.startsWith('demo-')) demo++;
    }
    if (row.product_id !== null) transactions.get(row.id).items.push(row.product_id);
  }
  const result=analyzeBaskets([...transactions.values()],options);
  const products=new Map(db.prepare('SELECT id,sku,name,stock,unit FROM products').all().map(p=>[p.id,p]));
  return {...result, window_days:days, start_date:bangkokDate(start), end_date:bangkokDate(new Date(end.getTime()-86400_000)),
    demo_bills:demo, method:'exact-pair-counting',
    rules:result.rules.map(rule=>({...rule,antecedent:products.get(rule.from),consequent:products.get(rule.to)}))};
}
