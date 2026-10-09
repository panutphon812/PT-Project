const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const percent=value=>(value*100).toLocaleString('th-TH',{maximumFractionDigits:2})+'%';
const decimal=value=>value.toLocaleString('th-TH',{maximumFractionDigits:2});
const emptyMessage=report=>report.status==='insufficient'
  ? `มี ${report.total_bills} บิล ยังน้อยกว่าเกณฑ์ ${report.thresholds.min_bills} บิล จึงยังไม่แสดงกฎ`
  : 'ไม่มีคู่สินค้าที่ผ่านเกณฑ์ในช่วงนี้ ไม่ได้หมายความว่าสินค้าไม่มีความสัมพันธ์';

function evidence(report){
  return `<p class="hint">ข้อมูลวันเต็ม ${esc(report.start_date)} ถึง ${esc(report.end_date)} · ${report.total_bills} บิล · บิลที่มีหลายสินค้า ${report.multi_item_bills} บิล</p>
    <p class="check-note">รวมบิลจำลอง ${report.demo_bills} บิล ผลที่มีข้อมูลจำลองยังใช้ยืนยันพฤติกรรมของร้านจริงไม่ได้ สินค้าซ้ำหรือซื้อหลายชิ้นในบิลเดียวจะนับเพียงหนึ่งครั้งต่อ SKU</p>`;
}

