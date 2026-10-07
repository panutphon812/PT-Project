import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { openDatabase, seedDemo } from './db.js';
import { createService } from './service.js';

const root=fileURLToPath(new URL('.',import.meta.url));
export function makeServer(db){
  const service=createService(db);
  return createServer(async(req,res)=>{
    const send=(status,value)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
    try{
      const url=new URL(req.url,'http://localhost');
      if(req.method==='GET' && !url.pathname.startsWith('/api/')){
        const file={'/':'index.html','/app.js':'app.js','/style.css':'style.css','/basket-ui.js':'basket-ui.js'}[url.pathname];
        if(!file)return send(404,{error:'ไม่พบหน้า'});
        res.writeHead(200,{'Content-Type':file.endsWith('js')?'text/javascript; charset=utf-8':file.endsWith('css')?'text/css; charset=utf-8':'text/html; charset=utf-8','X-Content-Type-Options':'nosniff'});
        return res.end(readFileSync(join(root,'public',file)));
      }
      if(req.method==='GET'){
        if(url.pathname==='/api/products')return send(200,service.products());
        if(url.pathname==='/api/dashboard')return send(200,service.dashboard());
        if(url.pathname==='/api/baskets'){
          const options={};
          for(const key of ['min_bills','min_pair_count','min_support','min_confidence','min_lift']){
            if(url.searchParams.has(key))options[key]=Number(url.searchParams.get(key));
          }
          return send(200,service.baskets(Number(url.searchParams.get('days')||28),options));
        }
        if(url.pathname==='/api/recommendations')return send(200,service.recommendations(Number(url.searchParams.get('days')||28)));
        if(url.pathname==='/api/sales')return send(200,service.history());
        if(/^\/api\/sales\/\d+$/.test(url.pathname))return send(200,service.receipt(Number(url.pathname.split('/').at(-1))));
        if(/^\/api\/movements\/\d+$/.test(url.pathname))return send(200,service.movements(Number(url.pathname.split('/').at(-1))));
      }
      if(req.method==='POST'){
        const origin=req.headers.origin;
        if(origin && origin!==`http://${req.headers.host}`)return send(403,{error:'ไม่อนุญาตคำขอจากเว็บอื่น'});
        let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>100_000)return send(413,{error:'ข้อมูลใหญ่เกินไป'});}
        let body;try{body=JSON.parse(raw);}catch{return send(400,{error:'รูปแบบข้อมูลไม่ถูกต้อง'});}
        if(url.pathname==='/api/checkout')return send(200,service.checkout(body));
        if(url.pathname==='/api/stock')return send(200,service.stock(body));
        if(url.pathname==='/api/products')return send(200,service.saveProduct(body));
      }
      send(404,{error:'ไม่พบรายการ'});
    }catch(error){send(400,{error:error.message});}
  });
}
if(process.argv[1] && fileURLToPath(import.meta.url)===process.argv[1]){
  const db=openDatabase(process.env.DB_PATH||join(root,'data','grocery.sqlite'));
  seedDemo(db);
  const port=Number(process.env.PORT||3000);
  makeServer(db).listen(port,'127.0.0.1',()=>console.log(`Grocery prototype: http://localhost:${port}`));
}
