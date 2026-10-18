"""Independent full reconciliation of recovered records, source amounts and retained objects."""
import collections,gzip,hashlib,json,pathlib
from decimal import Decimal
ROOT=pathlib.Path(__file__).resolve().parents[2]
old=ROOT/'private/expanded-objects';new=ROOT/'private/procurement-2024-objects'
baseline=json.loads((old/'data/market.json').read_text())['records'];data=json.loads((new/'data/market.json').read_text());rows=[r for r in data['records'] if r['year']=='2024']
assert [r for r in data['records'] if r['year']!='2024']==baseline
assert len(rows)==1773 and len(data['records'])==5386 and len({r['row_key'] for r in data['records']})==5386
source={};scanned=0;national=0
with gzip.open(ROOT/'private/procurement-2024/full.jsonl.gz','rt') as f:
 for line_number,line in enumerate(f,1):
  release=json.loads(line);scanned+=1
  for a in release.get('award',[]) or []:
   if str(a.get('date','')).startswith('2024'):
    national+=1;source[(release['ocid'],a['uID'])]=(release,a,line_number,hashlib.sha256(line.encode()).hexdigest())
months=collections.Counter();total=Decimal(0);cross=0
for row in rows:
 release,award,line_number,line_hash=source[(row['process_id'],row['award_id'])]
 assert row['source_date']==award['date'] and row['year']==award['date'][:4]
 assert row['amount']==award['value'].get('amount') and row['value_unit']==award['value'].get('currency')
 assert row['buyer']==release['tender']['procuringEntity']['party']['name']
 assert row['source_archive_line']==line_number and row['provenance']['sourceLineSha256']==line_hash
 assert row['supplier']==(' | '.join((s.get('party') or {}).get('name') or '' for s in award.get('suppliers',[]) or []) or 'E papërcaktuar')
 assert row['paid_amount'] is None and row['verified_contract_total'] is None
 if row['value_unit']=='EUR':total+=Decimal(str(row['amount'] or 0))
 months[row['source_date'][:7]]+=1;cross+=not release['date'].startswith('2024')
receipt=data['coverage']['recovered_years']['2024'];assert scanned==75710 and national==10708 and cross==200
assert dict(months)==receipt['monthlyCounts'] and len(months)==12 and float(total)==receipt['eurPublishedAmount']
assert len({r['process_id'] for r in rows})==1163
manifest=json.loads((ROOT/'app/lib/import-manifest.json').read_text())
for key,item in manifest.items():
 raw=(new/key).read_bytes();assert len(raw)==item['bytes'] and hashlib.sha256(raw).hexdigest()==item['sha256']
 if (old/key).exists() and key not in ['data/market.json','data/quality.json','data/overview.json','data/documents.json']:assert raw==(old/key).read_bytes(),key
assert json.loads((new/'data/documents.json').read_text())['records'][:218]==json.loads((old/'data/documents.json').read_text())['records']
with gzip.open(new/'documents/2024-recovered-processes.jsonl.gz','rt') as f:assert {json.loads(line)['ocid'] for line in f}=={r['process_id'] for r in rows}
report={'rowsAdded':len(rows),'totalRows':len(data['records']),'months':dict(sorted(months.items())),'eurPublishedAmounts':str(total),'crossPartitionAwards':cross,'originalRowsUnchanged':len(baseline),'objectsVerified':len(manifest),'documents':220}
(ROOT/'artifacts/procurement-2024-data-verification.json').write_text(json.dumps(report,indent=2));print(json.dumps(report))