export async function renderBaskets(api){
  const content=document.querySelector('#content');
  content.innerHTML=`<div class="hero"><div><h2>ลูกค้าซื้ออะไรด้วยกันบ้าง?</h2><p>ช่วยเตือนให้ตรวจสินค้าที่เกี่ยวข้องเวลาจัดรายการเติม ไม่เพิ่มจำนวนซื้อให้อัตโนมัติ</p></div></div>
  <div class="panel"><p>เลือกช่วงเวลาแล้วกดดูผล ระบบตั้งเกณฑ์ให้แล้ว ไม่ต้องรู้สูตรหรือกรอกตัวเลขทางสถิติ</p>
  <form id="basket-filters"><div class="basket-simple-controls">
  <label>ดูบิลย้อนหลัง<select name="days"><option value="7">7 วัน</option><option value="14">14 วัน</option><option value="28" selected>28 วัน</option><option value="90">90 วัน</option></select></label>
  <label>ดูข้อมูลแบบไหน<select name="mode"><option value="recommend">คู่ที่มีหลักฐานพอให้ตรวจสต็อก</option><option value="explore">สำรวจคู่เบื้องต้น (ยังไม่ใช้ตัดสินใจซื้อ)</option></select></label><button>ดูสินค้าที่ซื้อด้วยกัน</button></div>
  <details><summary>ตั้งค่าขั้นสูง · สำหรับผู้ดูแลหรือผู้ประเมิน</summary><p class="hint">ไม่จำเป็นต้องปรับสำหรับการใช้งานทั่วไป เกณฑ์เริ่มต้นยังต้องประเมินกับร้านจริง</p><div class="basket-filters">
  ${[['min_bills','จำนวนบิลทั้งหมดขั้นต่ำ',20,1,1000000,1],['min_pair_count','จำนวนบิลซื้อร่วมขั้นต่ำ',3,1,1000000,1],['min_support','Support ขั้นต่ำ (%)',1,0,100,.1],['min_confidence','Confidence ขั้นต่ำ (%)',20,0,100,.1],['min_lift','Lift ขั้นต่ำ',1.01,1,1000000,.01]].map(([key,label,value,min,max,step])=>`<label>${label}<input name="${key}" type="number" value="${value}" min="${min}" max="${max}" step="${step}" required></label>`).join('')}</div></details></form>
  <div id="basket-results" aria-live="polite"></div></div>
  <div class="panel basket-explanation"><h2>ใช้หน้านี้ทำอะไร?</h2><p>เมื่อพบคู่สินค้า ให้ตรวจว่าตัวที่ซื้อร่วมยังมีของพอหรือไม่ แล้วเปิดหน้าแนะนำเติมสินค้าเพื่อดูจำนวนซื้อจากยอดขายและสต็อก อย่าใช้คู่ซื้อร่วมเป็นเหตุผลเพิ่มจำนวนซื้อทันที</p>
  <details><summary>วิธีคำนวณและงานวิจัยอ้างอิง</summary><p>Support = บิลที่มีทั้งคู่ ÷ บิลทั้งหมด · Confidence = บิลที่มีทั้งคู่ ÷ บิลที่มีสินค้าตัวแรก · Lift = Confidence ÷ สัดส่วนบิลที่มีสินค้าตัวที่สอง</p><p>ใช้ Association Rules แบบนับคู่โดยตรง 1 → 1 ไม่ใช่ Apriori เต็มรูปแบบ ความสัมพันธ์ไม่ยืนยันเหตุเป็นผลและไม่ทำนายการซื้อครั้งถัดไป</p><p><a href="https://sigmodrecord.org/1993/06/03/mining-association-rules-between-sets-of-items-in-large-databases/" target="_blank" rel="noopener">Agrawal, Imieliński &amp; Swami (1993)</a> · <a href="https://www.vldb.org/conf/1994/P487.PDF" target="_blank" rel="noopener">Agrawal &amp; Srikant (1994)</a></p></details></div>`;
  const form=content.querySelector('form'),area=content.querySelector('#basket-results');let report,offset=0,explore=false;
  form.elements.mode.onchange=()=>{const preset=form.elements.mode.value==='explore'?[1,1,0,0,1]:[20,3,1,20,1.01];['min_bills','min_pair_count','min_support','min_confidence','min_lift'].forEach((key,i)=>form.elements[key].value=preset[i]);};
  function draw(){
    if(!area.isConnected)return;
    area.innerHTML=(explore?'<div class="check-note"><strong>ข้อมูลเบื้องต้น ยังไม่ใช่คำแนะนำซื้อ</strong><br>แสดงคู่ที่ผ่านเงื่อนไขสำรวจ แม้พบเพียงครั้งเดียว ค่าสูงจากบิลน้อยยังสรุปไม่ได้ และไม่เปลี่ยนคำแนะนำเติมสินค้า</div>':'')+evidence(report)+
    (report.rules.length?`<h2>พบ ${report.rules.length} รายการให้ตรวจดู</h2><div class="table-wrap"><table><thead><tr><th>เมื่อซื้อสินค้านี้</th><th>ซื้ออะไรด้วย</th><th>พบร่วมกันแค่ไหน</th><th>นำไปใช้อย่างไร</th></tr></thead><tbody>${report.rules.slice(offset,offset+25).map(r=>`<tr><td>${esc(r.antecedent.name)}<span class="sub">${esc(r.antecedent.sku)}</span></td><td>${esc(r.consequent.name)}<span class="sub">เหลือ ${r.consequent.stock} ${esc(r.consequent.unit)}</span></td><td>พบร่วม ${r.pair_count} บิล จาก ${r.from_count} บิลที่ซื้อสินค้าตัวแรก<span class="sub">คิดเป็น ${percent(r.confidence)}</span><details><summary>ดูตัวเลขประกอบ</summary><p>Support ${percent(r.support)} · Confidence ${percent(r.confidence)} · Lift ${decimal(r.lift)}</p></details></td><td>${explore?'ใช้ดูข้อมูลก่อน ยังไม่ใช้ตัดสินใจซื้อ':'ถ้าจะเติมตัวแรก ให้ตรวจสต็อกตัวนี้ด้วย'}<span class="sub">ไม่เพิ่มจำนวนซื้ออัตโนมัติ</span></td></tr>`).join('')}</tbody></table></div><div class="pagination"><span>${offset+1}–${Math.min(offset+25,report.rules.length)} / ${report.rules.length} รายการ · สลับทิศสินค้าได้เป็นคนละรายการ</span><div class="two-actions"><button id="basket-prev" class="secondary" ${offset===0?'disabled':''}>ก่อนหน้า</button><button id="basket-next" class="secondary" ${offset+25>=report.rules.length?'disabled':''}>ถัดไป</button></div></div>`:
    `<div class="empty-cart"><strong>${explore?'ยังไม่มีคู่ที่แสดงได้ในช่วงนี้':'ยังไม่มีคู่ที่มีหลักฐานพอให้แนะนำ'}</strong><p>มีบิลหลายสินค้า ${report.multi_item_bills} บิล จากทั้งหมด ${report.total_bills} บิล<br>พบคู่สินค้า ${report.observed_pairs} คู่ แต่ยังไม่ผ่านเกณฑ์ทั้งหมด ระบบจึงไม่เดาคำแนะนำให้<br>${explore?'เก็บบิลที่ขายหลายสินค้าจริงเพิ่มเติม':'ลองเลือก “สำรวจคู่เบื้องต้น” เพื่อดูคู่ที่พบ หรือสะสมบิลหลายสินค้าจริงเพิ่มเติม'}</p></div>`);
    if(report.rules.length){area.querySelector('#basket-prev').onclick=()=>{offset-=25;draw();};area.querySelector('#basket-next').onclick=()=>{offset+=25;draw();};}
  }
  async function load(){const button=form.querySelector('button');button.disabled=true;button.textContent='กำลังอ่านบิล…';
    const params=new URLSearchParams(new FormData(form));explore=params.get('mode')==='explore';params.delete('mode');
    for(const key of ['min_support','min_confidence'])params.set(key,Number(params.get(key))/100);
    try{report=await api('baskets?'+params);offset=0;draw();}catch(error){if(area.isConnected)area.textContent='อ่านข้อมูลไม่ได้: '+error.message;}finally{button.disabled=false;button.textContent='ดูสินค้าที่ซื้อด้วยกัน';}}
  form.onsubmit=e=>{e.preventDefault();load();};await load();
}

