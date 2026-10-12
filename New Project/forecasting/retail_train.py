"""Reproducible shared-model M5 experiment for the approved 14-day scope."""
from pathlib import Path
import os,sys,json,hashlib,time
os.environ.setdefault('OMP_NUM_THREADS','2')
import numpy as np
import pandas as pd
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'data/ml-experiment-libs'))
import sklearn,joblib
from sklearn.ensemble import RandomForestRegressor
from sklearn.linear_model import LinearRegression
ROOT=Path(__file__).resolve().parent
DATA=ROOT.parent/'Dataset/m5-forecasting-accuracy'
OUT=DATA/'ai_results/retail';OUT.mkdir(parents=True,exist_ok=True)
FEATURES=['lag1','lag7','lag14','lag28','mean7','std7','zero28','log_mean28','weekday_sin','weekday_cos','year_sin','year_cos']

def features(history,date):
    a=np.asarray(history[-28:],float);scale=max(float(a.mean()),1.)
    d=pd.Timestamp(date);weekday=d.dayofweek;year=d.dayofyear
    return np.array([a[-1]/scale,a[-7]/scale,a[-14]/scale,a[-28]/scale,a[-7:].mean()/scale,a[-7:].std()/scale,float((a==0).mean()),np.log1p(a.mean()),np.sin(2*np.pi*weekday/7),np.cos(2*np.pi*weekday/7),np.sin(2*np.pi*year/365.25),np.cos(2*np.pi*year/365.25)]),scale

def predict(model,history,date):
    a=list(history);out=[]
    for h in range(14):
        d=pd.Timestamp(date)+pd.Timedelta(days=h)
        if model=='seasonal':v=a[-7]
        else:
            x,scale=features(a,d);v=max(0,float(model.predict([x])[0])*scale)
        a.append(v);out.append(v)
    return out

def metrics(rows):
    a=np.array([r['actual'] for r in rows]);p=np.array([r['prediction'] for r in rows]);e=np.abs(a-p)
    scaled=[abs(r['actual']-r['prediction'])/r['maseScale'] for r in rows if r['maseScale']>0]
    return dict(n=len(rows),MAE=float(e.mean()),RMSE=float(np.sqrt(np.mean((a-p)**2))),MASE=float(np.mean(scaled)) if scaled else None,maseExcluded=len(rows)-len(scaled),WAPE=float(e.sum()/a.sum()*100) if a.sum()>0 else None)

def tree_export(model):
    if isinstance(model,LinearRegression):return dict(type='linear',coef=model.coef_.tolist(),intercept=float(model.intercept_))
    return dict(type='forest',trees=[dict(left=e.tree_.children_left.tolist(),right=e.tree_.children_right.tolist(),feature=e.tree_.feature.tolist(),threshold=e.tree_.threshold.tolist(),value=e.tree_.value[:,0,0].tolist()) for e in model.estimators_])

