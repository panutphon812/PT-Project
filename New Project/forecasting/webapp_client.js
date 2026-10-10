async function api(path,body){try{const r=await fetch(path,body===undefined?{}:{method:'POST',headers:{'X-Forecast-App':'1','Content-Type':'text/plain;charset=utf-8'},body});const value=await r.json();if(!r.ok)throw new Error(value.error);return value}catch(e){if(e instanceof TypeError)throw new Error('เชื่อมต่อไม่ได้ ตรวจว่าหน้าต่างเซิร์ฟเวอร์ยังเปิดอยู่ แล้วลองใหม่');throw e}}
const savedCard=document.createElement('section');savedCard.className='card saved-card';
savedCard.innerHTML='<div class="card-head"><h2>ประวัติคำแนะนำซื้อ</h2><span class="small-label" id="saved-count"></span></div><p class="note">บันทึกคำแนะนำที่คำนวณแล้ว เพื่อกลับมาเปิดดูภายหลัง</p><button id="save-purchase" disabled>บันทึกคำแนะนำซื้อนี้</button><p id="save-status" role="status" aria-live="polite"></p><div id="saved-list"></div>';
document.querySelector('[data-view="purchase"]').append(savedCard);
const saveButton=byId('save-purchase'),savedStatus=byId('save-status'),savedList=byId('saved-list');
let busy=false,datasetId='m5',savedFingerprint='',pendingFingerprint='',requestId='';
const controls=['forecast','export','export-test','item','date','buy','export-buy','stock','pack'];
function fingerprint(){return latestPurchase?JSON.stringify(latestPurchase):''}
function syncSave(){saveButton.disabled=busy||!latestPurchase||fingerprint()===savedFingerprint;saveButton.textContent=latestPurchase&&fingerprint()===savedFingerprint?'บันทึกคำแนะนำนี้แล้ว':'บันทึกคำแนะนำซื้อนี้';byId('buy').disabled=busy||!latestResult}
function setBusy(value){busy=value;controls.forEach(id=>byId(id).disabled=value);byId('export').disabled=value||!latestResult;byId('export-buy').disabled=value||!latestPurchase;syncSave()}
function showSaved(rows){
 savedList.replaceChildren();byId('saved-count').textContent=rows.length+' รายการ';
 if(!rows.length){const p=document.createElement('p');p.className='saved-empty';p.textContent='ยังไม่มีประวัติ เริ่มจากทำนายยอดขายและคำนวณจำนวนซื้อ';savedList.append(p);return}
 const wrap=document.createElement('div');wrap.className='saved-table-wrap';const table=document.createElement('table');table.className='saved-table';table.innerHTML='<thead><tr><th>วันเป้าหมาย / สินค้า</th><th>จำนวนซื้อ</th><th>บันทึกเมื่อ</th></tr></thead>';const tbody=document.createElement('tbody');
 for(const r of rows.slice(0,20)){const tr=document.createElement('tr');const a=document.createElement('td'),b=document.createElement('td'),c=document.createElement('td');const code=document.createElement('strong');code.textContent=r.item;const detail=document.createElement('small');detail.textContent=r.date+' · '+(r.datasetName||'รายการเดิม');a.append(code,detail);const units=document.createElement('strong');units.textContent=r.units.toLocaleString('th-TH')+' หน่วย';const pack=document.createElement('small');pack.textContent=r.packs+' แพ็ก × '+r.pack+' · ของเหลือ '+r.stock;b.append(units,pack);c.textContent=new Date(r.savedAt).toLocaleString('th-TH');tr.append(a,b,c);tbody.append(tr)}table.append(tbody);wrap.append(table);savedList.append(wrap);
 if(rows.length>20){const p=document.createElement('p');p.className='note';p.textContent='แสดง 20 รายการล่าสุด';savedList.append(p)}
}
saveButton.addEventListener('click',async()=>{if(busy||!latestPurchase)return;const current=fingerprint();if(current===savedFingerprint)return;if(current!==pendingFingerprint){pendingFingerprint=current;requestId=crypto.randomUUID()}const payload={...latestPurchase,datasetId,requestId};setBusy(true);savedStatus.textContent='กำลังบันทึก…';try{await api('/api/purchases',JSON.stringify(payload));savedFingerprint=current;savedStatus.textContent='บันทึกคำแนะนำซื้อแล้ว';try{showSaved((await api('/api/workspace')).purchases)}catch{savedStatus.textContent='บันทึกแล้ว แต่โหลดประวัติไม่ได้ กรุณารีโหลดเพื่อดูรายการ'}}catch(e){savedStatus.textContent=e.message}finally{setBusy(false)}});
['item','date','stock','pack','forecast','buy'].forEach(id=>byId(id).addEventListener(id==='forecast'||id==='buy'?'click':id==='item'?'change':'input',()=>{savedStatus.textContent='';syncSave()}));
document.querySelectorAll('[data-page="import"], [data-view="import"]').forEach(el=>el.remove());
models=builtInModels;imported=false;populate();
byId('method-note').textContent=m5Note+' ระบบรอบนี้ใช้ข้อมูล M5 ที่เตรียมไว้ 5 สินค้า และ Linear Regression เท่านั้น';
setBusy(true);
api('/api/workspace').then(state=>showSaved(state.purchases)).catch(e=>{savedStatus.textContent='โหลดประวัติไม่ได้: '+e.message;datasetId='unavailable'}).finally(()=>setBusy(false));const experimentLink=document.createElement('a');experimentLink.href='/improvement_report.html';experimentLink.textContent='เปิดผลทดลองปรับช่วงฝึก Linear Regression ด้วยข้อมูลจริง →';experimentLink.style.display='block';experimentLink.style.marginTop='16px';byId('method-note').before(experimentLink);
const calendarLink=document.createElement('a');calendarLink.href='/calendar_report.html';calendarLink.textContent='เปิดผลทดลองปฏิทิน M5 และตรวจสอบ 3 ช่วงเวลา →';calendarLink.style.display='block';calendarLink.style.marginTop='16px';experimentLink.after(calendarLink);
const boostingLink=document.createElement('a');boostingLink.href='/boosting_report.html';boostingLink.textContent='เปิดผลเปรียบเทียบ Gradient Boosting กับ Linear →';boostingLink.style.display='block';boostingLink.style.marginTop='16px';calendarLink.after(boostingLink);
const priceLink=document.createElement('a');priceLink.href='/price_report.html';priceLink.textContent='เจาะ FOODS_1_085 และทดลองราคาจริง →';priceLink.style.display='block';priceLink.style.marginTop='16px';boostingLink.after(priceLink);

