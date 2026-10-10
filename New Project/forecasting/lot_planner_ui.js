pages.lots=['วางแผนล็อตและวันรับของ','ทดลองอายุสินค้าและเวลารอรับ ร่วมกับยอดขายที่คาดการณ์'];
const lotNav=document.createElement('button');lotNav.dataset.page='lots';lotNav.textContent='วันหมดอายุ / เวลารับของ';lotNav.addEventListener('click',()=>showPage('lots'));document.querySelector('.nav').append(lotNav);
const lotView=document.createElement('div');lotView.className='view';lotView.dataset.view='lots';lotView.hidden=true;
lotView.innerHTML=`<section class="card"><h2>วางแผนซื้อโดยดูแต่ละล็อต</h2><div class="info-strip">เงื่อนไขทดลองที่คุณกรอก ไม่ใช่วันหมดอายุหรือเวลาขนส่งจริงจาก M5 · วันที่เริ่มวางแผน 23 พ.ค. 2016</div><p class="note">กรอกของที่มีอยู่ตอนเริ่มวัน ใช้ล็อตที่หมดอายุก่อนก่อน สินค้าใช้ขายได้ถึงสิ้นวันหมดอายุ กดบันทึกข้อมูลล็อตเพื่อเปิดใช้ต่อหลังรีโหลด</p><div class="inputs"><div><label for="lot-item">สินค้า</label><select id="lot-item"></select></div><div><label for="lot-lead">เวลารอรับหลังสั่ง (วัน)</label><input id="lot-lead" type="number" min="0" max="30" step="1" value="2"></div><div><label for="lot-shelf">อายุขายของใหม่ รวมวันรับ (วัน)</label><input id="lot-shelf" type="number" min="1" max="30" step="1" value="3"></div><div><label for="lot-pack">หน่วยต่อแพ็ก</label><input id="lot-pack" type="number" min="1" max="1000000" step="1" value="1"></div></div><h3>สต็อกปัจจุบันแยกล็อต</h3><div id="lot-inputs"></div><button id="lot-add" class="secondary">เพิ่มล็อต</button><button id="lot-run">คำนวณแผนซื้อ</button><p id="lot-error" class="error" role="alert"></p></section><section id="lot-output" class="card" hidden aria-live="polite"><h2 id="lot-summary"></h2><p id="lot-dates"></p><div class="info-strip" id="lot-warning"></div><p id="lot-extra" class="note"></p><div class="saved-table-wrap"><table class="saved-table"><thead><tr><th>วันที่</th><th>คาดขาย</th><th>ใช้ของเดิม/ของที่รับแล้ว</th><th>ส่วนที่ของเดิมไม่พอ</th><th>หมดอายุ (รวมเหลือสิ้นวัน)</th></tr></thead><tbody id="lot-days"></tbody></table></div><button id="lot-export" class="secondary">ดาวน์โหลดแผน CSV</button></section><section class="card"><h2>วิธีคำนวณและข้อจำกัด</h2><p class="note">เริ่มจากโมเดล Linear Regression เดิม แล้วใช้คำทำนายแต่ละวันต่อเป็นข้อมูลวันถัดไป โดยไม่ใช้ยอดขายจริงในอนาคต การทำนายหลายวันนี้ยังไม่ได้รับการประเมินแบบเดียวกับคะแนนทำนายหนึ่งวัน</p><p class="note">จำลองการใช้ของเดิมตามยอดคาดการณ์ จากนั้นรวมส่วนที่ไม่พอในช่วงวันรับถึงวันหมดอายุของล็อตใหม่ และปัดขึ้นตามแพ็ก สั่งวันนี้ รับตอนเริ่มวันรับของ นับของที่กำลังส่งตามวันรับและวันหมดอายุ และวางแผนซื้อครั้งเดียวครอบคลุมอายุล็อตใหม่</p><p class="note">ส่วนต่างและของหมดอายุในตารางเป็นค่าคาดการณ์ จึงมีทศนิยมได้ จำนวนซื้อจริงเป็นจำนวนเต็ม ไม่ใช่ผลพิสูจน์ว่าลดของเสียได้ ระยะทางยังไม่ใช้คำนวณ: ให้กรอกเวลารอรับที่คาดไว้โดยตรง</p></section>`;
document.querySelector('.footnote').before(lotView);
for(const code of Object.keys(builtInModels)){const option=document.createElement('option');option.value=code;option.textContent=code;byId('lot-item').append(option)}
let lotResult=null,lotSequence=0;
function clearLotResult(){lotResult=null;byId('lot-output').hidden=true;byId('lot-error').textContent=''}
function addLot(qty='',expiry=''){
 if(byId('lot-inputs').children.length>=50){byId('lot-error').textContent='รองรับไม่เกิน 50 ล็อต';return}
 const id=++lotSequence,row=document.createElement('div');row.className='inputs lot-input-row';
 row.innerHTML=`<div><label for="lot-qty-${id}">จำนวนล็อต ${id} (หน่วย)</label><input id="lot-qty-${id}" class="lot-qty" type="number" min="0" max="1000000" step="1"></div><div><label for="lot-expiry-${id}">วันหมดอายุล็อต ${id}</label><input id="lot-expiry-${id}" class="lot-expiry" type="date"></div><div><button type="button" class="secondary">ลบล็อต ${id}</button></div>`;
 row.querySelector('.lot-qty').value=qty;row.querySelector('.lot-expiry').value=expiry;
 row.querySelector('button').addEventListener('click',()=>{row.remove();clearLotResult()});row.addEventListener('input',clearLotResult);byId('lot-inputs').append(row);clearLotResult();
}
byId('lot-add').addEventListener('click',()=>addLot());
['item','lead','shelf','pack'].forEach(k=>byId('lot-'+k).addEventListener(k==='item'?'change':'input',clearLotResult));
byId('lot-run').addEventListener('click',()=>{clearLotResult();try{
 const options=Object.fromEntries(['lead','shelf','pack'].map(k=>{const value=byId('lot-'+k).value;if(!value.trim())throw new Error('กรอกเงื่อนไขให้ครบ');return [k,Number(value)]}));
 const lots=Array.from(byId('lot-inputs').children).map(row=>{const q=row.querySelector('.lot-qty').value,e=row.querySelector('.lot-expiry').value;if(!q.trim()||!e)throw new Error('กรอกจำนวนและวันหมดอายุทุกล็อต หรือลบล็อตที่ไม่ใช้');return {qty:Number(q),expires:e}});
 const item=byId('lot-item').value,r=planLots(builtInModels[item],options,lots,infer,readInbound());lotResult={item,options,lots,...r};
 byId('lot-summary').textContent=`แนะนำซื้อ ${r.units} หน่วย (${r.packs} แพ็ก)`;
 byId('lot-dates').textContent=`${item} · สั่ง ${r.start} · รับ ${r.arrival} · ขายล็อตใหม่ได้ถึง ${r.expiry}`;
 byId('lot-warning').textContent=r.waitShortage>0?`ระหว่างรอรับ ของเดิมอาจไม่พอประมาณ ${r.waitShortage.toFixed(2)} หน่วย การสั่งครั้งนี้มาถึงไม่ทันแก้ส่วนนี้`:'ของเดิมคาดว่าเพียงพอระหว่างรอรับสินค้า';
 byId('lot-extra').textContent=`ต้องเติมช่วงอายุล็อตใหม่ประมาณ ${r.need.toFixed(2)} หน่วย · ส่วนเกินจากการปัดแพ็ก ${r.packExcess.toFixed(2)} หน่วยอาจขายไม่ทัน · ของเดิม/ของกำลังส่งที่คาดว่าหมดอายุในช่วงแผนประมาณ ${r.expired.toFixed(2)} หน่วย`;
 byId('lot-days').replaceChildren();for(const d of r.rows){const tr=document.createElement('tr');for(const v of [d.date,...['demand','existingUsed','missing','expired'].map(k=>d[k].toFixed(2))]){const td=document.createElement('td');td.textContent=v;tr.append(td)}byId('lot-days').append(tr)}byId('lot-output').hidden=false;
 }catch(e){byId('lot-error').textContent=e.message}});
