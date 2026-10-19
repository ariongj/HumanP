import type {Row} from './domain';
import {budgetViews,budgetRows} from './budget';
export type LinkedGroup={id:string;title:string;basis:string;rows:Row[]};
export function procedureKey(row:Row):string{
 for(const key of ['procurement_id','reference','procedure_key','procurement_code','process_id']){
  const value=String(row[key]||'').trim().replace(/\/B\d.*$/,'');
  const match=value.match(/(?:^|[-/])(\d{2,6}-\d{2}-\d+-\d-\d-\d)$/);if(match)return match[1];
 }return '';
}
const name=(v:unknown)=>typeof v==='string'?v.normalize('NFC').trim().replace(/\s+/g,' ').toLocaleLowerCase('sq'):'';
const paths=(r:Row)=>[r.source_document,r.source_table_document,r.path].filter(v=>typeof v==='string'&&v.startsWith('documents/'));
export function connectedRecords(row:Row,data:Record<string,Row>):LinkedGroup[]{
 const groups:LinkedGroup[]=[];const key=procedureKey(row),notice=String(row.notice_id||'');
 const buyer=name(row.buyer||row.authority||row.organization||row.organization_name||row.Institucioni),supplier=name(row.supplier||row.company_name||row.company),brand=name(row.brand||row.brand_explicit);
 const sameProcedure=(r:Row)=>Boolean(key&&procedureKey(r)===key||notice&&String(r.notice_id||'')===notice);
 const add=(id:string,title:string,basis:string,rows:Row[])=>{if(rows.length)groups.push({id,title,basis,rows});};
 // Alternative market populations overlap: show each stable source row ID once.
 const marketRows:Row[]=[];const seen=new Set<string>();for(const r of [...(data.market?.records||[]),...(data.market?.nationalRecords2024||[])]){if(r.row_key&&seen.has(r.row_key))continue;if(r.row_key)seen.add(r.row_key);marketRows.push(r);}
 add('procedure','Prokurimi i së njëjtës procedurë','I njëjti kod procedure; ID-të e rreshtave të përbashkët paraqiten vetëm një herë.',marketRows.filter(sameProcedure));
 add('products','Referencat e produkteve','I njëjti kod procedure ose emërtim marke. Referenca burimore; jo përfaqësim tregtar.',(data.products?.records||[]).filter((r:Row)=>sameProcedure(r)||Boolean(brand&&name(r.brand)===brand)));
 add('mentions','Përmendjet e vitit 2024','I njëjti kod procedure. Emërtimet e titujve nuk bashkohen me prodhues të supozuar.',(data.market?.brandMentions2024||[]).filter(sameProcedure));
 for(const [id,title] of [['notices','Njoftimet'],['lots','Lotet dhe fazat'],['requirements','Kërkesat'],['changes','Korrigjimet'],['products','Produktet në njoftime']])add('medical-'+id,title,'I njëjti kod procedure ose ID njoftimi; fazat dhe lotet mbeten rreshta të veçantë.',(data.medical?.[id]||[]).filter(sameProcedure));
 if(buyer)add('buyer','Prokurimi i të njëjtit emërtim institucioni','Përputhje e emërtimit burimor, në të gjitha vitet. Nuk është harmonizim juridik.',marketRows.filter(r=>name(r.buyer)===buyer&&!sameProcedure(r)));
 if(supplier)add('supplier','Prokurimi i të njëjtit emërtim operatori','Përputhje e plotë e emërtimit. Grupet nuk ndahen mes anëtarëve.',marketRows.filter(r=>name(r.supplier)===supplier&&!sameProcedure(r)));
 for(const [id,title] of [['institutions','Institucionet'],['employers','Punëdhënësit'],['wholesalers','Licencat dhe depot']])add(id,title,'Përputhje e plotë e emërtimit burimor; statusi dhe marrëdhëniet kërkojnë verifikim.',(data[id]?.records||[]).filter((r:Row)=>[r.name,r.Institucioni,r.institution,r.organization,r.company_name,r.company].some(v=>Boolean(name(v)&&(name(v)===buyer||name(v)===supplier)))));
 for(const [id,title] of budgetViews){add('budget-'+id,title,'I njëjti emërtim institucioni ose dokument i referuar. Baza dhe hierarkia e çdo tabele ruhen; rreshtat nuk mblidhen mes tabelave.',budgetRows(data.budget||{},id).filter(r=>Boolean(buyer&&name(r.organization||r.organization_name)===buyer)||paths(r).some(p=>paths(row).includes(p))));}
 add('documents','Dokumentet origjinale','Dokument i referuar drejtpërdrejt ose lidhje burimore identike.',(data.documents?.records||[]).filter((r:Row)=>paths(row).includes(r.path)||Boolean(row.source_url&&r.source_url===row.source_url)));
 return groups;
}
