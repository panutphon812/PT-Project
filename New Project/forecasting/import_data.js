// Local CSV validation and training. No network requests or persistent storage.
function parseSalesCSV(text) {
 const rows=[];let row=[],cell='',quoted=false,closed=false;
 text=text.replace(/^\uFEFF/,'');
 for(let i=0;i<text.length;i++){
  const ch=text[i];
  if(quoted){if(ch==='"'){if(text[i+1]==='"'){cell+='"';i++}else{quoted=false;closed=true}}else cell+=ch;continue}
  if(ch==='"'){if(cell||closed)throw new Error('รูปแบบเครื่องหมายคำพูดใน CSV ไม่ถูกต้อง');quoted=true;continue}
  if(ch===','||ch==='\n'||ch==='\r'){
   row.push(cell);cell='';closed=false;
   if(ch!==','){if(ch==='\r'&&text[i+1]==='\n')i++;if(row.some(v=>v.trim()!==''))rows.push(row);row=[]}
  }else{if(closed)throw new Error('มีข้อความหลังเครื่องหมายคำพูดปิด');cell+=ch}
 }
 if(quoted)throw new Error('CSV มีเครื่องหมายคำพูดที่ปิดไม่ครบ');
 row.push(cell);if(row.some(v=>v.trim()!==''))rows.push(row);
 if(rows.length<2)throw new Error('ไฟล์ไม่มีข้อมูลยอดขาย');
 if(rows.length>20001)throw new Error('รองรับไม่เกิน 20,000 แถวต่อไฟล์');
 const headers=rows.shift().map(v=>v.trim());
 const thai=['วันที่','รหัสสินค้า','จำนวนที่ขาย'],english=['date','item_id','sales'];
 const names=thai.every(v=>headers.includes(v))?thai:english;
 if(headers.length!==3||new Set(headers).size!==3||!names.every(v=>headers.includes(v)))throw new Error('หัวตารางต้องเป็น วันที่,รหัสสินค้า,จำนวนที่ขาย หรือ date,item_id,sales');
 const indices=names.map(v=>headers.indexOf(v));const groups=Object.create(null);
 rows.forEach((cells,i)=>{
  const fail=message=>{throw new Error('แถว '+(i+2)+': '+message)};
  if(cells.length!==3)fail('ต้องมี 3 ช่องข้อมูล');
  const [day,code,salesText]=indices.map(n=>cells[n].trim());
  if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||!Number.isFinite(Date.parse(day+'T00:00:00Z'))||new Date(day+'T00:00:00Z').toISOString().slice(0,10)!==day)fail('วันที่ต้องถูกต้องและอยู่ในรูปแบบ YYYY-MM-DD');
  if(day<'1900-01-01'||day>'2099-12-30')fail('รองรับวันที่ปี 1900–2099');
  if(!code||code.length>80||/[\r\n\t]/.test(code)||/^[=+@-]/.test(code))fail('รหัสสินค้าต้องยาว 1–80 ตัวอักษร และไม่ขึ้นต้นด้วย = + @ -');
  if(!/^\d+(?:\.0+)?$/.test(salesText))fail('จำนวนขายต้องเป็นจำนวนเต็มตั้งแต่ 0 ขึ้นไป');
  const sales=Number(salesText);if(!Number.isSafeInteger(sales)||sales>1000000)fail('จำนวนขายสูงเกินขอบเขต 1,000,000 หน่วย');
  if(!groups[code])groups[code]=Object.create(null);
  if(Object.hasOwn(groups[code],day))fail('วันที่และรหัสสินค้าซ้ำกัน');
  groups[code][day]=sales;
 });
 if(Object.keys(groups).length>20)throw new Error('รองรับไม่เกิน 20 สินค้าต่อไฟล์');
 for(const [code,history] of Object.entries(groups)){
  const days=Object.keys(history).sort();
  if(days.length<90)throw new Error(code+': ต้องมีข้อมูลอย่างน้อย 90 วันต่อเนื่อง');
  for(let i=1;i<days.length;i++)if(days[i]!==shift(days[i-1],1))throw new Error(code+': ขาดข้อมูลวันที่ '+shift(days[i-1],1)+' กรุณาเติมยอดขายจริง (ใส่ 0 เฉพาะวันที่ขายไม่ได้จริง)');
 }
 return groups;
}
function featureVector(history,day){
 const values=Array.from({length:28},(_,i)=>history[shift(day,i-28)]);
 if(values.some(v=>!Number.isFinite(v)))throw new Error('ข้อมูลย้อนหลังไม่ครบ 28 วัน');
 const mean=a=>a.reduce((s,v)=>s+v,0)/a.length;const last7=values.slice(-7),m7=mean(last7);
 const d=new Date(day+'T00:00:00Z'),weekday=(d.getUTCDay()+6)%7;
 const doy=Math.floor((d-Date.UTC(d.getUTCFullYear(),0,1))/86400000)+1;
 return [1,7,14,28].map(n=>history[shift(day,-n)]).concat([m7,mean(values),Math.sqrt(mean(last7.map(v=>(v-m7)**2)))],Array.from({length:6},(_,i)=>+(weekday===i+1)),[Math.sin(2*Math.PI*doy/365.25),Math.cos(2*Math.PI*doy/365.25)]);
}
function fitImported(history,days){
 const xs=days.map(day=>featureVector(history,day)),ys=days.map(day=>history[day]);const n=xs.length,p=xs[0].length;
 const center=Array.from({length:p},(_,j)=>xs.reduce((s,x)=>s+x[j],0)/n);
 const scale=center.map((m,j)=>Math.sqrt(xs.reduce((s,x)=>s+(x[j]-m)**2,0)/n)||1);
 const a=Array.from({length:p+1},()=>Array(p+2).fill(0));
 xs.forEach((x,i)=>{const z=[1,...x.map((v,j)=>(v-center[j])/scale[j])];for(let j=0;j<=p;j++){for(let k=0;k<=p;k++)a[j][k]+=z[j]*z[k];a[j][p+1]+=z[j]*ys[i]}});
 // Ridge alpha=1, fixed before evaluating. Intercept is not penalized.
 for(let j=1;j<=p;j++)a[j][j]+=1;
 for(let j=0;j<=p;j++){
  let pivot=j;for(let k=j+1;k<=p;k++)if(Math.abs(a[k][j])>Math.abs(a[pivot][j]))pivot=k;
  [a[j],a[pivot]]=[a[pivot],a[j]];const divisor=a[j][j];
  if(Math.abs(divisor)<1e-12)throw new Error('ข้อมูลไม่พอสำหรับฝึกโมเดล');
  for(let k=j;k<=p+1;k++)a[j][k]/=divisor;
  for(let r=0;r<=p;r++)if(r!==j){const factor=a[r][j];for(let k=j;k<=p+1;k++)a[r][k]-=factor*a[j][k]}
 }
 const coefficients=a.map(r=>r[p+1]);if(!coefficients.every(Number.isFinite))throw new Error('ฝึกโมเดลไม่สำเร็จ');
 return {center,scale,coefficients,trained_until:days.at(-1)};
}
function infer(model,history,day){const x=featureVector(history,day);return Math.max(0,model.coefficients[0]+x.reduce((s,v,i)=>s+(v-model.center[i])/model.scale[i]*model.coefficients[i+1],0))}
function trainImported(groups){
 const result=Object.create(null);
 for(const [code,history] of Object.entries(groups)){
  const days=Object.keys(history).sort(),testDays=days.slice(-28),training=days.slice(28,-28);
  const evaluation=fitImported(history,training),final=fitImported(history,days.slice(28));
  const test=testDays.map(day=>{const predicted=infer(evaluation,history,day),baseline=featureVector(history,day)[5];return {date:day,actual:history[day],prediction:predicted,baseline}});
  const mae=test.reduce((s,r)=>s+Math.abs(r.prediction-r.actual),0)/28;
  const baselineMAE=test.reduce((s,r)=>s+Math.abs(r.baseline-r.actual),0)/28;
  result[code]={...final,history,evaluation,test,mae,baselineMAE,min_date:testDays[0],max_date:shift(days.at(-1),1),last_date:days.at(-1)};
 }
 return result;
}
function csvCell(value){const text=String(value);return /[",\r\n]/.test(text)?'"'+text.replaceAll('"','""')+'"':text}
