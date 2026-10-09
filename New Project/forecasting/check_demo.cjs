// Check actual browser calculation against Python model predictions.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const html = fs.readFileSync(path.join(__dirname, '../Dataset/m5-forecasting-accuracy/ai_results/forecast_demo.html'), 'utf8');
const data = html.match(/const builtInModels = (.*);\r?\n/)[1];
const functions = html.slice(html.indexOf('function shift('), html.indexOf('function history('));
const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(`const models=${data};const item={value:''}, date={value:''};${functions}
let count=0,maxError=0;
for(const code of Object.keys(models)){
 item.value=code;
 for(const [day,reference] of Object.entries(models[code].reference)){
  date.value=day;const c=context();const result=calculate(c);
  maxError=Math.max(maxError,Math.abs(result.prediction-reference));count++;
  if(c.days.at(-1)>=day)throw new Error('Target day included in history');
 }
}
let rejected=0;
for(const day of ['', '2016-04-24', '2016-05-24']){date.value=day;try{context()}catch(e){rejected++}}
globalThis.result={count,maxError,rejected};`, sandbox);
assert.equal(sandbox.result.count, 145);
assert.ok(sandbox.result.maxError < 1e-9);
assert.equal(sandbox.result.rejected, 3);
console.log('PASS:', sandbox.result);
