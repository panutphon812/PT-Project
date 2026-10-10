"""Select Linear Regression training windows using validation only; retain real targets."""
import json, hashlib
import numpy as np
import pandas as pd
from train_forecast import DATA, OUTPUT, ITEMS, features, fit, predict

source=DATA/'selected_5_foods.csv'
frame=pd.read_csv(source,encoding='utf-8-sig');frame.columns=['date','item_id','sales'];frame.date=pd.to_datetime(frame.date)
windows=[None,730,365,180,90]
results=[];candidates=[];models={}
for item in ITEMS:
 s=frame[frame.item_id==item].set_index('date').sales.sort_index();x=features(s);valid=x.notna().all(axis=1)
 # Original 56-day validation; no test targets participate in selection.
 train=valid&(x.index<='2016-02-28');val=(x.index>'2016-02-28')&(x.index<='2016-04-24')
 scores=[]
 for window in windows:
  days=x.index[train];days=days if window is None else days[-window:]
  m=fit(x.loc[days].to_numpy(float),s.loc[days].to_numpy(float));p=predict(m,x.loc[val].to_numpy(float));mae=float(np.abs(p-s.loc[val].to_numpy()).mean())
  scores.append((mae,window));candidates.append({'item':item,'window':window,'validation_mae':mae})
 chosen=min(scores,key=lambda v:v[0])[1]
 days=x.index[valid&(x.index<='2016-04-24')];days=days if chosen is None else days[-chosen:]
 m=fit(x.loc[days].to_numpy(float),s.loc[days].to_numpy(float));models[item]=(m,chosen)
 test=(x.index>'2016-04-24');actual=s.loc[test].to_numpy();p=predict(m,x.loc[test].to_numpy(float))
 original=fit(x.loc[valid&(x.index<='2016-04-24')].to_numpy(float),s.loc[valid&(x.index<='2016-04-24')].to_numpy(float));old=predict(original,x.loc[test].to_numpy(float))
 results.append({'item':item,'selected_window':chosen,'validation_mae':min(scores,key=lambda v:v[0])[0],'old_mae':float(np.abs(old-actual).mean()),'new_mae':float(np.abs(p-actual).mean()),'old_wape':float(100*np.abs(old-actual).sum()/actual.sum()),'new_wape':float(100*np.abs(p-actual).sum()/actual.sum())})
