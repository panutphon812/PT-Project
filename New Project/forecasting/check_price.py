import hashlib,json
import numpy as np
import pandas as pd
from price_experiment import DATA,OUTPUT,load_prices,design,predict
r=json.loads((OUTPUT/'price_experiment.json').read_text(encoding='utf-8'));models=json.loads((OUTPUT/'price_models.json').read_text(encoding='utf-8'));rows=pd.read_csv(OUTPUT/'price_predictions.csv')
raw=pd.read_csv(DATA/'selected_5_foods.csv');raw.columns=['date','item','sales'];raw.date=pd.to_datetime(raw.date)
cal=pd.read_csv(DATA/'calendar.csv',parse_dates=['date']).set_index('date',drop=False);prices=load_prices()
assert len(rows)==140 and len(r['folds'])==45
for name,digest in r['hashes'].items():assert hashlib.sha256((DATA/name).read_bytes()).hexdigest()==digest
for item,m in models.items():
 s=raw[raw.item==item].set_index('date').sales.sort_index();part=rows[rows.item==item];days=pd.to_datetime(part.date);subset=prices[prices.item_id==item]
 np.testing.assert_array_equal(s.loc[days].to_numpy(),part.actual.to_numpy())
 base,x,p=design(s,cal,subset,m);forecast=predict(tuple(np.array(m[k]) for k in ['center','scale','coefficients']),x.loc[days].to_numpy(float))
 np.testing.assert_allclose(forecast,part.price,atol=1e-8,rtol=0)
 np.testing.assert_allclose(base.loc[days,'mean_7'].to_numpy(),part.mean7,atol=1e-8,rtol=0)
 changed=s.copy();changed.loc['2016-04-25':]+=10000;pd.testing.assert_frame_equal(design(changed,cal,subset,m)[1].loc[:'2016-04-25'],x.loc[:'2016-04-25'])
 result=next(v for v in r['results'] if v['item']==item);assert result['selected']==min(result['cv'],key=lambda k:round(result['cv'][k],8))
assert abs((rows.price-rows.actual).abs().mean()-r['aggregate']['price']['mae'])<1e-8
print('PASS: 140 real targets, saved price-model replays, baseline calculations, CV-only choices, source hashes and future-sales invariance.')
