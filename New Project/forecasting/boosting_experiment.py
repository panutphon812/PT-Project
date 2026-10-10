"""Compare Gradient Boosting against selected Linear Regression; do not replace live models."""
from pathlib import Path
import sys
# Keep bundled NumPy/Pandas; install experiment dependencies only in ignored data/.
import numpy as np
import pandas as pd
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'data/ml-experiment-libs'))
import sklearn,joblib
from sklearn.ensemble import GradientBoostingRegressor
import json,hashlib
from calendar_experiment import calendar_features,FOLDS
from train_forecast import DATA,OUTPUT,ITEMS,predict
GRID=[{'n_estimators':150,'learning_rate':.03,'max_depth':1},{'n_estimators':150,'learning_rate':.05,'max_depth':2},{'n_estimators':150,'learning_rate':.03,'max_depth':3},{'n_estimators':300,'learning_rate':.03,'max_depth':2}]
def estimator(params):return GradientBoostingRegressor(**params,min_samples_leaf=10,loss='squared_error',random_state=812)
def main():
 source=DATA/'selected_5_foods.csv';calfile=DATA/'calendar.csv';hashes={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in [source,calfile]}
 raw=pd.read_csv(source);raw.columns=['date','item','sales'];raw.date=pd.to_datetime(raw.date)
 cal=pd.read_csv(calfile,parse_dates=['date']).set_index('date',drop=False)
 linear=json.loads((OUTPUT/'calendar_models.json').read_text(encoding='utf-8'));linear_report=json.loads((OUTPUT/'calendar_experiment.json').read_text(encoding='utf-8'))
 candidates=[];results=[];rows=[];foldrows=[]
 for item in ITEMS:
  s=raw[raw.item==item].set_index('date').sales.sort_index();m=linear[item];x=calendar_features(s,cal,m['variant']);valid=x.notna().all(axis=1)
  options=[]
  for params in GRID:
   errors=[]
   for cutoff in FOLDS:
    cutoff=pd.Timestamp(cutoff);train=x.index[valid&(x.index<=cutoff)];train=train if m['window'] is None else train[-m['window']:]
    test=x.index[(x.index>cutoff)&(x.index<=cutoff+pd.Timedelta(days=28))];assert len(test)==28 and train.max()<test.min()
    g=estimator(params).fit(x.loc[train].to_numpy(float),s.loc[train].to_numpy(float));p=np.maximum(g.predict(x.loc[test].to_numpy(float)),0);mae=float(np.abs(p-s.loc[test].to_numpy()).mean());errors.append(mae)
    foldrows.append({'item':item,'params':params,'cutoff':str(cutoff.date()),'mae':mae})
   candidate={'item':item,'params':params,'cv_mae':float(np.mean(errors))};options.append(candidate);candidates.append(candidate)
  chosen=min(options,key=lambda c:c['cv_mae'])
  train=x.index[valid&(x.index<='2016-04-24')];train=train if m['window'] is None else train[-m['window']:]
  days=x.index[x.index>'2016-04-24'];assert len(days)==28 and train.max()<days.min()
  g=estimator(chosen['params']).fit(x.loc[train].to_numpy(float),s.loc[train].to_numpy(float))
  joblib.dump(g,OUTPUT/('boosting_'+item+'.joblib'))
  pa=predict(tuple(np.array(m[k]) for k in ['center','scale','coefficients']),x.loc[days].to_numpy(float));pb=np.maximum(g.predict(x.loc[days].to_numpy(float)),0);truth=s.loc[days].to_numpy()
  def metrics(p):return {'mae':float(np.abs(p-truth).mean()),'wape':float(100*np.abs(p-truth).sum()/truth.sum())}
  lc=next(r['cv_mae'] for r in linear_report['results'] if r['item']==item)
  results.append({**chosen,'features':m['variant'],'window':m['window'],'linear_cv_mae':lc,'linear':metrics(pa),'boosting':metrics(pb)})
  for d,a,b,t in zip(days,pa,pb,truth):rows.append({'date':str(d.date()),'item':item,'actual':int(t),'old_prediction':float(a),'new_prediction':float(b)})
 p=pd.DataFrame(rows);assert len(p)==140
 def aggregate(key):return {'mae':float((p[key]-p.actual).abs().mean()),'wape':float(100*(p[key]-p.actual).abs().sum()/p.actual.sum())}
 report={'hashes':hashes,'sklearn_version':sklearn.__version__,'grid':GRID,'results':results,'candidates':candidates,'fold_results':foldrows,'aggregate':{'linear':aggregate('old_prediction'),'boosting':aggregate('new_prediction')},'test_status':'previously reported test; not unseen holdout','comparison':'same features, selected training windows, folds and final test; GB params chosen by CV only'}
 for path in [source,calfile]:assert hashes[path.name]==hashlib.sha256(path.read_bytes()).hexdigest()
 p.to_csv(OUTPUT/'boosting_predictions.csv',index=False,encoding='utf-8-sig',float_format='%.9f');(OUTPUT/'boosting_experiment.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
 page=(OUTPUT/'calendar_report.html').read_text(encoding='utf-8');a=page.index('const data=');b=page.index(';const byId',a)
 mapped={'source_sha256':hashes['selected_5_foods.csv'],'results':[{'item':r['item'],'selected_window':str(r['window'] or 'ทั้งหมด')+' / '+r['features']} for r in results],'candidates':[{'item':c['item'],'window':str(c['params']),'validation_mae':c['cv_mae']} for c in candidates]}
 page=page[:a]+'const data='+json.dumps({'report':mapped,'rows':rows},ensure_ascii=False,allow_nan=False)+page[b:]
 # Remove old fold table because it belongs to another experiment.
 a=page.index('<h2>ผลตรวจสอบ 3 รอบ');b=page.index('<details>',a);page=page[:a]+page[b:]
 a=page.index('<p>ลอง 9 วิธี');b=page.index('</p>',a)+4
 page=page[:a]+'<p>ใช้ตัวแปรและช่วงฝึกเดียวกับ Linear รุ่นปฏิทิน เปรียบเทียบ Gradient Boosting 4 ค่าตั้ง เลือกจาก MAE เฉลี่ย 3 รอบตรวจสอบ รอบละ 28 วัน ฝึกถึง 31 ม.ค., 28 ก.พ., 27 มี.ค. 2016 จากนั้นฝึกถึง 24 เม.ย. และทดสอบ 25 เม.ย.–22 พ.ค. แบบทำนายทีละวัน ไม่ใช้คะแนนทดสอบเลือกค่าตั้ง</p>'+page[b:]
 page=page.replace('ทดลองปฏิทิน M5 และตรวจสอบหลายช่วงเวลา','ทดลอง Gradient Boosting เทียบ Linear Regression').replace('ทดลองปฏิทินจริง M5','ทดลอง Gradient Boosting').replace('เพิ่มประเภทกิจกรรม วันก่อน/หลังกิจกรรม และ SNAP ของรัฐ CA พร้อมเลือกช่วงฝึก Linear Regression','ใช้ตัวแปรและช่วงฝึกเดียวกัน เปลี่ยนเฉพาะโมเดลเป็น Gradient Boosting')
 page=page.replace('MAE เดิม','MAE Linear').replace('MAE ทดลอง','MAE Boosting').replace('WAPE เดิม','WAPE Linear').replace('WAPE ทดลอง','WAPE Boosting').replace('เดิมทำนาย','Linear ทำนาย').replace('ทดลองทำนาย','Boosting ทำนาย').replace('calendar_predictions.csv','boosting_predictions.csv')
 page=page.replace('ช่วงฝึกทุกตัวที่ทดลองและคะแนนตรวจสอบ','ค่าตั้ง Boosting ทุกตัวและคะแนนตรวจสอบ')
 cvtable='<h2>ผลตรวจสอบก่อนเลือกโมเดล</h2><p>รอบนี้ Boosting มี MAE ตรวจสอบสูงกว่า Linear ทุกสินค้า จึงคง Linear ไว้ ไม่เลือกสลับโมเดลจากสินค้าที่ชนะเฉพาะชุดทดสอบ</p><div class="scroll"><table><tr><th>สินค้า</th><th>Linear CV MAE</th><th>Boosting CV MAE</th></tr>'
 for r in results:cvtable+='<tr><td>'+r['item']+'</td><td>'+str(round(r['linear_cv_mae'],4))+'</td><td>'+str(round(r['cv_mae'],4))+'</td></tr>'
 page=page.replace('<details>',cvtable+'</table></div><details>',1)
 (OUTPUT/'boosting_report.html').write_text(page,encoding='utf-8');print(json.dumps({'aggregate':report['aggregate'],'results':results},indent=2))
if __name__=='__main__':main()
