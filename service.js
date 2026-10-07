import { transaction, bangkokDate } from './db.js';
import { basketReport } from './basket.js';

function fail(message) { throw new Error(message); }
function integer(value, min, max, label) {
  if (!Number.isSafeInteger(value) || value<min || value>max) fail(`${label}ต้องเป็นจำนวนเต็ม ${min}–${max}`);
  return value;
}
function text(value, label, max=200) {
  if (typeof value!=='string' || !value.trim() || value.length>max) fail(`กรุณาระบุ${label} (ไม่เกิน ${max} ตัวอักษร)`);
  return value.trim();
}

export function calculateRecommendation(product, sold, windowDays=28) {
  const avg = sold/windowDays;
  const coverage = avg>0?product.stock/avg:null;
  const reorderPoint = Math.ceil(avg*(product.lead_days+product.safety_days));
  const target = Math.ceil(avg*(product.lead_days+product.safety_days+product.review_days));
  const due = avg>0 && product.stock<=reorderPoint;
  const status = avg===0?'no-data':product.stock===0?'out':due?'buy':'ok';
  const orderIn = avg>0?Math.max(0,Math.floor(coverage-product.lead_days-product.safety_days)):null;
  return {...product,sold,window_days:windowDays,avg,coverage,reorder_point:reorderPoint,target,
    order_in_days:orderIn,suggested_qty:due?Math.max(0,target-product.stock):0,status,
    reason:avg===0?'ไม่มียอดขายในช่วงที่เลือก: ตรวจสอบสินค้าขาดหรือสินค้าใหม่ก่อนตัดสินใจ':
      `ขาย ${sold} ${product.unit} / ${windowDays} วัน = ${avg.toFixed(2)} ${product.unit}/วัน; คงเหลือ ${product.stock}; จุดสั่งซื้อ ${reorderPoint}; เป้าหมาย ${target} (รอ ${product.lead_days} + สำรอง ${product.safety_days} + รอบซื้อ ${product.review_days} วัน)`};
}

