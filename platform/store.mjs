import {DatabaseSync} from 'node:sqlite';
import {mkdirSync, chmodSync} from 'node:fs';
import {dirname} from 'node:path';
import {randomUUID} from 'node:crypto';
import {ensureReportSchema} from './reports.mjs';
export const id = () => randomUUID();
export function openStore(path) {
  if (path !== ':memory:') mkdirSync(dirname(path), {recursive: true, mode: 0o700});
  const db = new DatabaseSync(path);
  if (path !== ':memory:') chmodSync(path, 0o600);
  db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
  CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY,email TEXT NOT NULL UNIQUE COLLATE NOCASE,name TEXT NOT NULL,password_hash TEXT NOT NULL,created_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS companies (id TEXT PRIMARY KEY,name TEXT NOT NULL,sector TEXT NOT NULL,interests_json TEXT NOT NULL DEFAULT '[]',created_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS memberships (company_id TEXT NOT NULL REFERENCES companies(id),user_id TEXT NOT NULL REFERENCES users(id),role TEXT NOT NULL CHECK(role IN ('owner','member','viewer')),status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','revoked')),PRIMARY KEY(company_id,user_id));
  CREATE TABLE IF NOT EXISTS sessions (hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),company_id TEXT NOT NULL REFERENCES companies(id),csrf TEXT NOT NULL,expires_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS invitations (hash TEXT PRIMARY KEY,company_id TEXT NOT NULL REFERENCES companies(id),email TEXT NOT NULL,role TEXT NOT NULL CHECK(role IN ('member','viewer')),expires_at TEXT NOT NULL,used_at TEXT);
  CREATE TABLE IF NOT EXISTS workspaces (id TEXT PRIMARY KEY,company_id TEXT NOT NULL REFERENCES companies(id),tender_id TEXT NOT NULL,title TEXT NOT NULL,buyer TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'watching',owner_id TEXT REFERENCES users(id),notes TEXT NOT NULL DEFAULT '',deadline TEXT,version INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,UNIQUE(company_id,tender_id),UNIQUE(id,company_id));
  CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY,company_id TEXT NOT NULL,workspace_id TEXT NOT NULL,title TEXT NOT NULL,assignee_id TEXT REFERENCES users(id),done INTEGER NOT NULL DEFAULT 0,FOREIGN KEY(workspace_id,company_id) REFERENCES workspaces(id,company_id));
  CREATE TABLE IF NOT EXISTS comments (id TEXT PRIMARY KEY,company_id TEXT NOT NULL,workspace_id TEXT NOT NULL,author_id TEXT NOT NULL REFERENCES users(id),body TEXT NOT NULL,created_at TEXT NOT NULL,FOREIGN KEY(workspace_id,company_id) REFERENCES workspaces(id,company_id));
  CREATE TABLE IF NOT EXISTS audit_events (id TEXT PRIMARY KEY,company_id TEXT REFERENCES companies(id),user_id TEXT REFERENCES users(id),action TEXT NOT NULL,entity_id TEXT,created_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS rate_limits (key TEXT PRIMARY KEY,attempts INTEGER NOT NULL,expires INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS report_preferences (company_id TEXT PRIMARY KEY REFERENCES companies(id),enabled INTEGER NOT NULL DEFAULT 1,timezone TEXT NOT NULL DEFAULT 'Europe/Tirane',local_time TEXT NOT NULL DEFAULT '10:00');
  CREATE TABLE IF NOT EXISTS source_cache (id INTEGER PRIMARY KEY CHECK(id=1),feed_json TEXT NOT NULL,ai_json TEXT,last_fetch_at TEXT NOT NULL,last_error TEXT);
  CREATE INDEX IF NOT EXISTS workspace_company ON workspaces(company_id);
  CREATE INDEX IF NOT EXISTS session_expiry ON sessions(expires_at);`);
  ensureReportSchema(db);
  return db;
}
export function transaction(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try { const result=fn(); db.exec('COMMIT'); return result; }
  catch(error) {db.exec('ROLLBACK'); throw error;}
}
export function audit(db, companyId, userId, action, entityId=null) {
  db.prepare('INSERT INTO audit_events VALUES (?,?,?,?,?,?)').run(id(),companyId,userId,action,entityId,new Date().toISOString());
}
export function createCompany(db, {name,sector='healthcare',userId}) {
  const companyId=id();
  transaction(db,()=>{
    db.prepare('INSERT INTO companies VALUES (?,?,?,?,?)').run(companyId,name,sector,'[]',new Date().toISOString());
    db.prepare('INSERT INTO memberships VALUES (?,?,?,?)').run(companyId,userId,'owner','active');
    db.prepare('INSERT INTO report_preferences(company_id) VALUES (?)').run(companyId);
    audit(db,companyId,userId,'company.created',companyId);
  });
  return companyId;
}
