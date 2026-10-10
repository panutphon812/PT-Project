import http from 'node:http';
import {readFile,mkdir,writeFile,rename} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
const root=dirname(fileURLToPath(import.meta.url));
const assets=resolve(root,'../Dataset/m5-forecasting-accuracy/ai_results');
const engine=vm.createContext({});
vm.runInContext(await readFile(resolve(root,'import_data.js'),'utf8')+`;function shift(v,n){const d=new Date(v+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)};globalThis.engine={parseSalesCSV,trainImported,infer};`,engine);
export async function createApp(storage=resolve(root,'../../data/forecast-webapp')){
 await mkdir(storage,{recursive:true});const stateFile=resolve(storage,'workspace.json');
 let state={dataset:null,purchases:[]};try{state=JSON.parse(await readFile(stateFile,'utf8'))}catch(e){if(e.code!=='ENOENT')throw new Error('ไฟล์ข้อมูลที่บันทึกไว้เสียหาย กรุณาตรวจไฟล์ก่อนเปิดระบบ',{cause:e})}
 let writes=Promise.resolve(),mutations=Promise.resolve();
 const save=()=>{const json=JSON.stringify(state);writes=writes.catch(()=>{}).then(async()=>{const temp=stateFile+'.tmp';await writeFile(temp,json,'utf8');await rename(temp,stateFile)});return writes};
 return http.createServer(async(req,res)=>{
  const send=(code,value)=>{res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(value))};
  try{
   const url=new URL(req.url,'http://localhost');
   if(req.headers.host&&!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(req.headers.host))return send(403,{error:'เปิดใช้งานผ่าน localhost เท่านั้น'});
   if(req.method==='POST'){
    if(req.headers['x-forecast-app']!=='1'||(req.headers.origin&&req.headers.origin!==`http://${req.headers.host}`))return send(403,{error:'คำขอไม่ได้มาจากเว็บแอปนี้'});
    let bytes=0,chunks=[];for await(const chunk of req){bytes+=chunk.length;if(bytes>5*1024*1024)return send(413,{error:'ข้อมูลต้องไม่เกิน 5 MB'});chunks.push(chunk)}
    const body=Buffer.concat(chunks).toString('utf8');
    const prior=mutations;let release;mutations=new Promise(r=>release=r);await prior;
    try{
    if(url.pathname==='/api/purchases'){
     const input=JSON.parse(body);const {item,date,stock,pack}=input;
     const datasetId='m5';
     if(input.datasetId!==datasetId)throw new Error('ชุดข้อมูลเปลี่ยนจากอีกหน้าต่าง กรุณารีโหลดและทำนายใหม่ก่อนบันทึก');
     if(typeof input.requestId!=='string'||!/^[-a-f0-9]{36}$/.test(input.requestId))throw new Error('รหัสรายการบันทึกไม่ถูกต้อง');
     const existing=state.purchases.find(r=>r.requestId===input.requestId);if(existing){if(existing.item!==item||existing.date!==date||existing.stock!==stock||existing.pack!==pack)throw new Error('รหัสรายการนี้ถูกใช้กับคำแนะนำอื่นแล้ว');return send(200,existing)}
     if(!Number.isSafeInteger(stock)||stock<0||stock>1e6||!Number.isSafeInteger(pack)||pack<1||pack>1e6)throw new Error('สต็อกหรือขนาดแพ็กไม่ถูกต้อง');
     let prediction;
{const page=await readFile(resolve(assets,'forecast_demo.html'),'utf8');const match=page.match(/const builtInModels\s*=\s*(\{.*?\});/s);if(!match)throw new Error('อ่านโมเดล M5 ไม่สำเร็จ');const m=JSON.parse(match[1])[item];if(!m||date!=='2016-05-23')throw new Error('วันหรือรหัสสินค้าไม่ถูกต้อง');prediction=engine.engine.infer(m,m.history,date)}
     const packs=Math.ceil(Math.max(0,prediction-stock)/pack);const row={id:crypto.randomUUID(),requestId:input.requestId,datasetId,datasetName:'M5 · CA_1',savedAt:new Date().toISOString(),item,date,prediction,stock,pack,packs,units:packs*pack};
     const previous=state;state={...state,purchases:[row,...state.purchases].slice(0,500)};try{await save()}catch(e){state=previous;throw e}return send(200,row);
    }
    return send(404,{error:'ไม่พบรายการ'});
    }finally{release()}
   }
   if(req.method!=='GET')return send(405,{error:'ไม่รองรับคำขอนี้'});
   if(url.pathname==='/api/workspace'){await mutations;return send(200,{dataset:null,purchases:state.purchases})}
   const files={'/':'forecast_demo.html','/forecast_demo.html':'forecast_demo.html','/forecast_report.html':'forecast_report.html','/improvement_report.html':'improvement_report.html','/calendar_report.html':'calendar_report.html','/boosting_report.html':'boosting_report.html'};
   if(['/simulation.js','/simulation_ui.js'].includes(url.pathname)){res.writeHead(200,{'Content-Type':'text/javascript; charset=utf-8','Cache-Control':'no-store'});return res.end(await readFile(resolve(root,url.pathname.slice(1))))}
   if(url.pathname==='/webapp_client.js'){res.writeHead(200,{'Content-Type':'text/javascript; charset=utf-8'});return res.end(await readFile(resolve(root,'webapp_client.js')))}
   if(url.pathname==='/webapp.css'){res.writeHead(200,{'Content-Type':'text/css; charset=utf-8'});return res.end(await readFile(resolve(root,'webapp.css')))}
   const file=files[url.pathname];if(!file)return send(404,{error:'ไม่พบหน้า'});
   let body=await readFile(resolve(assets,file),'utf8');
   if(file==='forecast_demo.html')body=body.replace('<style>','<link rel="stylesheet" href="/webapp.css"><style>').replace('Offline workspace','Web app · บันทึกข้อมูลได้').replace('ข้อมูลจะประมวลผลในเครื่องและหายเมื่อปิดหรือรีโหลดหน้า','ข้อมูลจะส่งไปฝึกบนเซิร์ฟเวอร์ในเครื่องและบันทึกไว้ เปิดหน้าใหม่แล้วใช้งานต่อได้').replace('</html>','<script src="/webapp_client.js"></script><script src="/simulation.js"></script><script src="/simulation_ui.js"></script></html>');
   res.writeHead(200,{'Content-Type':file.endsWith('.csv')?'text/csv; charset=utf-8':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(body);
  }catch(e){sendError(res,e)}
 });
}
function sendError(res,e){if(!res.headersSent){res.writeHead(e.code==='ENOENT'?503:400,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify({error:e.code==='ENOENT'?'ยังไม่มีชุดสาธิต กรุณาสร้าง forecast_demo.html ก่อน':e.message}))}else res.end()}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){const port=Number(process.env.FORECAST_PORT||8768);(await createApp()).listen(port,'127.0.0.1',()=>console.log(`Forecast web app: http://127.0.0.1:${port}`))}
