export const day=(date,n)=>new Date(Date.parse(date+'T00:00:00Z')+n*86400000).toISOString().slice(0,10);
const sum=a=>a.reduce((s,v)=>s+v,0),mean=a=>sum(a)/a.length;
export function features(history,date){
 if(history.length<28||history.some(v=>!Number.isFinite(v)||v<0))throw Error('ต้องมีประวัติรายวันต่อเนื่องอย่างน้อย 28 วัน และจำนวนขายไม่ติดลบ');
 const a=history.slice(-28),scale=Math.max(mean(a),1),last=a.slice(-7),d=new Date(date+'T00:00:00Z'),w=(d.getUTCDay()+6)%7,y=(d-Date.UTC(d.getUTCFullYear(),0,1))/86400000+1;
 return {scale,x:[a.at(-1)/scale,a.at(-7)/scale,a.at(-14)/scale,a.at(-28)/scale,mean(last)/scale,Math.sqrt(mean(last.map(v=>(v-mean(last))**2)))/scale,a.filter(v=>v===0).length/28,Math.log1p(mean(a)),Math.sin(2*Math.PI*w/7),Math.cos(2*Math.PI*w/7),Math.sin(2*Math.PI*y/365.25),Math.cos(2*Math.PI*y/365.25)]};
}
export function forecast(model,history,date){
 const a=[...history],out=[];
 for(let h=0;h<14;h++){
  let v;
  if(model==='seasonal')v=a.at(-7);
  else {const {x,scale}=features(a,day(date,h));
   if(model.type==='linear')v=model.intercept+sum(x.map((n,i)=>n*model.coef[i]));
   else if(model.type==='forest')v=mean(model.trees.map(t=>{let i=0;while(t.left[i]!==-1){const f=Math.fround(x[t.feature[i]]);i=f<=t.threshold[i]?t.left[i]:t.right[i]}return t.value[i]}));
   else throw Error('ชนิดโมเดลไม่ถูกต้อง');v=Math.max(0,v*scale);
  }if(!Number.isFinite(v))throw Error('โมเดลให้ผลที่คำนวณไม่ได้');out.push(v);a.push(v);
 }return out;
}
function csvRows(text){
 if(new TextEncoder().encode(text).length>5*1024*1024)throw Error('ไฟล์ต้องไม่เกิน 5 MB');
 const rows=[];let row=[],cell='',quoted=false;
 for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++}else quoted=!quoted}else if(!quoted&&(c===','||c==='\n')){row.push(cell);cell='';if(c==='\n'){if(row.some(v=>v.trim()))rows.push(row);row=[]}}else if(c!=='\r')cell+=c}
 if(quoted)throw Error('เครื่องหมายคำพูดใน CSV ไม่ครบ');row.push(cell);if(row.some(v=>v.trim()))rows.push(row);return rows;
}
export function parseSales(text){
 const rows=csvRows(text.replace(/^\uFEFF/,'')),header=rows.shift()?.map(v=>v.trim());
 const aliases=[['date','วันที่'],['item','item_id','รหัสสินค้า'],['sales','จำนวนที่ขาย','จำนวนหน่วยที่ขาย']];
 const ix=aliases.map(a=>header?.findIndex(h=>a.includes(h))??-1);if(ix.some(i=>i<0))throw Error('หัว CSV ต้องมี date,item,sales');
 const groups=new Map(),seen=new Set(),errors=[];
 rows.forEach((r,n)=>{const date=r[ix[0]]?.trim(),item=r[ix[1]]?.trim(),raw=r[ix[2]]?.trim(),v=Number(raw),key=date+'|'+item;
  if(r.length!==header.length||!/^\d{4}-\d{2}-\d{2}$/.test(date||'')||!Number.isFinite(Date.parse(date+'T00:00:00Z'))||day(date,0)!==date||!item||item.length>80||!raw||!Number.isSafeInteger(v)||v<0||seen.has(key)){errors.push(`แถว ${n+2}: วันที่/รหัส/จำนวนขายผิด ค่าว่าง หรือข้อมูลซ้ำ`);return}
  seen.add(key);if(!groups.has(item))groups.set(item,[]);groups.get(item).push({date,sales:v});
 });
 if(groups.size<1||groups.size>15)errors.push('รองรับสินค้า 1–15 รายการต่อร้าน');
 const products=[];
 for(const [item,rs] of groups){rs.sort((a,b)=>a.date.localeCompare(b.date));if(rs.length<28)errors.push(`${item}: ประวัติไม่ถึง 28 วัน`);for(let i=1;i<rs.length;i++)if(day(rs[i-1].date,1)!==rs[i].date)errors.push(`${item}: วันที่ขาดระหว่าง ${rs[i-1].date} และ ${rs[i].date}`);products.push({item,dept:'ข้อมูลผู้ใช้',category:'ข้อมูลผู้ใช้',sales:rs.map(r=>r.sales),dates:rs.map(r=>r.date)})}
 if(new Set(products.map(p=>p.dates.at(-1))).size>1)errors.push('สินค้าทุกตัวต้องมีวันล่าสุดเดียวกัน');
 if(errors.length)throw Error(errors.slice(0,20).join('\n'));
 return {products,latest:products[0].dates.at(-1),source:'CSV ผู้ใช้ · ใช้โมเดลเดิม ไม่ฝึกใหม่'};
}
export function defaultConfig(products){
 return {capacity:3000,products:products.map((p,i)=>({item:p.item,stock:0,space:1,holding:.1,shortage:60+i*2})),suppliers:[1,2,3].map((n)=>({id:'S'+n,name:'ผู้จำหน่ายจำลอง '+n,distance:n*15,lead:n*2-1,shipping:n===1?120:n===2?80:60,offers:products.map((p,i)=>({item:p.item,price:20+i*2+(4-n),minimum:n*3}))})),inbound:[]};
}
export function validateDataset(data){
 if(!data||!Array.isArray(data.products)||data.products.length<1||data.products.length>15||new Set(data.products.map(p=>p.item)).size!==data.products.length)throw Error('ข้อมูลร้านต้องมีสินค้า 1–15 รายการไม่ซ้ำ');
 for(const p of data.products){const dates=p.dates||data.dates;if(typeof p.item!=='string'||!p.item||p.item.length>80||!Array.isArray(p.sales)||p.sales.length<28||p.sales.length>10000||p.sales.some(v=>!Number.isSafeInteger(v)||v<0)||!Array.isArray(dates)||dates.length!==p.sales.length)throw Error('ข้อมูลสินค้าและประวัติไม่ถูกต้อง');for(let i=0;i<dates.length;i++){const d=dates[i];if(typeof d!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(d)||!Number.isFinite(Date.parse(d+'T00:00:00Z'))||day(d,0)!==d||(i&&day(dates[i-1],1)!==d))throw Error('วันที่ประวัติต้องถูกต้องและต่อเนื่อง');}if(dates.at(-1)!==data.latest)throw Error('วันล่าสุดของสินค้าต้องตรงกัน');}return data;
}
export function validateConfig(c,items,date){
 if(!c||!Number.isFinite(c.capacity)||c.capacity<=0||c.capacity>1e9)throw Error('ความจุต้องมากกว่าศูนย์');
 if(c.products?.length!==items.length||new Set(c.products.map(p=>p.item)).size!==items.length)throw Error('ข้อมูลสต็อกต้องครบทุกสินค้าและไม่ซ้ำ');
 const valid=(n,min=0)=>Number.isFinite(n)&&n>=min&&n<=1e9;
 for(const p of c.products)if(!items.includes(p.item)||!Number.isSafeInteger(p.stock)||!valid(p.stock)||!valid(p.space,0.000001)||!valid(p.holding)||!valid(p.shortage))throw Error('สต็อกต้องเป็นจำนวนเต็ม และพื้นที่/ต้นทุนต้องไม่ติดลบ');
 if(c.suppliers?.length!==3||new Set(c.suppliers.map(s=>s.id)).size!==3)throw Error('ต้องมีผู้จำหน่าย 3 แห่งที่รหัสไม่ซ้ำ');
 for(const s of c.suppliers){if(!s.id||!s.name||!Number.isInteger(s.lead)||s.lead<1||s.lead>7||!valid(s.shipping)||!valid(s.distance)||!Array.isArray(s.offers)||new Set(s.offers.map(o=>o.item)).size!==s.offers.length)throw Error('ผู้จำหน่าย: ระยะเวลาส่งต้องเป็น 1–7 วัน และค่าขนส่งไม่ติดลบ');for(const o of s.offers)if(!items.includes(o.item)||!valid(o.price,0.000001)||!Number.isSafeInteger(o.minimum)||o.minimum<1||o.minimum>1e6)throw Error('ราคาซื้อต้องมากกว่าศูนย์ ขั้นต่ำเป็นจำนวนเต็มบวก');}
 for(const item of items)if(!c.suppliers.some(s=>s.offers.some(o=>o.item===item)))throw Error(`${item}: ต้องมีผู้จำหน่ายอย่างน้อยหนึ่งแห่ง`);
 if(!Array.isArray(c.inbound)||c.inbound.length>200)throw Error('รายการระหว่างขนส่งไม่ถูกต้อง');
 for(const r of c.inbound)if(!items.includes(r.item)||!Number.isSafeInteger(r.units)||r.units<=0||!/^\d{4}-\d{2}-\d{2}$/.test(r.receipt||'')||!Number.isFinite(Date.parse(r.receipt+'T00:00:00Z'))||day(r.receipt,0)!==r.receipt||r.receipt<=date)throw Error('ของระหว่างขนส่งต้องมีจำนวนเต็มบวก และวันรับหลังวันล่าสุด');
 if(sum(c.products.map(p=>p.stock*p.space))>c.capacity+1e-8)throw Error('สต็อกเริ่มต้นเกินความจุ กรุณาปรับเงื่อนไข');return c;
}
// Evaluate a forecast-only plan. Receipt is checked BEFORE sales; transport charged once per supplier/day.
export function evaluatePlan(predictions,c,date,orders=[]){
 const stock=Object.fromEntries(c.products.map(p=>[p.item,p.stock])),cost={purchase:0,shipping:0,holding:0,shortage:0},daily=[];let missing=0;
 const consolidated=new Map();
 for(const order of orders){const key=order.supplier+'|'+order.orderDate;if(!consolidated.has(key))consolidated.set(key,{...order,lines:[]});consolidated.get(key).lines.push(...order.lines)}
 const canonical=[];
 for(const order of consolidated.values()){
  const supplier=c.suppliers.find(s=>s.id===order.supplier);if(!supplier)return {feasible:false,reason:'ผู้จำหน่ายไม่ถูกต้อง'};
  if(order.orderDate<date||order.receipt!==day(order.orderDate,supplier.lead))return {feasible:false,reason:'วันรับไม่ตรงระยะเวลาส่ง'};
  const merged=Object.entries(order.lines.reduce((a,l)=>(a[l.item]=(a[l.item]||0)+l.units,a),{})).map(([item,units])=>({item,units}));
  for(const l of merged){const o=supplier.offers.find(o=>o.item===l.item);if(!o||!Number.isSafeInteger(l.units)||l.units<o.minimum)return {feasible:false,reason:'จำนวนซื้อไม่ผ่านขั้นต่ำ'};cost.purchase+=o.price*l.units}
  cost.shipping+=supplier.shipping;canonical.push({...order,lines:merged});
 }
 // Reserve capacity conservatively without relying on uncertain future sales.
 // Existing commitments remain visible; new orders cannot use forecast sales to free space.
 if(canonical.length){const reserved=sum(c.products.map(p=>(p.stock+sum(c.inbound.filter(r=>r.item===p.item).map(r=>r.units))+sum(canonical.flatMap(o=>o.lines.filter(l=>l.item===p.item).map(l=>l.units))))*p.space));if(reserved>c.capacity+1e-7)return {feasible:false,reason:'พื้นที่ที่สำรองให้สต็อกและคำสั่งซื้อเกินความจุ'};}
 for(let h=0;h<14;h++){
  const d=day(date,h+1);
  for(const r of c.inbound)if(r.receipt===d)stock[r.item]+=r.units;
  for(const o of canonical)if(o.receipt===d)for(const l of o.lines)stock[l.item]+=l.units;
  const space=sum(c.products.map(p=>stock[p.item]*p.space));if(space>c.capacity+1e-7)return {feasible:false,reason:`พื้นที่รับสินค้าวัน ${d} เกินความจุ`,date:d,space};
  let lost=0;for(const p of c.products){const demand=predictions[p.item][h],sold=Math.min(stock[p.item],demand),lack=demand-sold;stock[p.item]-=sold;missing+=lack;lost+=lack;cost.shortage+=lack*p.shortage;cost.holding+=stock[p.item]*p.holding}
  daily.push({date:d,spaceBeforeSales:space,stock:{...stock},missing:lost});
 }
 return {feasible:true,cost,total:sum(Object.values(cost)),missing,stock,daily,orders:canonical};
}
export function planPurchases(predictions,c,date,{baseline=false,review=true}={}){
 validateConfig(c,Object.keys(predictions),date);
 if(Object.values(predictions).some(a=>a.length!==14||a.some(v=>!Number.isFinite(v)||v<0)))throw Error('คำทำนายต้องครบ 14 วันทุกสินค้า');
 let best=evaluatePlan(predictions,c,date),orders=[],warnings=[];
 if(!best.feasible)return {...best,orders:[],warnings:['คำสั่งซื้อที่ยืนยันแล้วชนความจุ ต้องปรับเงื่อนไขก่อนวางแผน']};
 for(const p of c.products){if(!c.suppliers.some(s=>s.offers.some(o=>o.item===p.item&&o.minimum*p.space<=c.capacity)))warnings.push(`${p.item}: ขั้นต่ำของทุกแหล่งซื้อเกินความจุ ไม่สามารถจัดซื้อภายใต้เงื่อนไขนี้`)}
 if(baseline&&!review)return {...best,orders,warnings};
 const maxRounds=baseline?1:3;
 for(let round=0;round<maxRounds;round++){
  let winner=null;
  for(const supplier of c.suppliers){
   const delays=baseline?[0]:[0,1,2,3,4,5,6];
   for(const delay of delays){if(delay+supplier.lead>14)continue;
    for(const cover of baseline?[7]:[3,7,14-supplier.lead-delay]){
     const lines=[];let remaining=c.capacity-sum(c.products.map(p=>(p.stock+sum(c.inbound.filter(r=>r.item===p.item).map(r=>r.units))+sum(orders.flatMap(o=>o.lines.filter(l=>l.item===p.item).map(l=>l.units))))*p.space));
     for(const offer of supplier.offers){
      const p=c.products.find(p=>p.item===offer.item),a=predictions[p.item];
      const required=sum(a.slice(0,Math.min(14,delay+supplier.lead+cover)));
      const committed=sum(c.inbound.filter(r=>r.item===p.item&&r.receipt<=day(date,delay+supplier.lead+cover)).map(r=>r.units))+sum(orders.flatMap(o=>o.lines.filter(l=>l.item===p.item).map(l=>l.units)));
      let need=Math.max(0,Math.ceil(required-p.stock-committed-1e-10));if(need>0)need=Math.max(need,offer.minimum);
      need=Math.min(need,Math.floor((remaining+1e-8)/p.space));
      if(need>=offer.minimum){lines.push({item:p.item,units:need});remaining-=need*p.space;}
     }
     const variants=baseline?[lines]:[lines,...lines.map(l=>[l])];
     for(const basket of variants){if(!basket.length)continue;
      const o={supplier:supplier.id,orderDate:day(date,delay),receipt:day(date,delay+supplier.lead),lines:basket};
      const result=evaluatePlan(predictions,c,date,[...orders,o]);
      if(result.feasible&&(!winner||result.total<winner.total-1e-8))winner=result;
     }
    }
   }
  }
  if(baseline){if(winner){orders=winner.orders;best=winner}break}
  if(!winner||winner.total>=best.total-1e-8)break;orders=winner.orders;best=winner;
 }
 if(best.missing>0&&!orders.length)warnings.push('ไม่มีแผนในตัวเลือกที่ลดต้นทุนได้และผ่านความจุ อาจต้องปรับขั้นต่ำ ความจุ หรือต้นทุนเสียโอกาส');
 return {...best,orders,warnings,method:baseline?'ทบทวนทุก 7 วัน · เลือกผู้จำหน่ายจากต้นทุนจำลอง':'ค้นหลายทางเลือกและปรับแผนแบบโลภ สูงสุด 3 รอบ · ไม่รับประกันคำตอบดีที่สุด'};
}
export function simulate(bundle,config,{model,start,days=28,scenario='ปกติ',baseline=false}){
 const idx=bundle.dates.indexOf(start);if(idx<28||idx+days>bundle.dates.length)throw Error('ช่วงจำลองต้องมีประวัติ 28 วันและยอดขายจริงครบ');
 const c=structuredClone(config);validateConfig(c,bundle.products.map(p=>p.item),day(start,-1));
 if(scenario==='พื้นที่จำกัด')c.capacity*=.4;if(scenario==='ค่าขนส่งสูง')c.suppliers.forEach(s=>s.shipping*=3);
 validateConfig(c,bundle.products.map(p=>p.item),day(start,-1));
 const stock=Object.fromEntries(c.products.map(p=>[p.item,p.stock])),incoming=structuredClone(c.inbound),cost={purchase:0,shipping:0,holding:0,shortage:0},log=[],orders=[];let demandTotal=0,missing=0,stockSum=0;
 // Decide after the latest observed day, then receive before sales the following day.
 for(let t=0;t<days;t++){
  const decisionDate=day(start,t-1),forecasts={};
  for(const p of bundle.products){const hist=p.sales.slice(0,idx+t);forecasts[p.item]=baseline?Array(14).fill(mean(hist.slice(-28))):forecast(model==='seasonal'?'seasonal':bundle.models[model],hist,day(start,t))}
  const current={...c,products:c.products.map(p=>({...p,stock:stock[p.item]})),inbound:incoming.filter(r=>r.receipt>decisionDate)};
  const plan=planPurchases(forecasts,current,decisionDate,{baseline,review:t%7===0});
  if(!plan.feasible)throw Error(plan.reason);
  for(const o of plan.orders.filter(o=>o.orderDate===decisionDate)){
   const s=c.suppliers.find(s=>s.id===o.supplier);cost.shipping+=s.shipping;
   for(const l of o.lines){cost.purchase+=l.units*s.offers.find(r=>r.item===l.item).price;incoming.push({...l,receipt:o.receipt})}
   orders.push(o);
  }
  const date=day(start,t);for(const r of incoming.filter(r=>r.receipt===date))stock[r.item]+=r.units;
  const space=sum(c.products.map(p=>stock[p.item]*p.space));if(space>c.capacity+1e-7)throw Error('สินค้ารับเข้าจริงเกินความจุ แม้แผนผ่านคำทำนาย กรุณาใช้ความจุเผื่อหรือปรับแผน');
  for(const p of bundle.products){const actual=p.sales[idx+t],sold=Math.min(stock[p.item],actual),lack=actual-sold;stock[p.item]-=sold;demandTotal+=actual;missing+=lack;const meta=c.products.find(r=>r.item===p.item);cost.shortage+=lack*meta.shortage;cost.holding+=stock[p.item]*meta.holding}
  const end=sum(Object.values(stock));stockSum+=end;log.push({date,stock:end,spaceBeforeSales:space});
 }
 return {model:baseline?'รอบคงที่ 7 วัน':model,scenario,start,days,cost,total:sum(Object.values(cost)),missing,missingPercent:demandTotal?100*missing/demandTotal:null,averageStock:stockSum/days,orderCount:orders.length,endStock:stock,inbound:incoming.filter(r=>r.receipt>day(start,days-1)),orders,log};
}