export async function renderBasketChecks(api,rows,days,navigate){
  const host=document.querySelector('#basket-checks');
  if(!host)return;
  try{
    const report=await api('baskets?days='+days);
    if(!host.isConnected)return;
    const byId=new Map(rows.map(p=>[p.id,p]));
    const matches=report.rules.filter(r=>byId.get(r.from)?.suggested_qty>0);
    host.innerHTML=`<h2>ตรวจสินค้าที่ซื้อร่วม ก่อนจัดรายการเติม</h2>${evidence(report)}
      <p class="hint">ใช้เกณฑ์เริ่มต้น: อย่างน้อย ${report.thresholds.min_bills} บิล · ซื้อร่วม ${report.thresholds.min_pair_count} บิล · Support ${percent(report.thresholds.min_support)} · Confidence ${percent(report.thresholds.min_confidence)} · Lift ${decimal(report.thresholds.min_lift)} ขึ้นไป</p>`+
      (matches.length?`<p>พบ ${matches.length} กฎที่สินค้า A ควรเติม แสดง 10 กฎแรกตาม Lift</p><div class="table-wrap"><table><thead><tr><th>A ที่ควรเติม → ตรวจ B</th><th>หลักฐานซื้อร่วม</th><th>สถานะ B / จำนวนจากสูตรเดิม</th></tr></thead><tbody>${matches.slice(0,10).map(rule=>{const b=byId.get(rule.to);return `<tr><td>${esc(rule.antecedent.name)} → ${esc(b.name)}<span class="sub">${esc(rule.antecedent.sku)} → ${esc(b.sku)}</span></td><td>${rule.pair_count} บิล · Support ${percent(rule.support)}<span class="sub">Confidence ${percent(rule.confidence)} · Lift ${decimal(rule.lift)}</span></td><td>เหลือ ${b.stock} ${esc(b.unit)}<span class="sub">${b.status==='no-data'?'ตรวจสอบก่อน':b.suggested_qty>0?'ควรเติม '+b.suggested_qty+' '+esc(b.unit):'เพียงพอ · ไม่เพิ่มจำนวนซื้อ'}</span></td></tr>`;}).join('')}</tbody></table></div>`:`<p>${report.status==='ok'?'ยังไม่มีกฎผ่านเกณฑ์ที่เชื่อมกับสินค้าที่ควรเติมในช่วงนี้':emptyMessage(report)}</p>`)+
      `<p class="hint">เพียงชี้ให้ตรวจ B จากความสัมพันธ์ ไม่เพิ่มยอดขาย ไม่ปรับสต็อก และไม่เพิ่มจำนวนซื้อ ความสัมพันธ์ไม่ยืนยันเหตุเป็นผล</p><button id="open-basket" class="secondary">ดูการวิเคราะห์และสูตรทั้งหมด →</button>`;
    host.querySelector('#open-basket').onclick=()=>navigate('basket');
  }catch(error){if(host.isConnected)host.textContent='อ่านข้อมูลซื้อร่วมไม่ได้: '+error.message;}
}
