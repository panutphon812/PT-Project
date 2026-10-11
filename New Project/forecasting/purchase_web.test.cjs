const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const out=path.join(__dirname,'../Dataset/m5-forecasting-accuracy/ai_results');
const ctx={};vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(out,'purchase_bundle.js'),'utf8')+fs.readFileSync(path.join(__dirname,'purchase_engine.js'),'utf8')+';globalThis.api={purchasePredict,purchaseEvaluate,purchaseCompare}',ctx);
const rows=JSON.parse(fs.readFileSync(path.join(out,'purchase_model_dataset.json'),'utf8'));
let predictions=0,evaluations=0;
for(const r of rows){
 if(r.prediction){assert.deepEqual(Array.from(ctx.api.purchasePredict(r.forecast,r.conditions)),r.prediction);predictions++;}
 for(const [method,a] of [['teacher',r.label],['ml2',r.prediction]])if(a&&r.evaluations){const got=ctx.api.purchaseEvaluate(r.actual,r.conditions,a);for(const k of Object.keys(got))assert.ok(Math.abs(got[k]-r.evaluations[method][k])<1e-7,`${r.id} ${k}`);evaluations++;}
 const compared=ctx.api.purchaseCompare(r.forecast,r.conditions);assert.deepEqual(Array.from(compared[2].action),r.label);
}
console.log(`PASS ${predictions} tree predictions, ${evaluations} actual-sales evaluations, ${rows.length} teacher plans`);
const html=fs.readFileSync(path.join(out,'forecast_demo.html'),'utf8');
const data=html.match(/const builtInModels\s*=\s*(\{.*?\});/s)[1];
vm.runInContext(`const builtInModels=${data};function shift(day,n){const d=new Date(day+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)}`+fs.readFileSync(path.join(__dirname,'import_data.js'),'utf8')+';globalThis.forecastTest=(item,start)=>{const model={...builtInModels[item],...purchaseBundle.first[item]},history=Object.fromEntries(Object.entries(model.history).filter(([d])=>d<start)),f=[];for(let i=0;i<7;i++){const day=shift(start,i),sales=infer(model,history,day);f.push(sales);history[day]=sales}return f}',ctx);
for(const r of rows){const f=ctx.forecastTest(r.item,r.date);f.forEach((v,i)=>assert.ok(Math.abs(v-r.forecast[i])<1e-8,`${r.id} forecast ${i}`))}
console.log('PASS recursive first-model forecasts for all 680 scenarios; actual future history excluded');
