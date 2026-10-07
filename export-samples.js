// Independent sample export: never opens or changes the live demo database.
import { mkdirSync,writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { openDatabase,seedDemo } from './db.js';
const db=openDatabase(':memory:');
seedDemo(db,new Date('2026-10-07T05:00:00Z'));
const root=fileURLToPath(new URL('./sample-data/',import.meta.url));
mkdirSync(root,{recursive:true});
function exportCsv(name,rows){
 const keys=Object.keys(rows[0]);
 const cell=v=>'"'+String(v??'').replaceAll('"','""')+'"';
 const content=[keys,...rows.map(row=>keys.map(key=>row[key]))].map(row=>row.map(cell).join(',')).join('\r\n');
 writeFileSync(root+name,'\uFEFF'+content,'utf8');
}
exportCsv('products-500.csv',db.prepare('SELECT * FROM products ORDER BY id').all());
exportCsv('sales-28-days.csv',db.prepare(`SELECT s.id AS sale_id,s.created_at,p.sku,i.quantity,i.price_cents,s.total_cents,s.paid_cents
 FROM sales s JOIN sale_items i ON s.id=i.sale_id JOIN products p ON p.id=i.product_id ORDER BY s.created_at,s.id`).all());
db.close();
console.log('Exported standalone samples to sample-data/');
