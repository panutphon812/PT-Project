const test=require('node:test'),assert=require('node:assert/strict'),engine=require('node:vm').createContext({});
require('node:vm').runInContext(require('node:fs').readFileSync(require('node:path').join(__dirname,'simulation.js'),'utf8')+';globalThis.run=simulateInventory',engine); const simulateInventory=engine.run;
const add=(day,n)=>{const d=new Date(day+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)};
const history=Object.fromEntries(Array.from({length:90},(_,i)=>[add('2016-02-23',i),10]));
const model={trained_until:'2016-04-24',history},options={lead:1,shelf:2,review:1,pack:1,initial:0};
test('daily receipts, lost sales, expiry and conservation',()=>{
 const r=simulateInventory(model,options,'ai',()=>10);assert.equal(r.shortage,10);assert.equal(r.waste,0);assert.equal(r.sold,270);assert.equal(r.inTransit,10);
 assert.equal(r.rows[0].received,0);assert.equal(r.rows[1].received,10);
 assert.equal(r.ordered,r.sold+r.waste+r.remaining+r.inTransit);
 const stale=simulateInventory(model,{...options,shelf:1,review:3,initial:30},'ai',()=>0);assert.equal(stale.rows[0].waste,20);assert.equal(stale.shortage,270);
});
test('orders cannot use current or future actuals',()=>{
 const modified={...model,history:{...history,'2016-04-25':1000,'2016-05-01':999}};
 const predictor=(m,h,d)=>{assert.ok(Object.keys(h).every(k=>k<d));return h[add(d,-1)]};
 const a=simulateInventory(model,options,'ai',predictor),b=simulateInventory(modified,options,'ai',predictor);
 assert.equal(a.rows[0].ordered,b.rows[0].ordered);
 assert.throws(()=>simulateInventory({...model,trained_until:'2016-04-25'},options,'ai',()=>10));
 assert.throws(()=>simulateInventory(model,{...options,lead:0},'ai',()=>10));
});
test('all five M5 models conserve stock across transport and shelf-life scenarios',()=>{
 const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
 const page=fs.readFileSync(path.join(__dirname,'../Dataset/m5-forecasting-accuracy/ai_results/forecast_demo.html'),'utf8');
 const models=JSON.parse(page.match(/const builtInModels\s*=\s*(\{.*?\});/s)[1]);
 const inference=vm.createContext({});vm.runInContext(fs.readFileSync(path.join(__dirname,'import_data.js'),'utf8')+';function shift(d,n){const v=new Date(d+"T00:00:00Z");v.setUTCDate(v.getUTCDate()+n);return v.toISOString().slice(0,10)};globalThis.predict=infer',inference);
 for(const m of Object.values(models))for(const lead of [1,3])for(const shelf of [1,5])for(const method of ['ai','baseline']){
  const o={lead,shelf,review:3,pack:6,initial:10},r=simulateInventory(m,o,method,inference.predict);
  assert.equal(r.demand,r.sold+r.shortage);assert.equal(o.initial+r.ordered,r.sold+r.waste+r.remaining+r.inTransit);
  assert.ok(r.rows.every(d=>d.closing>=0&&d.shortage>=0&&d.waste>=0));
 }
});
