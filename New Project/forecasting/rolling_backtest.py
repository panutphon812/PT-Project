"""Fixed retrospective protocol: 12 non-overlapping 28-day one-step blocks.

No tuning or model selection. Refit original all-history OLS at each cutoff.
"""
import hashlib
import html
import json
import numpy as np
import pandas as pd
from train_forecast import DATA, OUTPUT, ITEMS, features, fit, predict

METHODS = {'linear': 'Linear Regression', 'mean7': 'เฉลี่ย 7 วัน', 'mean28': 'เฉลี่ย 28 วัน'}
END = pd.Timestamp('2016-05-22')
START = END - pd.Timedelta(days=335)

def score(frame, method):
    error = (frame[method] - frame.actual).abs()
    total = float(frame.actual.sum())
    return {'mae': float(error.mean()), 'wape': float(error.sum()/total*100) if total else None}

def main():
    source = DATA/'selected_5_foods.csv'
    digest = hashlib.sha256(source.read_bytes()).hexdigest()
    df = pd.read_csv(source)
    df.columns = ['date','item','sales']
    df.date = pd.to_datetime(df.date)
    rows = []
    models = []
    for item in ITEMS:
        s = df[df.item == item].set_index('date').sales.sort_index()
        assert s.index.equals(pd.date_range(s.index.min(), s.index.max()))
        assert np.isfinite(s).all() and (s >= 0).all()
        x = features(s)
        for block in range(12):
            start = START + pd.Timedelta(days=28*block)
            end = start + pd.Timedelta(days=27)
            cutoff = start - pd.Timedelta(days=1)
            train = x.index[x.notna().all(axis=1) & (x.index <= cutoff)]
            days = pd.date_range(start,end)
            assert train.max() < days.min() and len(days) == 28
            m = fit(x.loc[train].to_numpy(float),s.loc[train].to_numpy(float))
            p = predict(m,x.loc[days].to_numpy(float))
            models.append({'item':item,'block':block+1,'cutoff':str(cutoff.date()),'training_rows':len(train),'center':m[0].tolist(),'scale':m[1].tolist(),'coefficients':m[2].tolist()})
            for day, pred in zip(days,p):
                rows.append({'item':item,'block':block+1,'date':str(day.date()),'actual':int(s.loc[day]),'linear':float(pred),'mean7':float(x.loc[day,'mean_7']),'mean28':float(x.loc[day,'mean_28'])})
    predictions = pd.DataFrame(rows)
    assert len(predictions) == 1680 and not predictions.duplicated(['item','date']).any()
    summaries = []
    for item in ITEMS:
        part = predictions[predictions.item == item]
        folds = []
        for block, group in part.groupby('block'):
            folds.append({'block':int(block),'start':group.date.min(),'end':group.date.max(),'scores':{m:score(group,m) for m in METHODS}})
        summaries.append({'item':item,'scores':{m:score(part,m) for m in METHODS},'wins_against_mean7':sum(f['scores']['linear']['mae'] < f['scores']['mean7']['mae'] for f in folds),'wins_against_mean28':sum(f['scores']['linear']['mae'] < f['scores']['mean28']['mae'] for f in folds),'folds':folds})
    report = {'source_sha256':digest,'start':str(START.date()),'end':str(END.date()),'protocol':'Fixed original features, all-history OLS, refit each 28-day block; daily actual history through previous day; retrospective, previously inspected dataset; no tuning or deployment','aggregate':{m:score(predictions,m) for m in METHODS},'items':summaries,'models':models}
    assert hashlib.sha256(source.read_bytes()).hexdigest() == digest
    OUTPUT.mkdir(exist_ok=True)
    predictions.to_csv(OUTPUT/'rolling_predictions.csv',index=False,encoding='utf-8-sig',float_format='%.12f')
    (OUTPUT/'rolling_backtest.json').write_text(json.dumps(report,ensure_ascii=False,indent=2,allow_nan=False),encoding='utf-8')
    def table(scores):
        return '<div class="scroll"><table><tr><th>วิธี</th><th>MAE (หน่วย/วัน)</th><th>WAPE</th></tr>'+''.join(f'<tr><td>{METHODS[m]}</td><td>{v["mae"]:.2f}</td><td>{v["wape"]:.2f}%</td></tr>' if v['wape'] is not None else f'<tr><td>{METHODS[m]}</td><td>{v["mae"]:.2f}</td><td>คำนวณไม่ได้: ยอดจริงรวมเป็นศูนย์</td></tr>' for m,v in scores.items())+'</table></div>'
    cards = ''
    for result in summaries:
        cards += f'<section><h2>{html.escape(result["item"])}</h2>{table(result["scores"])}<p>AI มี MAE ต่ำกว่าเฉลี่ย 7 วัน: {result["wins_against_mean7"]}/12 รอบ · ต่ำกว่าเฉลี่ย 28 วัน: {result["wins_against_mean28"]}/12 รอบ</p><details><summary>ดูผลทั้ง 12 ช่วง</summary><div class="scroll"><table><tr><th>ช่วง</th><th>วิธี</th><th>MAE</th><th>WAPE</th></tr>'
        for f in result['folds']:
            for m,v in f['scores'].items():
                w = f'{v["wape"]:.2f}%' if v['wape'] is not None else 'ไม่มีนิยาม'
                cards += f'<tr><td>{f["start"]}–{f["end"]}</td><td>{METHODS[m]}</td><td>{v["mae"]:.2f}</td><td>{w}</td></tr>'
        cards += '</table></div></details></section>'
    page = '<!doctype html><html lang="th"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ทดสอบย้อนหลัง 12 ช่วง</title><style>body{font-family:Tahoma,Arial;background:#9585e9;color:#30313e;margin:0;line-height:1.8}main{max-width:1050px;margin:auto;padding:24px}section{background:white;border-radius:16px;padding:24px;margin:20px 0}h1{font-size:26px}h2{font-size:21px}table{width:100%;border-collapse:collapse;white-space:nowrap}td,th{padding:10px;text-align:right;border-bottom:1px solid #eee}td:first-child,th:first-child{text-align:left}th{background:#f5f2ff}.scroll{overflow:auto}a{color:#5843bb}summary{cursor:pointer;color:#5843bb}@media(max-width:600px){main{padding:12px}section{padding:16px}table{font-size:13px}}</style><main><section><a href="/">← กลับเว็บแอป</a><h1>ทดสอบย้อนหลัง 12 ช่วงเวลา</h1><p>12 รอบ × 28 วัน × 5 สินค้า = 1,680 คำทำนาย · '+report['start']+' ถึง '+report['end']+'</p><p>ใช้ Linear Regression ตัวแปรเดิม ฝึกด้วยข้อมูลทั้งหมดก่อนเริ่มแต่ละรอบ และคงโมเดลไว้ตลอดรอบ แต่ละวันใช้ยอดขายจริงถึงวันก่อนหน้า จึงเป็นการทำนายล่วงหน้า 1 วันซ้ำ 28 ครั้ง ไม่ใช่ทำนายทั้งเดือนในครั้งเดียว</p><p>กำหนดวิธีไว้ก่อนรัน ไม่มีการเลือกวิธีจากคะแนนนี้ ข้อมูล M5 เคยถูกตรวจในการทดลองก่อนหน้า ผลนี้จึงเป็นการตรวจย้อนหลังเพิ่มเติม ไม่ใช่หลักฐานจากข้อมูลอนาคตชุดใหม่ และยังไม่ได้เปลี่ยนโมเดลบนเว็บ</p></section><section><h2>ผลรวมทั้งหมด</h2>'+table(report['aggregate'])+'<p>MAE และ WAPE ยิ่งต่ำยิ่งดี WAPE เป็นสัดส่วนความคลาดเคลื่อน ไม่ใช่เปอร์เซ็นต์ความถูกต้อง ผลรวมคำนวณจากคำทำนายทุกแถว ไม่ใช่เฉลี่ยเปอร์เซ็นต์ของแต่ละรอบ</p></section>'+cards+'<section><h2>ตรวจสอบผลได้</h2><p><a href="/rolling_predictions.csv" download>ดาวน์โหลดคำทำนายจริงครบ 1,680 แถว</a></p><p>ข้อมูลร้าน CA_1 จาก M5 ไม่มีการแก้ยอดขายหรือสร้างยอดขายเพิ่มเติม</p><small>SHA256: '+digest+'</small></section></main></html>'
    (OUTPUT/'rolling_report.html').write_text(page,encoding='utf-8')
    print(json.dumps({'aggregate':report['aggregate'],'items':[{k:v for k,v in r.items() if k != 'folds'} for r in summaries]},ensure_ascii=False,indent=2))

if __name__ == '__main__':
    main()
