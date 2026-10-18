#!/usr/bin/env python3
"""Append source-backed award-year records; raw inputs/output remain outside the checkout."""
import argparse,collections,copy,gzip,hashlib,json,pathlib,re,unicodedata
from urllib.parse import urlparse

REGISTRY='https://data.open-contracting.org/en/publication/115'
ARCHIVE='https://fastly.data.open-contracting.org/downloads/kosovo/3446/full.jsonl.gz'
ARCHIVE_SHA='b782bdb3c323b3a6b9bba72c906756744700752bd9287efe55dbab4fe1f1341b'
SECTORS={'medicines':('Barna','Barna dhe produkte farmaceutike'),'medical_consumables':('Materiale mjekësore','Material shpenzues mjekësor'),'medical_equipment':('Pajisje mjekësore','Pajisje mjekësore, kategori e përgjithshme'),'laboratory':('Laborator klinik (titull)','Laboratorë dhe diagnostikë in vitro'),'health_services':('Shërbime shëndetësore','Shërbime klinike dhe kontrolle mjekësore')}
HEALTH_MARKERS=['shskuk','spital','shendet','klinike universitare','stomatolog','mjek','tranfuzion','transfuzion','psikiatri','produkte dhe pajisje medicinale']
def norm(s):return ' '.join(''.join(c for c in unicodedata.normalize('NFKD',str(s or '').lower()) if not unicodedata.combining(c)).split())
def sha(b):return hashlib.sha256(b).hexdigest()
def run(args):
 app=pathlib.Path(__file__).resolve().parents[1];base=pathlib.Path(args.baseline).resolve();out=pathlib.Path(args.output).resolve();archive=pathlib.Path(args.archive).resolve()
 assert not out.is_relative_to(app),'Private output must remain outside the source checkout'
 assert sha(archive.read_bytes())==ARCHIVE_SHA,'Unexpected source archive'
 market=json.loads((base/'data/market.json').read_text());original=copy.deepcopy(market['records']);assert not any(r['year']==args.year for r in original),'Year already present'
 terms=collections.defaultdict(set)
 for r in original:
  for part in (r.get('existing_sector_evidence') or '').split('|'):
   sector,sep,term=part.strip().partition(': ')
   if sector in SECTORS and sep and not term.startswith('source category'):terms[sector].add(norm(term))
 health_ids={r['buyer_id'] for r in original if r.get('healthcare_buyer')=='True' and r.get('buyer_id')}
 rows=[];source_lines=[];national=0;source_processes=0;cross_partition=0;month_counts=collections.Counter();seen={};line_numbers=[]
 with gzip.open(archive,'rt') as stream:
  for line_number,line in enumerate(stream,1):
   release=json.loads(line);source_processes+=1;t=release.get('tender') or {};buyer=(t.get('procuringEntity') or {}).get('party') or {};bname=buyer.get('name') or ''
   marker=next((x for x in HEALTH_MARKERS if x in norm(bname)),None);health=buyer.get('id') in health_ids or bool(marker);used=False
   for award in release.get('award',[]) or []:
    date=str(award.get('date') or '')
    if date[:4]!=args.year:continue
    national+=1
    title=award.get('lotTitle') or award.get('title') or t.get('title') or ''
    text=norm(' '.join(str(v or '') for v in [title,award.get('title'),t.get('title')]))
    hits={sector:sorted(term for term in words if term in text) for sector,words in terms.items()};hits={k:v for k,v in hits.items() if v}
    if not health and not hits:continue
    assert award.get('uID') and release.get('ocid'),'Award identity is required'
    key=release['ocid']+':'+award['uID'];assert key not in seen,'Duplicate source identity: '+key;seen[key]=True
    used=True;outside=not str(release.get('date','')).startswith(args.year);cross_partition+=outside;month_counts[date[:7]]+=1
    parties=[s.get('party') or {} for s in award.get('suppliers',[]) or []];names=[p.get('name') or '' for p in parties];ids=[p.get('id') or '' for p in parties];registrations=[(p.get('identity') or {}).get('identificationNumber') or '' for p in parties]
    value=award.get('value') or {};amount=value.get('amount');currency=value.get('currency') or 'unknown';assert amount is None or isinstance(amount,(float,int))
    links=[d.get('url') or '' for d in t.get('documents',[])];url=next((u for u in links if urlparse(u).scheme=='https' and not re.search(r'[?&]id=$',u,re.I)),'')
    nonclinical=any(v in norm(bname+' '+text) for v in ['veterinar','flotacion','balistik','per tekstile','per fermen','fbv-','ujerave','ujit te pijshem'])
    medical='yes' if hits else 'no';sector=next(iter(hits),'support');category,sector_sq=SECTORS.get(sector,('Pa evidencë pozitive për produkt mjekësor','Blerje mbështetëse të institucioneve shëndetësore'))
    if len(hits)>1:category='Mallra mjekësore dhe të tjera të pandara';sector='mixed';sector_sq='Blerje mjekësore të përziera';medical='review'
    if ('laboratory' in hits and not health) or nonclinical:category='Laborator ndërsektorial: përdorim i paqartë' if 'laboratory' in hits else 'Përdorim i mundshëm klinik/paketë: shqyrtim';medical='review';sector_sq='Për verifikim të fushës mjekësore'
    if health and 'medical_equipment' in hits and any(v in text for v in ['mirembajt','servisim','riparim']):category='Mirëmbajtje pajisjesh klinike'
    flags=['cpv_missing_text_classification_only','classification_text_inferred_2024']
    if not url:flags.append('source_record_link_missing')
    if currency!='EUR':flags.append('currency_unverified')
    if not any(names):flags.append('supplier_identity_unverified')
    group=len(parties)>1 or any(v in norm(' '.join(names)) for v in ['grup i operatoreve','grup i operator','konsorcium'])
    if group:flags.append('consortium_value_do_not_allocate_to_members')
    if amount is not None and 0<amount<100:flags.append('low_value_unit_price_possible')
    evidence=' | '.join(k+': '+', '.join(v) for k,v in hits.items())
    rows.append({'row_key':key,'source':'historical_ocds_mirror_2024','source_label':'KRPP / OCP · 2024','year':args.year,'period':args.year,'source_date':date,'award_id':award['uID'],'reference':award.get('tenderNumber') or t.get('id'),'process_id':release['ocid'],'title':title,'full_tender_title':t.get('title'),'buyer':bname,'buyer_id':buyer.get('id'),'supplier':' | '.join(names) or 'E papërcaktuar','supplier_id':' | '.join(ids),'supplier_registration_id':' | '.join(registrations),'reported_value':str(amount) if amount is not None else None,'amount':amount,'value_unit':currency,'value_bucket':'published_award_value','amount_type':'unverified_published_amount','verified_contract_total':None,'quantity':None,'paid_amount':None,'category':category,'primary_sector':sector,'primary_sector_sq':sector_sq,'classification_basis':'Klasifikim tekstual me termat e historikut; kërkon shqyrtim. '+evidence,'classification_confidence':'Mesatare, klasifikim tekstual; pa CPV','classification_evidence':evidence,'classification_method':'baseline_keyword_taxonomy_v1','healthcare_buyer':str(health),'healthcare_buyer_evidence':marker or ('buyer_id_in_supplied_healthcare_scope' if health else 'no human-health institution name marker; multipurpose municipalities remain outside'),'medical_goods_services':medical,'medical_status_sq':{'yes':'Po','no':'Jo','review':'Për shqyrtim'}[medical],'medical_goods_services_scope':sector,'medical_goods_services_evidence':evidence,'union_positive':str(health or medical=='yes'),'quadrant_sq':('Blerës shëndetësor + blerje mjekësore' if medical=='yes' else 'Blerës shëndetësor; blerje tjetër/paqartë') if health else ('Blerje mjekësore nga blerës tjetër' if medical=='yes' else 'neither_positive'),'group_label':str(group),'duplicate_flag':'False','duplicate_group':'','cpv_code':'','cpv_description':'','cpv_join_status':'not_available_in_mirror','municipality':'E papërcaktuar','source_url':url,'source_link_usable':bool(url),'source_dataset_url':REGISTRY,'source_archive_url':ARCHIVE,'source_archive_line':line_number,'source_release_date':release.get('date'),'source_document_id':'documents/2024-recovered-processes.jsonl.gz','audit_flags':flags,'overlays':[],'secondary_tags':[],'provenance':{'publisher':'Kosovo Public Procurement Regulatory Commission (KRPP/PPRC)','distributor':'Open Contracting Partnership','snapshotRetrievedAt':'2026-03-08','downloadedAt':'2026-10-18','yearBasis':'award.date','sourceArchiveSha256':ARCHIVE_SHA,'sourceLineSha256':sha(line.encode()),'sourceAwardId':award['uID'],'sourceProcessId':release['ocid'],'recoveredFromOtherReleaseYear':outside}})
   if used:source_lines.append(line);line_numbers.append(line_number)
 groups=collections.defaultdict(list)
 for r in rows:groups[(r['process_id'],norm(r['title']),r['supplier_registration_id'] or r['supplier'],r['reported_value'],r['value_unit'])].append(r)
 for group in groups.values():
  if len(group)>1:
   group_id=sha(json.dumps([r['row_key'] for r in group]).encode())[:16]
   for r in group:r['duplicate_flag']='True';r['duplicate_group']=group_id;r['audit_flags'].append('duplicate_candidate_existing')
 rows.sort(key=lambda r:(r['source_date'],r['row_key']));assert rows and len(month_counts)==12
 assert not set(r['row_key'] for r in original)&set(r['row_key'] for r in rows)
 receipt={'year':args.year,'publisher':'KRPP/PPRC','registryUrl':REGISTRY,'archiveUrl':ARCHIVE,'archiveSha256':ARCHIVE_SHA,'archiveBytes':archive.stat().st_size,'mirrorRetrievedAt':'2026-03-08','downloadedAt':'2026-10-18','yearBasis':'award.date, not release.date or reference number','scannedProcesses':source_processes,'nationalAwardsInYear':national,'selectedAwardRecords':len(rows),'selectedProcesses':len(source_lines),'outsideReleaseYear':cross_partition,'monthlyCounts':dict(sorted(month_counts.items())),'eurPublishedAmount':round(sum(r['amount'] or 0 for r in rows if r['value_unit']=='EUR'),2),'categories':dict(collections.Counter(r['category'] for r in rows)),'scope':'Healthcare buyers plus medical/laboratory title candidates, including nonclinical support and uncertain cross-sector laboratory purchases. Not a census of Kosovo procurement or verified contracts/payments.','classification':'Text-based screening using the existing HumanPlus taxonomy; keywords are evidence, not clinical confirmation. No CPV in the mirror. Mixed and nonclinical cases remain for review.','duplicatePolicy':'One row per process OCID + award UID. Similar awards flagged; no amount removed or allocated to consortium members.','sourcePartitionPitfall':'The 2024 release partition excludes awards from processes released in earlier years. The full archive was scanned.','missingData':'2024 budget data and 2026 coverage gaps are unchanged.','classificationTerms':{k:sorted(v) for k,v in terms.items()},'healthBuyerMarkers':HEALTH_MARKERS,'originalRowsPreserved':len(original)}
 manifest=json.loads((app/'lib/import-manifest.json').read_text());documents=json.loads((base/'data/documents.json').read_text())
 def stage(key,value,mime='application/json'):
  raw=value if isinstance(value,bytes) else json.dumps(value,ensure_ascii=False,separators=(',',':')).encode();p=out/key;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(raw);manifest[key]={'sha256':sha(raw),'bytes':len(raw),'contentType':mime}
 def document(key,raw,name,mime):
  stage(key,raw,mime);m=manifest[key];documents['records'].append({'id':key,'name':name,'category':'procurement_2024','path':key,'bytes':m['bytes'],'sha256':m['sha256'],'date':'2026-10-18','status':'KRPP përmes OCP; kopje burimore me gjurmë verifikimi','text':json.dumps(receipt,ensure_ascii=False) if key.endswith('json') else '', 'source_url':REGISTRY})
 document('documents/2024-recovered-processes.jsonl.gz',gzip.compress(''.join(source_lines).encode(),mtime=0),'KRPP_OCP_2024_procedurat_burimore.jsonl.gz','application/gzip')
 document('documents/2024-provenance.json',json.dumps(receipt,ensure_ascii=False,indent=2).encode(),'HumanPlus_2024_burimi_dhe_metoda.json','application/json')
 market['records']=original+rows;coverage=market['coverage'];coverage['requested_years']=sorted(set(coverage['requested_years']+[int(args.year)]));coverage['recovered_years']={args.year:receipt};coverage['source_warning_counts']=dict(collections.Counter(f for r in market['records'] for f in r['audit_flags']));coverage['as_of']='2026-10-18';stage('data/market.json',market);stage('data/documents.json',documents)
 for name in ['overview','quality']:
  d=json.loads((base/f'data/{name}.json').read_text());d['coverage']=coverage
  if name=='overview':d['counts']['market']=len(market['records']);d['counts']['documents']=len(documents['records'])
  stage(f'data/{name}.json',d)
 (app/'lib/import-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n');(out/'recovery-2024.json').write_text(json.dumps(receipt,ensure_ascii=False,indent=2))
 print(json.dumps({k:v for k,v in receipt.items() if k not in ['classificationTerms','healthBuyerMarkers','categories']},ensure_ascii=False,indent=2))

if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--archive',required=True);p.add_argument('--baseline',required=True);p.add_argument('--output',required=True);p.add_argument('--year',default='2024');run(p.parse_args())
