import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from './webapp_server.mjs';
test('lot snapshot persists without touching purchases and rejects stale updates',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'forecast-lots-'));let server;
 const start=async()=>{server=await createApp(dir);await new Promise(r=>server.listen(0,'127.0.0.1',r));return 'http://127.0.0.1:'+server.address().port};
 try{
  let base=await start();
  const payload={item:'FOODS_1_085',revision:0,options:{lead:2,shelf:3,pack:6},lots:[{qty:6,expires:'2016-05-24'}],inbound:[{qty:12,arrives:'2016-05-25',expires:'2016-05-27'}]};
  const post=body=>fetch(base+'/api/lot-plans',{method:'POST',headers:{'X-Forecast-App':'1'},body:JSON.stringify(body)});
  assert.equal((await post(payload)).status,200);
  assert.equal((await post(payload)).status,400);
  assert.equal((await post({...payload,revision:1,inbound:[{qty:1,arrives:'2016-05-25',expires:'2016-05-24'}]})).status,400);
  assert.equal((await (await fetch(base+'/api/lot-plans')).json()).revision,1);
  await new Promise(r=>server.close(r));base=await start();
  const saved=await (await fetch(base+'/api/lot-plans')).json();assert.deepEqual(saved.items[payload.item].lots,payload.lots);assert.deepEqual(saved.items[payload.item].inbound,payload.inbound);
  assert.deepEqual((await (await fetch(base+'/api/workspace')).json()).purchases,[]);
  await assert.rejects(readFile(join(dir,'workspace.json')),e=>e.code==='ENOENT');
 }finally{if(server?.listening)await new Promise(r=>server.close(r));await rm(dir,{recursive:true,force:true})}
});