byId('lot-export').addEventListener('click',()=>{if(!lotResult)return;const r=lotResult;downloadCSV([['สินค้า','วันสั่ง','วันรับ','วันหมดอายุล็อตใหม่','หน่วยต่อแพ็ก','จำนวนซื้อ','วันที่','คาดขาย','ใช้ของเดิม','ส่วนที่ของเดิมไม่พอ','หมดอายุก่อนขาย'],...r.rows.map(d=>[r.item,r.start,r.arrival,r.expiry,r.options.pack,r.units,d.date,d.demand,d.existingUsed,d.missing,d.expired])],'lot_plan.csv')});

const pendingPanel=document.createElement('section');pendingPanel.className='card';
pendingPanel.innerHTML='<h2>สินค้าที่สั่งแล้วและกำลังส่ง</h2><p class="note">กรอกเฉพาะคำสั่งซื้อที่มีอยู่แล้ว ระบบจะนับสินค้าเมื่อถึงวันรับ ไม่ใช่ของที่คำแนะนำครั้งนี้เสนอให้ซื้อ</p><div id="inbound-inputs"></div><button id="inbound-add" class="secondary">เพิ่มของกำลังส่ง</button><hr><button id="lot-save">บันทึกข้อมูลล็อตและเงื่อนไข</button><button id="lot-reload" class="secondary">โหลดข้อมูลที่บันทึกแล้ว</button><p id="lot-store-status" role="status" aria-live="polite"></p>';
byId('lot-run').before(pendingPanel);
let plannerSnapshot={revision:0,items:{}},plannerReady=false,pendingSequence=0,plannerDirty=false;
function readInbound(){return Array.from(byId('inbound-inputs').children).map(row=>{
 const qty=row.querySelector('.inbound-qty').value,arrives=row.querySelector('.inbound-arrives').value,expires=row.querySelector('.inbound-expires').value;
 if(!qty.trim()||!arrives||!expires)throw new Error('กรอกจำนวน วันรับ และวันหมดอายุของที่กำลังส่งให้ครบ');return {qty:Number(qty),arrives,expires};
})}
function addInbound(value={}){
 if(byId('inbound-inputs').children.length>=50)throw new Error('รองรับของกำลังส่ง 50 ล็อต');
 const id=++pendingSequence,row=document.createElement('div');row.className='inputs';
 row.innerHTML=`<div><label for="inbound-qty-${id}">จำนวนที่กำลังส่ง ${id}</label><input id="inbound-qty-${id}" class="inbound-qty" type="number" min="1" max="1000000" step="1"></div><div><label for="inbound-arrives-${id}">วันรับล็อตส่ง ${id}</label><input id="inbound-arrives-${id}" class="inbound-arrives" type="date" min="2016-05-23"></div><div><label for="inbound-expires-${id}">วันหมดอายุล็อตส่ง ${id}</label><input id="inbound-expires-${id}" class="inbound-expires" type="date"></div><button type="button" class="secondary">ลบของกำลังส่ง ${id}</button>`;
 for(const k of ['qty','arrives','expires'])row.querySelector('.inbound-'+k).value=value[k]??'';
 row.querySelector('button').addEventListener('click',()=>{row.remove();clearLotResult();plannerDirty=true});byId('inbound-inputs').append(row);clearLotResult();
}
function applyPlanner(){
 const saved=plannerSnapshot.items[byId('lot-item').value];byId('lot-inputs').replaceChildren();byId('inbound-inputs').replaceChildren();
 for(const k of ['lead','shelf','pack'])byId('lot-'+k).value=saved?.options[k]??({lead:2,shelf:3,pack:1}[k]);
 for(const l of saved?.lots||[])addLot(l.qty,l.expires);for(const l of saved?.inbound||[])addInbound(l);
 clearLotResult();plannerDirty=false;byId('lot-store-status').textContent=saved?'โหลดข้อมูลที่บันทึกไว้แล้ว · '+new Date(saved.savedAt).toLocaleString('th-TH'):'สินค้านี้ยังไม่มีข้อมูลล็อตที่บันทึกไว้ (ไม่มีล็อต = สต็อก 0)';
}
function storeBusy(value){['lot-save','lot-reload','lot-run','lot-item','lot-add','inbound-add'].forEach(id=>byId(id).disabled=value);lotView.querySelectorAll('input, #lot-inputs button, #inbound-inputs button').forEach(el=>el.disabled=value)}
async function loadPlanner(){storeBusy(true);try{plannerSnapshot=await api('/api/lot-plans');plannerReady=true;applyPlanner()}catch(e){byId('lot-store-status').textContent='โหลดข้อมูลไม่ได้: '+e.message}finally{storeBusy(false);byId('lot-save').disabled=!plannerReady}}
byId('inbound-add').addEventListener('click',()=>{try{addInbound();plannerDirty=true}catch(e){byId('lot-error').textContent=e.message}});
lotView.addEventListener('input',event=>{if(event.target.id==='lot-item')return;plannerDirty=true;clearLotResult();byId('lot-store-status').textContent='มีการเปลี่ยนแปลงที่ยังไม่ได้บันทึก'});
let plannerItem=byId('lot-item').value;
byId('lot-item').addEventListener('change',()=>{
 if(plannerDirty){byId('lot-item').value=plannerItem;byId('lot-store-status').textContent='บันทึกข้อมูลสินค้าปัจจุบันก่อนเปลี่ยนสินค้า หรือกดโหลดข้อมูลที่บันทึกแล้วเพื่อยกเลิกการแก้ไข';return}
 plannerItem=byId('lot-item').value;applyPlanner();
});
byId('lot-add').addEventListener('click',()=>{plannerDirty=true});
byId('lot-inputs').addEventListener('click',()=>{plannerDirty=true});
byId('lot-save').addEventListener('click',async()=>{if(!plannerReady)return;try{
 const options=Object.fromEntries(['lead','shelf','pack'].map(k=>{const value=byId('lot-'+k).value;if(!value.trim())throw new Error('กรอกเงื่อนไขให้ครบ');return [k,Number(value)]}));
 const lots=Array.from(byId('lot-inputs').children).map(row=>{const qty=row.querySelector('.lot-qty').value,expires=row.querySelector('.lot-expiry').value;if(!qty.trim()||!expires)throw new Error('กรอกทุกล็อตให้ครบ');return {qty:Number(qty),expires}});
 const item=byId('lot-item').value,inbound=readInbound();planLots(builtInModels[item],options,lots,infer,inbound);
 storeBusy(true);plannerSnapshot=await api('/api/lot-plans',JSON.stringify({item,options,lots,inbound,revision:plannerSnapshot.revision}));plannerDirty=false;byId('lot-store-status').textContent='บันทึกล็อตและของกำลังส่งแล้ว เปิดกลับมาใช้ต่อได้';
 }catch(e){byId('lot-store-status').textContent=e.message}finally{storeBusy(false)}});
byId('lot-reload').addEventListener('click',loadPlanner);
loadPlanner();
