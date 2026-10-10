// Daily lost-sales simulation. Order decisions never see current/future sales.
function simulateInventory(model, options, method, predict) {
 const {lead,shelf,review,pack,initial}=options;
 for(const [key,value] of Object.entries(options))if(!Number.isSafeInteger(value)||value<(key==='initial'?0:1)||value>(key==='initial'?100000:30))throw new Error('กรอกจำนวนเต็ม: เงื่อนไข 1–30 วัน/หน่วย และของเริ่มต้น 0–100,000');
 const start='2016-04-25',end='2016-05-22';
 if(model.trained_until>=start)throw new Error('โมเดลต้องฝึกก่อนช่วงทดสอบ');
 const add=(day,n)=>{const d=new Date(day+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)};
 const known=Object.fromEntries(Object.entries(model.history).filter(([d])=>d<start));
 let lots=initial?[{qty:initial,expires:add(start,shelf-1)}]:[],pending=[],rows=[];
 function consume(batch,demand){batch.sort((a,b)=>a.expires.localeCompare(b.expires));let left=demand;for(const b of batch){const used=Math.min(left,b.qty);b.qty-=used;left-=used}return left}
 for(let t=0;t<28;t++){
  const day=add(start,t),actual=model.history[day];if(!Number.isFinite(actual))throw new Error('ข้อมูล M5 ไม่ครบ');
  let ordered=0;
  if(t%review===0){
   const arrival=add(day,lead),window=Math.min(review,shelf),horizon=lead+window;
   const history={...known},projection=lots.map(b=>({...b}));let need=0;
   const mean=Array.from({length:28},(_,i)=>known[add(day,i-28)]).reduce((s,v)=>s+v,0)/28;
   for(let k=0;k<horizon;k++){
    const future=add(day,k);projection.push(...pending.filter(b=>b.arrives===future).map(b=>({...b})));
    const usable=projection.filter(b=>b.expires>=future);projection.splice(0,projection.length,...usable);
    const forecast=method==='ai'?predict(model,history,future):mean;
    if(!Number.isFinite(forecast))throw new Error('คำนวณคำทำนายไม่ได้');history[future]=forecast;
    const missing=consume(projection,forecast);if(k>=lead)need+=missing;
   }
   ordered=Math.ceil(Math.max(0,need)/pack)*pack;
   if(ordered)pending.push({qty:ordered,arrives:arrival,expires:add(arrival,shelf-1)});
  }
  const receipts=pending.filter(b=>b.arrives===day);lots.push(...receipts);pending=pending.filter(b=>b.arrives!==day);
  const received=receipts.reduce((s,b)=>s+b.qty,0);const opening=lots.reduce((s,b)=>s+b.qty,0),shortage=consume(lots,actual);
  const waste=lots.filter(b=>b.expires===day).reduce((s,b)=>s+b.qty,0);lots=lots.filter(b=>b.expires>day&&b.qty>0);
  rows.push({date:day,actual,ordered,received,opening,sold:actual-shortage,shortage,waste,closing:lots.reduce((s,b)=>s+b.qty,0)});
  known[day]=actual;
 }
 const total=key=>rows.reduce((s,r)=>s+r[key],0),demand=total('actual');
 return {rows,demand,sold:total('sold'),shortage:total('shortage'),waste:total('waste'),ordered:total('ordered'),remaining:rows.at(-1).closing,inTransit:pending.reduce((s,b)=>s+b.qty,0),service:demand?100*total('sold')/demand:null};
}
if(typeof module!=='undefined')module.exports={simulateInventory};
