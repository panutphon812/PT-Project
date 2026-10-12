import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {defaultConfig,simulate} from './retail_engine.mjs';
const assets=new URL('../Dataset/m5-forecasting-accuracy/ai_results/retail/',import.meta.url),bundle=JSON.parse(await readFile(new URL('bundle.json',assets),'utf8'));
const config=defaultConfig(bundle.products),results=[],start=performance.now();
const cut=bundle.dates.indexOf('2014-12-31')+1;
// Scenario capacity is derived only from TRAINING demand, never from test shortages/costs.
config.capacity=Math.ceil(bundle.products.reduce((s,p)=>s+p.sales.slice(0,cut).reduce((a,v)=>a+v,0)/cut,0)*28);
const validation=[];
for(const scenario of ['ปกติ','พื้นที่จำกัด','ค่าขนส่งสูง']){
 for(const model of Object.keys(bundle.models))validation.push(simulate(bundle,config,{model,start:'2015-02-01',days:28,scenario}));
 validation.push(simulate(bundle,config,{start:'2015-02-01',days:28,scenario,baseline:true}));
}
await writeFile(new URL('policy_validation.json',assets),JSON.stringify({results:validation,config,notice:'ตรวจสอบกติกาและสถานการณ์ในช่วง validation โดยไม่ปรับพารามิเตอร์จากผล test'},null,2));
await writeFile(new URL('policy_protocol.json',assets),JSON.stringify({config,start:'2016-01-01',days:28,restrictedCapacityFactor:.4,highShippingFactor:3,capacityRule:'ceil(sum(training mean daily demand)*28)',frozenBeforeSimulation:true},null,2));
// Fixed settings, window and baseline; never tune on test outcomes.
for(const scenario of ['ปกติ','พื้นที่จำกัด','ค่าขนส่งสูง']){
 for(const model of Object.keys(bundle.models)){const r=simulate(bundle,config,{model,start:'2016-01-01',days:28,scenario});results.push(r);console.log(scenario,model,r.total.toFixed(2),r.missing)}
 const r=simulate(bundle,config,{start:'2016-01-01',days:28,scenario,baseline:true});results.push(r);console.log(scenario,r.model,r.total.toFixed(2),r.missing);
}
const report={results,config,start:'2016-01-01',days:28,seconds:(performance.now()-start)/1000,bundleVersion:bundle.version,notice:'ยอดจริง M5 เป็นความต้องการอ้างอิง ค่าซื้อ ขนส่ง เก็บรักษา เสียโอกาส และพื้นที่เป็นสมมุติ ไม่ใช่ผลร้านจริง ทุกวิธีทราบยอดจริงเมื่อจบวันเท่านั้น ใช้ความจุสำรองโดยไม่พึ่งยอดขายอนาคต ไม่ปรับค่าจากชุดทดสอบ'};
await writeFile(new URL('policy_report.json',assets),JSON.stringify(report,null,2));
console.log('Saved',fileURLToPath(new URL('policy_report.json',assets)),'seconds',report.seconds);
