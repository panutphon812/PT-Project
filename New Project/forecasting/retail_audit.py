"""Verify source rows and fixed-model backtest references without changing sales."""
from pathlib import Path
import json,sys
import numpy as np
import pandas as pd
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'data/ml-experiment-libs'))
import joblib
from retail_train import DATA,OUT,predict
b=json.loads((OUT/'bundle.json').read_text(encoding='utf-8'))
source=pd.read_csv(DATA/'sales_train_evaluation.csv');source=source[source.store_id=='CA_1'].set_index('item_id')
cal=pd.read_csv(DATA/'calendar.csv');assert cal.date.tolist()[:1941]==b['dates']
cut=b['dates'].index('2014-12-31')+1
for p in b['products']:
 a=source.loc[p['item'],[f'd_{i}' for i in range(1,1942)]].to_numpy(dtype=float)
 assert np.array_equal(a,p['sales']) and np.isfinite(a).all() and (a>=0).all()
 assert p['dept']==source.loc[p['item'],'dept_id']
rows=pd.read_csv(OUT/'predictions.csv');models={k:joblib.load(OUT/(k+'.joblib')) for k in b['models']}
for (phase,name,item,origin),group in rows.groupby(['phase','model','item','origin']):
 group=group.sort_values('horizon');a=source.loc[item,[f'd_{i}' for i in range(1,1942)]].to_numpy(dtype=float).tolist();t=b['dates'].index(origin)
 expected=predict('seasonal' if name=='seasonal' else models[name],a[:t],origin)
 assert np.allclose(group.prediction,expected,atol=1e-9)
 assert np.array_equal(group.actual,a[t:t+14]);assert group.horizon.tolist()==list(range(1,15))
 assert group.date.iloc[-1]<'2017-01-01'
assert max(b['experiment']['validationOrigins'])<'2016-01-01'
print('PASS: source calendar, 14 source products and all',len(rows),'backtest rows match frozen models and actual M5.')
