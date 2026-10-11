pages.purchaseAI=['AI วิเคราะห์แผนซื้อ','ทดลองโมเดลชั้นที่สอง · เงื่อนไขและต้นทุนสมมุติ'];
const purchaseNav=document.createElement('button');purchaseNav.dataset.page='purchaseAI';purchaseNav.textContent='AI วิเคราะห์แผนซื้อ';purchaseNav.onclick=()=>showPage('purchaseAI');document.querySelector('.nav').append(purchaseNav);
const purchaseView=document.createElement('div');purchaseView.className='view';purchaseView.dataset.view='purchaseAI';purchaseView.hidden=true;
purchaseView.innerHTML=`<section class="card"><h2>ลองให้ AI เลือกแผนซื้อ</h2><div class="info-strip">ต้นแบบทดลอง ไม่ใช่ข้อมูลต้นทุนร้านจริง · เริ่ม 23 พ.ค. 2016 · วางแผนครั้งเดียวใน 7 วัน</div><p class="note">ชั้นแรกทำนายยอดขาย 7 วัน ชั้นที่สองเป็น Decision Tree ที่ฝึกให้เลือกจำนวนแพ็ก วันสั่ง และการส่ง โดยเรียนรู้จากแผนที่ค้นหาต้นทุนต่ำสุดบนคำทำนาย</p><div class="inputs" id="pai-inputs"></div><button id="pai-run">วิเคราะห์แผนซื้อ</button><p id="pai-error" role="alert"></p></section><section class="card" id="pai-output" hidden aria-live="polite"><h2 id="pai-summary"></h2><p id="pai-forecast"></p><div class="saved-table-wrap"><table class="saved-table"><thead><tr><th>แผน</th><th>ซื้อ (หน่วย)</th><th>วันสั่ง / รับ</th><th>ขนส่ง</th><th>ต้นทุนคาดการณ์ (บาท)</th><th>ขาด (หน่วย)</th><th>หมดอายุ (หน่วย)</th><th>เหลือ (หน่วย)</th></tr></thead><tbody id="pai-rows"></tbody></table></div><p class="note">ตัวเลขตารางคำนวณจากคำทำนาย จึงมีทศนิยมได้ จำนวนซื้อเป็นแพ็กเต็ม ไม่ใช่ผลขายจริง และ AI อาจเลือกแผนแพงกว่าตัวค้นหาแผนได้</p><button class="secondary" id="pai-export">ดาวน์โหลดผล CSV</button></section><section class="card"><h2>ขอบเขตการทดลอง</h2><p class="note">ใช้ Linear Regression ชุดทดลองที่ฝึกถึง 31 ธ.ค. 2014 ร่วมกับประวัติถึง 22 พ.ค. 2016 เพื่อให้ตรงกับขั้นฝึก AI ชั้นที่สอง จึงอาจให้ยอดทำนายต่างจากหน้าทำนายหลัก อายุสินค้า ระยะทาง สต็อก และต้นทุนเป็นค่าจำลองทั้งหมด</p><p class="note">แพ็กละ 6 หน่วย · ของกำลังส่งรับวันที่ 25 พ.ค. หมดอายุสิ้นวันที่ 27 พ.ค. · ส่งปกติรอ 3 วัน ค่าเดินทาง 15 + 0.4 × กม. ส่งด่วนรอ 1 วัน ค่าเดินทาง 40 + 0.8 × กม. ระยะทางมีผลต่อค่าเดินทาง ไม่ได้เปลี่ยนเวลาส่ง</p><p class="note">ต้นทุนรวม = ราคาซื้อเต็ม + ค่าเดินทาง + ค่าขาด (2 เท่าราคาซื้อ/หน่วย) + ค่ากำจัด (10% ราคาซื้อ/หน่วย) ไม่หักมูลค่าสินค้าเหลือสิ้นวันที่ 7 ใช้ของหมดอายุก่อนก่อน ขายได้ถึงสิ้นวันหมดอายุ ไม่มีการวางเส้นทางหลายร้าน</p><p class="note">ทดสอบย้อนหลัง 180 สถานการณ์: ต้นทุนจำลอง AI ต่ำกว่าวิธีพื้นฐานประมาณ 6.1% แต่ของหมดอายุมากกว่า ผลนี้ไม่รับรองผลร้านจริง วันที่ทดลองนี้อยู่นอกช่วงทดสอบย้อนหลัง</p><a href="purchase_model_report.html" target="_blank" rel="noopener">ดูรายงานประเมินย้อนหลัง</a></section>`;
document.querySelector('.footnote').before(purchaseView);
const purchaseFields=[
 ['item','ต้องการวางแผนซื้อสินค้าอะไร?',Object.keys(builtInModels),'รหัสสินค้า 5 ตัวจากชุดข้อมูล M5 ยังไม่มีชื่อสินค้าจริง'],
 ['stock','ตอนเริ่ม มีของพอขายประมาณกี่วัน?',[0,.5,1,2],'ระบบคำนวณจำนวนของจากยอดขายเฉลี่ยที่ AI คาด เช่น คาดขายวันละ 8 หน่วย เลือก 2 วัน = มีของ 16 หน่วย เป็นระดับสต็อกทดลอง'],
 ['life','ของที่มีอยู่ ยังขายได้อีกกี่วัน?',[1,3,6],'นับรวมวันเริ่ม 23 พ.ค. เช่น เลือก 1 วัน = ขายได้ถึงสิ้นวันที่ 23 พ.ค. แล้วของที่เหลือจะหมดอายุ'],
 ['inbound','มีของที่สั่งไว้แล้ว รอรับกี่หน่วย?',[0,6,12],'เลือก 0 ถ้ายังไม่ได้สั่งไว้ ในการทดลอง ของชุดนี้รับ 25 พ.ค. และหมดอายุสิ้นวันที่ 27 พ.ค. ไม่ใช่ของที่ AI กำลังแนะนำให้ซื้อ'],
 ['distance','ร้านห่างจากแหล่งซื้อกี่กิโลเมตร?',[10,30,60],'ใช้ระยะทางเพื่อคำนวณค่าเดินทางสมมุติ ส่งปกติรอ 3 วัน ส่งด่วนรอ 1 วัน โดยเวลารอไม่เปลี่ยนตามระยะทาง'],
 ['shelf','ของที่จะซื้อใหม่ เก็บขายได้กี่วันหลังรับ?',[2,4,7],'นับรวมวันรับ เช่น รับ 26 พ.ค. เลือก 2 วัน = ขายได้ถึงสิ้นวันที่ 27 พ.ค.'],
 ['price','ซื้อของมาในราคาเท่าไหร่ต่อหน่วย?',[20,40],'ราคาทดลอง 20 หรือ 40 บาทต่อหน่วย ซื้อเป็นแพ็กละ 6 หน่วย เช่น 20 บาทต่อหน่วย = 120 บาทต่อแพ็ก ยังไม่รวมค่าเดินทาง']
];
let purchaseExperiment=null;
for(const [key,label,values,help] of purchaseFields){
 const box=document.createElement('div'),l=document.createElement('label'),s=document.createElement('select'),hint=document.createElement('p');
 l.htmlFor=s.id='pai-'+key;l.textContent=label;hint.id='pai-help-'+key;hint.className='note';hint.textContent=help;hint.style.margin='8px 0 16px';s.setAttribute('aria-describedby',hint.id);
 for(const v of values){const o=document.createElement('option');o.value=v;
 o.textContent=key==='stock'?({0:'ไม่มีของในร้าน',.5:'พอขายประมาณครึ่งวัน',1:'พอขายประมาณ 1 วัน',2:'พอขายประมาณ 2 วัน'}[v]):key==='inbound'?(v?v+' หน่วย ('+v/6+' แพ็ก)':'ไม่มีของที่รอรับ'):key==='distance'?v+' กิโลเมตร':key==='price'?v+' บาทต่อหน่วย':key==='life'?(v===1?'ขายได้วันนี้วันเดียว':v+' วัน รวมวันเริ่ม'):key==='shelf'?v+' วัน รวมวันรับ':v;
 s.append(o)}s.onchange=()=>{purchaseExperiment=null;byId('pai-output').hidden=true};box.append(l,s,hint);byId('pai-inputs').append(box)
}
byId('pai-run').onclick=()=>{byId('pai-error').textContent='';try{
 if(!sharedPurchaseForecast||sharedPurchaseForecast.item!==byId('pai-item').value)throw Error('กรุณาทำนายยอดขายในขั้นตอนที่ 1 ก่อน');
 const item=sharedPurchaseForecast.item,f=[...sharedPurchaseForecast.forecast];
 const n=k=>Number(byId('pai-'+k).value),price=n('price'),distance=n('distance');
 const c={stock_qty:Math.round(f.reduce((a,b)=>a+b,0)/7*n('stock')),stock_life:n('life'),inbound_qty:n('inbound'),distance_km:distance,shelf_days:n('shelf'),pack_units:6,unit_cost:price,shortage_penalty:2*price,disposal_cost:.1*price,normal_fee:15+.4*distance,express_fee:40+.8*distance};
 const rows=purchaseCompare(f,c),date=d=>shift('2016-05-23',d),a=rows[0].action;
 byId('pai-summary').textContent=a[0]?`AI แนะนำ ${a[0]} แพ็ก (${a[0]*6} หน่วย) · สั่ง ${date(a[1])} · รับ ${date(a[1]+(a[2]?1:3))}`:'AI แนะนำไม่ซื้อเพิ่มในแผนนี้';
 byId('pai-forecast').textContent=`${item} · สต็อกเริ่ม ${c.stock_qty} หน่วย · คาดขาย 23–29 พ.ค.: ${f.map(x=>x.toFixed(2)).join(' / ')} หน่วยตามลำดับวัน`;
 byId('pai-rows').replaceChildren();for(const r of rows){const tr=document.createElement('tr');for(const v of [r.name,r.ordered,r.ordered?date(r.action[1])+' / '+date(r.action[1]+(r.action[2]?1:3)):'—',r.ordered?(r.action[2]?'ด่วน':'ปกติ'):'—',...['cost','shortage','waste','remaining'].map(k=>r[k].toFixed(2))]){const td=document.createElement('td');td.textContent=v;tr.append(td)}byId('pai-rows').append(tr)}
 purchaseExperiment={item,f,c,rows};byId('pai-output').hidden=false;
 }catch(e){byId('pai-output').hidden=true;byId('pai-error').textContent=e.message}};
byId('pai-export').onclick=()=>{if(!purchaseExperiment)return;const {item,rows}=purchaseExperiment;downloadCSV([['สินค้า','แผน','แพ็ก','รอวันสั่ง','ส่งด่วน','ต้นทุนสมมุติ','ขาดคาดการณ์','หมดอายุคาดการณ์','เหลือคาดการณ์'],...rows.map(r=>[item,r.name,...r.action,r.cost,r.shortage,r.waste,r.remaining])],'purchase_ai_experiment.csv')};
