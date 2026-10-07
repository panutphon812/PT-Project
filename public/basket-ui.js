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
  content.innerHTML=`<div class="hero"><div><h2>สินค้าอะไรที่มักซื้อในบิลเดียวกัน?</h2><p>สำรวจความสัมพันธ์เพื่อช่วยตรวจสต็อกสินค้าที่เกี่ยวข้อง</p></div></div>
    <div class="panel"><form id="basket-filters" class="basket-filters">
      <label>ช่วงย้อนหลัง<select name="days"><option value="7">7 วัน</option><option value="14">14 วัน</option><option value="28" selected>28 วัน</option><option value="90">90 วัน</option></select></label>
      <label>จำนวนบิลขั้นต่ำ<input name="min_bills" type="number" min="1" step="1" value="20" required></label>
      <label>บิลซื้อร่วมขั้นต่ำ<input name="min_pair_count" type="number" min="1" step="1" value="3" required></label>
      <label>Support ขั้นต่ำ (%)<input name="min_support" type="number" min="0" max="100" step="0.1" value="1" required></label>
      <label>Confidence ขั้นต่ำ (%)<input name="min_confidence" type="number" min="0" max="100" step="0.1" value="20" required></label>
      <label>Lift ขั้นต่ำ<input name="min_lift" type="number" min="1" step="0.01" value="1.01" required></label>
      <button>วิเคราะห์</button></form><div id="basket-results" role="status" aria-live="polite"></div></div>
    <div class="panel basket-explanation"><h2>อ่านตัวเลขอย่างไร</h2>
      <p><strong>A → B</strong> หมายถึงในบิลที่มี A พบ B ร่วมด้วย ไม่ได้หมายถึงซื้อ B ในครั้งถัดไป</p>
      <p><strong>Support:</strong> บิลที่มีทั้ง A และ B ÷ บิลทั้งหมดในช่วงข้อมูล</p>
      <p><strong>Confidence:</strong> บิลที่มีทั้ง A และ B ÷ บิลที่มี A (สลับทิศแล้วค่าอาจต่างกัน)</p>
      <p><strong>Lift:</strong> Confidence ÷ สัดส่วนบิลที่มี B ค่ามากกว่า 1 หมายถึงพบร่วมมากกว่าที่คาดหากเป็นอิสระ ค่าใกล้ 1 อาจเกิดจาก B ขายบ่อยอยู่แล้ว</p>
      <p>ใช้การนับคู่โดยตรงและสร้าง Association Rules ขนาด 1 → 1 ไม่ใช่ Apriori เต็มรูปแบบ ไม่ค้นชุด 3 สินค้าขึ้นไป เกณฑ์เริ่มต้นเป็นเกณฑ์สาธิต ปรับตามข้อมูลและแผนประเมินได้</p>
      <p>ความสัมพันธ์ไม่ยืนยันเหตุเป็นผล ไม่ทำนายลูกค้ารายบุคคล และไม่เพิ่มจำนวนซื้อจากความสัมพันธ์</p>
      <p class="hint">อ้างอิงแนวคิด Support/Confidence: <a href="https://sigmodrecord.org/1993/06/03/mining-association-rules-between-sets-of-items-in-large-databases/" target="_blank" rel="noopener">Agrawal, Imieliński &amp; Swami (1993)</a> · แนวทาง Apriori เพื่อเปรียบเทียบวิธี: <a href="https://www.vldb.org/conf/1994/P487.PDF" target="_blank" rel="noopener">Agrawal &amp; Srikant (1994)</a></p></div>`;
  const form=document.querySelector('#basket-filters');
  const area=document.querySelector('#basket-results');
  let report=null, offset=0;
  const draw=()=>{
    if(!area.isConnected)return;
    area.innerHTML=evidence(report)+`<p class="hint">ผ่านเกณฑ์ ${report.rules.length} กฎ (A → B และ B → A ตรวจแยกกัน) · คู่ที่พบก่อนคัด ${report.observed_pairs} คู่</p>`+
      (report.rules.length?`<div class="table-wrap"><table><thead><tr><th>เมื่อซื้อ A → พบ B</th><th>บิลซื้อร่วม</th><th>Support</th><th>Confidence</th><th>Lift</th></tr></thead><tbody>${report.rules.slice(offset,offset+25).map(r=>`<tr><td>${esc(r.antecedent.name)} → ${esc(r.consequent.name)}<span class="sub">${esc(r.antecedent.sku)} → ${esc(r.consequent.sku)}</span><span class="sub">บิลที่มี A ${r.from_count} · บิลที่มี B ${r.to_count}</span></td><td>${r.pair_count} / ${report.total_bills}</td><td>${percent(r.support)}</td><td>${percent(r.confidence)}</td><td>${decimal(r.lift)} เท่า</td></tr>`).join('')}</tbody></table></div><div class="pagination"><span>${offset+1}–${Math.min(offset+25,report.rules.length)} / ${report.rules.length} กฎ · เรียง Lift แล้วจำนวนบิล</span><div class="two-actions"><button id="basket-prev" class="secondary small" ${offset===0?'disabled':''}>ก่อนหน้า</button><button id="basket-next" class="secondary small" ${offset+25>=report.rules.length?'disabled':''}>ถัดไป</button></div></div>`:`<div class="empty-cart"><strong>${emptyMessage(report)}</strong><p>เก็บบิลจริงเพิ่มเติมหรือทบทวนเกณฑ์ โดยไม่สร้างข้อมูลเพื่อให้ผลดูดี</p></div>`);
    if(report.rules.length){document.querySelector('#basket-prev').onclick=()=>{offset-=25;draw();};document.querySelector('#basket-next').onclick=()=>{offset+=25;draw();};}
  };
  const load=async()=>{
    const button=form.querySelector('button');button.disabled=true;
    const params=new URLSearchParams(new FormData(form));
    for(const key of ['min_support','min_confidence'])params.set(key,Number(params.get(key))/100);
    try{report=await api('baskets?'+params);offset=0;draw();}
    catch(error){if(area.isConnected)area.textContent=error.message;}
    finally{button.disabled=false;}
  };
  form.onsubmit=e=>{e.preventDefault();load();};
  await load();
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
