export type N = number | null;
export const serviceNames=['Biokimi','Mikrobiologji','Alergji e intolerancë','Endokrinologji','Gjinekologji','Pediatri e familjare','Paketa për punonjës','Laborator outsource'];
export const personnelNames=['Laborator','Infermier/e','Mjekë me pagë fikse','Recepsion / administratë','Pastrimi','Menaxhment'];
export const overheadNames=['Qiraja','Energjia / uji / interneti','Mirëmbajtja / kalibrimi','Sigurimet / administrata','Marketing media','Marketing prodhim / menaxhim','Software / telefoni','Shërbime profesionale','Të tjera fikse'];
export const months=Array.from({length:39},(_,i)=>new Date(Date.UTC(2026,9+i,1)).toISOString().slice(0,7));
export type Service={volume:N;price:N;cost:N;doctor:N;other:N};
export type Cash={investment:N;oneOff:N;oldReceipts:N;funding:N;otherPayments:N};
export type Assumptions={volume:number[];growth:number[];price:number[];cost:number[]};
export const scenarios:Record<string,Assumptions>={
  'Kujdesshëm':{volume:[.5,.8,.8,.8],growth:[0,0,0,0],price:[0,0,0,0],cost:[0,0,.05,.1025]},
  'Bazë':{volume:[.75,1,1,1],growth:[0,0,.1,.21],price:[0,0,.02,.0404],cost:[0,0,.03,.0609]},
  'Zgjerim':{volume:[1,1.2,1.2,1.2],growth:[0,0,.2,.44],price:[0,0,.03,.0609],cost:[0,0,.02,.0404]},
};
export type BusinessInputs={activeBusinesses:N;activeOutsource:N;conversion:N;mediaBudget:N;contactCost:N;appointmentRate:N;visitRate:N};
export const emptyBusiness=():BusinessInputs=>({activeBusinesses:null,activeOutsource:null,conversion:null,mediaBudget:null,contactCost:null,appointmentRate:null,visitRate:null});
export type Plan={b2b?:BusinessInputs;services:Service[];personnel:{fte:N;salary:N;extra:N}[];overhead:N[];opening:N;reserve:N;collections:N[];cash:Cash[];scenario:string;assumptions:Assumptions;note:string;approvedBy:string;history:{at:string;note:string}[]};
export function emptyPlan():Plan{return {b2b:emptyBusiness(),services:serviceNames.map(()=>({volume:null,price:null,cost:null,doctor:null,other:null})),personnel:personnelNames.map(()=>({fte:null,salary:null,extra:null})),overhead:overheadNames.map(()=>null),opening:null,reserve:null,collections:[null,null,null],cash:months.map(()=>({investment:null,oneOff:null,oldReceipts:null,funding:null,otherPayments:null})),scenario:'Bazë',assumptions:structuredClone(scenarios['Bazë']),note:'',approvedBy:'',history:[]};}
const valid=(n:unknown):n is number=>typeof n==='number'&&Number.isFinite(n)&&n>=0;
const known=(a:unknown[]):a is number[]=>a.every(valid);
export function validatePlan(p:Plan):string[]{
  const errors:string[]=[];
  for(const [i,s] of p.services.entries()){
    if(Object.values(s).some(x=>x!==null&&!valid(x)))errors.push(`${serviceNames[i]}: hyrje jonegative dhe të fundme.`);
    if((s.doctor!==null&&s.doctor>1)||(s.other!==null&&s.other>1)||(s.doctor!==null&&s.other!==null&&s.doctor+s.other>1))errors.push(`${serviceNames[i]}: pjesët së bashku duhet të jenë ≤ 1.`);
  }
  if(p.collections.some(x=>x!==null&&(!valid(x)||x>1)) || (known(p.collections)&&Math.abs(p.collections.reduce((a,b)=>a+b,0)-1)>.00001))errors.push('Pjesët e arkëtimit duhet të jenë 0–1 dhe të kenë shumën 1.');
  const values=[...p.personnel.flatMap(x=>Object.values(x)),...p.overhead,p.opening,p.reserve,...p.cash.flatMap(x=>Object.values(x))];
  if(values.some(x=>x!==null&&!valid(x)))errors.push('Kostot, investimet dhe paraja duhet të jenë jonegative.');
  if(p.personnel.some(x=>x.extra!==null&&x.extra>1))errors.push('Kostoja shtesë e pagës duhet të jetë 0–1.');
  if(Object.values(p.assumptions).some(a=>a.length!==4||!known(a)))errors.push('Plotëso të katër vitet e supozimeve me vlera jonegative.');
  if(p.b2b)errors.push(...businessModel(p.b2b).errors);
  return errors;
}
export function isPlan(value:unknown):value is Plan {
  if(!value||typeof value!=='object')return false;
  const p=value as Plan;const fields=(x:any,keys:string[])=>x&&keys.every(k=>x[k]===null||valid(x[k]));
  return (!p.b2b||fields(p.b2b,['activeBusinesses','activeOutsource','conversion','mediaBudget','contactCost','appointmentRate','visitRate']))&&Array.isArray(p.services)&&p.services.length===8&&p.services.every(s=>fields(s,['volume','price','cost','doctor','other']))&&Array.isArray(p.personnel)&&p.personnel.length===6&&p.personnel.every(s=>fields(s,['fte','salary','extra']))&&Array.isArray(p.overhead)&&p.overhead.length===9&&p.overhead.every(x=>x===null||valid(x))&&Array.isArray(p.cash)&&p.cash.length===39&&p.cash.every(s=>fields(s,['investment','oneOff','oldReceipts','funding','otherPayments']))&&Array.isArray(p.collections)&&p.collections.length===3&&p.collections.every(x=>x===null||valid(x))&&fields(p,['opening','reserve'])&&typeof p.scenario==='string'&&typeof p.note==='string'&&typeof p.approvedBy==='string'&&Array.isArray(p.history)&&p.history.every(x=>typeof x.at==='string'&&typeof x.note==='string')&&!!p.assumptions&&['volume','growth','price','cost'].every(k=>Array.isArray(p.assumptions[k as keyof Assumptions])&&p.assumptions[k as keyof Assumptions].length===4&&known(p.assumptions[k as keyof Assumptions]));
}
export type MonthResult={month:string;fraction:number;revenue:N;variable:N;contribution:N;fixed:N;operating:N;collections:N;outflow:N;net:N;opening:N;closing:N;gap:N;breakEven:N};
export function project(p:Plan,volumeSensitivity=1):{errors:string[];rows:MonthResult[];baseRevenue:N;fixed:N}{
  const errors=validatePlan(p); if(errors.length)return {errors,rows:[],baseRevenue:null,fixed:null};
  const serviceComplete=p.services.every(s=>known(Object.values(s)));
  const baseRevenue=serviceComplete?p.services.reduce((sum,s)=>sum+s.volume!*s.price!,0):null;
  const direct=serviceComplete?p.services.reduce((sum,s)=>sum+s.volume!*s.cost!,0):null;
  const shares=serviceComplete?p.services.reduce((sum,s)=>sum+s.volume!*s.price!*(s.doctor!+s.other!),0):null;
  const fixedComplete=p.personnel.every(s=>known(Object.values(s)))&&known(p.overhead);
  const fixed=fixedComplete?p.personnel.reduce((sum,s)=>sum+s.fte!*s.salary!*(1+s.extra!),0)+p.overhead.reduce<number>((sum,n)=>sum+n!,0):null;
  const collectionReady=known(p.collections);
  const rows:MonthResult[]=[];
  months.forEach((month,i)=>{
    const year=Number(month.slice(0,4))-2026;const fraction=i===0?14/31:1;
    const factor=p.assumptions.volume[year]*(1+p.assumptions.growth[year])*volumeSensitivity;
    const price=1+p.assumptions.price[year],cost=1+p.assumptions.cost[year];
    const revenue=baseRevenue===null?null:baseRevenue*fraction*factor*price;
    const variable=direct===null?null:fraction*factor*(direct*cost+shares!*price);
    const contribution=revenue===null?null:revenue-variable!;
    const fixedMonth=fixed===null?null:fixed*fraction*cost;
    const operating=contribution===null||fixedMonth===null?null:contribution-fixedMonth;
    const c=p.cash[i];const cashReady=known(Object.values(c));
    const collections=revenue===null||!collectionReady||!cashReady?null:revenue*p.collections[0]!+(i>0?rows[i-1].revenue!*p.collections[1]!:0)+(i>1?rows[i-2].revenue!*p.collections[2]!:0)+c.oldReceipts!;
    const outflow=operating===null||!cashReady?null:variable!+fixedMonth!+c.investment!+c.oneOff!+c.otherPayments!;
    const net=collections===null||outflow===null?null:collections-outflow+c.funding!;
    const opening=i===0?p.opening:rows[i-1].closing;
    const closing=opening===null||net===null?null:opening+net;
    const gap=closing===null||p.reserve===null?null:Math.max(0,p.reserve-closing);
    const breakEven=fixedMonth===null||revenue===null||revenue<=0||contribution===null||contribution<=0?null:fixedMonth/(contribution/revenue);
    rows.push({month,fraction,revenue,variable,contribution,fixed:fixedMonth,operating,collections,outflow,net,opening,closing,gap,breakEven});
  });return {errors,rows,baseRevenue,fixed};
}

export function businessModel(b:BusinessInputs){
  const errors:string[]=[];if(Object.values(b).some(x=>x!==null&&!valid(x)))errors.push('Hyrjet B2B duhet të jenë jonegative.');
  if([b.conversion,b.appointmentRate,b.visitRate].some(x=>x!==null&&x>1))errors.push('Normat B2B duhet të jenë 0–1.');
  const contacts=errors.length||b.activeBusinesses===null||b.conversion===null||b.conversion<=0?null:Math.ceil(Math.max(0,20-b.activeBusinesses)/b.conversion);
  const outsource=errors.length||b.activeOutsource===null?null:Math.max(0,3-b.activeOutsource);
  const visits=errors.length||!known([b.mediaBudget,b.contactCost,b.appointmentRate,b.visitRate])||b.contactCost!<=0?null:b.mediaBudget!/b.contactCost!*b.appointmentRate!*b.visitRate!;
  return {errors,contacts,outsource,visits,costPerVisit:visits===null||visits<=0?null:b.mediaBudget!/visits};
}
