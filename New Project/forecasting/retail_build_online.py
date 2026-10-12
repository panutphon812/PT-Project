"""Publish only M5 demonstrator artifacts; never copy user workspaces or SQLite."""
from pathlib import Path
import shutil
root=Path(__file__).resolve().parent
dist=root.parent/'online-demo/dist'
dest=dist/'retail';dest.mkdir(parents=True,exist_ok=True)
assets=root.parent/'Dataset/m5-forecasting-accuracy/ai_results/retail'
for name in ['retail.css','retail_ui.mjs','retail_engine.mjs']:shutil.copy2(root/name,dest/name)
for name in ['bundle.json','policy_report.json','predictions.csv']:shutil.copy2(assets/name,dest/name)
page=(root/'retail.html').read_text(encoding='utf-8')
(dist/'index.html').write_text(page,encoding='utf-8')
(dest/'index.html').write_text(page,encoding='utf-8')
print('Built approved-scope static demonstrator. No private records copied.')
