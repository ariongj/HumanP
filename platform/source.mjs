const FEED_URL='https://raw.githubusercontent.com/ariongj/HumanP/main/monitor/feed.json';
const AI_URL='https://raw.githubusercontent.com/ariongj/HumanP/main/monitor/ai-report.json';
export function readSource(db){
  const row=db.prepare('SELECT * FROM source_cache WHERE id=1').get();
  if(!row)return {feed:null,aiReport:null};
  const feed=JSON.parse(row.feed_json);
  if(row.last_error)feed.run={...feed.run,status:'error',errors:['The public feed could not be refreshed.']};
  return {feed,aiReport:row.ai_json?JSON.parse(row.ai_json):null};
}
async function fetchJSON(url,fetcher){
  const response=await fetcher(url,{signal:AbortSignal.timeout(20000),headers:{'User-Agent':'HumanPlus-Workspace/0.1','Accept':'application/json'}});
  if(!response.ok)throw new Error('Source returned HTTP '+response.status);
  const bytes=await response.text();if(bytes.length>8*1024*1024)throw new Error('Source is too large');return JSON.parse(bytes);
}
export async function refreshSource(db,{now=new Date(),fetcher=fetch,force=false}={}){
  const previous=db.prepare('SELECT last_fetch_at FROM source_cache WHERE id=1').get();
  if(!force&&previous&&now.getTime()-Date.parse(previous.last_fetch_at)<10*60000)return readSource(db);
  try{
    const feed=await fetchJSON(FEED_URL,fetcher);
    if(!Array.isArray(feed.notices)||typeof feed.last_successful_check!=='string')throw new Error('Invalid source schema');
    let ai=null;try{ai=await fetchJSON(AI_URL,fetcher);}catch{/* Source facts remain available without AI commentary. */}
    db.prepare(`INSERT INTO source_cache VALUES(1,?,?,?,NULL) ON CONFLICT(id) DO UPDATE SET feed_json=excluded.feed_json,ai_json=excluded.ai_json,last_fetch_at=excluded.last_fetch_at,last_error=NULL`).run(JSON.stringify(feed),ai?JSON.stringify(ai):null,now.toISOString());
  }catch(error){
    db.prepare(`INSERT INTO source_cache VALUES(1,'{}',NULL,?,?) ON CONFLICT(id) DO UPDATE SET last_fetch_at=excluded.last_fetch_at,last_error=excluded.last_error`).run(now.toISOString(),'Public source refresh failed');
  }
  return readSource(db);
}
