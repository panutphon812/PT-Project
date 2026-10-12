import {DatabaseSync,backup} from 'node:sqlite';
import {readFile,mkdir,stat} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateConfig,validateDataset} from './retail_engine.mjs';
const root=dirname(fileURLToPath(import.meta.url)),assets=resolve(root,'../Dataset/m5-forecasting-accuracy/ai_results/retail');
export async function retailHandler(storage){
 await mkdir(storage,{recursive:true});const dbFile=resolve(storage,'retail.sqlite');let exists=true;try{await stat(dbFile)}catch(e){if(e.code!=='ENOENT')throw e;exists=false}
 const db=new DatabaseSync(dbFile);
 if(!exists)db.exec('CREATE TABLE workspace (id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL, payload TEXT NOT NULL, saved_at TEXT NOT NULL);');
 else if(!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='workspace'").get()){db.close();throw Error('ฐานข้อมูลแผนจัดซื้อไม่ตรงรุ่น ไม่แก้โครงสร้างอัตโนมัติ')}
 let queue=Promise.resolve();
 const handler=async(req,res,url)=>{
  if(!['/','/retail','/retail/'].includes(url.pathname)&&!url.pathname.startsWith('/retail/'))return false;
  const send=(code,data)=>{res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data))};
  try{
   if(url.pathname==='/retail/api/workspace'){
    if(req.method==='GET'){await queue;const row=db.prepare('SELECT * FROM workspace WHERE id=1').get();send(200,row?{revision:row.revision,state:JSON.parse(row.payload),savedAt:row.saved_at}:{revision:0,state:null});return true}
    if(req.method!=='PUT'){send(405,{error:'ไม่รองรับคำขอ'});return true}
    if(req.headers['x-forecast-app']!=='1'||(req.headers.origin&&req.headers.origin!==`http://${req.headers.host}`)){send(403,{error:'คำขอไม่ได้มาจากเว็บแอปนี้'});return true}
    let size=0,chunks=[];for await(const b of req){size+=b.length;if(size>5*1024*1024){send(413,{error:'ข้อมูลเกิน 5 MB'});return true}chunks.push(b)}
    const value=JSON.parse(Buffer.concat(chunks).toString('utf8'));
    const state=value.state;if(!state||!Number.isSafeInteger(value.revision)||value.revision<0||!state.dataset||!Array.isArray(state.dataset.products))throw Error('ข้อมูลที่บันทึกไม่ถูกต้อง');
    validateDataset(state.dataset);const ps=state.dataset.products;
    for(const p of ps)if(typeof p.item!=='string'||!Array.isArray(p.sales)||p.sales.length<28||p.sales.length>10000||p.sales.some(v=>!Number.isSafeInteger(v)||v<0))throw Error('ประวัติยอดขายไม่ถูกต้อง');
    validateConfig(state.config,ps.map(p=>p.item),state.dataset.latest);
    const work=queue.then(async()=>{const old=db.prepare('SELECT revision FROM workspace WHERE id=1').get();if((old?.revision||0)!==value.revision){send(409,{error:'ข้อมูลเปลี่ยนจากอีกหน้าต่าง กรุณาโหลดข้อมูลที่บันทึกใหม่'});return}
     // Verified SQLite API backup includes committed WAL; never copy just the main file.
     if(old){const folder=resolve(storage,'backups');await mkdir(folder,{recursive:true});const target=resolve(folder,`retail-${Date.now()}.sqlite`);await backup(db,target);const check=new DatabaseSync(target,{readOnly:true});try{if(check.prepare('PRAGMA integrity_check').get().integrity_check!=='ok')throw Error('ตรวจสำรองฐานข้อมูลไม่ผ่าน')}finally{check.close()}}
     const revision=value.revision+1,savedAt=new Date().toISOString();db.prepare('INSERT INTO workspace VALUES (1,?,?,?) ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,payload=excluded.payload,saved_at=excluded.saved_at').run(revision,JSON.stringify(state),savedAt);send(200,{revision,savedAt});
    });queue=work.catch(()=>{});await work;return true;
   }
   if(req.method!=='GET'){send(405,{error:'ไม่รองรับคำขอ'});return true}
   const name=['/','/retail','/retail/'].includes(url.pathname)?'retail.html':url.pathname.slice('/retail/'.length);
   const mapping={'retail.html':[root,'retail.html','text/html'],'retail.css':[root,'retail.css','text/css'],'retail_ui.mjs':[root,'retail_ui.mjs','text/javascript'],'retail_engine.mjs':[root,'retail_engine.mjs','text/javascript'],'bundle.json':[assets,'bundle.json','application/json'],'policy_report.json':[assets,'policy_report.json','application/json'],'predictions.csv':[assets,'predictions.csv','text/csv']};
   if(!mapping[name]){send(404,{error:'ไม่พบหน้า'});return true}
   const [base,file,mime]=mapping[name];res.writeHead(200,{'Content-Type':mime+'; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(await readFile(resolve(base,file)));return true;
  }catch(e){send(e.code==='ENOENT'?503:400,{error:e.code==='ENOENT'?'ยังไม่มีโมเดล กรุณารัน retail_train.py ก่อน':e.message});return true}
 };handler.close=()=>db.close();return handler;
}
