import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export function openDatabase(path) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY, sku TEXT UNIQUE NOT NULL, barcode TEXT UNIQUE,
      name TEXT NOT NULL, category TEXT NOT NULL, unit TEXT NOT NULL,
      price_cents INTEGER NOT NULL CHECK(price_cents>=0), cost_cents INTEGER NOT NULL CHECK(cost_cents>=0),
      stock INTEGER NOT NULL CHECK(stock>=0), lead_days INTEGER NOT NULL CHECK(lead_days>=0),
      safety_days INTEGER NOT NULL CHECK(safety_days>=0), review_days INTEGER NOT NULL CHECK(review_days>0)
    );
    CREATE TABLE IF NOT EXISTS sales (
      id INTEGER PRIMARY KEY, request_key TEXT UNIQUE NOT NULL, created_at TEXT NOT NULL,
      total_cents INTEGER NOT NULL, paid_cents INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sale_items (
      id INTEGER PRIMARY KEY, sale_id INTEGER NOT NULL REFERENCES sales(id),
      product_id INTEGER NOT NULL REFERENCES products(id), quantity INTEGER NOT NULL CHECK(quantity>0),
      price_cents INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS stock_movements (
      id INTEGER PRIMARY KEY, product_id INTEGER NOT NULL REFERENCES products(id),
      created_at TEXT NOT NULL, type TEXT NOT NULL CHECK(type IN ('opening','sale','receive','adjust')),
      delta INTEGER NOT NULL, balance INTEGER NOT NULL CHECK(balance>=0),
      note TEXT NOT NULL, sale_id INTEGER REFERENCES sales(id)
    );
    CREATE INDEX IF NOT EXISTS idx_sales_date ON sales(created_at);
    CREATE INDEX IF NOT EXISTS idx_items_product ON sale_items(product_id);
    CREATE INDEX IF NOT EXISTS idx_movements_product ON stock_movements(product_id);
    CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);
  `);
  return db;
}

export function transaction(db, work) {
  db.exec('BEGIN IMMEDIATE');
  try { const result = work(); db.exec('COMMIT'); return result; }
  catch (error) { db.exec('ROLLBACK'); throw error; }
}

export function bangkokDate(now = new Date()) {
  return new Date(now.getTime() + 7 * 3600_000).toISOString().slice(0, 10);
}

export function seedDemo(db, now = new Date()) {
  if (db.prepare('SELECT COUNT(*) AS n FROM products').get().n) return false;
  transaction(db, () => {
    const groups = [
      ['บะหมี่กึ่งสำเร็จรูป','อาหารแห้ง','ซอง',8], ['น้ำดื่ม','เครื่องดื่ม','ขวด',10],
      ['น้ำปลา','เครื่องปรุง','ขวด',30], ['นมกล่อง','เครื่องดื่ม','กล่อง',15],
      ['ขนมขบเคี้ยว','ขนม','ถุง',20], ['ข้าวสาร','อาหารแห้ง','ถุง',45],
      ['สบู่','ของใช้','ก้อน',25], ['ผงซักฟอก','ของใช้','ถุง',35],
      ['ไข่ไก่','อาหารสด','ฟอง',5], ['น้ำตาล','เครื่องปรุง','ถุง',28]
    ];
    const insertProduct = db.prepare('INSERT INTO products VALUES(?,?,?,?,?,?,?,?,?,?,?,?)');
    const move = db.prepare('INSERT INTO stock_movements(product_id,created_at,type,delta,balance,note,sale_id) VALUES(?,?,?,?,?,?,?)');
    const sale = db.prepare('INSERT INTO sales(request_key,created_at,total_cents,paid_cents) VALUES(?,?,?,?)');
    const item = db.prepare('INSERT INTO sale_items(sale_id,product_id,quantity,price_cents) VALUES(?,?,?,?)');
    const day = bangkokDate(now);
    const start = new Date(day + 'T00:00:00+07:00');
    for (let id = 1; id <= 500; id++) {
      const [base,category,unit,price] = groups[(id-1)%10];
      const name = id===1?'บะหมี่กึ่งสำเร็จรูป รสดั้งเดิม':id===2?'น้ำดื่ม 600 มล.':id===3?'น้ำปลา 700 มล.':`${base} รุ่น ${String(Math.floor((id-1)/10)+1).padStart(2,'0')}`;
      const stock = id<=3?12:id===500?0:(id*17)%100;
      const quantities = Array.from({length:28},(_,d)=> id===500?0:id===1?4:id===2?8:id===3?(d%5===0?1:0):id%13===0?0:(id+d*3)%8);
      const opening = stock + quantities.reduce((a,b)=>a+b,0);
      const cents = (price + (id<=3?0:Math.floor(id/100)))*100;
      insertProduct.run(id,`SKU${String(id).padStart(4,'0')}`,id%5===0?null:`885000${String(id).padStart(7,'0')}`,name,category,unit,cents,Math.round(cents*0.7),stock,2,1,7);
      let balance = opening;
      move.run(id,new Date(start.getTime()-28*86400_000).toISOString(),'opening',opening,balance,'ยอดตั้งต้นข้อมูลจำลอง',null);
      for (let d=0;d<28;d++) {
        const q = quantities[d]; if (!q) continue;
        const time = new Date(start.getTime()-(28-d)*86400_000+12*3600_000).toISOString();
        const saleId = Number(sale.run(`demo-${id}-${d}`,time,q*cents,q*cents).lastInsertRowid);
        item.run(saleId,id,q,cents); balance-=q;
        move.run(id,time,'sale',-q,balance,'ขายจากข้อมูลจำลอง',saleId);
      }
    }
    db.prepare('INSERT INTO meta VALUES(?,?)').run('demo_seed_date',day);
  });
  return true;
}
