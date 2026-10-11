function purchaseForecast(item,start='2016-05-23'){
 const model={...builtInModels[item],...purchaseBundle.first[item]};
 if(!purchaseBundle.first[item])throw Error('ไม่พบโมเดลสินค้า');
 const history=Object.fromEntries(Object.entries(model.history).filter(([d])=>d<start)),f=[];
 for(let i=0;i<7;i++){const day=shift(start,i),sales=infer(model,history,day);if(!Number.isFinite(sales))throw Error('คำนวณยอดขายไม่ได้');f.push(sales);history[day]=sales}
 return {item,start,forecast:f,modelCutoff:'2014-12-31'};
}
function purchaseEvaluate(demand,c,a){
 const qty=a[0]*6,arrival=a[1]+(a[2]?1:3),expiry=arrival+c.shelf_days-1;
 const lots=[{q:c.stock_qty,e:c.stock_life-1},{q:0,e:4},{q:0,e:expiry}];
 let shortage=0,waste=0;
 demand.forEach((d,day)=>{if(day===2)lots[1].q+=c.inbound_qty;if(day===arrival)lots[2].q+=qty;
 let left=d;for(const l of [...lots].sort((x,y)=>x.e-y.e)){const used=Math.min(left,l.q);l.q-=used;left-=used}shortage+=left;
 for(const l of lots)if(l.e<=day){waste+=l.q;l.q=0}});
 const fee=qty?(a[2]?c.express_fee:c.normal_fee):0;
 return {cost:qty*c.unit_cost+fee+shortage*c.shortage_penalty+waste*c.disposal_cost,shortage,waste,remaining:lots.reduce((s,l)=>s+l.q,0),ordered:qty,fee};
}
function purchasePredict(f,c){
 const x=[...f,...purchaseBundle.names.slice(7).map(k=>c[k])],t=purchaseBundle.tree;let n=0;
 while(t.left[n]!==-1)n=Math.fround(x[t.feature[n]])<=t.threshold[n]?t.left[n]:t.right[n];
 const v=t.value[n],q=Math.min(Math.ceil(f.reduce((a,b)=>a+b,0)/6),Math.max(0,Math.floor(v[0]+.5)));
 return q?[q,Math.min(2,Math.max(0,Math.floor(v[1]+.5))),Number(v[2]>=.5)]:[0,0,0];
}
function purchaseCompare(f,c){
 const sum=x=>x.reduce((a,b)=>a+b,0),usable=c.stock_life>3?Math.max(0,c.stock_qty-sum(f.slice(0,3))):0;
 const baseline=[Math.ceil(Math.max(0,sum(f.slice(3,3+Math.min(c.shelf_days,4)))-usable-c.inbound_qty)/6),0,0];
 let teacher=[0,0,0],best=purchaseEvaluate(f,c,teacher).cost;
 for(let q=1;q<=Math.ceil(sum(f)/6);q++)for(let d=0;d<3;d++)for(let m=0;m<2;m++){const a=[q,d,m],cost=purchaseEvaluate(f,c,a).cost;if(cost<best){best=cost;teacher=a}}
 return [['AI ชั้นที่สอง',purchasePredict(f,c)],['วิธีพื้นฐาน',baseline],['ค้นหาแผนต้นทุนต่ำสุด',teacher]].map(([name,action])=>({name,action,...purchaseEvaluate(f,c,action)}));
}
