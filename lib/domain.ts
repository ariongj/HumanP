export type Row = Record<string, any>;
export type Filters = Record<string, string>;
export const marketYears=(rows:Row[])=>Array.from(new Set(rows.map(r=>String(r.year||'')).filter(Boolean))).sort();
export function marketMonths(rows:Row[]){const counts=new Map<string,number>();for(const row of rows){const month=String(row.source_date||'').slice(0,7);if(/^\d{4}-(0[1-9]|1[0-2])$/.test(month))counts.set(month,(counts.get(month)||0)+1);}return [...counts].sort(([a],[b])=>a.localeCompare(b)).map(([name,value])=>({name,value}));}
export const numberOrNull = (v: unknown): number | null => v === null || v === undefined || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null;
export function safeLink(value: unknown) {
  if(typeof value !== 'string' || /[?&]id=$/i.test(value)) return null;
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? value : null; } catch { return null; }
}
export function selectedValues(value:string|undefined):string[]{
  if(!value)return [];try{const v=JSON.parse(value);return Array.isArray(v)&&v.length<=100&&v.every(x=>typeof x==='string')?v:[];}catch{return [];}
}
export function filterMarket(rows: Row[], filters: Filters) {
  const words=(filters.q||'').trim().toLocaleLowerCase('sq').split(/\s+/).filter(Boolean);
  for(const [key,value] of Object.entries(filters)){if(key.endsWith('Any')&&value){try{const v=JSON.parse(value);if(!Array.isArray(v)||v.length>100||v.some(x=>typeof x!=='string'))return [];}catch{return [];}}}
  const choices=Object.fromEntries(Object.entries(filters).filter(([k])=>k.endsWith('Any')).map(([k,v])=>[k.slice(0,-3),selectedValues(v)]));
  const hasRange=Boolean(filters.minAmount||filters.maxAmount);
  const min=filters.minAmount?Number(filters.minAmount):null,max=filters.maxAmount?Number(filters.maxAmount):null;
  if((min!==null&&(!Number.isFinite(min)||min<0))||(max!==null&&(!Number.isFinite(max)||max<0))||(min!==null&&max!==null&&min>max))return [];
  return rows.filter(r=>{
    const haystack=[r.title,r.full_tender_title,r.buyer,r.supplier,r.reference,r.row_key].map(x=>String(x??'')).join(' ').toLocaleLowerCase('sq');
    if(words.length&&!(filters.searchMode==='any'?words.some(w=>haystack.includes(w)):words.every(w=>haystack.includes(w))))return false;
    for(const [key,values] of Object.entries(choices)){
      if(!values.length)continue;
      if(key==='flags'){const flags=r.audit_flags||[];if(!(filters.flagMode==='all'?values.every(v=>flags.includes(v)):values.some(v=>flags.includes(v))))return false;}
      else if(!values.includes(String(r[key]||'E papërcaktuar')))return false;
    }
    const amount=numberOrNull(r.reported_value);
    if(hasRange&&(r.value_unit!=='EUR'||amount===null||(min!==null&&amount<min)||(max!==null&&amount>max)))return false;
    if(filters.amountPresence==='missing'&&amount!==null||filters.amountPresence==='known'&&amount===null)return false;
    if(filters.linkState==='usable'&&!r.source_link_usable||filters.linkState==='missing'&&r.source_link_usable)return false;
    return Object.entries(filters).every(([key,value])=>!value||key.endsWith('Any')||['q','page','searchMode','flagMode','minAmount','maxAmount','amountPresence','linkState'].includes(key)||(key==='month'?/^\d{4}-(0[1-9]|1[0-2])$/.test(value)&&String(r.source_date||'').slice(0,7)===value:key==='flag'?(r.audit_flags||[]).includes(value):key==='status'?(value==='duplicate'?r.duplicate_flag==='True':value==='group'?r.group_label==='True':value==='link'?!r.source_link_usable:true):String(r[key]||'E papërcaktuar')===value));
  });
}
export function marketSummary(rows: Row[]) {
  const eur=rows.filter(r=>r.value_unit==='EUR' && numberOrNull(r.reported_value)!==null);
  return {count:rows.length,eur:eur.length ? eur.reduce((s,r)=>s+Number(r.reported_value),0):null,
    unknown:rows.filter(r=>r.value_unit!=='EUR').length, processes:new Set(rows.map(r=>r.process_id).filter(Boolean)).size,
    companies:new Set(rows.map(r=>r.supplier_registration_id ? `id:${r.supplier_registration_id}` : `${r.source}:${r.supplier}`)).size,
    duplicates:rows.filter(r=>r.duplicate_flag==='True').length};
}
export function groupMarket(rows:Row[],key:string,measure:'count'|'eur'='count') {
  const groups=new Map<string,number>();
  for(const r of rows) {
    if(measure==='eur' && (r.value_unit!=='EUR' || numberOrNull(r.reported_value)===null)) continue;
    const label=String(r[key]||'E papërcaktuar'); groups.set(label,(groups.get(label)||0)+(measure==='count'?1:Number(r.reported_value)));
  }
  return Array.from(groups,([label,value])=>({label,value})).sort((a,b)=>b.value-a.value);
}
export function csv(rows: Row[], columns: string[]) {
  const escape=(v:unknown)=>{let s=v==null?'':typeof v==='object'?JSON.stringify(v):String(v); if(/^[\s]*[=+@-]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';};
  return '\uFEFF'+[columns,...rows.map(r=>columns.map(k=>r[k]))].map(row=>row.map(escape).join(',')).join('\r\n');
}
export const marketColumns=['year','source_date','row_key','source_label','reference','title','buyer','supplier','category','reported_value','value_unit','amount_type','audit_flags','source_url','source_link_usable','duplicate_flag','group_label','overlays','award_id','source_dataset_url','source_archive_line','provenance'];
export function hasIdentity(request: Request) { return Boolean(request.headers.get('oai-authenticated-user-id') && request.headers.get('oai-authenticated-user-email')); }
