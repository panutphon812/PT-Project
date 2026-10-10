"""Real M5 lagged-price study and FOODS_1_085 error audit. Live models unchanged."""
import json,hashlib,html
import numpy as np
import pandas as pd
from train_forecast import DATA,OUTPUT,ITEMS,fit,predict
from calendar_experiment import calendar_features,FOLDS

def load_prices():
 parts=[]
 for chunk in pd.read_csv(DATA/'sell_prices.csv',chunksize=250000):
  selected=chunk[(chunk.store_id=='CA_1')&chunk.item_id.isin(ITEMS)]
  if len(selected):parts.append(selected)
 prices=pd.concat(parts);assert not prices.duplicated(['item_id','wm_yr_wk']).any()
 return prices

def design(s,cal,prices,m):
 base=calendar_features(s,cal,m['variant'])
 table=cal.reindex(s.index).merge(prices[['wm_yr_wk','sell_price']],on='wm_yr_wk',how='left',validate='many_to_one');table.index=s.index
 p=table.sell_price.astype(float);assert (p.dropna()>0).all()
 previous=p.shift(1);extended=base.copy();extended['price_previous_day']=previous
 extended['price_change_known_7']=previous/p.shift(8)-1
 extended['price_relative_known_28']=previous/previous.rolling(28).mean()-1
 return base,extended,p