report={'source_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'selection':'validation only 2016-02-29 to 2016-04-24','test':'previously reported test 2016-04-25 to 2016-05-22; not an unseen holdout','candidates':candidates,'results':results}
(OUTPUT/'window_experiment.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(results,indent=2))
# Reproducible artifacts: keep all rows, including products that get worse.
predictions=[];payload={}
for item,(m,window) in models.items():
 s=frame[frame.item_id==item].set_index('date').sales.sort_index();x=features(s);valid=x.notna().all(axis=1)
 assert s.index.is_unique and s.index.equals(pd.date_range(s.index.min(),s.index.max()))
 assert (s>=0).all() and np.isfinite(s).all()
 assert x.index[valid&(x.index<='2016-04-24')].max()<pd.Timestamp('2016-04-25')
 altered=s.copy();altered.loc['2016-04-25':]+=10000
 pd.testing.assert_frame_equal(features(altered).loc[:'2016-04-25'],x.loc[:'2016-04-25'])
 days=x.index[x.index>'2016-04-24'];new=predict(m,x.loc[days].to_numpy(float))
 old=fit(x.loc[valid&(x.index<='2016-04-24')].to_numpy(float),s.loc[valid&(x.index<='2016-04-24')].to_numpy(float));oldp=predict(old,x.loc[days].to_numpy(float))
 payload[item]={'center':m[0].tolist(),'scale':m[1].tolist(),'coefficients':m[2].tolist(),'trained_until':'2016-04-24','window':window,'features':list(x.columns)}
 for day,a,b in zip(days,oldp,new):predictions.append({'date':str(day.date()),'item':item,'actual':int(s.loc[day]),'old_prediction':float(a),'new_prediction':float(b)})
p=pd.DataFrame(predictions);assert len(p)==140
assert hashlib.sha256(source.read_bytes()).hexdigest()==report['source_sha256']
p.to_csv(OUTPUT/'improvement_predictions.csv',index=False,encoding='utf-8-sig',float_format='%.9f')
(OUTPUT/'improved_models.json').write_text(json.dumps(payload,indent=2),encoding='utf-8')
oldmae=float((p.old_prediction-p.actual).abs().mean());newmae=float((p.new_prediction-p.actual).abs().mean())
report['aggregate']={'old_mae':oldmae,'new_mae':newmae,'old_wape':float(100*(p.old_prediction-p.actual).abs().sum()/p.actual.sum()),'new_wape':float(100*(p.new_prediction-p.actual).abs().sum()/p.actual.sum()),'mae_reduction_percent':100*(oldmae-newmae)/oldmae}
(OUTPUT/'window_experiment.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
page='''<!doctype html><html lang="th"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ทดลองปรับ Linear Regression ด้วยข้อมูลจริง</title><style>body{font:14px/1.8 Tahoma,sans-serif;margin:0;background:#9585e9;color:#30313e}main{max-width:1100px;margin:24px auto;background:white;border-radius:14px;padding:28px}table{border-collapse:collapse;width:100%}td,th{padding:10px;border-bottom:1px solid #eeedf3;text-align:left}th{background:#f7f6fc}.scroll{overflow:auto}button,select{font:inherit;padding:10px;border:1px solid #ddd;border-radius:6px}button{background:#7054dc;color:white}a{color:#7054dc}.note{background:#f7f6fc;padding:18px;border-radius:8px}@media(max-width:600px){main{margin:0;padding:16px}table{min-width:600px}}</style><main><a href="/">← กลับเว็บหลัก</a><h1>ทดลองเพิ่มความแม่นยำด้วยข้อมูลจริง</h1><p class="note">ใช้ยอดขาย M5 จริงชุดเดิม ไม่แก้คำตอบ ไม่สร้างยอดขายใหม่ เปลี่ยนเฉพาะช่วงฝึก Linear Regression และเก็บผลสินค้าทุกตัว รวมตัวที่แย่ลง</p><h2>วิธีทดลอง</h2><p>ลองข้อมูลทั้งหมด / 730 / 365 / 180 / 90 วัน เลือกช่วงที่ MAE ต่ำสุดจาก 29 ก.พ.–24 เม.ย. 2016 เท่านั้น จากนั้นฝึกถึง 24 เม.ย. แล้วทดสอบ 25 เม.ย.–22 พ.ค. ทีละวันโดยใช้ยอดจริงถึงวันก่อนหน้า ไม่มีการเลือกใหม่จากคะแนนทดสอบ</p><p class="note">ช่วงทดสอบนี้เคยรายงานคะแนนแล้ว จึงเป็นการเปรียบเทียบกับชุดทดสอบเดิม ไม่ใช่หลักฐานจากชุดใหม่ที่ไม่เคยเห็น โมเดลในเว็บหลักยังเป็นรุ่นเดิม หน้านี้แสดงรุ่นทดลอง ยังไม่ได้เปลี่ยนส่วนจำลองของเสีย/ของขาด</p><h2>คะแนนที่คำนวณจากคำทำนายจริง 140 แถว</h2><p id="total"></p><div class="scroll"><table><thead><tr><th>สินค้า</th><th>ช่วงฝึก</th><th>MAE เดิม</th><th>MAE ทดลอง</th><th>WAPE เดิม</th><th>WAPE ทดลอง</th></tr></thead><tbody id="scores"></tbody></table></div><p>MAE และ WAPE ยิ่งต่ำยิ่งดี ไม่มีการแปลงเป็นเปอร์เซ็นต์ accuracy</p><button id="export">ดาวน์โหลดผลจริง 140 แถว CSV</button><h2>ตรวจผลรายวัน</h2><label for="item">สินค้า </label><select id="item"></select><div class="scroll"><table><thead><tr><th>วันที่</th><th>ยอดขายจริง</th><th>เดิมทำนาย</th><th>ทดลองทำนาย</th><th>ทดลองคลาดเคลื่อน</th></tr></thead><tbody id="daily"></tbody></table></div><details><summary>ช่วงฝึกทุกตัวที่ทดลองและคะแนนตรวจสอบ</summary><div class="scroll"><table><thead><tr><th>สินค้า</th><th>ช่วงฝึก</th><th>MAE ช่วงตรวจสอบ</th></tr></thead><tbody id="candidates"></tbody></table></div></details><p id="hash"></p></main><script>const data=__DATA__;const byId=id=>document.getElementById(id);function row(id,values){const tr=document.createElement('tr');values.forEach(v=>{const td=document.createElement('td');td.textContent=v;tr.append(td)});byId(id).append(tr)}function metric(rows,key){const error=rows.reduce((s,r)=>s+Math.abs(r[key]-r.actual),0),sales=rows.reduce((s,r)=>s+r.actual,0);return {mae:error/rows.length,wape:100*error/sales}}const old=metric(data.rows,'old_prediction'),updated=metric(data.rows,'new_prediction');byId('total').textContent=`MAE ${old.mae.toFixed(2)} → ${updated.mae.toFixed(2)} หน่วย · WAPE ${old.wape.toFixed(2)}% → ${updated.wape.toFixed(2)}% · ลด MAE ${((old.mae-updated.mae)/old.mae*100).toFixed(2)}%`;for(const r of data.report.results){const rows=data.rows.filter(d=>d.item===r.item),a=metric(rows,'old_prediction'),b=metric(rows,'new_prediction');row('scores',[r.item,r.selected_window??'ทั้งหมด',a.mae.toFixed(2),b.mae.toFixed(2),a.wape.toFixed(2)+'%',b.wape.toFixed(2)+'%']);const o=document.createElement('option');o.value=r.item;o.textContent=r.item;byId('item').append(o)}function daily(){byId('daily').replaceChildren();data.rows.filter(r=>r.item===byId('item').value).forEach(r=>row('daily',[r.date,r.actual,r.old_prediction.toFixed(3),r.new_prediction.toFixed(3),Math.abs(r.new_prediction-r.actual).toFixed(3)]))}byId('item').addEventListener('change',daily);daily();data.report.candidates.forEach(r=>row('candidates',[r.item,r.window??'ทั้งหมด',r.validation_mae.toFixed(6)]));byId('hash').textContent='SHA256 ข้อมูลต้นทาง: '+data.report.source_sha256;byId('export').addEventListener('click',()=>{const header=['date','item','actual','old_prediction','new_prediction'];const csv='\\uFEFF'+[header.join(','),...data.rows.map(r=>header.map(k=>r[k]).join(','))].join('\\r\\n');const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='improvement_predictions.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)});</script></html>'''
page=page.replace('__DATA__',json.dumps({'report':report,'rows':predictions},ensure_ascii=False,allow_nan=False))
(OUTPUT/'improvement_report.html').write_text(page,encoding='utf-8')
print(json.dumps(report['aggregate'],indent=2))
