import type {Row} from './domain';
import {procedureKey} from './record-links';
export type EntitySelection={brand:string;suppliers:string[]};
export const emptyEntitySelection:EntitySelection={brand:'',suppliers:[]};
export const entityName=(v:unknown)=>typeof v==='string'?v.normalize('NFC').trim().replace(/\s+/g,' ').toLocaleLowerCase('sq'):'';
const brands=(r:Row)=>[r.brand,r.brand_explicit,r.brand_or_model_as_published,...String(r.brand_or_model_as_published||'').split('|')].map(entityName).filter(Boolean);
const rows=(d:Row|undefined,k:string):Row[]=>Array.isArray(d?.[k])?d![k]:[];
const keys=(rs:Row[])=>new Set(rs.map(procedureKey).filter(Boolean));
const hasProcedure=(r:Row,set:Set<string>)=>Boolean(procedureKey(r)&&set.has(procedureKey(r)));
export const entityScopeNote='Lidhjet përdorin emërtime burimore dhe kode të plota procedure. Prokurimi i lidhur është kontekst procedure, jo shitje ose çmim i markës. Grupet e operatorëve nuk ndahen. Buxhetet lidhen vetëm me emërtim të njëjtë institucioni; nuk janë shpenzime për markën.';
export function createEntityScope(data:Record<string,Row|undefined>,selection:EntitySelection){
 const active=Boolean(selection.brand||selection.suppliers.length),brand=entityName(selection.brand),suppliers=new Set(selection.suppliers.map(entityName));
 const products=rows(data.products,'records'),mentions=rows(data.market,'brandMentions2024'),medicalProducts=rows(data.medical,'products');
 const market=[...rows(data.market,'records'),...rows(data.market,'nationalRecords2024')];
 const medical=Object.values(data.medical||{}).filter(Array.isArray).flat() as Row[];
 const brandEvidence=[...products,...mentions,...medicalProducts].filter(r=>brands(r).includes(brand));
 const brandProcedures=keys(brandEvidence),supplierProcedures=keys([...market,...medical,...products].filter(r=>suppliers.has(entityName(r.supplier))));
 const brandMatch=(r:Row)=>!brand||brands(r).includes(brand)||hasProcedure(r,brandProcedures);
 const supplierMatch=(r:Row,allowProcedure:boolean)=>!suppliers.size||(entityName(r.supplier)?suppliers.has(entityName(r.supplier)):allowProcedure&&hasProcedure(r,supplierProcedures));
 const matchMarket=(r:Row)=>brandMatch(r)&&supplierMatch(r,false);
 const matchProduct=(r:Row)=>(!brand||brands(r).includes(brand))&&supplierMatch(r,true);
 const matchMedical=(r:Row)=>brandMatch(r)&&supplierMatch(r,true);
 const evidence=[...market.filter(matchMarket),...products.filter(matchProduct),...mentions.filter(r=>brandMatch(r)&&supplierMatch(r,true)),...medical.filter(matchMedical)];
 const buyers=new Set(evidence.flatMap(r=>[r.buyer,r.authority]).map(entityName).filter(Boolean));
 const operators=new Set(evidence.map(r=>entityName(r.supplier)).filter(Boolean));if(!brand)for(const s of suppliers)operators.add(s);
 const paths=new Set(evidence.flatMap(r=>[r.source_document,r.source_table_document]).filter(Boolean));
 const urls=new Set(evidence.flatMap(r=>[r.source_url,r.procurement_source_url,r.manufacturer_source_url]).filter(Boolean));
 function filterDataset(name:string,d:Row):Row{
  if(!active)return d;
  let predicate:((r:Row)=>boolean)|undefined;
  if(name==='market')return {...d,records:rows(d,'records').filter(matchMarket),nationalRecords2024:rows(d,'nationalRecords2024').filter(matchMarket),brandMentions2024:rows(d,'brandMentions2024').filter(r=>(!brand||brands(r).includes(brand))&&supplierMatch(r,true))};
  if(name==='products')predicate=matchProduct;
  if(name==='medical')return Object.fromEntries(Object.entries(d).map(([k,v])=>[k,Array.isArray(v)&&v.some(r=>r&&typeof r==='object'&&('notice_id' in r||procedureKey(r)))?v.filter(k==='products'?matchProduct:matchMedical):v]));
  if(name==='wholesalers')predicate=r=>operators.has(entityName(r.company_name));
  // No source-backed medicine ↔ brand/distributor join is supplied in this package.
  if(name==='medicines')predicate=()=>false;
  if(['institutions','employers','doctors','registry'].includes(name))predicate=r=>[r.name,r.Institucioni,r.institution,r.organization,r.company_name,r.company].some(v=>buyers.has(entityName(v))||operators.has(entityName(v)));
  if(name==='documents')predicate=r=>paths.has(r.path)||Boolean(r.source_url&&urls.has(r.source_url));
  if(name==='catalogue')return {...d,analyses:[]};
  if(name==='budget'){
   const match=(r:Row)=>[r.organization,r.organization_name].some(v=>buyers.has(entityName(v)));
   return Object.fromEntries(Object.entries(d).map(([k,v])=>[k,Array.isArray(v)?v.filter(match):k==='supplement'?{...v,health_actual_share:[],prishtina_project_cash:[]}:v]));
  }
  return predicate?{...d,records:rows(d,'records').filter(predicate)}:d;
 }
 const unique=(values:unknown[])=>Array.from(new Set(values.filter((v):v is string=>typeof v==='string'&&Boolean(v.trim())))).sort((a,b)=>a.localeCompare(b,'sq'));
 return {active,filterDataset,brands:unique([...products.map(r=>r.brand),...medicalProducts.map(r=>r.brand_explicit),...mentions.flatMap(r=>[r.brand_or_model_as_published,...String(r.brand_or_model_as_published||'').split('|').map(s=>s.trim())])]),suppliers:unique([...market,...medical,...products].map(r=>r.supplier))};
}
