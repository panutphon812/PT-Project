import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeBaskets, basketReport } from '../basket.js';
import { openDatabase } from '../db.js';
import { createService } from '../service.js';
import { makeServer } from '../server.js';

const now=new Date('2026-10-07T05:00:00Z');
const options={min_bills:1,min_pair_count:1,min_support:0,min_confidence:0,min_lift:1};
test('pair support, directional confidence and lift use unique bill/item sets',()=>{
  const transactions=[{id:1,items:[1,1,2]},{id:1,items:[2]},{id:2,items:[1,2]}, {id:3,items:[1]}, {id:4,items:[3]}];
  const report=analyzeBaskets(transactions,options);
  assert.equal(report.total_bills,4);assert.equal(report.multi_item_bills,2);
  const ab=report.rules.find(r=>r.from===1&&r.to===2),ba=report.rules.find(r=>r.from===2&&r.to===1);
  assert.equal(ab.pair_count,2);assert.equal(ab.support,.5);assert.equal(ab.confidence,2/3);assert.equal(ab.lift,4/3);
  assert.equal(ba.confidence,1);assert.equal(ba.lift,4/3);
});
test('popular independent products do not pass lift threshold',()=>{
  const report=analyzeBaskets([{id:1,items:[1,2]},{id:2,items:[1,2]},{id:3,items:[2]},{id:4,items:[2]}],{...options,min_lift:1.01});
  assert.equal(report.rules.length,0);assert.equal(report.status,'no-rules');
  assert.equal(analyzeBaskets([{id:1,items:[1,2]}]).status,'insufficient');
  assert.equal(analyzeBaskets([],options).rules.length,0);
  assert.equal(analyzeBaskets([{id:1,items:[1]},{id:2,items:[2]}],options).observed_pairs,0);
});
test('each selection threshold applies, rejects invalid configuration',()=>{
  const data=[{id:1,items:[1,2]},{id:2,items:[1,2]},{id:3,items:[1]},{id:4,items:[3]}];
  for(const overrides of [{min_bills:5},{min_pair_count:3},{min_support:.6},{min_confidence:1,min_lift:1.4},{min_lift:2}])assert.equal(analyzeBaskets(data,{...options,...overrides}).rules.length,0);
  for(const invalid of [{min_support:NaN},{min_confidence:1.1},{min_lift:.5},{min_bills:0},{min_pair_count:1.5}])assert.throws(()=>analyzeBaskets(data,{...options,...invalid}));
});
function fixture(){
  const db=openDatabase(':memory:');const s=createService(db);
  const products=['A','B','C'].map(sku=>s.saveProduct({sku,name:sku,category:'ทดสอบ',unit:'ชิ้น',price_cents:100,cost_cents:50,lead_days:2,safety_days:1,review_days:7}));
  products.forEach(p=>s.stock({product_id:p.id,type:'receive',quantity:100,note:'fixture'},now));
  const sale=(key,ids,date)=>s.checkout({request_key:key,items:ids.map(product_id=>({product_id,quantity:1})),paid_cents:10000},date);
  sale('one',[1,1,2],new Date('2026-10-06T05:00:00Z'));
  sale('two',[1,2],new Date('2026-10-06T06:00:00Z'));
  sale('three',[1],new Date('2026-10-06T07:00:00Z'));
  sale('four',[3],new Date('2026-10-06T08:00:00Z'));
  sale('today',[1,2],now);
  sale('old',[1,2],new Date('2026-09-01T05:00:00Z'));
  sale('one',[1,1,2],new Date('2026-10-06T05:00:00Z'));
  return {db,s};
}
test('SQLite report excludes current day, includes all bills, ignores quantities and duplicate lines, leaves stock formula unchanged',()=>{
  const {db,s}=fixture();
  // Simulate a legacy bill containing duplicate SKU rows.
  db.prepare('INSERT INTO sale_items(sale_id,product_id,quantity,price_cents) VALUES(1,1,4,100)').run();
  const before=s.recommendations(28,now);
  const report=basketReport(db,28,options,now);
  assert.equal(report.total_bills,4);assert.equal(report.start_date,'2026-09-09');assert.equal(report.end_date,'2026-10-06');
  assert.equal(report.rules[0].pair_count,2);assert.equal(report.demo_bills,0);
  assert.deepEqual(s.recommendations(28,now),before);
  assert.throws(()=>s.baskets(0,options,now));db.close();
});
test('basket API and module are served, query validation, previous API remains available',async()=>{
  const {db}=fixture();const server=makeServer(db);await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const url=`http://127.0.0.1:${server.address().port}`;
  try{
    const response=await fetch(url+'/api/baskets?days=90&min_bills=1&min_pair_count=1&min_support=0&min_confidence=0&min_lift=1');
    assert.equal(response.status,200);assert.ok((await response.json()).total_bills>=5);
    assert.equal((await fetch(url+'/api/baskets?min_support=2')).status,400);
    assert.equal((await fetch(url+'/basket-ui.js')).status,200);
    assert.equal((await fetch(url+'/api/recommendations')).status,200);
  }finally{await new Promise(r=>server.close(r));db.close();}
});
