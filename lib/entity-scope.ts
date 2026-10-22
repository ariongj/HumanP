import type {Row} from './domain';
import {procedureKey} from './record-links';
import {budgetViews,budgetRows} from './budget';
export type EntitySelection={brand:string;suppliers:string[];year?:string;categories?:string[]};
export const emptyEntitySelection:EntitySelection={brand:'',suppliers:[],year:'',categories:[]};
export const entityName=(v:unknown)=>typeof v==='string'?v.normalize('NFC').trim().replace(/\s+/g,' ').toLocaleLowerCase('sq'):'';
const brands=(r:Row)=>[r.brand,r.brand_explicit,r.brand_or_model_as_published,...String(r.brand_or_model_as_published||'').split('|')].map(entityName).filter(Boolean);
const rows=(d:Row|undefined,k:string):Row[]=>Array.isArray(d?.[k])?d![k]:[];
const keys=(rs:Row[])=>new Set(rs.map(procedureKey).filter(Boolean));
const hasProcedure=(r:Row,set:Set<string>)=>Boolean(procedureKey(r)&&set.has(procedureKey(r)));
const category=(r:Row)=>entityName(r.category_sq||r.category);
export const recordYear=(r:Row)=>/^\d{4}$/.test(String(r.year??r.budget_year??''))?String(r.year??r.budget_year):'unknown';
const snapshotYear=(r:Row)=>String(r.snapshot_date||r.retrieved_date||'').match(/(?:19|20)\d{2}/)?.[0]||'unknown';
export const entityScopeNote='Lidhjet përdorin emërtime burimore dhe kode të plota procedure. Prokurimi i lidhur është kontekst procedure, jo shitje ose çmim i markës. Grupet e operatorëve nuk ndahen. Kategoritë përdorin etiketën burimore; mes taksonomive të ndryshme lidhet procedura e dokumentuar ose i njëjti rekord burimor i shpërblimit. Buxhetet e lidhura janë kontekst institucioni, jo shpenzime për kategorinë ose markën. Viti është viti i rekordit/buxhetit; për regjistrat e barnave dhe licencave përdoret viti i snapshot-it. Data e paketimit të dokumentit nuk është viti i evidencës.';
export function createEntityScope(data:Record<string,Row|undefined>,selection:EntitySelection){
 const year=selection.year||'',categories=(selection.categories||[]).map(entityName);
 const entityActive=Boolean(selection.brand||selection.suppliers.length),linkedActive=entityActive||Boolean(categories.length),active=linkedActive||Boolean(year);
 const brand=entityName(selection.brand),suppliers=new Set(selection.suppliers.map(entityName));
 const products=rows(data.products,'records'),mentions=rows(data.market,'brandMentions2024'),medicalProducts=rows(data.medical,'products');
 const historicalMarket=rows(data.market,'records'),nationalMarket=rows(data.market,'nationalRecords2024');
 const market=[...historicalMarket,...nationalMarket];
 const medical=Object.values(data.medical||{}).filter(Array.isArray).flat().filter(r=>r&&typeof r==='object') as Row[];
 const noticeYears=new Map(rows(data.medical,'notices').map(r=>[String(r.notice_id),recordYear(r)]));
 const noticeRows=new Map(rows(data.medical,'notices').map(r=>[String(r.notice_id),r]));
 const yearMatch=(r:Row,medicalRow=false)=>!year||(medicalRow&&recordYear(r)==='unknown'?noticeYears.get(String(r.notice_id))||'unknown':recordYear(r))===year;
 const brandProcedures=keys([...products,...mentions,...medicalProducts].filter(r=>brands(r).includes(brand)));
 const supplierProcedures=keys([...market,...medical,...products].filter(r=>suppliers.has(entityName(r.supplier))));
 // The healthcare/context and national award populations use different source
 // taxonomies even where they contain the same award or procedure.
 const populations={market:historicalMarket,nationalMarket,products,medical};
 const taxonomies=Object.fromEntries(Object.entries(populations).map(([k,rs])=>[k,new Set(rs.map(category).filter(Boolean))]));
 const categoryProcedures=new Map(categories.map(c=>[c,keys([...market,...products,...medical].filter(r=>category(r)===c))]));
 const categoryAwards=new Map(categories.map(c=>[c,new Set(market.filter(r=>category(r)===c).map(r=>r.row_key).filter((key):key is string=>typeof key==='string'&&Boolean(key)))]));
 // A category present in a table's taxonomy matches directly. Across different
 // taxonomies only explicit procedure links or identical source award IDs apply;
 // labels are never equated, and invalid procedure codes are not loosened.
 const categoryMatch=(r:Row,kind:keyof typeof populations)=>!categories.length||categories.some(c=>taxonomies[kind].has(c)&&category(r)?category(r)===c:hasProcedure(r,categoryProcedures.get(c)!)||(['market','nationalMarket'].includes(kind)&&categoryAwards.get(c)!.has(r.row_key)));
 const brandMatch=(r:Row)=>!brand||brands(r).includes(brand)||hasProcedure(r,brandProcedures);
 const supplierMatch=(r:Row,allowProcedure:boolean)=>!suppliers.size||(entityName(r.supplier)?suppliers.has(entityName(r.supplier)):allowProcedure&&hasProcedure(r,supplierProcedures));
 const matchMarket=(r:Row)=>yearMatch(r)&&categoryMatch(r,'market')&&brandMatch(r)&&supplierMatch(r,false);
 const matchNationalMarket=(r:Row)=>yearMatch(r)&&categoryMatch(r,'nationalMarket')&&brandMatch(r)&&supplierMatch(r,false);
 const matchProduct=(r:Row)=>yearMatch(r)&&categoryMatch(r,'products')&&(!brand||brands(r).includes(brand))&&supplierMatch(r,true);
 const matchMedical=(r:Row)=>{const linked={...noticeRows.get(String(r.notice_id)),...r};return yearMatch(linked,true)&&categoryMatch(linked,'medical')&&brandMatch(linked)&&supplierMatch(linked,true);};
 const matchMedicalProduct=(r:Row)=>matchMedical(r)&&(!brand||brands(r).includes(brand));
 const matchMention=(r:Row)=>yearMatch(r)&&categoryMatch(r,'market')&&(!brand||brands(r).includes(brand))&&supplierMatch(r,true);
 const evidence=[...historicalMarket.filter(matchMarket),...nationalMarket.filter(matchNationalMarket),...products.filter(matchProduct),...mentions.filter(matchMention),...medical.filter(matchMedical)];
 const buyers=new Set(evidence.flatMap(r=>[r.buyer,r.authority]).map(entityName).filter(Boolean));
 const operators=new Set(evidence.map(r=>entityName(r.supplier)).filter(Boolean));if(!brand&&!categories.length)for(const s of suppliers)operators.add(s);
 const budgetMatch=(r:Row)=>yearMatch(r)&&(!linkedActive||[r.organization,r.organization_name].some(v=>buyers.has(entityName(v))));
 const budgetEvidence=budgetViews.flatMap(([id])=>budgetRows(data.budget||{},id).filter(budgetMatch));
 const sourceEvidence=[...evidence,...budgetEvidence];
 const paths=new Set(sourceEvidence.flatMap(r=>[r.source_document,r.source_table_document]).filter(Boolean));
 const urls=new Set(sourceEvidence.flatMap(r=>[r.source_url,r.procurement_source_url,r.manufacturer_source_url]).filter(Boolean));
 function filterDataset(name:string,d:Row):Row{
  if(!active)return d;
  let predicate:((r:Row)=>boolean)|undefined;
  if(name==='market')return {...d,records:rows(d,'records').filter(matchMarket),nationalRecords2024:rows(d,'nationalRecords2024').filter(matchNationalMarket),brandMentions2024:rows(d,'brandMentions2024').filter(matchMention)};
  if(name==='products')predicate=matchProduct;
  if(name==='medical')return Object.fromEntries(Object.entries(d).map(([k,v])=>[k,Array.isArray(v)&&v.some(r=>r&&typeof r==='object'&&('notice_id' in r||procedureKey(r)))?v.filter(k==='products'?matchMedicalProduct:matchMedical):v]));
  if(name==='wholesalers')predicate=r=>(!year||snapshotYear(r)===year)&&(!linkedActive||operators.has(entityName(r.company_name)));
  // This package supplies no medicine ↔ procurement category/brand/supplier join.
  if(name==='medicines')predicate=r=>!linkedActive&&(!year||snapshotYear(r)===year);
  if(['institutions','employers','doctors','registry'].includes(name))predicate=r=>[r.name,r.Institucioni,r.institution,r.organization,r.company_name,r.company].some(v=>buyers.has(entityName(v))||operators.has(entityName(v)));
  if(name==='documents')predicate=r=>paths.has(r.path)||Boolean(r.source_url&&urls.has(r.source_url));
  if(name==='catalogue')return {...d,analyses:[],packages:[]};
  if(name==='budget')return Object.fromEntries(Object.entries(d).map(([k,v])=>[k,k==='supplement'?{...v,health_actual_share:rows(v,'health_actual_share').filter(budgetMatch),prishtina_project_cash:rows(v,'prishtina_project_cash').filter(budgetMatch)}:Array.isArray(v)&&v.some(r=>r&&typeof r==='object'&&(recordYear(r)!=='unknown'||'organization' in r||'organization_name' in r))?v.filter(budgetMatch):v]));
  return predicate?{...d,records:rows(d,'records').filter(predicate)}:d;
 }
 const unique=(values:unknown[])=>Array.from(new Set(values.filter((v):v is string=>typeof v==='string'&&Boolean(v.trim())))).sort((a,b)=>a.localeCompare(b,'sq'));
 return {active,entityActive,linkedActive,filterDataset,
  years:unique([...market,...products,...medical,...budgetViews.flatMap(([id])=>budgetRows(data.budget||{},id))].map(recordYear)).filter(y=>y!=='unknown').concat('unknown'),
  categories:unique([...market,...products,...medical].map(r=>r.category_sq||r.category)),
  brands:unique([...products.map(r=>r.brand),...medicalProducts.map(r=>r.brand_explicit),...mentions.flatMap(r=>[r.brand_or_model_as_published,...String(r.brand_or_model_as_published||'').split('|').map(s=>s.trim())])]),
  suppliers:unique([...market,...medical,...products].map(r=>r.supplier))};
}
