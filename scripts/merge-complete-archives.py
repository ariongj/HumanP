#!/usr/bin/env python3
"""Merge the two supplied source archives without losing the published evidence.

Run after recover-budget-2024.py. The input folder is the safely extracted union
of the two ZIPs. Plaintext files remain outside the Git checkout.
"""
import argparse,collections,copy,gzip,hashlib,json,mimetypes,pathlib,re,shutil
import pymupdf

def sha(b):return hashlib.sha256(b).hexdigest()
def load(p):return json.loads(p.read_text())
def write(p,v):p.write_text(json.dumps(v,ensure_ascii=False,separators=(',',':')))
def clean(s):return ' '.join(str(s or '').split())
def amount(v):return float(str(v).replace(',','')) if v not in ('',None,'-') else 0
def run(args):
 app=pathlib.Path(__file__).resolve().parents[1];source=pathlib.Path(args.sources).resolve();out=pathlib.Path(args.objects).resolve();archive=pathlib.Path(args.archive).resolve();assert not out.is_relative_to(app)
 root=source/'HumanPlus_2023_2024_2025_2026_2027_2029';incoming=root/'private_data';bud=incoming/'public_budget/2024'
 assert sha((bud/'sources/budget_2024.pdf').read_bytes())=='a7ef95523599e2da45cc2cce229f420794e4a1184534f6d12a4a18c07b7445fa'
 assert sha((bud/'sources/execution_2024.pdf').read_bytes())=='38164add2e15c10ddbb729efe616f4216d5258cef78ec3f757d3c1c08e6bcd1b'
 assert sha(archive.read_bytes())=='b782bdb3c323b3a6b9bba72c906756744700752bd9287efe55dbab4fe1f1341b'
 budget=load(out/'data/budget.json');docs=load(out/'data/documents.json');market=load(out/'data/market.json');overview=load(out/'data/overview.json');quality=load(out/'data/quality.json')
 # Every archive file is retained once, with all supplied paths recorded as aliases.
 by_hash={r['sha256']:r for r in docs['records']};file_ids={};new_files=0
 for f in sorted(source.rglob('*')):
  if not f.is_file():continue
  raw=f.read_bytes();digest=sha(raw);rel=str(f.relative_to(source))
  if digest in by_hash:
   r=by_hash[digest];aliases=r.setdefault('supplied_paths',[])
   if rel not in aliases:aliases.append(rel)
   file_ids[rel]=r['id'];continue
  name=f.name;key='documents/complete-'+digest[:16]+f.suffix.lower();target=out/key;target.write_bytes(raw)
  category='archive_superseded' if 'archive_superseded' in rel else 'budget_2024' if 'public_budget/2024' in rel else 'procurement_2024' if '2024_evidence' in rel else 'complete_sources'
  preview=raw.decode('utf-8-sig',errors='replace')[:24000] if f.suffix.lower() in ('.txt','.md','.csv','.json','.py') else ''
  r={'id':key,'path':key,'name':name,'category':category,'bytes':len(raw),'sha256':digest,'date':'2026-10-18','status':'Paketë e dorëzuar · origjinali ruhet','text':preview,'supplied_paths':[rel]};docs['records'].append(r);by_hash[digest]=r;file_ids[rel]=key;new_files+=1
 def doc_id(f):return file_ids[str(f.relative_to(source))]
 def source_row(r,f,pdf='budget_2024.pdf'):
  c=copy.deepcopy(r);c.update(source_table_document=doc_id(f),source_document=doc_id(bud/'sources'/pdf),source_sha256=sha((bud/'sources'/pdf).read_bytes()),retrieved_at='2026-10-18');return c
 # Cross-check the independent PDF extraction against the supplied allocations.
 for name,keys,id_key in [('central_budget',['total','wages','goods_services','utilities','subsidies_transfers','capital'],'organization_code'),('municipal_budget',['total','wages','goods_services','utilities','subsidies_transfers','capital'],'municipality_code')]:
  independent={r[id_key]:r for r in budget[name] if str(r['year'])=='2024'}
  for r in load(bud/(name+'_2024.json')):
   assert r[id_key] in independent
   for k in keys:assert amount(r[k])==amount(independent[r[id_key]][k]),(name,r[id_key],k)
 # Funding rows are independently matched by proposal + funding source and all
 # eight amounts. Additional contextual candidates stay explicitly separated.
 supplied=load(bud/'capital_funding_rows_2024.json');ids={r['proposal_code']+':'+r['funding_source']:r for r in supplied}
 capital_keys=['reported_cumulative_expenditure_through_prior_year_eur','approved_continuing_current_year_eur','approved_new_current_year_eur','approved_current_year_eur','projection_next_year_eur','projection_second_year_eur','projection_later_years_eur','reported_total_project_value_eur']
 own={r['proposal_code']+':'+r['funding_source']:r for r in budget['capital_projects'] if r['budget_year']=='2024'}
 for key,r in ids.items():
  assert key in own,key
  for k in capital_keys:assert amount(r[k])==amount(own[key][k]),(key,k)
  own[key]['inclusion_status']='core';own[key]['source_table_document']=doc_id(bud/'capital_funding_rows_2024.json')
 for key in own.keys()-ids.keys():own[key]['inclusion_status']='context';own[key]['scope_caution']='Kandidat konteksti jashtë listës së kuruar: mund të jetë rrugë, lagje, hapësirë publike ose projekt i një institucioni tjetër. Mos e përfshi automatikisht në buxhetin klinik.'
 # Validate municipal programme rows against independent coordinates, including
 # 770 secondary care (three municipalities), then retain all hierarchy levels.
 own_prog={(r['municipality_code'],r['programme_code'],r['subprogramme_code']):r for r in budget['municipal_programmes_2024']}
 for r in load(bud/'municipal_programmes_2024.json'):
  other=own_prog[(r['municipality_code'],r['programme_code'],r['subprogramme_code'])]
  for k in ['total','wages','goods_services','utilities','subsidies_transfers','capital']:assert amount(r[k])==amount(other[k]),(r,k)
  other['source_table_document']=doc_id(bud/'municipal_programmes_2024.json')
 # Treasury series has the same basis as the retained 2023 data. The broader
 # audited figures are a separate view, never duplicate additive rows.
 budget['audited_execution_2024']=[r for r in budget['execution_2023'] if str(r['year'])=='2024']
 budget['execution_2023']=[r for r in budget['execution_2023'] if str(r['year'])!='2024']
 treasury=pymupdf.open(bud/'sources/execution_2024.pdf')
 treasury_rows=[]
 for r in load(bud/'central_execution_2024.json'):
  page=int(r['pdf_page']);flat=treasury[page-1].get_text(sort=True)
  expected=[int(amount(r[k])) for k in ['initial_budget_eur','final_simfk_budget_eur','payments_eur','commitments_obligations_eur']]
  numeric_rows=[]
  for line in flat.splitlines():
   m=re.search(r'([\d,]+|-)\s+([\d,]+|-)\s+([\d,]+|-)\s+([\d,]+|-)\s+\d+%\s*$',line)
   if m:numeric_rows.append([int(amount(v)) for v in m.groups()])
  c=source_row(r,bud/'central_execution_2024.json','execution_2024.pdf')
  if expected not in numeric_rows:
   matches=[]
   for candidate in (55,56):
    for line in treasury[candidate-1].get_text(sort=True).splitlines():
     m=re.search(r'([\d,]+|-)\s+([\d,]+|-)\s+([\d,]+|-)\s+([\d,]+|-)\s+\d+%\s*$',line)
     if m and [int(amount(v)) for v in m.groups()]==expected:matches.append(candidate)
   assert len(matches)==1,(r,matches)
   c.update(supplied_pdf_page=page,pdf_page=matches[0],page_correction='Verified cash execution row in Annex 3; supplied page pointed at budget revision table.')
  treasury_rows.append(c)
 budget['execution_2023'].extend(treasury_rows)
 # Programme and grant tables retain reported parent/child hierarchy. Check
 # every supplied nonzero number against the original PDF row or page.
 pdf=pymupdf.open(bud/'sources/budget_2024.pdf')
 central_programmes=[]
 for r in load(bud/'central_programmes_2024.json'):
  words=pdf[int(r['pdf_page'])-1].get_text('words');anchor=next(w for w in words if w[4]==r['programme_code'] and w[0]<100);line=[w for w in words if abs(w[1]-anchor[1])<1]
  edges=[545,575,615,660,705,750,805,880,930,980];keys=['employees','wages_eur','goods_services_eur','utilities_eur','subsidies_transfers_eur','capital_eur','total_eur','projection_y1_eur','projection_y2_eur']
  for k,lo,hi in zip(keys,edges,edges[1:]):
   vals=[w[4] for w in line if lo<=w[2]<hi];assert len(vals)<=1,(r,k,vals);assert int(amount(vals[0] if vals else 0))==int(amount(r[k])),(r,k,vals)
  c=source_row(r,bud/'central_programmes_2024.json');c['organization']={'206':'Ministria e Shëndetësisë','220':'SHSKUK','224':'Fondi i Sigurimeve Shëndetësore'}[r['organization_code']];central_programmes.append(c)
 budget['central_programmes_2024']=central_programmes
 for key in ['municipal_grants','municipal_annual_totals','hierarchy_reconciliation','municipal_validation','capital_project_rollup']:
  f=bud/(key+'_2024.json');budget[key+'_2024']=[source_row(r,f) for r in load(f)]
 grants=budget['municipal_grants_2024'];assert len(grants)==39
 for r in grants:
  if r['row_type']!='municipality':continue
  for amount_key,page_key in [('primary_health_grant','primary_pdf_page'),('secondary_health_financing','secondary_pdf_page')]:
   if amount(r[amount_key])==0:continue
   text_page=pdf[int(r[page_key])-1].get_text();token=f'{int(amount(r[amount_key])):,}';assert token in text_page,(r,token)
  assert amount(r['combined_health_grant_financing'])==amount(r['primary_health_grant'])+amount(r['secondary_health_financing'])
 # All provided 2024 award rows reconcile to the full KRPP archive by UUID.
 provided=load(incoming/'market/2024_evidence/2024_all_sector_awards.json');provided={r['row_id']:r for r in provided}
 supplied_records=load(incoming/'market/records_with_audit_flags.json')['records'];supplied_records={r['row_key']:r for r in supplied_records}
 supplied_classification={r['row_key']:r for r in load(incoming/'medical_sector/classified_procurement.json')['records']}
 old={r['row_key']:r for r in market['records']};added=[];national=[];matched=set();classification_fields=['primary_sector','primary_sector_sq','classification_basis','classification_confidence','secondary_tags','medical_goods_services','medical_goods_services_scope','medical_goods_services_evidence','medical_status_sq','healthcare_buyer','quadrant_sq']
 for line_number,line in enumerate(gzip.open(archive,'rt'),1):
  release=json.loads(line);t=release.get('tender') or {};buyer=(t.get('procuringEntity') or {}).get('party') or {}
  for award in release.get('award',[]) or []:
   if str(award.get('date',''))[:4]!='2024':continue
   key=release['ocid']+':'+award['uID'];value=award.get('value') or {};parties=[s.get('party') or {} for s in award.get('suppliers',[]) or []]
   if key in provided:
    p=provided[key];assert p['award_date']==award['date'] and abs(amount(p['award_value'])-amount(value.get('amount')))<.001 and p['award_currency']==value.get('currency'),key;matched.add(key)
   n={'row_key':key,'year':'2024','period':'2024','source_date':award['date'],'award_id':award['uID'],'process_id':release['ocid'],'reference':award.get('tenderNumber') or t.get('id'),'title':award.get('lotTitle') or award.get('title') or t.get('title') or '', 'full_tender_title':t.get('title'),'buyer':buyer.get('name') or 'E papërcaktuar','buyer_id':buyer.get('id'),'supplier':' | '.join(p.get('name') or '' for p in parties) or 'E papërcaktuar','supplier_registration_id':' | '.join((p.get('identity') or {}).get('identificationNumber') or '' for p in parties),'supplier_id':' | '.join(p.get('id') or '' for p in parties),'reported_value':value.get('amount'),'amount':value.get('amount'),'value_unit':value.get('currency') or 'unknown','value_bucket':'published_award_value','amount_type':'unverified_published_amount','source':'national_ocds_2024','source_label':'KRPP / OCP · të gjithë sektorët 2024','category':{'goods':'Mallra','services':'Shërbime','works':'Punë'}.get(t.get('mainProcurementCategory'),'E papërcaktuar'),'audit_flags':[],'duplicate_flag':'False','group_label':str(len(parties)>1),'overlays':[],'source_url':provided.get(key,{}).get('source_notice_urls','').split(' | ')[0],'source_dataset_url':'https://data.open-contracting.org/en/publication/115','source_archive_line':line_number,'source_release_date':release.get('date'),'provenance':{'archiveSha256':sha(archive.read_bytes()) if not national else national[0]['provenance']['archiveSha256'],'archiveLine':line_number,'scope':'All award objects dated 2024 in this KRPP/OCP snapshot. Not verified signed contracts or cash payments.'}}
   n['source_link_usable']=bool(n['source_url'].startswith('https://') and not n['source_url'].endswith('id='))
   if key in provided:n['supplied_award_evidence']=provided[key]
   national.append(n)
   if key not in old and key in supplied_records:
    r={**n,**supplied_records[key]};c=supplied_classification.get(key,{})
    for k in classification_fields:
     if k in c:r[k]=c[k]
    r.update(category=c.get('primary_sector_sq') or r.get('medical_goods_services_scope') or 'Për shqyrtim',source_label='KRPP / OCP · 2024 · shtesa e paketës',source='historical_ocds_mirror_2024',audit_flags=['cpv_missing_text_classification_only','classification_text_inferred_2024','supplied_scope_addition_2024'],overlays=[],source_link_usable=n['source_link_usable']);added.append(r)
 assert len(national)==10708 and matched==set(provided),(len(national),len(matched));assert len(added)==8,len(added)
 for r in market['records']:
  supplied_row=supplied_records.get(r['row_key'])
  if supplied_row:
   if 'resolved_overlays' in supplied_row:r['resolved_overlays']=supplied_row['resolved_overlays']
   if r['year']=='2024':r['supplied_classification']={k:supplied_classification.get(r['row_key'],{}).get(k) for k in classification_fields};r['supplied_record']=supplied_row
 unique={}
 for r in national:
  if r['row_key'] in unique:assert r==unique[r['row_key']],r['row_key']
  else:unique[r['row_key']]=r
 occurrences=collections.Counter(r['row_key'] for r in national);national=list(unique.values());assert len(national)==10701
 for r in national:r['source_occurrences']=occurrences[r['row_key']]
 market['records'].extend(added);market['nationalRecords2024']=national
 market['entrySupplement']=load(incoming/'market/entry_supplement.json');market['brandMentions2024']=load(incoming/'market/2024_evidence/2024_brand_title_mentions.json')
 current=[r for r in market['records'] if r['year']=='2024'];recovered=market['coverage']['recovered_years']['2024'];recovered.update(selectedAwardRecords=len(current),selectedProcesses=len({r['process_id'] for r in current}),outsideReleaseYear=sum(not str(r.get('source_release_date','')).startswith('2024') for r in current),monthlyCounts=dict(sorted(collections.Counter(r['source_date'][:7] for r in current).items())),suppliedPackageRecords=1760,overlappingSuppliedRecords=1752,additionalSuppliedRecords=8,retainedAdditionalContextRecords=21,nationalAwardsInYear=10701,nationalRawOccurrences=10708,nationalExactDuplicateOccurrences=7)
 market['coverage']['source_warning_counts']=dict(collections.Counter(f for r in market['records'] for f in r.get('audit_flags',[])))
 quality['coverage']=market['coverage']
 quality['resolvedOverlays']=load(root/'quality/row_corrections_resolved_by_id.json')
 readiness=load(out/'data/readiness.json');readiness['readiness']=load(incoming/'procurement_readiness/readiness_and_patterns.json')
 budget['coverage2024'].update(municipalHealthApprovedEUR=sum(amount(r['total']) for r in budget['municipal_budget'] if r['year']=='2024'),treasuryPaymentsEUR=sum(amount(r['payments_eur']) for r in treasury_rows if r['row_type']=='organization_total'),coreCapitalApprovedEUR=sum(amount(r['approved_current_year_eur']) for r in own.values() if r['inclusion_status']=='core'),attachmentFilesAdded=new_files,treasurySource=treasury_rows[0]['source_url'])
 budget['coverage2024']['counts'].update(centralProgrammes=len(central_programmes),municipalProgrammes=116,grants=38,treasuryExecution=len(treasury_rows),coreCapitalFundingRows=209,contextCapitalFundingRows=11)
 budget['coverage2024']['methods'].append('Treasury Annex 3 payments are separate from institution audit totals. Supplied FSSH category page references corrected against the original cash execution table. All original supplied files and alternate classifications retained.')
 budget['coverage2024']['sources'].append({'name':'treasury-2024','sha256':sha((bud/'sources/execution_2024.pdf').read_bytes()),'url':treasury_rows[0]['source_url'],'title':'Thesari · Raporti financiar vjetor 2024'})
 budget['coverage2024']['scope']='Health institutions 206/220/224; health programmes 730 and 770 in all 38 municipalities. Capital core and contextual candidates are separated. Parent/child budgets, grants and projects overlap and must not be summed.'
 overview['counts'].update(market=len(market['records']),documents=len(docs['records']));overview['budget2024']=budget['coverage2024'];overview['coverage']=market['coverage'];overview['cashShares']=budget['supplement']['health_actual_share']
 receipt={'sourceArchives':'HumanPlus_01_Dokumentet_dhe_te_dhenat (1).zip + HumanPlus_02_Burimet_dhe_provat (1).zip','date':'2026-10-18','sourceFiles':len(file_ids),'newUniqueFiles':new_files,'documents':len(docs['records']),'marketRecords':len(market['records']),'healthContext2024':len(current),'national2024':len(national),'suppliedNational2024Verified':len(matched),'additionalHealthRecords':len(added),'mergePolicy':'Stable UUID union; 10,708 national raw award occurrences contain 7 exact repeated UUIDs, exposed as 10,701 unique awards with source_occurrences retained. Retain existing records and their classification, supplied alternate classifications and resolved overlays. All supplied original files retained by SHA256; no file instructions executed. Treasury and audited payments separated by source scope.','files':file_ids}
 for name,d in [('budget',budget),('market',market),('quality',quality),('readiness',readiness),('overview',overview),('documents',docs)]:write(out/'data'/(name+'.json'),d)
 existing=load(app/'lib/import-manifest.json');manifest={}
 for key in [*['data/'+f.name for f in sorted((out/'data').glob('*.json'))],*[r['id'] for r in docs['records']]]:
  raw=(out/key).read_bytes();manifest[key]={'sha256':sha(raw),'bytes':len(raw),'contentType':existing.get(key,{}).get('contentType') or mimetypes.guess_type(key)[0] or 'application/octet-stream'}
 (app/'lib/import-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n');write(out/'complete-merge-receipt.json',receipt)
 print(json.dumps({k:v for k,v in receipt.items() if k!='files'},indent=2))

if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--sources',required=True);p.add_argument('--objects',required=True);p.add_argument('--archive',required=True);run(p.parse_args())
