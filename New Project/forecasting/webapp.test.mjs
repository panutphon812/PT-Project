import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from './webapp_server.mjs';
test('persistent workspace, validated purchases, invalid import and request protection',async()=>{
 const storage=await mkdtemp(join(tmpdir(),'forecast-webapp-'));let server;
 async function start(){server=await createApp(storage);await new Promise(r=>server.listen(0,'127.0.0.1',r));return `http://127.0.0.1:${server.address().port}`}
 const stop=()=>new Promise(r=>server.close(r));
 try{
  let url=await start(),datasetId='m5';const post=(path,body)=>fetch(url+path,{method:'POST',headers:{'X-Forecast-App':'1'},body:path==='/api/purchases'?JSON.stringify({datasetId,requestId:crypto.randomUUID(),...JSON.parse(body)}):body});
  assert.equal((await fetch(url+'/')).status,200);
  assert.equal((await fetch(url+'/../server.js')).status,404);
  assert.equal((await fetch(url+'/api/reset',{method:'POST',body:''})).status,403);
  let r=await post('/api/purchases',JSON.stringify({item:'FOODS_1_085',date:'2016-05-23',stock:0,pack:6}));assert.equal(r.status,200);const m5=await r.json();assert.equal(m5.units,m5.packs*6);
  const csv=await readFile(new URL('../Dataset/m5-forecasting-accuracy/ai_results/sample_sales_import.csv',import.meta.url),'utf8');
  r=await post('/api/import',csv);assert.equal(r.status,200);const dataset=await r.json();datasetId=dataset.id;const item=Object.keys(dataset.models)[0];const model=dataset.models[item];
  r=await post('/api/purchases',JSON.stringify({item,date:model.max_date,stock:8,pack:6,prediction:1e9}));assert.equal(r.status,200);const purchase=await r.json();assert.notEqual(purchase.prediction,1e9);assert.equal(purchase.units,Math.ceil(Math.max(0,purchase.prediction-8)/6)*6);
  assert.equal((await post('/api/import','date,item_id,sales\n2026-01-01,A,-1')).status,400);
  await stop();url=await start();let state=await (await fetch(url+'/api/workspace')).json();assert.equal(state.purchases.length,2);assert.equal(Object.keys(state.dataset.models).length,5);
  assert.equal((await post('/api/reset','')).status,200);state=await (await fetch(url+'/api/workspace')).json();assert.equal(state.dataset,null);assert.equal(state.purchases.length,2);
  assert.equal((await post('/api/purchases',JSON.stringify({item,date:model.max_date,stock:8,pack:6}))).status,400,'stale tab must not save against a different dataset');
  datasetId='m5';const same={item:'FOODS_1_085',date:'2016-05-23',stock:0,pack:6,requestId:crypto.randomUUID()};
  const duplicate=await Promise.all([post('/api/purchases',JSON.stringify(same)),post('/api/purchases',JSON.stringify(same))]);
  assert.ok(duplicate.every(r=>r.status===200));assert.equal((await duplicate[0].json()).id,(await duplicate[1].json()).id);
  const batch=await Promise.all(Array.from({length:8},(_,stock)=>post('/api/purchases',JSON.stringify({...same,stock,requestId:crypto.randomUUID()}))));assert.ok(batch.every(r=>r.status===200));
  await stop();url=await start();state=await (await fetch(url+'/api/workspace')).json();assert.equal(state.purchases.length,11,'concurrent requests persisted without losing rows');
 }finally{if(server?.listening)await stop();await rm(storage,{recursive:true,force:true})}
});
