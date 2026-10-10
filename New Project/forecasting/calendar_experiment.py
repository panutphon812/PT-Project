"""Real M5 calendar experiment: frozen one-step forecasts, chronological CV."""
import hashlib,json,html
import numpy as np
import pandas as pd
from train_forecast import DATA,OUTPUT,ITEMS,features,fit,predict
KINDS=['Cultural','National','Religious','Sporting']
FOLDS=['2016-01-31','2016-02-28','2016-03-27']
WINDOWS=[None,730,365]
def calendar_features(series,calendar,variant):
 x=features(series)
 if variant!='base':
  c=calendar.reindex(series.index);assert c.date.notna().all()
  for kind in KINDS:x['event_'+kind]=((c.event_type_1==kind)|(c.event_type_2==kind)).astype(float)
  event=((calendar.event_type_1.notna())|(calendar.event_type_2.notna())).astype(float)
  x['before_event']=event.shift(-1).reindex(series.index)
  x['after_event']=event.shift(1).reindex(series.index)
  if variant=='calendar_snap':x['snap_CA']=c.snap_CA.astype(float)
 return x

def main():
 source=DATA/'selected_5_foods.csv';calfile=DATA/'calendar.csv'
 hashes={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in [source,calfile]}
 df=pd.read_csv(source);df.columns=['date','item','sales'];df.date=pd.to_datetime(df.date)
 calendar=pd.read_csv(calfile,parse_dates=['date']);calendar=calendar.set_index('date',drop=False);assert calendar.index.is_unique
 records=[];candidates=[];foldrows=[];scores=[];saved={}
 for item in ITEMS:
  s=df[df.item==item].set_index('date').sales.sort_index();assert s.index.is_unique and s.index.equals(pd.date_range(s.index.min(),s.index.max()))
  assert len(s)==1941 and (s>=0).all() and np.isfinite(s).all()
  designs={v:calendar_features(s,calendar,v) for v in ['base','calendar','calendar_snap']}
  itemc=[]
  for variant,x in designs.items():
   for window in WINDOWS:
    total=0;count=0
    for cutoff in FOLDS:
     cutoff=pd.Timestamp(cutoff);valid=x.notna().all(axis=1);train=x.index[valid&(x.index<=cutoff)];train=train if window is None else train[-window:]
     days=x.index[(x.index>cutoff)&(x.index<=cutoff+pd.Timedelta(days=28))];assert len(days)==28 and train.max()<days.min()
     m=fit(x.loc[train].to_numpy(float),s.loc[train].to_numpy(float));p=predict(m,x.loc[days].to_numpy(float));err=np.abs(p-s.loc[days].to_numpy())
     total+=err.sum();count+=len(days);foldrows.append({'item':item,'variant':variant,'window':window,'cutoff':str(cutoff.date()),'mae':float(err.mean())})
    c={'item':item,'variant':variant,'window':window,'cv_mae':float(total/count)};itemc.append(c);candidates.append(c)
  selected=min(itemc,key=lambda c:c['cv_mae'])
  # Fixed selection is complete before opening final-test targets.
  chosenx=designs[selected['variant']];valid=chosenx.notna().all(axis=1);train=chosenx.index[valid&(chosenx.index<='2016-04-24')];train=train if selected['window'] is None else train[-selected['window']:]
  model=fit(chosenx.loc[train].to_numpy(float),s.loc[train].to_numpy(float))
  base=designs['base'];base_train=base.index[base.notna().all(axis=1)&(base.index<='2016-04-24')];old=fit(base.loc[base_train].to_numpy(float),s.loc[base_train].to_numpy(float))
  testdays=s.index[s.index>'2016-04-24'];assert len(testdays)==28 and train.max()<testdays.min()
  changed=s.copy();changed.loc['2016-04-25':]+=10000
  pd.testing.assert_frame_equal(calendar_features(changed,calendar,selected['variant']).loc[:'2016-04-25'],chosenx.loc[:'2016-04-25'])
  a=predict(old,base.loc[testdays].to_numpy(float));b=predict(model,chosenx.loc[testdays].to_numpy(float));actual=s.loc[testdays].to_numpy()
  def measures(p):return {'mae':float(np.abs(p-actual).mean()),'wape':float(100*np.abs(p-actual).sum()/actual.sum())}
  scores.append({**selected,'old':measures(a),'new':measures(b)})
  saved[item]={'variant':selected['variant'],'window':selected['window'],'features':list(chosenx.columns),'center':model[0].tolist(),'scale':model[1].tolist(),'coefficients':model[2].tolist(),'trained_until':'2016-04-24'}
  for day,truth,pa,pb in zip(testdays,actual,a,b):records.append({'date':str(day.date()),'item':item,'actual':int(truth),'old_prediction':float(pa),'new_prediction':float(pb)})
 p=pd.DataFrame(records);assert len(p)==140
 def aggregate(key):return {'mae':float((p[key]-p.actual).abs().mean()),'wape':float(100*(p[key]-p.actual).abs().sum()/p.actual.sum())}
 report={'hashes':hashes,'folds':FOLDS,'results':scores,'candidates':candidates,'fold_results':foldrows,'aggregate':{'old':aggregate('old_prediction'),'new':aggregate('new_prediction')},'test_status':'previously reported test; not new unseen holdout'}
 for path in [source,calfile]:assert hashes[path.name]==hashlib.sha256(path.read_bytes()).hexdigest()
 p.to_csv(OUTPUT/'calendar_predictions.csv',index=False,encoding='utf-8-sig',float_format='%.9f')
 (OUTPUT/'calendar_experiment.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
 (OUTPUT/'calendar_models.json').write_text(json.dumps(saved,ensure_ascii=False,indent=2),encoding='utf-8')
 # Build auditable report from rows; browser recomputes scores, not hard-coded metrics.
 oldpage=(OUTPUT/'improvement_report.html').read_text(encoding='utf-8')
 begin=oldpage.index('const data=');end=oldpage.index(';const byId',begin)
 mapped={**report,'source_sha256':hashes['selected_5_foods.csv'],'results':[{'item':r['item'],'selected_window':str(r['window'] or 'ทั้งหมด')+' / '+r['variant']} for r in scores], 'candidates':[{'item':c['item'],'window':str(c['window'] or 'ทั้งหมด')+' / '+c['variant'],'validation_mae':c['cv_mae']} for c in candidates]}
 page=oldpage[:begin]+'const data='+json.dumps({'report':mapped,'rows':records},ensure_ascii=False,allow_nan=False)+oldpage[end:]
 page=page.replace('ทดลองเพิ่มความแม่นยำด้วยข้อมูลจริง','ทดลองปฏิทิน M5 และตรวจสอบหลายช่วงเวลา').replace('ทดลองปรับ Linear Regression ด้วยข้อมูลจริง','ทดลองปฏิทินจริง M5')
 page=page.replace('เปลี่ยนเฉพาะช่วงฝึก Linear Regression','เพิ่มประเภทกิจกรรม วันก่อน/หลังกิจกรรม และ SNAP ของรัฐ CA พร้อมเลือกช่วงฝึก Linear Regression')
 page=page.replace('ลองข้อมูลทั้งหมด / 730 / 365 / 180 / 90 วัน เลือกช่วงที่ MAE ต่ำสุดจาก 29 ก.พ.–24 เม.ย. 2016 เท่านั้น จากนั้นฝึกถึง 24 เม.ย. แล้วทดสอบ 25 เม.ย.–22 พ.ค. ทีละวันโดยใช้ยอดจริงถึงวันก่อนหน้า ไม่มีการเลือกใหม่จากคะแนนทดสอบ','ลอง 9 วิธีต่อสินค้า: ตัวแปรเดิม / ปฏิทิน / ปฏิทิน+SNAP × ช่วงฝึกทั้งหมด / 730 / 365 วัน เลือกจาก MAE รวมการตรวจสอบ 3 รอบ รอบละ 28 วัน โดยฝึกถึง 31 ม.ค., 28 ก.พ., 27 มี.ค. 2016 ก่อนทดสอบช่วงถัดไป แล้วฝึกวิธีที่เลือกถึง 24 เม.ย. และทดสอบ 25 เม.ย.–22 พ.ค. ไม่มีการเลือกจากคะแนนทดสอบ SNAP คือปฏิทินสิทธิช่วยซื้ออาหารของ CA ไม่ใช่วันพระไทย สมมุติว่าปฏิทินเหล่านี้รู้ล่วงหน้าในวันทำนาย')
 page=page.replace('MAE ช่วงตรวจสอบ','MAE รวม 3 ช่วงตรวจสอบ').replace('improvement_predictions.csv','calendar_predictions.csv')
 extra='<h2>ผลตรวจสอบ 3 รอบของวิธีที่เลือก</h2><div class="scroll"><table><tr><th>สินค้า</th><th>วันสุดท้ายที่ฝึก</th><th>MAE รอบถัดไป 28 วัน</th></tr>'
 for r in scores:
  for f in foldrows:
   if (f['item'],f['variant'],f['window'])==(r['item'],r['variant'],r['window']):extra+='<tr><td>'+html.escape(f['item'])+'</td><td>'+f['cutoff']+'</td><td>'+str(round(f['mae'],4))+'</td></tr>'
 extra+='</table></div><p>SHA256 calendar.csv: '+hashes['calendar.csv']+'</p>'
 page=page.replace('<details>',extra+'<details>',1)
 (OUTPUT/'calendar_report.html').write_text(page,encoding='utf-8')
 print(json.dumps({'aggregate':report['aggregate'],'results':scores},indent=2))
if __name__=='__main__':main()
