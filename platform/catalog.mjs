import {readFileSync} from 'node:fs';
const reference=JSON.parse(readFileSync(new URL('./catalog-reference.json',import.meta.url),'utf8'));
export function ensureCatalogSchema(db){
  db.exec(`CREATE TABLE IF NOT EXISTS catalog_products(
    id TEXT PRIMARY KEY,company_id TEXT NOT NULL REFERENCES companies(id),name TEXT NOT NULL,brand TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT '',supplier TEXT NOT NULL DEFAULT '',notes TEXT NOT NULL DEFAULT '',source_url TEXT NOT NULL DEFAULT '',
    version INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,
    UNIQUE(id,company_id));
    CREATE TABLE IF NOT EXISTS catalog_links(company_id TEXT NOT NULL REFERENCES companies(id),product_id TEXT NOT NULL,notice_id TEXT NOT NULL,reason TEXT NOT NULL,created_at TEXT NOT NULL,PRIMARY KEY(company_id,product_id,notice_id));`);
}
export function catalogFor(db,companyId){
  const research=reference.records.map(r=>({...r,name:r.model||r.source_product_text,origin:'research',readOnly:true}));
  const own=db.prepare('SELECT * FROM catalog_products WHERE company_id=? ORDER BY name').all(companyId).map(r=>({...r,origin:'company',readOnly:false}));
  return {products:[...own,...research],links:db.prepare('SELECT product_id,notice_id,reason FROM catalog_links WHERE company_id=?').all(companyId),methodology:reference.methodology};
}
