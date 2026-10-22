// The Hostinger collector writes this cache directly from the official portal.
export function readSource(db){
  const row=db.prepare('SELECT * FROM source_cache WHERE id=1').get();
  if(!row)return {feed:null,aiReport:null};
  const feed=JSON.parse(row.feed_json);
  if(row.last_error)feed.run={...feed.run,status:'error',errors:[row.last_error]};
  return {feed,aiReport:row.ai_json?JSON.parse(row.ai_json):null};
}
export function saveSource(db,{feed,aiReport},now=new Date()){
  if(!Array.isArray(feed?.notices))throw new Error('Invalid source feed');
  db.prepare(`INSERT INTO source_cache VALUES(1,?,?,?,NULL) ON CONFLICT(id) DO UPDATE SET feed_json=excluded.feed_json,ai_json=excluded.ai_json,last_fetch_at=excluded.last_fetch_at,last_error=NULL`).run(JSON.stringify(feed),aiReport?JSON.stringify(aiReport):null,now.toISOString());
}
export function markSourceFailure(db,now=new Date()){
  db.prepare(`INSERT INTO source_cache VALUES(1,'{}',NULL,?,?) ON CONFLICT(id) DO UPDATE SET last_fetch_at=excluded.last_fetch_at,last_error=excluded.last_error`).run(now.toISOString(),'Official portal collection failed; last-known facts are retained.');
}