export function createService(db) {
  const getProduct=id=>db.prepare('SELECT * FROM products WHERE id=?').get(integer(id,1,1_000_000,'รหัสสินค้า'))||fail('ไม่พบสินค้า');
  const receipt=id=>{
    const s=db.prepare('SELECT * FROM sales WHERE id=?').get(id)||fail('ไม่พบใบเสร็จ');
    return {...s,change_cents:s.paid_cents-s.total_cents,items:db.prepare('SELECT i.*,p.name,p.unit,p.sku FROM sale_items i JOIN products p ON p.id=i.product_id WHERE sale_id=?').all(id)};
  };
  return {
    products() { return db.prepare('SELECT * FROM products ORDER BY id').all(); },
    baskets(days=28, options={}, now=new Date()) { return basketReport(db,days,options,now); },
    recommendations(windowDays=28, now=new Date()) {
      integer(windowDays,1,90,'ช่วงย้อนหลัง');
      // Completed Bangkok calendar days only: zero-sale days stay in the denominator.
      const end = new Date(bangkokDate(now)+'T00:00:00+07:00');
      const start = new Date(end.getTime()-windowDays*86400_000).toISOString();
      const sold = new Map(db.prepare(`SELECT i.product_id,SUM(i.quantity) AS qty FROM sale_items i
        JOIN sales s ON s.id=i.sale_id WHERE s.created_at>=? AND s.created_at<? GROUP BY i.product_id`).all(start,end.toISOString()).map(r=>[r.product_id,r.qty]));
      return {start_date:bangkokDate(new Date(start)),end_date:bangkokDate(new Date(end.getTime()-86400_000)),
        rows:this.products().map(p=>calculateRecommendation(p,sold.get(p.id)||0,windowDays))};
    },
    checkout(body, now=new Date()) {
      const key=text(body.request_key,'รหัสรายการ',100);
      const existing=db.prepare('SELECT id FROM sales WHERE request_key=?').get(key);
      if(existing) return receipt(existing.id);
      if(!Array.isArray(body.items)||body.items.length===0||body.items.length>500) fail('ตะกร้าต้องมีสินค้า 1–500 รายการ');
      integer(body.paid_cents,0,100_000_000,'เงินรับ');
      const quantities=new Map();
      for(const i of body.items) {
        integer(i.product_id,1,1_000_000,'รหัสสินค้า'); integer(i.quantity,1,100_000,'จำนวน');
        quantities.set(i.product_id,(quantities.get(i.product_id)||0)+i.quantity);
      }
      return transaction(db,()=>{
        const lines=[...quantities].map(([id,q])=>{const p=getProduct(id);if(q>p.stock)fail(`${p.name}: สต็อกไม่พอ (เหลือ ${p.stock})`);return {p,q};});
        const total=lines.reduce((sum,{p,q})=>sum+p.price_cents*q,0);
        if(body.paid_cents<total)fail('เงินรับน้อยกว่ายอดชำระ');
        const time=now.toISOString();
        const id=Number(db.prepare('INSERT INTO sales(request_key,created_at,total_cents,paid_cents) VALUES(?,?,?,?)').run(key,time,total,body.paid_cents).lastInsertRowid);
        for(const {p,q} of lines){
          db.prepare('INSERT INTO sale_items(sale_id,product_id,quantity,price_cents) VALUES(?,?,?,?)').run(id,p.id,q,p.price_cents);
          db.prepare('UPDATE products SET stock=stock-? WHERE id=?').run(q,p.id);
          db.prepare('INSERT INTO stock_movements(product_id,created_at,type,delta,balance,note,sale_id) VALUES(?,?,?,?,?,?,?)').run(p.id,time,'sale',-q,p.stock-q,'ขายหน้าร้าน',id);
        }
        return receipt(id);
      });
    },
    stock(body, now=new Date()) {
      if(!['receive','adjust'].includes(body.type))fail('ประเภทการเคลื่อนไหวไม่ถูกต้อง');
      integer(body.quantity,body.type==='receive'?1:0,100_000,'จำนวน');
      const note=text(body.note,'เหตุผล/เลขเอกสาร');
      return transaction(db,()=>{
        const p=getProduct(body.product_id);
        const balance=body.type==='receive'?p.stock+body.quantity:body.quantity;
        db.prepare('UPDATE products SET stock=? WHERE id=?').run(balance,p.id);
        db.prepare('INSERT INTO stock_movements(product_id,created_at,type,delta,balance,note) VALUES(?,?,?,?,?,?)').run(p.id,now.toISOString(),body.type,balance-p.stock,balance,note);
        return getProduct(p.id);
      });
    },
    saveProduct(body) {
      const name=text(body.name,'ชื่อสินค้า');const sku=text(body.sku,'SKU',40);
      const barcode=body.barcode?text(body.barcode,'บาร์โค้ด',50):null;
      const category=text(body.category,'หมวดหมู่',80),unit=text(body.unit,'หน่วย',30);
      for(const k of ['price_cents','cost_cents'])integer(body[k],0,1_000_000,k);
      for(const k of ['lead_days','safety_days'])integer(body[k],0,90,k);
      integer(body.review_days,1,90,'รอบซื้อ');
      const values=[sku,barcode,name,category,unit,body.price_cents,body.cost_cents,body.lead_days,body.safety_days,body.review_days];
      try {
        if(body.id){getProduct(body.id);db.prepare('UPDATE products SET sku=?,barcode=?,name=?,category=?,unit=?,price_cents=?,cost_cents=?,lead_days=?,safety_days=?,review_days=? WHERE id=?').run(...values,body.id);return getProduct(body.id);}
        const id=Number(db.prepare('INSERT INTO products(sku,barcode,name,category,unit,price_cents,cost_cents,lead_days,safety_days,review_days,stock) VALUES(?,?,?,?,?,?,?,?,?,?,0)').run(...values).lastInsertRowid);
        return getProduct(id);
      } catch(e){if(e.message.includes('UNIQUE'))fail('SKU หรือบาร์โค้ดซ้ำกับสินค้าเดิม');throw e;}
    },
    history(){return db.prepare(`SELECT s.*,COUNT(i.id) AS lines FROM sales s JOIN sale_items i ON i.sale_id=s.id GROUP BY s.id ORDER BY s.created_at DESC,s.id DESC LIMIT 100`).all();},
    receipt,
    movements(id){getProduct(id);return db.prepare('SELECT * FROM stock_movements WHERE product_id=? ORDER BY created_at DESC,id DESC LIMIT 100').all(id);},
    dashboard(now=new Date()){
      const rows=this.recommendations(28,now).rows;
      const start=new Date(bangkokDate(now)+'T00:00:00+07:00').toISOString();
      const today=db.prepare('SELECT COUNT(*) AS bills,COALESCE(SUM(total_cents),0) AS revenue_cents FROM sales WHERE created_at>=? AND created_at<=?').get(start,now.toISOString());
      return {sku_count:rows.length,stock_units:rows.reduce((s,p)=>s+p.stock,0),stock_value_cents:rows.reduce((s,p)=>s+p.stock*p.cost_cents,0),out_count:rows.filter(p=>p.stock===0).length,buy_count:rows.filter(p=>['buy','out'].includes(p.status)).length,no_data_count:rows.filter(p=>p.status==='no-data').length,...today,seed_date:db.prepare("SELECT value FROM meta WHERE key='demo_seed_date'").get()?.value};
    }
  };
}
