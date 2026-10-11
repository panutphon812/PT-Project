// Public demo storage is scoped to this browser; no local shop data is uploaded.
async function api(path,body){
 const key='forecast-studio-online-v1';
 const read=()=>{const raw=localStorage.getItem(key);return raw?JSON.parse(raw):{purchases:[],plans:{revision:0,items:{}}}};
 const action=()=>{
  const state=read();
  if(body===undefined){if(path==='/api/workspace')return {dataset:null,purchases:state.purchases};if(path==='/api/lot-plans')return state.plans}
  const input=body===undefined?null:JSON.parse(body);
  if(path==='/api/purchases'&&input){
   const model=builtInModels[input.item];if(!model||input.date!=='2016-05-23'||!Number.isSafeInteger(input.stock)||input.stock<0||!Number.isSafeInteger(input.pack)||input.pack<1)throw new Error('ข้อมูลคำแนะนำไม่ถูกต้อง');
   const existing=state.purchases.find(r=>r.requestId===input.requestId);if(existing)return existing;
   const prediction=infer(model,model.history,input.date),packs=Math.ceil(Math.max(0,prediction-input.stock)/input.pack);
   const row={...input,id:crypto.randomUUID(),datasetName:'M5 · CA_1',savedAt:new Date().toISOString(),prediction,packs,units:packs*input.pack};state.purchases=[row,...state.purchases].slice(0,500);localStorage.setItem(key,JSON.stringify(state));return row;
  }
  if(path==='/api/lot-plans'&&input){
   if(input.revision!==state.plans.revision)throw new Error('ข้อมูลเปลี่ยนจากอีกหน้าต่าง กรุณาโหลดข้อมูลที่บันทึกแล้ว');
   planLots(builtInModels[input.item],input.options,input.lots,infer,input.inbound);
   state.plans={revision:state.plans.revision+1,items:{...state.plans.items,[input.item]:{options:input.options,lots:input.lots,inbound:input.inbound,savedAt:new Date().toISOString()}}};localStorage.setItem(key,JSON.stringify(state));return state.plans;
  }
  throw new Error('ไม่รองรับรายการนี้ในเว็บสาธิต');
 };
 try{return navigator.locks?await navigator.locks.request(key,action):action()}catch(e){if(e.name==='QuotaExceededError'||e.name==='SecurityError')throw new Error('เบราว์เซอร์ไม่อนุญาตให้บันทึกข้อมูล โปรดเปิดการเก็บข้อมูลเว็บไซต์');throw e}
}