def main():
 paths=[DATA/n for n in ['selected_5_foods.csv','calendar.csv','sell_prices.csv']];hashes={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in paths}
 raw=pd.read_csv(paths[0]);raw.columns=['date','item','sales'];raw.date=pd.to_datetime(raw.date)
 cal=pd.read_csv(paths[1],parse_dates=['date']).set_index('date',drop=False);prices=load_prices()
 lm=json.loads((OUTPUT/'calendar_models.json').read_text(encoding='utf-8'))
 scores=[];rows=[];foldrows=[];saved={};audits={}
 for item in ITEMS:
  s=raw[raw.item==item].set_index('date').sales.sort_index();m=lm[item];base,price,p=design(s,cal,prices[prices.item_id==item],m)
  valid=price.notna().all(axis=1)&base.notna().all(axis=1);cv={k:[] for k in ['linear','price','mean7']}
  for cutoff in FOLDS:
   cutoff=pd.Timestamp(cutoff);train=base.index[valid&(base.index<=cutoff)];train=train if m['window'] is None else train[-m['window']:]
   days=base.index[(base.index>cutoff)&(base.index<=cutoff+pd.Timedelta(days=28))];assert len(days)==28 and train.max()<days.min()
   forecasts={}
   for name,x in [('linear',base),('price',price)]:forecasts[name]=predict(fit(x.loc[train].to_numpy(float),s.loc[train].to_numpy(float)),x.loc[days].to_numpy(float))
   forecasts['mean7']=base.loc[days,'mean_7'].to_numpy(float)
   for name,estimate in forecasts.items():
    mae=float(np.abs(estimate-s.loc[days].to_numpy()).mean());cv[name].append(mae);foldrows.append({'item':item,'method':name,'cutoff':str(cutoff.date()),'mae':mae})
  cv={k:float(np.mean(v)) for k,v in cv.items()};selected=min(cv,key=lambda k:round(cv[k],8)) # deterministic tie: keep simpler existing method
  train=base.index[valid&(base.index<='2016-04-24')];train=train if m['window'] is None else train[-m['window']:]
  days=s.index[s.index>'2016-04-24'];assert valid.loc[days].all();truth=s.loc[days].to_numpy();preds={}
  for name,x in [('linear',base),('price',price)]:
   model=fit(x.loc[train].to_numpy(float),s.loc[train].to_numpy(float));preds[name]=predict(model,x.loc[days].to_numpy(float))
   if name=='price':saved[item]={**m,'features':list(x.columns),'center':model[0].tolist(),'scale':model[1].tolist(),'coefficients':model[2].tolist()}
  preds['mean7']=base.loc[days,'mean_7'].to_numpy(float)
  def metric(estimate):return {'mae':float(np.abs(estimate-truth).mean()),'wape':float(100*np.abs(estimate-truth).sum()/truth.sum())}
  scores.append({'item':item,'selected':selected,'cv':cv,'test':{k:metric(v) for k,v in preds.items()}})
  for i,day in enumerate(days):rows.append({'date':str(day.date()),'item':item,'actual':int(truth[i]),**{k:float(v[i]) for k,v in preds.items()},'selected_prediction':float(preds[selected][i]),'known_price':float(p.shift(1).loc[day])})
  part=pd.DataFrame([r for r in rows if r['item']==item]);part['linear_abs_error']=(part.linear-part.actual).abs()
  zero=part[part.actual==0];audits[item]={'total':int(truth.sum()),'zero_days':len(zero),'zero_day_error':float(zero.linear_abs_error.sum()),'total_error':float(part.linear_abs_error.sum()),'unique_prices_test':int(p.loc[days].nunique()),'min_price_test':float(p.loc[days].min()),'max_price_test':float(p.loc[days].max()),'largest_errors':part.nlargest(8,'linear_abs_error').to_dict('records')}
 pframe=pd.DataFrame(rows);assert len(pframe)==140
 report={'hashes':hashes,'results':scores,'audit':audits,'folds':foldrows,'price_assumption':'Only lagged weekly prices known through prior day. No current/future price or imputed sales.','test_status':'Previously reported 28-day test; not unseen holdout.'}
 report['aggregate']={k:{'mae':float((pframe[k]-pframe.actual).abs().mean()),'wape':float(100*(pframe[k]-pframe.actual).abs().sum()/pframe.actual.sum())} for k in ['linear','price','mean7','selected_prediction']}
 for path in paths:assert hashlib.sha256(path.read_bytes()).hexdigest()==hashes[path.name]
 pframe.to_csv(OUTPUT/'price_predictions.csv',index=False,encoding='utf-8-sig',float_format='%.9f')
 (OUTPUT/'price_models.json').write_text(json.dumps(saved,ensure_ascii=False,indent=2),encoding='utf-8');(OUTPUT/'price_experiment.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
 page='''<!doctype html><html lang="th"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ทดลองราคาจริง M5</title><style>body{font:14px/1.8 Tahoma,sans-serif;background:#9585e9;color:#30313e;margin:0}main{max-width:1100px;margin:24px auto;padding:28px;background:white;border-radius:14px}table{width:100%;border-collapse:collapse}td,th{padding:10px;text-align:left;border-bottom:1px solid #eeedf3}th,.note{background:#f7f6fc}.note{padding:18px;border-radius:8px}.scroll{overflow:auto}button,select{font:inherit;padding:10px;border-radius:6px;border:1px solid #ddd}button{background:#7054dc;color:white}a{color:#7054dc}@media(max-width:600px){main{margin:0;padding:16px}table{min-width:600px}}</style><main><a href="/">← กลับเว็บหลัก</a><h1>เจาะ FOODS_1_085 และทดลองราคาจริง</h1><p class="note">ใช้ยอดขายและราคา M5 จริง ไม่เติมยอดขาย ไม่เปลี่ยนวันขาย 0 เป็นค่าอื่น ไม่สมมุติว่าร้านขาดสินค้า ใช้ราคาถึงวันก่อนหน้าเท่านั้น แถวฝึกที่ราคาไม่ครบถูกเว้นเหมือนกันทั้งสองโมเดล ไม่เติมราคาและไม่ตัดแถวทดสอบ ราคามีระดับรายสัปดาห์ จึงไม่ยืนยันโปรโมชั่นรายวัน</p><p>เปรียบเทียบ Linear รุ่นปฏิทิน, Linear เพิ่มราคาย้อนหลัง, ค่าเฉลี่ย 7 วัน ใช้ช่วงฝึกเดิมและตรวจสอบ 3 รอบเดียวกัน เลือกวิธีจาก MAE ตรวจสอบก่อนทดสอบ 25 เม.ย.–22 พ.ค. 2016 ไม่เลือกจากผลทดสอบ ชุดทดสอบเดิมเคยเห็นคะแนนแล้ว ไม่ใช่ข้อมูลใหม่ที่ไม่เคยเห็น เว็บหลักยังเป็นรุ่นเดิม</p><h2>สิ่งที่พบใน FOODS_1_085</h2><p id="audit"></p><h2>ผลรวม 5 สินค้า คำนวณจากคำทำนายจริง</h2><div class="scroll"><table><thead><tr><th>วิธี</th><th>MAE</th><th>WAPE</th></tr></thead><tbody id="total"></tbody></table></div><h2>คะแนนทุกสินค้า</h2><div class="scroll"><table><thead><tr><th>สินค้า</th><th>Linear WAPE</th><th>เพิ่มราคา WAPE</th><th>เฉลี่ย 7 วัน WAPE</th><th>วิธีที่เลือกจาก CV</th></tr></thead><tbody id="scores"></tbody></table></div><h2>คะแนนตรวจสอบก่อนเลือกวิธี</h2><div class="scroll"><table><thead><tr><th>สินค้า</th><th>Linear MAE</th><th>เพิ่มราคา MAE</th><th>เฉลี่ย 7 วัน MAE</th></tr></thead><tbody id="cv"></tbody></table></div><p>ทุกค่าความคลาดเคลื่อนยิ่งต่ำยิ่งดี ไม่ใช่เปอร์เซ็นต์ accuracy และยังไม่พิสูจน์ผลกับร้านจริง</p><button id="export">ดาวน์โหลดผลจริงครบ 140 แถว</button><h2>ตรวจผลรายวัน</h2><label for="item">สินค้า </label><select id="item"></select><div class="scroll"><table><thead><tr><th>วันที่</th><th>ยอดจริง</th><th>Linear</th><th>เพิ่มราคา</th><th>เฉลี่ย 7 วัน</th><th>ราคาที่รู้ถึงวันก่อน</th></tr></thead><tbody id="daily"></tbody></table></div><details><summary>ตรวจ SHA256 ไฟล์ต้นทาง</summary><pre id="hash"></pre></details></main><script>const data=__DATA__;const byId=id=>document.getElementById(id);const labels={linear:'Linear รุ่นปฏิทิน',price:'Linear เพิ่มราคาจริง',mean7:'ค่าเฉลี่ย 7 วัน',selected_prediction:'เลือกวิธีจาก CV'};function row(id,values){const tr=document.createElement('tr');values.forEach(v=>{const td=document.createElement('td');td.textContent=v;tr.append(td)});byId(id).append(tr)}function metric(rows,key){const error=rows.reduce((s,r)=>s+Math.abs(r[key]-r.actual),0);return {mae:error/rows.length,wape:100*error/rows.reduce((s,r)=>s+r.actual,0)}}for(const k of Object.keys(labels)){const m=metric(data.rows,k);row('total',[labels[k],m.mae.toFixed(3),m.wape.toFixed(2)+'%'])}for(const r of data.report.results){const p=data.rows.filter(d=>d.item===r.item);row('scores',[r.item,...['linear','price','mean7'].map(k=>metric(p,k).wape.toFixed(2)+'%'),labels[r.selected]]);row('cv',[r.item,...['linear','price','mean7'].map(k=>r.cv[k].toFixed(3))]);const o=document.createElement('option');o.value=r.item;o.textContent=r.item;byId('item').append(o)}const a=data.report.audit.FOODS_1_085;byId('audit').textContent=`ยอดขายจริง ${a.total} หน่วยใน 28 วัน มีวันขาย 0 จำนวน ${a.zero_days} วัน วันเหล่านี้มีความคลาดเคลื่อนรวม ${a.zero_day_error.toFixed(2)} จากทั้งหมด ${a.total_error.toFixed(2)} หน่วย ราคาจริงช่วงทดสอบมี ${a.unique_prices_test} ราคา ตั้งแต่ ${a.min_price_test} ถึง ${a.max_price_test} ดอลลาร์ ไม่สามารถสรุปว่าศูนย์เกิดจากสินค้าขาดได้`;function daily(){byId('daily').replaceChildren();data.rows.filter(r=>r.item===byId('item').value).forEach(r=>row('daily',[r.date,r.actual,r.linear.toFixed(3),r.price.toFixed(3),r.mean7.toFixed(3),r.known_price]))}byId('item').addEventListener('change',daily);daily();byId('hash').textContent=JSON.stringify(data.report.hashes,null,2);byId('export').addEventListener('click',()=>{const keys=Object.keys(data.rows[0]);const csv='\\uFEFF'+[keys.join(','),...data.rows.map(r=>keys.map(k=>r[k]).join(','))].join('\\r\\n');const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='price_predictions.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)});</script></html>'''
 error_table='<h2>8 วันที่ Linear พลาดมากที่สุด: FOODS_1_085</h2><div class="scroll"><table><tr><th>วันที่</th><th>ยอดจริง</th><th>Linear</th><th>คลาดเคลื่อน</th></tr>'
 for r in audits[ITEMS[0]]['largest_errors']:error_table+='<tr><td>'+r['date']+'</td><td>'+str(r['actual'])+'</td><td>'+str(round(r['linear'],3))+'</td><td>'+str(round(r['linear_abs_error'],3))+'</td></tr>'
 page=page.replace('<h2>ผลรวม 5 สินค้า',error_table+'</table></div><h2>ผลรวม 5 สินค้า',1)
 (OUTPUT/'price_report.html').write_text(page.replace('__DATA__',json.dumps({'report':report,'rows':rows},ensure_ascii=False,allow_nan=False)),encoding='utf-8')
 print(json.dumps({'aggregate':report['aggregate'],'target':scores[0],'audit':{k:v for k,v in audits[ITEMS[0]].items() if k!='largest_errors'}},indent=2))
if __name__=='__main__':main()
