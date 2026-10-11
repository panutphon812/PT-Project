"""Export our trained tree for deterministic browser inference, without shop data."""
import json
from train_purchase_model import joblib, OUTPUT, NAMES
t=joblib.load(OUTPUT/'purchase_model.joblib').tree_
payload={'names':NAMES,'first':json.loads((OUTPUT/'purchase_first_models.json').read_text()),'tree':{'left':t.children_left.tolist(),'right':t.children_right.tolist(),'feature':t.feature.tolist(),'threshold':t.threshold.tolist(),'value':t.value[:,:,0].tolist()}}
(OUTPUT/'purchase_bundle.js').write_text('const purchaseBundle='+json.dumps(payload)+';',encoding='utf-8')
print('Exported trained purchase model')
