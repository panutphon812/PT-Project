"""Second-layer ML: imitate an exhaustive, forecast-only purchasing teacher.

Real M5 sales are unchanged. Costs, stock, expiry, distance and transit are
explicit synthetic scenarios. This is not a real supplier/order dataset.
"""
import hashlib,html,json,sys
from pathlib import Path
import numpy as np
import pandas as pd
from train_forecast import DATA,OUTPUT,ITEMS,features,fit,predict
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'data/ml-experiment-libs'))
from sklearn.tree import DecisionTreeRegressor
import joblib

SEED=812
FIRST_CUTOFF=pd.Timestamp('2014-12-31')
NAMES=[f'forecast_day_{i+1}' for i in range(7)]+['stock_qty','stock_life','inbound_qty','distance_km','shelf_days','pack_units','unit_cost','shortage_penalty','disposal_cost','normal_fee','express_fee']

def recursive(m,s,start):
    # Only history before the decision date is available, including for test.
    known=s.loc[s.index<start].copy();values=[]
    for k in range(7):
        day=start+pd.Timedelta(days=k)
        extended=pd.concat([known,pd.Series([np.nan],index=[day])])
        x=features(extended).loc[[day]].to_numpy(float)
        value=float(predict(m,x)[0]);values.append(value);known.loc[day]=value
    return np.array(values)

def evaluate(demand,c,actions):
    """Evaluate a batch of single-order plans with integer stock, inclusive expiry.

    Forecast consumption can be fractional. Actual evaluation uses integer sales.
    New purchases charged in full; end-horizon stock reported, no salvage credit.
    """
    a=np.asarray(actions,dtype=int);n=len(a)
    old=np.full(n,c['stock_qty'],float);pending=np.zeros(n);new=np.zeros(n)
    qty=a[:,0]*c['pack_units'];arrival=a[:,1]+np.where(a[:,2]==0,3,1)
    expires=arrival+c['shelf_days']-1
    shortage=np.zeros(n);waste=np.zeros(n)
    for day,d in enumerate(demand):
        if day==2:pending+=c['inbound_qty'] # fixed synthetic inbound arrival day 3
        new+=np.where(arrival==day,qty,0)
        left=np.full(n,d,float)
        # FEFO across all three lots; vectorized per-plan ordering.
        quantities=np.stack([old,pending,new],axis=1)
        expiries=np.column_stack([np.full(n,c['stock_life']-1),np.full(n,4),expires])
        for rank in range(3):
            idx=np.argsort(expiries,axis=1,kind='stable')[:,rank]
            available=quantities[np.arange(n),idx];used=np.minimum(left,available)
            quantities[np.arange(n),idx]-=used;left-=used
        shortage+=left
        for j in range(3):
            gone=expiries[:,j]<=day;waste+=np.where(gone,quantities[:,j],0);quantities[gone,j]=0
        old,pending,new=quantities.T
    fee=np.where(a[:,2]==0,c['normal_fee'],c['express_fee'])*(qty>0)
    cost=qty*c['unit_cost']+fee+shortage*c['shortage_penalty']+waste*c['disposal_cost']
    return {'cost':cost,'shortage':shortage,'waste':waste,'remaining':old+pending+new,'ordered':qty,'fee':fee}

def teacher(f,c):
    cap=int(np.ceil(f.sum()/c['pack_units']))
    actions=[(0,0,0)]+[(q,delay,mode) for q in range(1,cap+1) for delay in range(3) for mode in range(2)]
    costs=evaluate(f,c,actions)['cost'];best=int(np.argmin(costs))
    return actions[best],float(costs[best])

def decode(pred,forecast,c):
    q=int(np.clip(np.floor(pred[0]+.5),0,np.ceil(forecast.sum()/c['pack_units'])))
    return (q,int(np.clip(np.floor(pred[1]+.5),0,2)),int(pred[2]>=.5)) if q else (0,0,0)

