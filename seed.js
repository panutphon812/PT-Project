import { openDatabase,seedDemo } from './db.js';
import { fileURLToPath } from 'node:url';
const db=openDatabase(process.env.DB_PATH||fileURLToPath(new URL('./data/grocery.sqlite',import.meta.url)));
console.log(seedDemo(db)?'สร้างข้อมูลจำลอง 500 SKU และยอดขาย 28 วันแล้ว':'มีข้อมูลอยู่แล้ว: ไม่เขียนทับ');
db.close();
