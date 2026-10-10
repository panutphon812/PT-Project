import hashlib,json
import numpy as np
import pandas as pd
from boosting_experiment import DATA,OUTPUT,calendar_features,joblib
r=json.loads((OUTPUT/'boosting_experiment.json').read_text(encoding='utf-8'));rows=pd.read_csv(OUTPUT/'boosting_predictions.csv');lm=json.loads((OUTPUT/'calendar_models.json').read_text(encoding='utf-8'))
raw=pd.read_csv(DATA/'selected_5_foods.csv');raw.columns=['date','item','sales'];raw.date=pd.to_datetime(raw.date)
cal=pd.read_csv(DATA/'calendar.csv',parse_dates=['date']).set_index('date',drop=False)
assert len(rows)==140 and len(r['candidates'])==20 and len(r['fold_results'])==60
for name,digest in r['hashes'].items():assert hashlib.sha256((DATA/name).read_bytes()).hexdigest()==digest
for item,m in lm.items():
 s=raw[raw.item==item].set_index('date').sales.sort_index();part=rows[rows.item==item];days=pd.to_datetime(part.date)
 np.testing.assert_array_equal(s.loc[days].to_numpy(),part.actual.to_numpy())
 g=joblib.load(OUTPUT/('boosting_'+item+'.joblib'));x=calendar_features(s,cal,m['variant']);p=np.maximum(g.predict(x.loc[days].to_numpy(float)),0)
 np.testing.assert_allclose(p,part.new_prediction,atol=1e-8,rtol=0)
 c=min([c for c in r['candidates'] if c['item']==item],key=lambda c:c['cv_mae']);chosen=next(v for v in r['results'] if v['item']==item);assert c['params']==chosen['params']
 changed=s.copy();changed.loc['2016-04-25':]+=10000
 pd.testing.assert_frame_equal(calendar_features(changed,cal,m['variant']).loc[:'2016-04-25'],x.loc[:'2016-04-25'])
assert abs((rows.new_prediction-rows.actual).abs().mean()-r['aggregate']['boosting']['mae'])<1e-8
print('PASS: all 140 real targets, saved Boosting model replays, CV-only parameter selection, unchanged sources and future-feature invariance.')
