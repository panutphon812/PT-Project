// Prospective scenario only: recursively forecast from the final observed day.
function planLots(model, options, lots, predict) {
 const {lead,shelf,pack}=options;
 if(!Number.isSafeInteger(lead)||lead<0||lead>30||!Number.isSafeInteger(shelf)||shelf<1||shelf>30||!Number.isSafeInteger(pack)||pack<1||pack>1000000)throw new Error('เวลารอรับ 0–30 วัน อายุขาย 1–30 วัน และแพ็ก 1–1,000,000 หน่วย ต้องเป็นจำนวนเต็ม');
 const add=(day,n)=>{const d=new Date(day+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)};
 const last=Object.keys(model.history).sort().at(-1),start=add(last,1),arrival=add(start,lead),expiry=add(arrival,shelf-1);
 if(!Array.isArray(lots)||lots.length>50)throw new Error('รองรับไม่เกิน 50 ล็อต');
 const stock=lots.map(l=>{
  if(!Number.isSafeInteger(l.qty)||l.qty<0||l.qty>1000000||!/^\d{4}-\d{2}-\d{2}$/.test(l.expires)||!Number.isFinite(Date.parse(l.expires+'T00:00:00Z'))||add(l.expires,0)!==l.expires)throw new Error('แต่ละล็อตต้องระบุจำนวนเต็ม 0–1,000,000 และวันหมดอายุที่ถูกต้อง');
  return {...l};
 }).sort((a,b)=>a.expires.localeCompare(b.expires));
 const history={...model.history},rows=[];let waitShortage=0,need=0,expired=0;
 for(let k=0;k<lead+shelf;k++){
  const day=add(start,k);let waste=0;
  for(const l of stock)if(l.expires<day){waste+=l.qty;l.qty=0}
  expired+=waste;
  const demand=predict(model,history,day);
  if(!Number.isFinite(demand)||demand<0)throw new Error('คำทำนายไม่ถูกต้อง');
  history[day]=demand;let missing=demand;
  for(const l of stock){const used=Math.min(l.qty,missing);l.qty-=used;missing-=used}
  if(day<arrival)waitShortage+=missing;else need+=missing;
  rows.push({date:day,demand,existingUsed:demand-missing,missing,expired:waste});
 }
 const packs=Math.ceil(Math.max(0,need)/pack),units=packs*pack;
 return {start,arrival,expiry,rows,waitShortage,need,packs,units,packExcess:units-need,expired,remaining:stock.reduce((s,l)=>s+l.qty,0)};
}
if(typeof module!=='undefined')module.exports={planLots};
