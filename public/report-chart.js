const money=n=>(n/100).toLocaleString('th-TH',{maximumFractionDigits:2});
const shortDate=s=>new Date(s+'T00:00:00+07:00').toLocaleDateString('th-TH',{day:'numeric',month:'short',timeZone:'Asia/Bangkok'});

export async function renderSalesChart(host,api){
  host.innerHTML=`<div class="panel-heading"><div><h2>รายงานยอดขาย</h2><p class="hint">ยอดขายรายวัน · เฉพาะวันเต็ม</p></div><label>ช่วงข้อมูล<select id="trend-days"><option value="7">7 วัน</option><option value="14">14 วัน</option><option value="28" selected>28 วัน</option></select></label></div><div id="trend-body" aria-live="polite"></div>`;
  const select=host.querySelector('select'),body=host.querySelector('#trend-body');
  async function draw(){
    select.disabled=true;
    try{
      const report=await api('sales-trend?days='+select.value);
      if(!host.isConnected)return;
      const total=report.points.reduce((s,p)=>s+p.revenue_cents,0);
      const previousTotal=report.points.reduce((s,p)=>s+p.previous_revenue_cents,0);
      const max=Math.max(100,...report.points.flatMap(p=>[p.revenue_cents,p.previous_revenue_cents]));
      const x=i=>70+i/(report.points.length-1||1)*900,y=v=>235-v/max*190;
      const line=key=>report.points.map((p,i)=>`${x(i)},${y(p[key])}`).join(' ');
      body.innerHTML=`<div class="trend-summary"><strong>฿ ${money(total)}</strong><span>${report.start_date} ถึง ${report.end_date}</span></div>
        <div class="trend-legends"><span><i class="current-dot"></i>ช่วงที่เลือก</span><span><i class="previous-dot"></i>ช่วงก่อนหน้า (${report.previous_start_date} ถึง ${report.previous_end_date})</span></div>
        <div class="trend-canvas"><svg viewBox="0 0 1000 280" role="img" aria-label="กราฟยอดขายช่วงที่เลือกเทียบช่วงก่อนหน้าที่มีจำนวนวันเท่ากัน">
        ${[0,.25,.5,.75,1].map(f=>`<line x1="70" x2="970" y1="${y(f*max)}" y2="${y(f*max)}" stroke="#efedf4"/><text x="58" y="${y(f*max)+4}" text-anchor="end" class="axis-label">${money(f*max)}</text>`).join('')}
        <polygon points="70,235 ${line('revenue_cents')} 970,235" fill="#13ad9810"/>
        <polyline points="${line('previous_revenue_cents')}" fill="none" stroke="#ded9e9" stroke-width="2.5"/>
        <polyline class="trend-line" points="${line('revenue_cents')}" fill="none" stroke="#0faf97" stroke-width="3" stroke-linejoin="round"/>
        ${report.points.map((p,i)=>`<g class="trend-point" tabindex="0" role="button" aria-label="${shortDate(p.day)} ยอดขาย ${money(p.revenue_cents)} บาท ${p.bills} บิล"><circle cx="${x(i)}" cy="${y(p.revenue_cents)}" r="14" fill="transparent"/><circle class="point-dot" cx="${x(i)}" cy="${y(p.revenue_cents)}" r="4" fill="#0faf97"/>${i%Math.max(1,Math.floor(report.days/7))===0?`<text x="${x(i)}" y="263" text-anchor="middle" class="axis-label">${shortDate(p.day)}</text>`:''}</g>`).join('')}</svg><div class="trend-tooltip" role="status" hidden></div></div>
        <p class="hint">ช่วงก่อนหน้ารวม ฿ ${money(previousTotal)} · หน่วยแกนตั้ง: บาท · วันที่ไม่มีบิลแสดง 0 · ไม่รวมยอดขายวันนี้ที่ยังไม่ครบวัน</p>`;
      const tooltip=body.querySelector('.trend-tooltip');
      body.querySelectorAll('.trend-point').forEach((point,i)=>{
        const p=report.points[i];
        const show=()=>{tooltip.hidden=false;tooltip.textContent=`${shortDate(p.day)} · ฿ ${money(p.revenue_cents)} · ${p.bills} บิล | ${shortDate(p.previous_day)} · ฿ ${money(p.previous_revenue_cents)}`;};
        point.onmouseenter=show;point.onfocus=show;point.onclick=show;
        point.onmouseleave=()=>{tooltip.hidden=true;};point.onblur=()=>{tooltip.hidden=true;};
      });
    }catch(error){if(host.isConnected)body.textContent=error.message;}
    finally{select.disabled=false;}
  }
  select.onchange=draw;await draw();
}
