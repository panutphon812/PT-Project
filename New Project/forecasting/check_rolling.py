"""Replay saved training parameters and independently verify actuals and metrics."""
import hashlib,json
import numpy as np
import pandas as pd
from train_forecast import DATA,OUTPUT,ITEMS,features,fit,predict

report=json.loads((OUTPUT/'rolling_backtest.json').read_text(encoding='utf-8'))
source=DATA/'selected_5_foods.csv'
assert hashlib.sha256(source.read_bytes()).hexdigest()==report['source_sha256']
raw=pd.read_csv(source);raw.columns=['date','item','sales'];raw.date=pd.to_datetime(raw.date)
p=pd.read_csv(OUTPUT/'rolling_predictions.csv',parse_dates=['date'])
assert len(p)==1680 and len(report['models'])==60
assert not p.duplicated(['item','date']).any()
for item in ITEMS:
 s=raw[raw.item==item].set_index('date').sales.sort_index();x=features(s)
 part=p[p.item==item].sort_values('date')
 assert part.date.tolist()==list(pd.date_range(report['start'],report['end']))
 np.testing.assert_array_equal(part.actual,s.loc[part.date])
 for model in [m for m in report['models'] if m['item']==item]:
  group=part[part.block==model['block']];cutoff=pd.Timestamp(model['cutoff'])
  assert cutoff==group.date.min()-pd.Timedelta(days=1) and len(group)==28
  train=x.index[x.notna().all(axis=1)&(x.index<=cutoff)]
  assert len(train)==model['training_rows']
  fitted=fit(x.loc[train].to_numpy(float),s.loc[train].to_numpy(float))
  saved=tuple(np.array(model[k]) for k in ['center','scale','coefficients'])
  for a,b in zip(fitted,saved):np.testing.assert_allclose(a,b)
  np.testing.assert_allclose(predict(saved,x.loc[group.date].to_numpy(float)),group.linear,atol=1e-9)
  for n in [7,28]:
   expected=[s.loc[d-pd.Timedelta(days=n):d-pd.Timedelta(days=1)].mean() for d in group.date]
   np.testing.assert_allclose(group[f'mean{n}'],expected,atol=1e-9)
  changed=s.copy();changed.loc[group.date.min():]+=10000
  pd.testing.assert_frame_equal(features(changed).loc[:group.date.min()],x.loc[:group.date.min()])
 for summary in [r for r in report['items'] if r['item']==item]:
  for method,metrics in summary['scores'].items():
   error=(part[method]-part.actual).abs()
   np.testing.assert_allclose(metrics['mae'],error.mean())
   np.testing.assert_allclose(metrics['wape'],100*error.sum()/part.actual.sum())
  for baseline in ['mean7','mean28']:
   wins=sum((g.linear-g.actual).abs().mean()<(g[baseline]-g.actual).abs().mean() for _,g in part.groupby('block'))
   assert wins==summary[f'wins_against_{baseline}']
for method,metrics in report['aggregate'].items():
 error=(p[method]-p.actual).abs()
 np.testing.assert_allclose(metrics['mae'],error.mean())
 np.testing.assert_allclose(metrics['wape'],100*error.sum()/p.actual.sum())
print('PASS: 1,680 real targets, 60 refitted model replays, chronological cutoffs, baseline means, future-target invariance, aggregate scores and wins')