const rollingLink=document.createElement('a');rollingLink.href='/rolling_report.html';rollingLink.textContent='ทดสอบย้อนหลัง 12 ช่วง เทียบค่าเฉลี่ย 7 และ 28 วัน →';rollingLink.style.display='block';rollingLink.style.marginTop='16px';priceLink.after(rollingLink);

// Keep the main workflow separate from archived model experiments.
const archive=document.createElement('details');archive.className='experiment-archive';
const archiveTitle=document.createElement('summary');archiveTitle.textContent='รายงานการทดลองที่ผ่านมา';archive.append(archiveTitle);
const archiveNote=document.createElement('p');archiveNote.className='note';archiveNote.textContent='เก็บไว้เป็นหลักฐานการศึกษา ผลทดลองเหล่านี้ยังไม่ได้เปลี่ยนโมเดลหลักที่ใช้ทำนายบนเว็บ';archive.append(archiveNote);
byId('method-note').before(archive);
[experimentLink,calendarLink,boostingLink,priceLink,rollingLink].forEach(link=>archive.append(link));
const scopeNote=document.createElement('div');scopeNote.className='info-strip scope-note';scopeNote.textContent='โหมดต้นแบบ M5 · ยอดขายล่าสุด 22 พ.ค. 2016 · วางแผนซื้อสำหรับ 23 พ.ค. 2016 ไม่ใช่ยอดขายร้านของคุณในปัจจุบัน';
document.querySelector('[data-view="forecast"]').prepend(scopeNote);
const purchaseHelp=document.createElement('p');purchaseHelp.className='note';purchaseHelp.setAttribute('role','status');
const prepareButton=document.createElement('button');prepareButton.className='secondary';prepareButton.textContent='ไปทำนายวันถัดจากข้อมูลล่าสุด';
prepareButton.addEventListener('click',()=>{date.value=date.max;changed();syncSave();showPage('forecast');byId('forecast').focus()});
byId('purchase-context').after(purchaseHelp,prepareButton);
function syncPurchaseHelp(){
 const ready=!!latestResult&&latestResult.date===date.max;
 byId('buy').disabled=busy||!ready;
 purchaseHelp.textContent=ready?'พร้อมคำนวณ: กรอกสต็อกและขนาดแพ็ก แล้วกดแนะนำจำนวนซื้อ':`ต้องทำนายวันที่ ${date.max} ก่อน จึงจะคำนวณและบันทึกจำนวนซื้อได้`;
 prepareButton.hidden=ready;
}
const previousSyncSave=syncSave;
syncSave=function(){previousSyncSave();syncPurchaseHelp()};
syncPurchaseHelp();
const historyExport=document.createElement('button');historyExport.className='secondary';historyExport.textContent='ดาวน์โหลดประวัติคำแนะนำ CSV';historyExport.disabled=true;saveButton.after(historyExport);
let savedRows=[];
const previousShowSaved=showSaved;
showSaved=function(rows){savedRows=rows;previousShowSaved(rows);historyExport.disabled=!rows.length};
historyExport.addEventListener('click',()=>{if(!savedRows.length)return;downloadCSV([['บันทึกเมื่อ','วันเป้าหมาย','สินค้า','AI คาดยอดขาย','สต็อก','หน่วยต่อแพ็ก','จำนวนแพ็ก','จำนวนซื้อ'],...savedRows.map(r=>[r.savedAt,r.date,r.item,r.prediction,r.stock,r.pack,r.packs,r.units])],'purchase_history.csv')});
const formula=document.createElement('p');formula.className='purchase-formula';formula.textContent='จำนวนซื้อ = ปัดขึ้นเป็นแพ็ก จากจำนวนที่คาดว่าจะขาย − สต็อกคงเหลือ (ถ้ามีของพอ ซื้อเพิ่ม 0 หน่วย)';byId('buy-result').after(formula);
