import {readFile,writeFile,rename} from 'node:fs/promises';
import {resolve} from 'node:path';
const ITEMS=['FOODS_1_085','FOODS_2_019','FOODS_2_197','FOODS_3_377','FOODS_3_064'];
const date=d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&Number.isFinite(Date.parse(d+'T00:00:00Z'))&&new Date(d+'T00:00:00Z').toISOString().slice(0,10)===d;
export function validatePlanner(input){
 if(!ITEMS.includes(input.item)||!Number.isSafeInteger(input.revision)||input.revision<0)throw new Error('สินค้า หรือรุ่นข้อมูลไม่ถูกต้อง');
 const {lead,shelf,pack}=input.options||{};
 if(!Number.isSafeInteger(lead)||lead<0||lead>30||!Number.isSafeInteger(shelf)||shelf<1||shelf>30||!Number.isSafeInteger(pack)||pack<1||pack>1000000)throw new Error('เงื่อนไขการซื้อไม่ถูกต้อง');
 const clean=(rows,pending)=>{
  if(!Array.isArray(rows)||rows.length>50)throw new Error('รองรับไม่เกิน 50 ล็อตต่อประเภท');
  return rows.map(r=>{
   if(!Number.isSafeInteger(r.qty)||r.qty<(pending?1:0)||r.qty>1000000||!date(r.expires)||pending&&(!date(r.arrives)||r.arrives<'2016-05-23'||r.expires<r.arrives))throw new Error('จำนวนหรือวันที่ล็อตไม่ถูกต้อง');
   return pending?{qty:r.qty,arrives:r.arrives,expires:r.expires}:{qty:r.qty,expires:r.expires};
  });
 };
 return {options:{lead,shelf,pack},lots:clean(input.lots,false),inbound:clean(input.inbound,true)};
}
export async function plannerStore(storage){
 const path=resolve(storage,'lot-plans.json');let state={revision:0,items:{}};
 try{state=JSON.parse(await readFile(path,'utf8'));if(!Number.isSafeInteger(state.revision)||!state.items)throw new Error('ข้อมูลแผนล็อตเสียหาย')}catch(e){if(e.code!=='ENOENT')throw e}
 return {get:()=>state,save:async input=>{
  const value=validatePlanner(input);
  if(input.revision!==state.revision)throw new Error('ข้อมูลถูกบันทึกจากอีกหน้าต่าง กรุณาโหลดข้อมูลที่บันทึกแล้วก่อนแก้ไขอีกครั้ง');
  const next={revision:state.revision+1,items:{...state.items,[input.item]:{...value,savedAt:new Date().toISOString()}}};
  await writeFile(path+'.tmp',JSON.stringify(next),'utf8');await rename(path+'.tmp',path);state=next;return state;
 }};
}
