import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from './webapp_server.mjs';
test('persistent workspace, validated M5 purchases, disabled import and request protection',async()=>{
 const storage=await mkdtemp(join(tmpdir(),'forecast-webapp-'));let server;
 async function start(){server=await createApp(storage);await new Promise(r=>server.listen(0,'127.0.0.1',r));return `http://127.0.0.1:${server.address().port}`}
 const stop=()=>new Promise(r=>server.close(r));
 try{
  let url=await start(),datasetId='m5';const post=(path,body)=>fetch(url+path,{method:'POST',headers:{'X-Forecast-App':'1'},body:path==='/api/purchases'?JSON.stringify({datasetId,requestId:crypto.randomUUID(),...JSON.parse(body)}):body});
  assert.equal((await fetch(url+'/')).status,200);
  assert.equal((await fetch(url+'/../server.js')).status,404);
  assert.equal((await fetch(url+'/api/reset',{method:'POST',body:''})).status,403);
  let r=await post('/api/purchases',JSON.stringify({item:'FOODS_1_085',date:'2016-05-23',stock:0,pack:6}));assert.equal(r.status,200);const m5=await r.json();assert.equal(m5.units,m5.packs*6);
  assert.equal((await post('/api/import','date,item_id,sales')).status,404);
  assert.equal((await post('/api/reset','')).status,404);
  await stop();url=await start();let state=await (await fetch(url+'/api/workspace')).json();assert.equal(state.dataset,null);assert.equal(state.purchases.length,1);
  assert.equal((await post('/api/purchases',JSON.stringify({item:'FOODS_1_085',date:'2026-10-10',stock:0,pack:6}))).status,400);
  datasetId='m5';const same={item:'FOODS_1_085',date:'2016-05-23',stock:0,pack:6,requestId:crypto.randomUUID()};
  const duplicate=await Promise.all([post('/api/purchases',JSON.stringify(same)),post('/api/purchases',JSON.stringify(same))]);
  assert.ok(duplicate.every(r=>r.status===200));assert.equal((await duplicate[0].json()).id,(await duplicate[1].json()).id);
  const batch=await Promise.all(Array.from({length:8},(_,stock)=>post('/api/purchases',JSON.stringify({...same,stock,requestId:crypto.randomUUID()}))));assert.ok(batch.every(r=>r.status===200));
  await stop();url=await start();state=await (await fetch(url+'/api/workspace')).json();assert.equal(state.purchases.length,10,'concurrent requests persisted without losing rows');
 }finally{if(server?.listening)await stop();await rm(storage,{recursive:true,force:true})}
});
