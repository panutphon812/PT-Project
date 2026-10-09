const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(path.join(__dirname,'import_data.js'),'utf8');
const sandbox={};vm.createContext(sandbox);
vm.runInContext(`function shift(value,days){const d=new Date(value+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10)}\n${source}\nglobalThis.api={parseSalesCSV,trainImported,infer};`,sandbox);
const {parseSalesCSV,trainImported,infer}=sandbox.api;
const dataDir=path.join(__dirname,'../Dataset/m5-forecasting-accuracy/ai_results');
const groups=parseSalesCSV(fs.readFileSync(path.join(dataDir,'sample_sales_import.csv'),'utf8'));
const models=trainImported(groups);assert.equal(Object.keys(models).length,5);
for(const m of Object.values(models)){
 assert.equal(m.test.length,28);assert.ok(m.evaluation.trained_until<m.min_date);
 assert.equal(m.trained_until,m.last_date);
 assert.ok(Number.isFinite(infer(m,m.history,m.max_date)));
}
const code=Object.keys(groups)[0];
const altered=JSON.parse(JSON.stringify(groups));
for(const day of Object.keys(altered[code]))if(day>=models[code].min_date)altered[code][day]+=100;
const alteredModel=trainImported(altered)[code];
assert.deepEqual(Array.from(alteredModel.evaluation.coefficients),Array.from(models[code].evaluation.coefficients));
assert.equal(alteredModel.test[0].prediction,models[code].test[0].prediction);
let lines=['date,item_id,sales'];
for(let i=0;i<90;i++){const d=new Date(Date.UTC(2024,0,1+i)).toISOString().slice(0,10);lines.push(`${d},"rice,bag",5`)}
const constant=lines.join('\r\n');const constantModels=trainImported(parseSalesCSV(constant));
assert.ok(Math.abs(infer(constantModels['rice,bag'],constantModels['rice,bag'].history,'2024-03-31')-5)<1e-9);
const bad=[constant+'\n'+lines[1],constant.replace('2024-01-01','2024-02-30'),constant.replace(',5',',-1'),constant.replace(',5',','),constant.replace(',5',',Infinity'),constant.replace(',5',',1.5'),lines.slice(0,89).join('\n'),lines.filter((_,i)=>i!==20).join('\n'),constant.replace('date,item_id,sales','date,date,sales'),'date,item_id,sales\n"unterminated'];
for(const text of bad)assert.throws(()=>parseSalesCSV(text));
assert.equal(parseSalesCSV('\uFEFF'+constant)['rice,bag']['2024-01-01'],5);
if(process.argv[2])fs.writeFileSync(process.argv[2],JSON.stringify(models));
console.log('PASS: 5 imported models; 10 invalid files rejected; quoted CSV; constant demand; chronological holdout and future invariance.');
