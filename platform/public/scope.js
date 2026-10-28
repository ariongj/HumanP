export const normalize=value=>String(value??'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
export const emptyFilters=()=>({q:'',year:'',category:'',buyer:'',kind:'',due:'',brand:'',product:'',supplier:'',stage:'',owner:''});
export function localDay(now=new Date()){return new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Tirane',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);}
export function deadlineDay(value){const m=String(value||'').match(/^(\d{2})\.(\d{2})\.(\d{4})/);if(!m)return null;const day=`${m[3]}-${m[2]}-${m[1]}`;const n=Date.parse(day);return Number.isFinite(n)&&new Date(n).toISOString().slice(0,10)===day?day:null;}
export function procedure(value){return String(value||'').replace(/\/B\d.*$/,'').replace(/^20\d{2}\//,'');}
export function relationships(notice,products,links){
  const hay=` ${normalize([notice.title,notice.cpv].join(' '))} `;
  return products.flatMap(product=>{
    const explicit=links.find(l=>l.notice_id===notice.id&&l.product_id===product.id);
    if(explicit)return [{productId:product.id,basis:'Team link',reason:explicit.reason}];
    const a=procedure(notice.procedure),b=procedure(product.procurement_id);
    if(a&&b&&a===b)return [{productId:product.id,basis:'Same procedure',reason:'Exact procurement identifier in the supplied research.'}];
    const model=normalize(product.model||product.name);
    if(model.length>=4&&hay.includes(` ${model} `))return [{productId:product.id,basis:'Name mentioned',reason:'Product/model name appears in the notice title; compatibility and eligibility need review.'}];
    return [];
  });
}
export function filterNotices(notices,filters,{products=[],links=[],workspaces=[],now=new Date()}={}){
  const today=localDay(now),end=new Date(Date.parse(today)+7*86400000).toISOString().slice(0,10);
  const f={...emptyFilters(),...filters};
  const selectedProducts=products.filter(p=>(!f.brand||p.brand===f.brand)&&(!f.product||p.id===f.product)&&(!f.supplier||p.supplier===f.supplier));
  const ids=new Set(selectedProducts.map(p=>p.id));
  return notices.filter(n=>{
    const workspace=workspaces.find(w=>w.tender_id===n.id),day=deadlineDay(n.deadline);
    return (!f.q||normalize([n.title,n.buyer,n.category,n.cpv,n.procedure].join(' ')).includes(normalize(f.q)))&&
      (!f.year||String(n.year)===f.year)&&(!f.category||n.category===f.category)&&(!f.buyer||n.buyer===f.buyer)&&(!f.kind||n.classification===f.kind)&&
      (!f.stage||(f.stage==='unsaved'?!workspace:workspace?.status===f.stage))&&(!f.owner||(f.owner==='unassigned'?workspace&&!workspace.owner_id:workspace?.owner_id===f.owner))&&
      (!f.due||(f.due==='unknown'?!day:f.due==='expired'?day&&day<today:f.due==='week'?day&&day>=today&&day<=end:day&&day>=today))&&
      (!(f.brand||f.product||f.supplier)||relationships(n,products,links).some(r=>ids.has(r.productId)));
  });
}
export function filterProducts(products,filters,visibleNotices,allNotices,links){
  const f={...emptyFilters(),...filters};
  const hasTenderFilter=['q','year','category','buyer','kind','due','stage','owner'].some(k=>f[k]);
  const related=new Set(visibleNotices.flatMap(n=>relationships(n,products,links).map(r=>r.productId)));
  return products.filter(p=>(!f.brand||p.brand===f.brand)&&(!f.product||p.id===f.product)&&(!f.supplier||p.supplier===f.supplier)&&(!hasTenderFilter||related.has(p.id)));
}
export function filterWorkspaces(workspaces,notices,filters){
  const active=Object.values(filters).some(Boolean);if(!active)return workspaces;
  const ids=new Set(notices.map(n=>n.id));return workspaces.filter(w=>ids.has(w.tender_id));
}
export function sortNotices(rows,sort='deadline'){
  const values=[...rows];return values.sort((a,b)=>sort==='title'?a.title.localeCompare(b.title):sort==='buyer'?String(a.buyer).localeCompare(String(b.buyer)):sort==='newest'?String(b.publishedAt||'').localeCompare(String(a.publishedAt||'')):(deadlineDay(a.deadline)||'9999').localeCompare(deadlineDay(b.deadline)||'9999')||String(a.deadline).localeCompare(String(b.deadline))||a.id.localeCompare(b.id));
}
