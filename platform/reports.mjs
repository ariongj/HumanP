import {randomUUID} from 'node:crypto';

// This module creates durable in-app inbox records. It does not send ChatGPT,
// email, or browser push notifications and never calls an AI/network service.
export function ensureReportSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS reports (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      report_date TEXT NOT NULL,
      timezone TEXT NOT NULL,
      scheduled_local_time TEXT NOT NULL,
      status TEXT NOT NULL,
      source_checked_at TEXT,
      generated_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      revision INTEGER NOT NULL DEFAULT 1,
      body_json TEXT NOT NULL,
      UNIQUE(company_id, report_date), UNIQUE(id, company_id)
    );
    CREATE TABLE IF NOT EXISTS notification_deliveries (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      report_id TEXT NOT NULL,
      channel TEXT NOT NULL CHECK(channel = 'in_app'),
      status TEXT NOT NULL CHECK(status = 'delivered'),
      created_at TEXT NOT NULL,
      delivered_at TEXT NOT NULL,
      read_at TEXT,
      UNIQUE(user_id, report_id, channel),
      FOREIGN KEY(report_id, company_id) REFERENCES reports(id, company_id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS reports_company_date ON reports(company_id, report_date DESC);
    CREATE INDEX IF NOT EXISTS deliveries_recipient ON notification_deliveries(company_id,user_id,delivered_at DESC);
  `);
}

const canonical = value => String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[_-]/g,' ').replace(/\s+/g,' ').trim();
const strings = value => typeof value === 'string' ? (value.trim() ? [value.trim()] : []) : Array.isArray(value) ? value.filter(x => typeof x === 'string' && x.trim()).map(x => x.trim()) : [];
const unique = value => [...new Set(value)];
function localClock(now, timezone) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now).map(p => [p.type,p.value]));
  return {date:`${parts.year}-${parts.month}-${parts.day}`,time:`${parts.hour}:${parts.minute}`};
}
function schedule(company, now) {
  const timezone = company.timezone || 'Europe/Tirane', time = company.local_time || '10:00';
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return null;
  try {return {...localClock(now, timezone),timezone,scheduled:time};} catch {return null;}
}
function officialLink(value) {
  try {const u = new URL(value);return u.protocol === 'https:' && u.hostname === 'e-prokurimi.rks-gov.net' && !u.username && !u.password ? u.href : null;} catch {return null;}
}
function procedure(row) {
  for (const field of ['procurement_id','reference','procedure_key','procurement_code','process_id']) {
    const value = String(row[field] || '').trim().replace(/\/B\d.*$/,'').replace(/^ocds-uhzcmx-/,'').replace(/^(?:19|20)\d{2}\//,'');
    if (/^[\d/-]+$/.test(value) && /(?:^|[-/])\d{2,6}-\d{2}-\d+-\d-\d-\d$/.test(value)) return value;
  }
  return `notice:${row.notice_id}`;
}
const latest = (a,b) => String(b.published_iso || '').localeCompare(String(a.published_iso || '')) || String(b.notice_id).localeCompare(String(a.notice_id),'en',{numeric:true});
function deadline(row) {
  const match = String(row.deadline_displayed || '').match(/^(\d{2})\.(\d{2})\.(\d{4})(?:\s+(\d{2}):(\d{2}))?/);
  if (!match) return null;
  const day = `${match[3]}-${match[2]}-${match[1]}`, stamp = Date.parse(day+'T00:00:00Z');
  if (!Number.isFinite(stamp) || new Date(stamp).toISOString().slice(0,10) !== day) return null;
  const time = match[4] ? `${match[4]}:${match[5]}` : null;
  if (time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return null;
  // The collector preserves this source limitation as prose, not an IANA zone.
  const sourceTimezone=typeof row.deadline_timezone==='string'?row.deadline_timezone.trim():'';
  const timezone=!sourceTimezone || sourceTimezone==='Not stated on portal metadata; verify in tender dossier' ? null : sourceTimezone;
  return {day,time,displayed:row.deadline_displayed,timezone};
}
function interests(company) {
  try {const raw = JSON.parse(company.interests_json || '[]');return Array.isArray(raw) && raw.every(x => typeof x === 'string') ? unique(raw.map(canonical).filter(Boolean)) : null;} catch {return null;}
}
function sectorTerms(sector) {
  const key = canonical(sector);
  if (['healthcare','health','medical','shendetesi','shendetesia','all healthcare','healthcare procurement'].includes(key)) return [];
  if (['pharma','pharmaceuticals','pharmaceutical','medicines','barna'].includes(key)) return ['barna','farmaceut','medikament','vaksin','medicine','pharma'];
  if (['laboratory','diagnostics','laborator','laborator dhe diagnostike'].includes(key)) return ['laborator','diagnost','reagent','reagens','analizator'];
  if (['dental','stomatology'].includes(key)) return ['dental','stomatolog'];
  if (['medical devices','medical equipment'].includes(key)) return ['pajisje','equipment','medical device','kirurg','instrument','radiolog'];
  return null;
}
function sourceState(feed, now, timezone) {
  const checked = feed?.last_successful_check || null, stamp = Date.parse(checked);
  let sameDay = false;
  if (Number.isFinite(stamp)) sameDay = localClock(new Date(stamp),timezone).date === localClock(now,timezone).date;
  const age = Number.isFinite(stamp) ? now.getTime()-stamp : null;
  const notices = Array.isArray(feed?.notices) ? feed.notices : null;
  const validIds = notices && notices.every(r => r && typeof r === 'object' && String(r.notice_id || '').trim());
  const uniqueIds = validIds && new Set(notices.map(r=>String(r.notice_id))).size === notices.length;
  const fresh = feed?.run?.status === 'ok' && sameDay && age !== null && age >= 0 && age <= 6*60*60*1000 && uniqueIds;
  return {fresh:Boolean(fresh),checked,same_local_day:sameDay,age_minutes:age === null ? null : Math.round(age/60000),run_status:feed?.run?.status || 'unavailable',reason:feed?.run?.status !== 'ok' ? 'Latest source check failed or is unavailable.' : !uniqueIds ? 'Source notice records are missing or ambiguous.' : !sameDay ? 'No successful source check on this local date.' : age < 0 ? 'Source timestamp is in the future.' : age > 6*60*60*1000 ? 'Successful source check is more than six hours old.' : null};
}
function verifiedAI(aiReport, row, related, checked) {
  // A complete context fingerprint set is mandatory: a new correction must
  // invalidate old interpretation even when the tender itself is unchanged.
  if (aiReport?.status !== 'ready' || aiReport.source_checked_at !== checked || !row.fingerprint) return null;
  const entry = (Array.isArray(aiReport.entries) ? aiReport.entries : []).find(e => e && String(e.notice_id) === String(row.notice_id) && e.fingerprint === row.fingerprint);
  const context = entry?.context_fingerprints;
  if (!context || typeof context !== 'object' || Array.isArray(context) || Object.keys(context).length !== related.length || related.some(r => !r.fingerprint || context[String(r.notice_id)] !== r.fingerprint)) return null;
  return {why_match:typeof entry.why_match === 'string' ? entry.why_match : null,next_step:typeof entry.next_step === 'string' ? entry.next_step : null,evidence_gaps:strings(entry.evidence_gaps),source_profile:'HumanPlus source profile; company fit and qualification require independent verification.'};
}
function reportAIState(body,aiReport) {
  const count=body.opportunities.filter(row=>row.ai_interpretation).length;
  body.ai_verified_count=count;
  body.ai_generated_at=count&&typeof aiReport?.generated_at==='string'&&Number.isFinite(Date.parse(aiReport.generated_at))?aiReport.generated_at:null;
  if(body.status==='insufficient_coverage') {body.ai_status='not_applicable';body.ai_note='The connected source does not cover this sector.';}
  else if(body.status==='source_unavailable') {body.ai_status='source_unavailable';body.ai_note='AI interpretation is unavailable while the source check is unavailable.';}
  else if(count) {body.ai_status='verified';body.ai_note=`${count} displayed candidates have fingerprint-verified AI interpretation. Other candidates use source metadata and matching rules.`;}
  else if(!aiReport) {body.ai_status='pending';body.ai_note='Daily AI analysis has not arrived. This report uses source metadata and matching rules.';}
  else if(aiReport.status!=='ready') {body.ai_status='unavailable';body.ai_note='Daily AI analysis is not ready. This report uses source metadata and matching rules.';}
  else if(aiReport.source_checked_at!==body.source_checked_at) {body.ai_status='source_mismatch';body.ai_note='AI analysis belongs to a different source check and was excluded.';}
  else {body.ai_status='no_verified_matches';body.ai_note='No AI interpretation passed source verification for the displayed candidates.';}
  return body;
}
function candidateReport(company, clock, now, feed, aiReport) {
  const state = sourceState(feed,now,clock.timezone), terms = sectorTerms(company.sector), keywords = interests(company);
  const body = {company_id:company.id,report_date:clock.date,title:`Daily procurement report · ${company.name}`,timezone:clock.timezone,scheduled_local_time:clock.scheduled,generated_at:now.toISOString(),updated_at:now.toISOString(),source_checked_at:state.checked,status:'ready',summary:'',coverage:{sector:company.sector,available_sector:'healthcare',complete:false,source_url:officialLink(feed?.source_url),note:feed?.coverage_note || 'The available feed covers healthcare public metadata, not all sectors or all tender documents.',freshness:state},opportunities:[],counts:{source_notices:Array.isArray(feed?.notices)?feed.notices.length:0,matched_procedures:0,actionable:0,shown:0,requires_status_review:0},warnings:['A match is research evidence, not proof of qualification or permission to represent a brand.','Delivery is to this application inbox; ChatGPT delivery is not connected.']};
  if (terms === null) {
    body.status='insufficient_coverage';body.summary='This sector is not covered by the connected healthcare feed. Absence of results does not mean no opportunities exist.';body.counts.actionable=null;return reportAIState(body,aiReport);
  }
  if (keywords === null) {body.status='source_unavailable';body.summary='Company interest settings are invalid. Matching was not performed.';return reportAIState(body,aiReport);}
  if (!state.fresh) {body.status='source_unavailable';body.summary=`Daily source unavailable: ${state.reason} No empty-success report was produced.`;body.counts.actionable=null;return reportAIState(body,aiReport);}
  const groups = new Map();
  for (const row of feed.notices) {const key=procedure(row);groups.set(key,[...(groups.get(key)||[]),row]);}
  const actionable=[];
  for (const [key,group] of groups) {
    const related=group.slice().sort(latest), tender=related.find(r=>r.evidence_classification==='tender_notice');
    if (!tender) continue;
    const haystack=canonical([tender.title,tender.buyer,tender.category_sq,tender.cpv_as_published].join(' '));
    const matchedKeywords=keywords.filter(k=>haystack.includes(k));
    if (terms.length && !terms.some(t=>haystack.includes(t)) || keywords.length && !matchedKeywords.length) continue;
    body.counts.matched_procedures++;
    const decision=related.find(r=>['tender_notice','award_notice','signing_notice','cancellation_notice','decision_notice'].includes(r.evidence_classification));
    if (decision?.evidence_classification !== 'tender_notice') continue;
    const deadlineSource=related.find(r=>deadline(r)), due=deadlineSource ? deadline(deadlineSource) : null;
    const url=officialLink(tender.source_url);
    if (!due || !url) {body.counts.requires_status_review++;continue;}
    let portalClock;
    try {portalClock=localClock(now,due.timezone || 'Europe/Tirane');} catch {body.counts.requires_status_review++;continue;}
    if (due.day < portalClock.date || due.day === portalClock.date && due.time && due.time <= portalClock.time) continue;
    const ai=verifiedAI(aiReport,tender,related,state.checked);
    const gaps=unique([...related.flatMap(r=>strings(r.gaps)),...strings(ai?.evidence_gaps),'Tender requirements and eligibility have not been independently extracted or verified.',...(!due.timezone?['The portal deadline timezone is unspecified; local comparison assumes Europe/Tirane and must be verified.']:[]),...(!due.time?['The deadline closing time is unspecified.']:[])]);
    actionable.push({procedure:key,notice_id:String(tender.notice_id),title:String(tender.title||'Untitled notice'),buyer:String(tender.buyer||'Unknown buyer'),category:String(tender.category_sq||'Unclassified'),source_url:url,deadline:due.displayed,deadline_date:due.day,deadline_time:due.time,deadline_timezone:due.timezone,deadline_source_url:officialLink(deadlineSource.source_url),status:'open_candidate_verify_dossier',why_match:[`Within the connected healthcare feed for sector ${company.sector}.`,...matchedKeywords.map(k=>`Company interest matched: ${k}`)],requirements:null,requirements_status:'unknown',evidence_gaps:gaps,related_notice_ids:related.map(r=>String(r.notice_id)),ai_interpretation:ai,source_fingerprint:tender.fingerprint||null});
  }
  actionable.sort((a,b)=>a.deadline_date.localeCompare(b.deadline_date) || String(a.deadline_time||'23:59').localeCompare(String(b.deadline_time||'23:59')) || a.notice_id.localeCompare(b.notice_id));
  body.opportunities=actionable.slice(0,30);body.counts.actionable=actionable.length;body.counts.shown=body.opportunities.length;
  body.status=actionable.length?'ready':'no_matches';body.summary=actionable.length?`${actionable.length} candidate procedures have future deadlines in the available feed; verify the official dossier and lot status.`:'No matching future-deadline candidates were identified in the available healthcare feed. This is not a statement about the entire market.';
  return reportAIState(body,aiReport);
}

function enrichReport(existing,candidate,aiReport,now) {
  if(!['ready','no_matches'].includes(existing.status)||!['ready','no_matches'].includes(candidate.status)||existing.source_checked_at!==candidate.source_checked_at)return null;
  const verified=new Map(candidate.opportunities.filter(row=>row.ai_interpretation).map(row=>[row.notice_id,row]));
  let additions=0;
  const opportunities=existing.opportunities.map(row=>{
    const fresh=verified.get(row.notice_id);
    if(row.ai_interpretation||!fresh||!row.source_fingerprint||row.source_fingerprint!==fresh.source_fingerprint)return row;
    additions++;
    return {...row,ai_interpretation:fresh.ai_interpretation,evidence_gaps:unique([...strings(row.evidence_gaps),...strings(fresh.ai_interpretation.evidence_gaps)])};
  });
  if(!additions)return null;
  return reportAIState({...existing,opportunities,updated_at:now.toISOString()},aiReport);
}

/** One report per company/local date. A same-day outage may recover in place,
 * and newly verified AI may enrich the same source snapshot in place;
 * the stable report and delivery IDs prevent repeated notifications. */
export function buildDailyReports(db,{now=new Date(),feed,aiReport=null}={}) {
  ensureReportSchema(db);
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) throw new TypeError('Invalid report clock');
  const companies=db.prepare(`SELECT c.*,COALESCE(p.enabled,1) AS enabled,COALESCE(p.timezone,'Europe/Tirane') AS timezone,COALESCE(p.local_time,'10:00') AS local_time FROM companies c LEFT JOIN report_preferences p ON p.company_id=c.id`).all();
  const results=[];
  for (const company of companies) {
    if (!company.enabled) continue;
    const clock=schedule(company,now);if (!clock || clock.time<clock.scheduled) continue;
    db.exec('BEGIN IMMEDIATE');
    try {
      const existing=db.prepare('SELECT * FROM reports WHERE company_id=? AND report_date=?').get(company.id,clock.date);
      let body;
      if (existing && existing.status !== 'source_unavailable') {
        const previous=JSON.parse(existing.body_json);
        if(aiReport?.status==='ready'&&aiReport.source_checked_at===existing.source_checked_at&&feed?.last_successful_check===existing.source_checked_at&&['ready','no_matches'].includes(existing.status))body=enrichReport(previous,candidateReport(company,clock,now,feed,aiReport),aiReport,now);
        if(!body){results.push(previous);db.exec('COMMIT');continue;}
      } else body=candidateReport(company,clock,now,feed,aiReport);
      if (existing && body.status==='source_unavailable') {results.push(JSON.parse(existing.body_json));db.exec('COMMIT');continue;}
      body.id=existing?.id||randomUUID();body.revision=existing?existing.revision+1:1;
      if (existing) {
        body.generated_at=existing.generated_at;
        db.prepare('UPDATE reports SET status=?,source_checked_at=?,updated_at=?,revision=?,body_json=? WHERE id=? AND company_id=?').run(body.status,body.source_checked_at,body.updated_at,body.revision,JSON.stringify(body),body.id,company.id);
      } else db.prepare('INSERT INTO reports(id,company_id,report_date,timezone,scheduled_local_time,status,source_checked_at,generated_at,updated_at,revision,body_json) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(body.id,company.id,clock.date,clock.timezone,clock.scheduled,body.status,body.source_checked_at,body.generated_at,body.updated_at,body.revision,JSON.stringify(body));
      results.push(body);db.exec('COMMIT');
    } catch (error) {db.exec('ROLLBACK');throw error;}
  }
  return results;
}

/** Caller must authorize an active membership before exposing these reports. */
export function listReports(db,companyId) {
  ensureReportSchema(db);
  return db.prepare('SELECT body_json FROM reports WHERE company_id=? ORDER BY report_date DESC').all(companyId).map(r=>JSON.parse(r.body_json));
}

/** Atomic durable inbox delivery, not an external push or ChatGPT message. */
export function runDeliveryTick(db,{now=new Date()}={}) {
  ensureReportSchema(db);
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) throw new TypeError('Invalid delivery clock');
  const delivered=[];db.exec('BEGIN IMMEDIATE');
  try {
    const rows=db.prepare(`SELECT r.id AS report_id,r.company_id,r.report_date,COALESCE(p.timezone,'Europe/Tirane') AS timezone,COALESCE(p.local_time,'10:00') AS local_time,m.user_id FROM reports r JOIN memberships m ON m.company_id=r.company_id AND m.status='active' LEFT JOIN report_preferences p ON p.company_id=r.company_id WHERE COALESCE(p.enabled,1)=1`).all();
    for (const row of rows) {
      const clock=schedule(row,now);if (!clock || clock.date!==row.report_date || clock.time<clock.scheduled) continue;
      const item={id:randomUUID(),company_id:row.company_id,user_id:row.user_id,report_id:row.report_id,channel:'in_app',status:'delivered',created_at:now.toISOString(),delivered_at:now.toISOString(),read_at:null};
      const inserted=db.prepare('INSERT OR IGNORE INTO notification_deliveries(id,company_id,user_id,report_id,channel,status,created_at,delivered_at) SELECT ?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM memberships WHERE company_id=? AND user_id=? AND status=?)').run(item.id,item.company_id,item.user_id,item.report_id,item.channel,item.status,item.created_at,item.delivered_at,item.company_id,item.user_id,'active');
      if (inserted.changes) delivered.push(item);
    }
    db.exec('COMMIT');return delivered;
  } catch (error) {db.exec('ROLLBACK');throw error;}
}
