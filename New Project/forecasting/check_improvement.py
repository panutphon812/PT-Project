import json
import numpy as np
import pandas as pd
from train_forecast import DATA,OUTPUT,features,predict
report=json.loads((OUTPUT/'window_experiment.json').read_text(encoding='utf-8'))
models=json.loads((OUTPUT/'improved_models.json').read_text(encoding='utf-8'))
raw=pd.read_csv(DATA/'selected_5_foods.csv');raw.columns=['date','item','sales'];raw.date=pd.to_datetime(raw.date)
rows=pd.read_csv(OUTPUT/'improvement_predictions.csv');assert len(rows)==140
for item,m in models.items():
 s=raw[raw.item==item].set_index('date').sales.sort_index();part=rows[rows.item==item];dates=pd.to_datetime(part.date)
 np.testing.assert_array_equal(s.loc[dates].to_numpy(),part.actual.to_numpy())
 pred=predict(tuple(np.array(m[k]) for k in ['center','scale','coefficients']),features(s).loc[dates].to_numpy(float))
 np.testing.assert_allclose(pred,part.new_prediction.to_numpy(),atol=1e-8,rtol=0)
 selected=min([c for c in report['candidates'] if c['item']==item],key=lambda c:c['validation_mae'])
 assert selected['window']==m['window']
assert abs((rows.new_prediction-rows.actual).abs().mean()-report['aggregate']['new_mae'])<1e-8
print('Verified 140 actual targets against source CSV, replayed all saved model predictions, validation-only selections and aggregate scores.')
