"""Export public M5 demo, excluding local inventory and sales databases."""
from pathlib import Path
import json
import re
root=Path(__file__).resolve().parent
target=root.parent/'online-demo'
dist=target/'dist';dist.mkdir(parents=True,exist_ok=True)
assets=root.parent/'Dataset/m5-forecasting-accuracy/ai_results'
page=(assets/'forecast_demo.html').read_text(encoding='utf-8')
page=page.replace('<style>','<link rel="stylesheet" href="webapp.css"><style>')
page=page.replace('</html>','<script src="webapp_client.js"></script><script src="lot_planner.js"></script><script src="lot_planner_ui.js"></script><script src="purchase_bundle.js"></script><script src="purchase_engine.js"></script><script src="purchase_ui.js"></script><script src="workflow_ui.js"></script></html>')
notice='<div style="padding:12px;background:#f2efff;font:14px Tahoma;line-height:1.7">เว็บสาธิตออนไลน์ · ใช้ข้อมูล M5 ปี 2016 · ล็อตและประวัติเก็บเฉพาะเบราว์เซอร์นี้ ไม่ส่งให้ผู้ใช้คนอื่น ล้างข้อมูลเว็บไซต์แล้วข้อมูลที่บันทึกจะหาย โปรดดาวน์โหลด CSV เพื่อเก็บสำเนา</div>'
page=page.replace('<main class="content">','<main class="content">'+notice)
page=page.replace('Offline workspace','เว็บสาธิตออนไลน์')
(dist/'index.html').write_text(page,encoding='utf-8')
client=(root/'webapp_client.js').read_text(encoding='utf-8').split('\n',1)[1]
(dist/'webapp_client.js').write_text((root/'online_storage.js').read_text(encoding='utf-8')+'\n'+client,encoding='utf-8')
for name in ['webapp.css','lot_planner.js','lot_planner_ui.js','purchase_engine.js','purchase_ui.js','workflow_ui.js']:(dist/name).write_bytes((root/name).read_bytes())
for name in ['purchase_bundle.js','purchase_model_report.html','workflow_report.html']:(dist/name).write_bytes((assets/name).read_bytes())
for name in ['forecast_report.html','improvement_report.html','calendar_report.html','boosting_report.html','price_report.html','rolling_report.html','rolling_predictions.csv']:
 if (assets/name).exists():(dist/name).write_bytes((assets/name).read_bytes())
manifest=target/'.openai/hosting.json'
config=json.loads(manifest.read_text(encoding='utf-8'));config['static']={'directory':'dist'};manifest.write_text(json.dumps(config,indent=2),encoding='utf-8')
print('Built public demo from M5 assets; no local workspace or lot data copied')
