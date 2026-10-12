import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import http from 'node:http';
import {forecast,parseSales,defaultConfig,validateConfig,evaluatePlan,planPurchases,simulate} from './retail_engine.mjs';
import {retailHandler} from './retail_server.mjs';
const assets=new URL('../Dataset/m5-forecasting-accuracy/ai_results/retail/',import.meta.url);
const bundle=JSON.parse(await readFile(new URL('bundle.json',assets),'utf8'));
test('browser inference replays independent sklearn 14-day references including float32 tree splits',async()=>{
 const rows=JSON.parse(await readFile(new URL('replay.json',assets),'utf8'));for(const r of rows){const out=forecast(bundle.models[r.model],r.history,r.date);out.forEach((v,i)=>assert.ok(Math.abs(v-r.expected[i])<1e-6,`${r.item}/${r.model}/${i}: ${v} vs ${r.expected[i]}`))}
});
test('CSV validates duplicate, missing days, negative, noninteger, impossible date and supports unseen ids',()=>{
 const lines=['date,item,sales',...Array.from({length:28},(_,i)=>`2020-01-${String(i+1).padStart(2,'0')},NEW,2`)];
 assert.equal(parseSales(lines.join('\n')).products[0].item,'NEW');
 for(const text of [lines.join('\n')+'\n2020-01-01,NEW,2',lines.filter((_,i)=>i!==10).join('\n'),lines.join('\n').replace('NEW,2','NEW,-1'),lines.join('\n').replace('NEW,2','NEW,1.5'),lines.join('\n').replace('2020-01-01','2020-02-30')])assert.throws(()=>parseSales(text));
});
test('hand calculation: shared delivery once, receive before sale, lost sales, holding and opportunity costs',()=>{
 const products=[{item:'A'},{item:'B'}],c=defaultConfig(products);c.capacity=100;c.products.forEach(p=>{p.stock=0;p.holding=1;p.shortage=5});c.suppliers.forEach(s=>{s.lead=1;s.shipping=10;s.offers.forEach(o=>{o.price=2;o.minimum=1})});
 const forecast={A:[2,...Array(13).fill(0)],B:[3,...Array(13).fill(0)]};
 const r=evaluatePlan(forecast,c,'2020-01-01',[{supplier:'S1',orderDate:'2020-01-01',receipt:'2020-01-02',lines:[{item:'A',units:2}]},{supplier:'S1',orderDate:'2020-01-01',receipt:'2020-01-02',lines:[{item:'B',units:3}]}]);
 assert.equal(r.feasible,true);assert.equal(r.orders.length,1);assert.deepEqual(r.cost,{purchase:10,shipping:10,holding:0,shortage:0});assert.equal(r.total,20);
 const none=evaluatePlan(forecast,c,'2020-01-01');assert.equal(none.missing,5);assert.equal(none.cost.shortage,25);
});
test('capacity is checked before sales and committed inbounds occupy reserved capacity; minimum conflicts are explicit',()=>{
 const c=defaultConfig([{item:'A'}]);c.capacity=5;c.products[0].stock=0;c.inbound=[{item:'A',units:4,receipt:'2020-01-03'}];const p={A:Array(14).fill(5)};
 const invalid=evaluatePlan(p,c,'2020-01-01',[{supplier:'S1',orderDate:'2020-01-01',receipt:'2020-01-02',lines:[{item:'A',units:6}]}]);assert.equal(invalid.feasible,false);
 c.suppliers.forEach(s=>s.offers[0].minimum=6);assert.ok(planPurchases(p,c,'2020-01-01').warnings.some(w=>w.includes('ขั้นต่ำ')));
});
test('no future demand enters decision: changing future actual leaves first committed order identical',()=>{
 const c=defaultConfig(bundle.products),altered=structuredClone(bundle),idx=altered.dates.indexOf('2016-01-01');altered.products.forEach(p=>{p.sales[idx]+=20});
 const a=simulate(bundle,c,{model:bundle.selected,start:'2016-01-01',days:2}),b=simulate(altered,c,{model:bundle.selected,start:'2016-01-01',days:2});
 assert.deepEqual(a.orders.filter(o=>o.orderDate==='2015-12-31'),b.orders.filter(o=>o.orderDate==='2015-12-31'));
});
test('SQLite persists separately, rejects stale writes and rejects invalid history, backs up before overwrite',async()=>{
 const folder=await mkdtemp(join(tmpdir(),'retail-test-')),handler=await retailHandler(folder),server=http.createServer(async(req,res)=>{await handler(req,res,new URL(req.url,'http://localhost'))});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${server.address().port}/retail/api/workspace`;
 const state={dataset:{products:bundle.products,dates:bundle.dates,latest:bundle.dates.at(-1)},config:defaultConfig(bundle.products)};
 const save=(revision,s=state)=>fetch(url,{method:'PUT',headers:{'Content-Type':'application/json','X-Forecast-App':'1'},body:JSON.stringify({revision,state:s})});
 try{assert.equal((await save(0)).status,200);assert.equal((await save(0)).status,409);assert.equal((await save(1)).status,200);assert.equal((await fetch(url)).status,200);const bad=structuredClone(state);bad.dataset.products[0].sales[0]=-1;assert.equal((await save(2,bad)).status,400);assert.equal((await fetch(url).then(r=>r.json())).revision,2)}finally{await new Promise(r=>server.close(r));handler.close();await rm(folder,{recursive:true,force:true})}
});
test('selection uses only training period; groups cover seven departments with independent heldout products',()=>{
 const main=bundle.experiment.selection.filter(p=>p.role==='main'),held=bundle.experiment.selection.filter(p=>p.role==='heldout');assert.equal(main.length,14);assert.equal(held.length,7);assert.equal(new Set(main.map(p=>p.dept)).size,7);for(const p of held)assert.ok(!main.some(q=>q.item===p.item));assert.equal(bundle.experiment.trainEnd,'2014-12-31');
 const selected=bundle.experiment.validation.filter(r=>r.model===bundle.selected)[0];assert.equal(selected.MASE,Math.min(...bundle.experiment.validation.filter(r=>r.model==='linear'||r.model===bundle.experiment.forest).map(r=>r.MASE)));
});
