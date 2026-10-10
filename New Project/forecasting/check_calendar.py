import hashlib,json
import numpy as np
import pandas as pd
from calendar_experiment import calendar_features
from train_forecast import DATA,OUTPUT,predict
r=json.loads((OUTPUT/'calendar_experiment.json').read_text(encoding='utf-8'));models=json.loads((OUTPUT/'calendar_models.json').read_text(encoding='utf-8'));rows=pd.read_csv(OUTPUT/'calendar_predictions.csv')
raw=pd.read_csv(DATA/'selected_5_foods.csv');raw.columns=['date','item','sales'];raw.date=pd.to_datetime(raw.date)
calendar=pd.read_csv(DATA/'calendar.csv',parse_dates=['date']).set_index('date',drop=False)
assert len(rows)==140 and len(r['candidates'])==45 and len(r['fold_results'])==135
for name,digest in r['hashes'].items():assert hashlib.sha256((DATA/name).read_bytes()).hexdigest()==digest
for item,m in models.items():
 s=raw[raw.item==item].set_index('date').sales.sort_index();part=rows[rows.item==item];days=pd.to_datetime(part.date)
 np.testing.assert_array_equal(s.loc[days].to_numpy(),part.actual.to_numpy())
 p=predict(tuple(np.array(m[k]) for k in ['center','scale','coefficients']),calendar_features(s,calendar,m['variant']).loc[days].to_numpy(float))
 np.testing.assert_allclose(p,part.new_prediction,atol=1e-8,rtol=0)
 chosen=min([c for c in r['candidates'] if c['item']==item],key=lambda c:c['cv_mae']);assert (chosen['variant'],chosen['window'])==(m['variant'],m['window'])
 folds=[f for f in r['fold_results'] if (f['item'],f['variant'],f['window'])==(item,m['variant'],m['window'])];assert len(folds)==3
 assert abs(np.mean([f['mae'] for f in folds])-chosen['cv_mae'])<1e-10
assert abs((rows.new_prediction-rows.actual).abs().mean()-r['aggregate']['new']['mae'])<1e-8
print('PASS: 140 real targets, 5 saved-model replays, 45 candidates/135 folds, chronological selections and unchanged source hashes.')