def main():
    source=DATA/'selected_5_foods.csv';digest=hashlib.sha256(source.read_bytes()).hexdigest()
    raw=pd.read_csv(source);raw.columns=['date','item','sales'];raw.date=pd.to_datetime(raw.date)
    rng=np.random.default_rng(SEED);records=[];first_models={}
    starts=pd.date_range('2015-01-05','2016-05-09',freq='14D')
    for item in ITEMS:
        s=raw[raw.item==item].set_index('date').sales.sort_index();x=features(s)
        train=x.index[x.notna().all(axis=1)&(x.index<=FIRST_CUTOFF)]
        m=fit(x.loc[train].to_numpy(float),s.loc[train].to_numpy(float))
        first_models[item]={k:v.tolist() for k,v in zip(['center','scale','coefficients'],m)}
        for start in starts:
            f=recursive(m,s,start)
            # Gap between splits prevents any seven-day demand window crossing.
            split='train' if start+pd.Timedelta(days=6)<=pd.Timestamp('2015-10-31') else 'validation' if start>=pd.Timestamp('2015-11-08') and start+pd.Timedelta(days=6)<=pd.Timestamp('2015-12-31') else 'test' if start>=pd.Timestamp('2016-01-08') else None
            if split is None:continue
            for scenario in range(4):
                price=int(rng.choice([20,40]));distance=int(rng.choice([10,30,60]))
                c={'stock_qty':int(round(f.mean()*rng.choice([0,.5,1,2]))),'stock_life':int(rng.choice([1,3,6])),'inbound_qty':int(rng.choice([0,6,12])),'distance_km':distance,'shelf_days':int(rng.choice([2,4,7])),'pack_units':6,'unit_cost':price,'shortage_penalty':price*2,'disposal_cost':price*.1,'normal_fee':15+.4*distance,'express_fee':40+.8*distance}
                target,teacher_cost=teacher(f,c)
                inputs=list(f)+[c[k] for k in NAMES[7:]]
                records.append({'id':f'{item}/{start.date()}/{scenario}','item':item,'date':str(start.date()),'split':split,'forecast':f.tolist(),'conditions':c,'features':inputs,'label':list(target),'teacher_forecast_cost':teacher_cost,'actual':s.loc[start:start+pd.Timedelta(days=6)].astype(int).tolist()})
    training=[r for r in records if r['split']=='train']
    model=DecisionTreeRegressor(max_depth=8,min_samples_leaf=8,random_state=SEED)
    model.fit([r['features'] for r in training],[r['label'] for r in training])
    metrics={}
    for split in ['validation','test']:
        subset=[r for r in records if r['split']==split];totals={method:{k:0. for k in ['cost','shortage','waste','remaining','ordered']} for method in ['ml2','teacher','baseline']};matched=0;regret=[]
        for r in subset:
            f=np.array(r['forecast']);c=r['conditions'];a=decode(model.predict([r['features']])[0],f,c)
            # Baseline: replenish forecast gap from receipt over the shelf window.
            arrival=3;window=min(c['shelf_days'],7-arrival)
            usable_stock=max(0,c['stock_qty']-f[:arrival].sum()) if c['stock_life']>arrival else 0
            baseline=(int(np.ceil(max(0,f[arrival:arrival+window].sum()-usable_stock-c['inbound_qty'])/c['pack_units'])),0,0)
            matched+=a==tuple(r['label']);forecast_cost=float(evaluate(f,c,[a])['cost'][0]);regret.append(forecast_cost-r['teacher_forecast_cost'])
            r['prediction']=list(a);r['forecast_regret']=regret[-1];r['evaluations']={}
            for method,action in [('ml2',a),('teacher',r['label']),('baseline',baseline)]:
                result={k:float(v[0]) for k,v in evaluate(r['actual'],c,[action]).items()};r['evaluations'][method]=result
                for k in totals[method]:totals[method][k]+=result[k]
        metrics[split]={'scenarios':len(subset),'exact_action_match_pct':100*matched/len(subset),'mean_forecast_cost_regret':float(np.mean(regret)),'real_sales_totals':totals}
    report={'source_sha256':digest,'seed':SEED,'first_model_cutoff':str(FIRST_CUTOFF.date()),'feature_names':NAMES,'second_model':'DecisionTreeRegressor multi-output: packs, order delay 0-2 days, transport 0 normal/1 express; rounded and clipped','fixed_parameters':{'max_depth':8,'min_samples_leaf':8},'counts':{split:sum(r['split']==split for r in records) for split in ['train','validation','test']},'metrics':metrics,'warning':'Costs, distance, expiry, stock and inbound are synthetic. Single order over seven days; no routing optimization. Previously inspected M5 data, not new unseen real-world evidence. Teacher uses forecasts only, never actual future labels. Main deployed model unchanged. Full purchase cost and disposal fee charged; terminal stock not credited.'}
    assert hashlib.sha256(source.read_bytes()).hexdigest()==digest
    OUTPUT.mkdir(exist_ok=True)
    (OUTPUT/'purchase_model_dataset.json').write_text(json.dumps(records,indent=2),encoding='utf-8')
    (OUTPUT/'purchase_model_report.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
    (OUTPUT/'purchase_first_models.json').write_text(json.dumps(first_models),encoding='utf-8')
    joblib.dump(model,OUTPUT/'purchase_model.joblib')
    cards=''
    for split,m in metrics.items():
        rows=''.join(f'<tr><td>{name}</td><td>{v["cost"]:.2f}</td><td>{v["shortage"]:.0f}</td><td>{v["waste"]:.0f}</td><td>{v["remaining"]:.0f}</td></tr>' for name,v in m['real_sales_totals'].items())
        cards+=f'<section><h2>{split}: {m["scenarios"]} สถานการณ์</h2><p>เลือกแผนตรงกับตัวสร้างคำตอบ {m["exact_action_match_pct"]:.1f}% · ต้นทุนบนคำทำนายเกินแผนตัวสร้างคำตอบเฉลี่ย {m["mean_forecast_cost_regret"]:.2f} บาทสมมุติ</p><div style="overflow:auto"><table><tr><th>วิธี</th><th>ต้นทุนรวมสมมุติ</th><th>ของขาด</th><th>หมดอายุ</th><th>เหลือ</th></tr>{rows}</table></div></section>'
    page='<!doctype html><html lang="th"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>โมเดลจัดซื้อชั้นที่สอง</title><style>body{font:15px Tahoma;line-height:1.8;background:#9585e9;color:#30313e}main{max-width:1050px;margin:auto}section{background:white;padding:24px;border-radius:14px;margin:20px 0}table{width:100%;white-space:nowrap;border-collapse:collapse}td,th{padding:10px;border-bottom:1px solid #eee;text-align:right}td:first-child,th:first-child{text-align:left}</style><main><section><h1>ต้นแบบโมเดลจัดซื้อชั้นที่สอง</h1><p>ข้อมูลยอดขายจริง M5 + เงื่อนไขจำลองที่เปิดเผย · ยังไม่แทนระบบบนเว็บ</p><p>ชั้นแรก Linear Regression ฝึกถึง 31 ธ.ค. 2014 ทำนายต่อเนื่อง 7 วันจากประวัติก่อนวันตัดสินใจ ชั้นที่สอง Decision Tree เรียนรู้จำนวนแพ็ก วันรอสั่ง และวิธีขนส่งจากแผนที่ค้นหาต้นทุนต่ำสุดบนคำทำนาย ไม่ใช้ยอดขายอนาคตสร้างคำตอบ</p><p>ฝึกสถานการณ์ปี 2015 ถึง ต.ค. ตรวจสอบ พ.ย.–ธ.ค. ทดสอบ ม.ค.–พ.ค. 2016 แบ่งตามวัน ไม่สุ่มแถวจากวันเดียวกันข้ามชุด ข้อมูล M5 เคยตรวจแล้ว ไม่ใช่ข้อมูลอนาคตชุดใหม่</p><p>ต้นทุนสมมุติ: ราคาซื้อ 20/40 บาทต่อหน่วย ของขาด 2 เท่าราคาซื้อ ค่ากำจัด 10% ของราคาซื้อ แพ็ก 6 หน่วย ระยะทาง 10/30/60 กม. ส่งปกติรอ 3 วัน ค่าส่ง 15 + 0.4 × กม.; ส่งด่วนรอ 1 วัน ค่าส่ง 40 + 0.8 × กม. เวลาและค่าใช้จ่ายเป็นตัวเลือกจำลอง ไม่ใช่ข้อมูลผู้ขนส่งจริง อายุขาย 2/4/7 วัน</p><p>ml2 = โมเดลที่ฝึก; teacher = ตัวค้นหาแผนจากคำทำนาย; baseline = วิธีเติมของตามยอดคาดการณ์แบบง่าย ต้นทุนคิดราคาซื้อเต็ม ค่าส่ง ค่าขาด และค่ากำจัด ไม่หักมูลค่าของเหลือหลังวัน 7 จึงเป็นผลภายใต้ขอบเขตนี้เท่านั้น</p></section>'+cards+'<section><p>ตารางประเมินด้วยยอดขายจริงในแต่ละสถานการณ์ แต่สต็อก ต้นทุน อายุ และการส่งเป็นสมมุติ สถานการณ์หลายชุดใช้ยอดขายช่วงเดียวกัน จึงไม่ใช่ตัวอย่างอิสระทั้งหมด ไม่ยืนยันว่าช่วยร้านจริง และเปอร์เซ็นต์ตรงกับแผนตัวสร้างคำตอบไม่ใช่ความแม่นยำยอดขาย</p><p>SHA256 ยอดขาย: '+digest+'</p></section></main></html>'
    (OUTPUT/'purchase_model_report.html').write_text(page,encoding='utf-8')
    print(json.dumps(report,indent=2))

if __name__=='__main__':main()
