export type Row = Record<string, any>;
export type Filters = Record<string, string>;
export const numberOrNull = (v: unknown): number | null => v === null || v === undefined || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null;
export function safeLink(value: unknown) {
  if(typeof value !== 'string' || /[?&]id=$/i.test(value)) return null;
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? value : null; } catch { return null; }
}
export function filterMarket(rows: Row[], filters: Filters) {
  const q=(filters.q||'').toLocaleLowerCase('sq');
  return rows.filter(r => (!q || [r.title,r.buyer,r.supplier,r.reference,r.row_key].some(x=>String(x??'').toLocaleLowerCase('sq').includes(q))) &&
    Object.entries(filters).every(([key,value])=> !value || ['q','page'].includes(key) || (key==='flag' ? r.audit_flags.includes(value) : key==='status' ? (value==='duplicate' ? r.duplicate_flag==='True' : value==='group' ? r.group_label==='True' : value==='link' ? !r.source_link_usable : true) : String(r[key]??'')===value)));
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
export const marketColumns=['year','source_label','reference','title','buyer','supplier','category','reported_value','value_unit','amount_type','audit_flags','source_url','source_link_usable','duplicate_flag','group_label','overlays'];
export function hasIdentity(request: Request) { return Boolean(request.headers.get('oai-authenticated-user-id') && request.headers.get('oai-authenticated-user-email')); }