def main():
    source=DATA/'sales_train_evaluation.csv';cal=pd.read_csv(DATA/'calendar.csv');dates=cal.date.tolist()[:1941]
    frame=pd.read_csv(source);frame=frame[frame.store_id=='CA_1'].copy()
    cols=[f'd_{i}' for i in range(1,1942)];cut=dates.index('2014-12-31')+1
    values=frame[cols].to_numpy(dtype=float)
    assert np.isfinite(values).all() and (values>=0).all() and (values==np.floor(values)).all(), 'Invalid sales in source'
    assert len(set(dates))==1941 and all(pd.Timestamp(dates[i])-pd.Timestamp(dates[i-1])==pd.Timedelta(days=1) for i in range(1,len(dates)))
    assert not frame.item_id.duplicated().any()
    selected=[];held=[];selection=[]
    for dept,group in frame.groupby('dept_id',sort=True):
        stats=[]
        for _,row in group.iterrows():
            a=row[cols[:cut]].to_numpy(dtype=float)
            if np.sum(a)>0 and np.count_nonzero(a)>100:
                stats.append((float((a==0).mean()),str(row.item_id),row))
        stats.sort(key=lambda r:(r[0],r[1]))
        # Choose one regular and one intermittent item by training-only zero-rate ranks.
        ix=[len(stats)//4,3*len(stats)//4,len(stats)//2]
        for k,j in enumerate(ix):
            row=stats[j][2];(selected if k<2 else held).append(row)
            selection.append(dict(item=str(row.item_id),dept=dept,role='main' if k<2 else 'heldout',trainingZeroRate=stats[j][0]))
    assert len(selected)==14 and len(held)==7
    series={str(r.item_id):r[cols].to_numpy(dtype=float).tolist() for r in selected+held}
    X=[];y=[]
    for r in selected:
        a=series[str(r.item_id)]
        for t in range(28,cut):
            x,s=features(a[t-28:t],dates[t]);X.append(x);y.append(a[t]/s)
    X=np.array(X);y=np.array(y)
    # Full forecast windows in validation never cross the test boundary.
    val_origins=['2015-02-01','2015-05-01','2015-08-01','2015-11-01']
    test_origins=[str(d.date()) for d in pd.date_range('2016-01-01','2016-05-08',freq='14D')]
    candidates=[('linear',{}),('forest_depth6',dict(max_depth=6,min_samples_leaf=12)),('forest_depth10',dict(max_depth=10,min_samples_leaf=8))]
    models={};val=[];timings={}
    def evaluate(name,model,items,origins,phase):
        rows=[]
        for item in items:
            a=series[item];scale=float(np.mean(np.abs(np.array(a[7:cut])-np.array(a[:cut-7]))))
            for origin in origins:
                t=dates.index(origin);pred=predict(model,a[:t],origin)
                for h,v in enumerate(pred):rows.append(dict(phase=phase,model=name,item=item,dept=item.rsplit('_',1)[0],origin=origin,date=dates[t+h],horizon=h+1,actual=a[t+h],prediction=v,maseScale=scale))
        return rows
    items=[str(r.item_id) for r in selected];newitems=[str(r.item_id) for r in held]
    for name,params in candidates:
        model=LinearRegression() if name=='linear' else RandomForestRegressor(n_estimators=60,random_state=812,n_jobs=2,**params)
        start=time.perf_counter();model.fit(X,y);timings[name]=dict(trainSeconds=time.perf_counter()-start)
        start=time.perf_counter();rows=evaluate(name,model,items,val_origins,'validation');timings[name]['validationSeconds']=time.perf_counter()-start
        models[name]=model;val.append(dict(model=name,params=params,**metrics(rows)))
        print('VALIDATION',name,val[-1],flush=True)
    forest=min([r for r in val if r['model'].startswith('forest')],key=lambda r:(r['MASE'],r['model']))['model']
    chosen=min([r for r in val if r['model'] in ('linear',forest)],key=lambda r:(r['MASE'],r['model']))['model']
    # Freeze and record the validation decision before the final test is opened.
    frozen=dict(selected=chosen,forest=forest,validation=val,features=FEATURES,trainEnd='2014-12-31',validationOrigins=val_origins,testOrigins=test_origins,seed=812,selection=selection,timings=timings)
    (OUT/'selection_frozen.json').write_text(json.dumps(frozen,ensure_ascii=False,indent=2),encoding='utf-8')
    rows=[]
    for name in ['linear',forest,'seasonal']:
        model='seasonal' if name=='seasonal' else models[name]
        rows+=evaluate(name,model,items,test_origins,'test')
        rows+=evaluate(name,model,newitems,test_origins,'new_items')
    pd.DataFrame(rows).to_csv(OUT/'predictions.csv',index=False)
    reports=[]
    for phase in ['test','new_items']:
        for name in ['linear',forest,'seasonal']:
            rs=[r for r in rows if r['phase']==phase and r['model']==name]
            reports.append(dict(phase=phase,model=name,group='overall',**metrics(rs)))
            for field in ['item','dept','horizon']:
                for v in sorted(set(r[field] for r in rs),key=str):reports.append(dict(phase=phase,model=name,group=field,value=v,**metrics([r for r in rs if r[field]==v])))
    sample=[dict(item=str(r.item_id),dept=str(r.dept_id),category=str(r.cat_id),sales=series[str(r.item_id)]) for r in selected]
    bundle=dict(schema=1,version=hashlib.sha256(source.read_bytes()).hexdigest()[:16],dates=dates,products=sample,models={name:tree_export(models[name]) for name in ['linear',forest]},selected=chosen,report=reports,experiment={**frozen,**dict(python=sys.version,numpy=np.__version__,sklearn=sklearn.__version__,sourceSHA256=hashlib.sha256(source.read_bytes()).hexdigest(),calendarSHA256=hashlib.sha256((DATA/'calendar.csv').read_bytes()).hexdigest(),inference='recursive 14 days; scale from preceding 28 observations only; no item identifier feature',notice='Retrospective M5 study. Some M5 products and periods were examined in earlier experiments; this is not a wholly unseen external dataset.',sources=['https://otexts.com/fpp3/regression.html','https://arxiv.org/abs/2602.00077','https://www.kaggle.com/competitions/m5-forecasting-accuracy/rules'])})
    for name,model in models.items():joblib.dump(model,OUT/(name+'.joblib'))
    (OUT/'bundle.json').write_text(json.dumps(bundle,ensure_ascii=False,separators=(',',':'),allow_nan=False),encoding='utf-8')
    pd.DataFrame([dict(date=d,item=p['item'],sales=p['sales'][i]) for p in sample for i,d in enumerate(dates)]).to_csv(OUT/'selected_14.csv',index=False)
    # Independent scikit-learn reference for browser replay tests.
    replay=[]
    for p in sample:
        for name,model in models.items():
            if name not in ['linear',forest]:continue
            history=p['sales'][-56:];replay.append(dict(item=p['item'],model=name,history=history,date='2016-05-23',expected=predict(model,history,'2016-05-23')))
    (OUT/'replay.json').write_text(json.dumps(replay),encoding='utf-8')
    print('DONE',chosen,'test rows',len(rows),flush=True)
if __name__=='__main__':main()
