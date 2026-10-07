import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase,seedDemo } from '../db.js';
import { createService,calculateRecommendation } from '../service.js';
import { makeServer } from '../server.js';
const now=new Date('2026-10-07T05:00:00Z');
function fixture(){const db=openDatabase(':memory:');seedDemo(db,now);return {db,s:createService(db)};}
test('500 SKU, optional barcode, 28 complete calendar days and consistent ledger',()=>{
 const {db,s}=fixture();assert.equal(s.products().length,500);assert.equal(s.products().filter(p=>!p.barcode).length,100);
 assert.equal(seedDemo(db,now),false);
 const r=s.recommendations(28,now);assert.equal(r.start_date,'2026-09-09');assert.equal(r.end_date,'2026-10-06');
 assert.equal(r.rows[0].avg,4);assert.equal(r.rows[1].avg,8);assert.equal(r.rows[2].sold,6);
 assert.equal(r.rows[0].suggested_qty,28);assert.equal(r.rows[1].suggested_qty,68);assert.equal(r.rows[2].suggested_qty,0);
 for(const p of s.products()){assert.equal(db.prepare('SELECT SUM(delta) AS n FROM stock_movements WHERE product_id=?').get(p.id).n,p.stock);}
 db.close();
});
test('atomic checkout, authoritative prices, duplicate lines, repeat protection, cash change',()=>{
 const {db,s}=fixture();const body={request_key:'sale-a',items:[{product_id:1,quantity:2,price_cents:1},{product_id:1,quantity:1},{product_id:5,quantity:1}],paid_cents:10000};
 const r=s.checkout(body,now);assert.equal(r.items.length,2);assert.equal(r.total_cents,4400);assert.equal(r.change_cents,5600);assert.equal(s.products()[0].stock,9);
 assert.equal(s.checkout(body,now).id,r.id);assert.equal(s.products()[0].stock,9);
 const count=db.prepare('SELECT COUNT(*) AS n FROM sales').get().n;
 assert.throws(()=>s.checkout({request_key:'bad',items:[{product_id:1,quantity:1},{product_id:2,quantity:999}],paid_cents:999999},now),/สต็อกไม่พอ/);
 assert.equal(s.products()[0].stock,9);assert.equal(db.prepare('SELECT COUNT(*) AS n FROM sales').get().n,count);
 assert.throws(()=>s.checkout({request_key:'cash',items:[{product_id:1,quantity:1}],paid_cents:0}),/เงินรับ/);
 assert.throws(()=>s.checkout({request_key:'float',items:[{product_id:1,quantity:0.5}],paid_cents:10000}),/จำนวนเต็ม/);
 db.close();
});
test('receiving and count adjustment preserve audit, reject negatives, zero sales needs review',()=>{
 const {db,s}=fixture();s.stock({product_id:1,type:'receive',quantity:30,note:'ใบส่งของ 001'},now);assert.equal(s.products()[0].stock,42);assert.equal(s.recommendations(28,now).rows[0].status,'ok');
 s.stock({product_id:1,type:'adjust',quantity:0,note:'ตรวจนับ'},now);assert.equal(s.products()[0].stock,0);assert.equal(s.movements(1)[0].delta,-42);
 assert.throws(()=>s.stock({product_id:1,type:'adjust',quantity:-1,note:'test'}),/จำนวนเต็ม/);
 const p=s.recommendations(28,now).rows[499];assert.equal(p.coverage,null);assert.equal(p.status,'no-data');assert.equal(p.suggested_qty,0);
 assert.throws(()=>s.recommendations(0,now),/จำนวนเต็ม/);db.close();
});
test('new product, uniqueness, updated lead time, no stock overwrite',()=>{
 const {db,s}=fixture();const body={sku:'NEW1',barcode:null,name:'สินค้าทดสอบ',category:'ทดสอบ',unit:'ชิ้น',price_cents:1250,cost_cents:800,lead_days:3,safety_days:2,review_days:7};
 const p=s.saveProduct(body);assert.equal(p.stock,0);assert.throws(()=>s.saveProduct(body),/ซ้ำ/);
 s.stock({product_id:p.id,type:'receive',quantity:10,note:'รับเข้า'});assert.equal(s.saveProduct({...body,id:p.id,lead_days:4}).stock,10);
 assert.equal(calculateRecommendation({...p,stock:5},28,28).suggested_qty,7);db.close();
});
test('sales today excluded from historical average until next Bangkok day',()=>{
 const {db,s}=fixture();s.checkout({request_key:'today',items:[{product_id:1,quantity:2}],paid_cents:1600},now);
 assert.equal(s.recommendations(28,now).rows[0].sold,112);assert.equal(s.dashboard(now).revenue_cents,1600);
 assert.equal(s.recommendations(28,new Date('2026-10-07T17:00:00Z')).rows[0].sold,110);db.close();
});
test('SQLite data persists when reopened',()=>{
 const dir=mkdtempSync(join(tmpdir(),'grocery-test-'));const path=join(dir,'test.sqlite');
 let db=openDatabase(path);seedDemo(db,now);createService(db).stock({product_id:1,type:'receive',quantity:7,note:'persist'});db.close();
 db=openDatabase(path);assert.equal(createService(db).products()[0].stock,19);db.close();rmSync(dir,{recursive:true});
});
test('HTTP integration: pages, sale, stock, recommendation and validation',async()=>{
 const {db}=fixture();const server=makeServer(db);await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const base=`http://127.0.0.1:${server.address().port}`;
 try{
  assert.equal((await fetch(base)).status,200);
  assert.equal((await (await fetch(base+'/api/products')).json()).length,500);
  const post=async(path,body)=>fetch(base+'/api/'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const r=await post('checkout',{request_key:'http-sale',items:[{product_id:1,quantity:1}],paid_cents:1000});assert.equal(r.status,200);assert.equal((await r.json()).change_cents,200);
  assert.equal((await post('stock',{product_id:1,type:'receive',quantity:2,note:'http'})).status,200);
  assert.equal((await fetch(base+'/api/recommendations?days=28')).status,200);
  assert.equal((await post('checkout',{items:[]})).status,400);
  assert.equal((await fetch(base+'/../package.json')).status,404);
  assert.equal((await fetch(base+'/api/sales/999999999')).status,400);
 }finally{await new Promise(r=>server.close(r));db.close();}
});
