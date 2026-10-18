"""Verify reconciliation and preservation against private source objects."""
import collections,hashlib,json,pathlib
ROOT=pathlib.Path(__file__).resolve().parents[2];APP=ROOT/'app';OUT=ROOT/'private/budget-2024-objects';BASE=ROOT/'private/procurement-2024-objects'
def load(p):return json.loads(p.read_text())
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def rowsum(rows,k):return sum(float(r[k]) for r in rows)
b=load(OUT/'data/budget.json');m=load(OUT/'data/market.json');docs=load(OUT/'data/documents.json')['records'];manifest=load(APP/'lib/import-manifest.json');receipt=load(OUT/'complete-merge-receipt.json')
assert len(manifest)==373 and len(docs)==356
for key,item in manifest.items():assert (OUT/key).stat().st_size==item['bytes'] and sha(OUT/key)==item['sha256'],key
for r in load(BASE/'data/documents.json')['records']:assert sha(OUT/r['id'])==r['sha256'],r['id']
for path,key in receipt['files'].items():assert sha(ROOT/'private/incoming-complete'/path)==sha(OUT/key),path
old={r['row_key']:r for r in load(BASE/'data/market.json')['records']};new={r['row_key']:r for r in m['records']}
assert len(new)==len(m['records'])==5394
for key,row in old.items():
 for field,value in row.items():assert new[key][field]==value,(key,field)
assert len(new.keys()-old.keys())==8
national={r['row_key']:r for r in m['nationalRecords2024']}
for key in new.keys()-old.keys():
 for field in ['reported_value','value_unit','source_date','process_id','award_id']:assert str(new[key][field])==str(national[key][field]),(key,field)
assert sum(r['source_occurrences'] for r in national.values())==10708
assert len([r for r in m['records'] if r['year']=='2024'])==1781
assert len(m['nationalRecords2024'])==len({r['row_key'] for r in m['nationalRecords2024']})==10701
assert len({r['category'] for r in m['nationalRecords2024']})>=3
for key in ['central_budget','municipal_budget','capital_projects','execution_2023']:
 original=load(BASE/'data/budget.json')[key];assert b[key][:len(original)]==original,key
central=[r for r in b['central_budget'] if r['year']=='2024'];municipal=[r for r in b['municipal_budget'] if r['year']=='2024'];capital=[r for r in b['capital_projects'] if r['budget_year']=='2024'];core=[r for r in capital if r['inclusion_status']=='core']
assert len(central)==3 and rowsum(central,'total')==263660768
assert len(municipal)==38 and rowsum(municipal,'total')==98801349
assert len(core)==209 and len({r['proposal_code'] for r in core})==184 and rowsum(core,'approved_current_year_eur')==61726194
assert len(capital)-len(core)==11
programmes=b['municipal_programmes_2024'];assert len(programmes)==116 and len([r for r in programmes if r['hierarchy_level']=='programme' and r['programme_code']=='770'])==3
assert rowsum([r for r in programmes if r['hierarchy_level']=='programme'],'total')==98801349
assert abs(rowsum([r for r in programmes if r['hierarchy_level']=='subprogramme'],'total')-98801349)<=1
assert len(b['central_programmes_2024'])==20
for key,total in [('execution_2023',239722563),('audited_execution_2024',240403904)]:
 r=[r for r in b[key] if r['year']=='2024'];assert len(r)==16 and rowsum([r for r in r if r['row_type']=='organization_total'],'payments_eur')==total
assert rowsum(b['functional_execution_2024'],'payments_eur')==3074595000
share=next(r for r in b['supplement']['health_actual_share'] if r['year']=='2024');assert share['health_cash_eur']==320008000 and abs(share['health_share_percent']-10.40813505518613)<1e-10
cash=[r for r in b['supplement']['prishtina_project_cash'] if r['year']=='2024'];assert len(cash)==9 and abs(rowsum(cash,'cash_paid_period_eur')-2886023.59)<.001
assert len([r for r in b['municipal_grants_2024'] if r['row_type']=='municipality'])==38
summary={'objectsVerified':len(manifest),'documents':len(docs),'archiveFilesPreserved':len(receipt['files']),'previousDocumentsPreserved':220,'previousProcurementRowsPreserved':len(old),'procurementRecords':len(new),'national2024':10701,'central2024EUR':263660768,'municipal2024EUR':98801349,'capitalCore2024EUR':61726194,'treasuryPayments2024EUR':239722563,'auditedPayments2024EUR':240403904,'verified':'All assertions passed. Source totals, hierarchy and payment bases remain separate.'}
(ROOT/'artifacts/complete-2024-data-verification.json').write_text(json.dumps(summary,indent=2));print(json.dumps(summary,indent=2))
