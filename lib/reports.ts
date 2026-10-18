import {filterMarket,marketPopulation,groupMarket,type Row} from './domain';
import {budgetRows,budgetSum} from './budget';
import {countsBy} from './medical';
export type ReportSection={id:string;title:string;note:string;rows:Row[];columns:{key:string;title:string}[];chart:{label:string;value:number}[];unit:string;total?:number|null;page:string;tab?:string};
export type Report={title:string;year:string;scope:string;generatedAt:string;sourceDate:string;sections:ReportSection[]};
const columns=(pairs:string[][])=>pairs.map(([key,title])=>({key,title}));
export function buildReport(kind:string,data:{market?:Row;budget?:Row;products?:Row},year:string,scope='',segment=''):Report{
 const sections:ReportSection[]=[];
 const sourceDate='18.10.2026';
 if(kind==='budget'){
  if(!year)throw new Error('Zgjidh një vit për raportin buxhetor.');
  for(const [id,title,valueKey,nameKey,note] of [
   ['central_budget','Ndarjet qendrore','total','organization','Buxheti fillestar i institucioneve shëndetësore të përfshira.'],
   ['municipal_budget','Ndarjet komunale','total','municipality','Ndarjet fillestare për shëndetësinë komunale.'],
   ['execution_2023','Pagesat · Thesari','payments_eur','organization','Vetëm totalet e organizatave; kategoritë ekonomike nuk shtohen sërish.'],
   ['audited_execution_2024','Pagesat · auditimi','payments_eur','organization','Baza e auditimit ruhet veçmas nga Thesari; mbulimi mund të ndryshojë.'],
  ]){
   const rows=budgetRows(data.budget||{},id).filter(r=>String(r.year||r.budget_year)===year&&(!id.includes('execution')||r.row_type==='organization_total'));
   sections.push({id,title,note,rows,columns:columns([[nameKey,'Institucioni'],[valueKey,'EUR'],['year','Viti'],['source_document','Dokumenti'],['pdf_page','Faqja']]),chart:rows.map(r=>({label:String(r[nameKey]),value:r[valueKey]})).filter(r=>typeof r.value==='number'&&Number.isFinite(r.value)).sort((a,b)=>b.value-a.value).slice(0,10),unit:'EUR',total:budgetSum(rows,valueKey),page:'budget',tab:id});
  }
 }else if(kind==='products'){
  const rows=(data.products?.records||[]).filter((r:Row)=>(!year||String(r.year??'unknown')===year)&&(!segment||r.brand===segment));
  sections.push({id:'products',title:'Produktet dhe markat',note:'Referenca kërkimi. Vlerat e loteve nuk janë çmime pajisjesh dhe nuk mblidhen për modele që ndajnë një procedurë. Pa vit prokurimi përfshihet vetëm kur zgjidhen të gjitha vitet ose filtri përkatës.',rows,columns:columns([['brand','Marka'],['model','Modeli / produkti'],['year','Viti'],['category','Kategoria'],['procurement_role','Roli i evidencës'],['procurement_id','Referenca'],['manufacturer_source','Burimi i prodhuesit']]),chart:countsBy(rows,'brand'),unit:'referenca',page:'products'});
 }else{
  const rows=filterMarket(marketPopulation(data.market,scope),{year,category:segment});
  sections.push({id:'market',title:'Prokurimi sipas kategorisë',note:scope==='national2024'?'Popullata kombëtare 2024, e veçantë nga nënbashkësia shëndetësore dhe kontekstuale. Numërohen shpërblime të publikuara.':'Historiku shëndetësor dhe kontekstual. Rekordet nuk provojnë pagesë ose madhësi tregu; klasifikimet tekstuale kërkojnë shqyrtim. Mbulimi 2026 është i pjesshëm.',rows,columns:columns([['year','Viti'],['reference','Referenca'],['title','Titulli'],['buyer','Institucioni'],['supplier','Operatori'],['category','Kategoria'],['source_url','Burimi']]),chart:groupMarket(rows,'category'),unit:'rekorde',page:'market'});
 }
 return {title:kind==='budget'?'Raporti i buxhetit dhe pagesave':kind==='products'?'Raporti i produkteve dhe markave':'Raporti i prokurimit',year:year==='unknown'?'Pa vit prokurimi':year||'Të gjitha vitet',scope:[kind==='market'?(scope==='national2024'?'Popullata kombëtare 2024':'Shëndetësi dhe kontekst'):'Burimet e paketës',segment].filter(Boolean).join(' · '),generatedAt:new Date().toISOString(),sourceDate,sections};
}
const escapeHTML=(value:unknown)=>String(value===null||value===undefined||value===''?'E panjohur':typeof value==='object'?JSON.stringify(value):value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export function reportHTML(report:Report){
 return '<!doctype html><html lang="sq"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'"><title>'+escapeHTML(report.title)+'</title><style>body{font:14px/1.6 system-ui;color:#193b44;max-width:1200px;margin:40px auto;padding:0 24px}h1{font-size:30px}h2{margin-top:40px}p{max-width:900px}table{border-collapse:collapse;width:100%;font-size:11px}th,td{text-align:left;vertical-align:top;border-bottom:1px solid #dde6e9;padding:8px;overflow-wrap:anywhere}th{background:#eef4f4}.scroll{overflow:auto}.chart{max-width:800px;margin:22px 0}.bar{display:grid;grid-template-columns:minmax(110px,2fr) 3fr 110px;gap:12px;margin:8px 0;font-size:12px}.track{background:#eff4f3}.fill{background:#258476;height:100%}small{color:#536c74}@media print{body{margin:0;max-width:none;padding:0}table{table-layout:fixed;font-size:9px}thead{display:table-header-group}tr,.bar{break-inside:avoid}.scroll{overflow:visible}h2{break-after:avoid}}</style><body><small>HumanPlus · Raport i ruajtur</small><h1>'+escapeHTML(report.title)+'</h1><p>'+escapeHTML(report.year)+' · '+escapeHTML(report.scope)+'</p><p>Burimet: '+escapeHTML(report.sourceDate)+' · Gjeneruar: '+escapeHTML(report.generatedAt)+'. Për printim ose PDF përdor Print në shfletues. Ky skedar përmban të dhënat e përzgjedhura.</p>'+report.sections.map(s=>'<section><h2>'+escapeHTML(s.title)+'</h2><p>'+escapeHTML(s.note)+'</p><p>'+s.rows.length+' rekorde'+('total' in s?' · '+(s.total===null?'Shuma e plotë nuk disponohet':new Intl.NumberFormat('sq-AL',{maximumFractionDigits:2}).format(s.total!)+' EUR'):'')+'</p><div class="chart">'+s.chart.map(r=>'<div class="bar"><span>'+escapeHTML(r.label)+'</span><div class="track"><div class="fill" style="width:'+Math.max(0,r.value/Math.max(1,...s.chart.map(v=>v.value))*100)+'%"></div></div><span>'+new Intl.NumberFormat('sq-AL',{maximumFractionDigits:2}).format(r.value)+' '+escapeHTML(s.unit)+'</span></div>').join('')+'</div><div class="scroll"><table><thead><tr>'+s.columns.map(c=>'<th>'+escapeHTML(c.title)+'</th>').join('')+'</tr></thead><tbody>'+s.rows.map(r=>'<tr>'+s.columns.map(c=>'<td>'+escapeHTML(r[c.key])+'</td>').join('')+'</tr>').join('')+'</tbody></table></div></section>').join('')+'</body></html>';
}
