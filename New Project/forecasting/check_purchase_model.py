"""Verify second-model labels, chronology, real targets and saved predictions."""
import hashlib,json
import numpy as np
import pandas as pd
from train_purchase_model import DATA,OUTPUT,ITEMS,NAMES,evaluate,teacher,decode,recursive,features,FIRST_CUTOFF
import joblib

def main():
 r=json.loads((OUTPUT/'purchase_model_report.json').read_text())
 rows=json.loads((OUTPUT/'purchase_model_dataset.json').read_text())
 source=DATA/'selected_5_foods.csv'
 assert hashlib.sha256(source.read_bytes()).hexdigest()==r['source_sha256']
 raw=pd.read_csv(source);raw.columns=['date','item','sales'];raw.date=pd.to_datetime(raw.date)
 first=json.loads((OUTPUT/'purchase_first_models.json').read_text())
 model=joblib.load(OUTPUT/'purchase_model.joblib')
 seen={};totals={split:{method:{k:0. for k in ['cost','shortage','waste','remaining','ordered']} for method in ['ml2','teacher','baseline']} for split in ['validation','test']}
 for row in rows:
  key=(row['item'],row['date']);assert seen.setdefault(key,row['split'])==row['split']
  day=pd.Timestamp(row['date']);end=day+pd.Timedelta(days=6)
  assert FIRST_CUTOFF<day
  if row['split']=='train':assert end<=pd.Timestamp('2015-10-31')
  elif row['split']=='validation':assert day>=pd.Timestamp('2015-11-08') and end<=pd.Timestamp('2015-12-31')
  else:assert day>=pd.Timestamp('2016-01-08')
  s=raw[raw.item==row['item']].set_index('date').sales.sort_index()
  np.testing.assert_array_equal(row['actual'],s.loc[day:end])
  expected=list(row['forecast'])+[row['conditions'][k] for k in NAMES[7:]]
  np.testing.assert_array_equal(row['features'],expected)
  label,cost=teacher(np.array(row['forecast']),row['conditions']);assert list(label)==row['label'];np.testing.assert_allclose(cost,row['teacher_forecast_cost'])
  if row['split']!='train':
   a=decode(model.predict([row['features']])[0],np.array(row['forecast']),row['conditions']);assert list(a)==row['prediction']
   for method,result in row['evaluations'].items():
    stock=row['conditions']['stock_qty']+row['conditions']['inbound_qty']+result['ordered']
    np.testing.assert_allclose(stock,sum(row['actual'])-result['shortage']+result['waste']+result['remaining'])
    for k in totals[row['split']][method]:totals[row['split']][method][k]+=result[k]
   for method,action in [('ml2',a),('teacher',row['label'])]:
    replay=evaluate(row['actual'],row['conditions'],[action])
    for k,v in replay.items():np.testing.assert_allclose(v[0],row['evaluations'][method][k])
 for split,total in totals.items():
  for method,metrics in total.items():
   for k,value in metrics.items():np.testing.assert_allclose(value,r['metrics'][split]['real_sales_totals'][method][k])
 # Future-sales changes cannot alter a decision's forecast or teacher label.
 for item in ITEMS:
  row=next(a for a in rows if a['item']==item and a['split']=='test');day=pd.Timestamp(row['date']);s=raw[raw.item==item].set_index('date').sales.sort_index()
  m=tuple(np.array(first[item][k]) for k in ['center','scale','coefficients'])
  changed=s.copy();changed.loc[day:]+=99999
  np.testing.assert_allclose(recursive(m,s,day),recursive(m,changed,day))
 # Analytic stock conservation and inclusive end-of-day expiry check.
 c={'stock_qty':10,'stock_life':1,'inbound_qty':0,'shelf_days':1,'pack_units':6,'unit_cost':20,'shortage_penalty':40,'disposal_cost':2,'normal_fee':19,'express_fee':48}
 v=evaluate([5,5,5,5,5,5,5],c,[(0,0,0)])
 assert v['shortage'][0]==30 and v['waste'][0]==5 and v['remaining'][0]==0
 assert v['cost'][0]==30*40+5*2
 print(f'PASS: {len(rows)} synthetic scenarios, real targets, time splits, teacher labels, saved model replay, future-sales invariance and analytic expiry/cost checks')

if __name__=='__main__':main()
