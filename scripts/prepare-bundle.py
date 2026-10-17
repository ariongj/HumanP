#!/usr/bin/env python3
"""Validate immutable source files, apply documented overlays, stage private R2 objects.
No source data is written into the application checkout or client assets.
"""
import argparse, collections, csv, hashlib, json, pathlib, re, zipfile
import xml.etree.ElementTree as ET

parser = argparse.ArgumentParser()
parser.add_argument('--bundle', required=True)
parser.add_argument('--output', required=True)
args = parser.parse_args()
root, out = pathlib.Path(args.bundle).resolve(), pathlib.Path(args.output).resolve()
app = pathlib.Path(__file__).resolve().parents[1]
if out.is_relative_to(app):
    raise SystemExit('Private output must be outside the application checkout')
out.mkdir(parents=True, exist_ok=True)
def read(p): return json.loads((root / p).read_text(encoding='utf-8-sig'))
def sha(b): return hashlib.sha256(b).hexdigest()
index = read('FILE_INDEX.json')['files']
for item in index:
    p = (root/item['path']).resolve()
    assert p.is_relative_to(root) and p.is_file(), item['path']
    assert sha(p.read_bytes()) == item['sha256'], 'Source hash mismatch: '+item['path']
datasets = read('config/datasets.json')
for spec in datasets:
    data = read(spec['path'])
    for collection in spec['collections']:
        value = data
        for token in collection['pointer'].strip('/').split('/'):
            if token: value = value[token.replace('~1','/').replace('~0','~')]
        assert len(value) == collection['count'], spec['id']
for p in root.rglob('*.json'): json.loads(p.read_text(encoding='utf-8-sig'))
for p in root.rglob('*.csv'):
    with p.open(encoding='utf-8-sig', newline='') as f:
        rows=list(csv.reader(f))
        assert all(len(row)==len(rows[0]) for row in rows), p.name

ns={'x':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
z=zipfile.ZipFile(root/'private_documents/market/Market_workbook_20_tabs.xlsx')
def sheet(number):
    return {int(row.attrib['r']): {re.sub(r'\d','', c.attrib['r']):c.findtext('x:v',None,ns) for c in row}
            for row in ET.fromstring(z.read(f'xl/worksheets/sheet{number}.xml')).find('x:sheetData',ns)}
original_sheets={'Historiku':sheet(6),'Regjistri2026':sheet(7),'Buxheti komunal':sheet(8),'Kandidatë klinikë':sheet(13),'Furnizime laboratorike':sheet(14)}
overlays=list(csv.DictReader((root/'quality/row_corrections_overlay.csv').open(encoding='utf-8-sig')))
records=read('private_data/market/records_with_audit_flags.json')['records']
by_id={r['row_key']:r for r in records}
assert len(records)==3613 and len(by_id)==3613
for r in records:
    r['overlays']=[]
    raw=r['reported_value']
    r['amount']=float(raw) if raw not in ('',None) else None
    r['category']=r.get('medical_goods_services_scope') or 'unclassified'
    r['source_link_usable']=bool(r['source_link_usable'] and re.match(r'^https?://',r.get('source_url','')) and not re.search(r'[?&]id=$',r['source_url'],re.I))
for label, rows in original_sheets.items():
    if label not in ('Historiku','Regjistri2026'): continue
    for n, cells in rows.items():
        if cells.get('O') in by_id:
            by_id[cells['O']]['source_sheet']=label
            by_id[cells['O']]['source_row']=n
            by_id[cells['O']]['category']=cells.get('J') or by_id[cells['O']]['category']
overlay_matches=[]
for overlay in overlays:
    label=overlay['Fleta_origjinale']; selector=overlay['Rreshti_Excel']; rows=original_sheets[label]
    selected=set()
    if 'Të gjitha' in selector: selected={n for n in rows if n>=6}
    else:
        for part in selector.replace('–','-').split(';'):
            ends=[int(x) for x in part.split('-')]; selected.update(range(ends[0],ends[-1]+1))
    matches=[]
    for number in sorted(selected):
        cells=rows.get(number,{})
        if label in ('Historiku','Regjistri2026'):
            targets=[by_id[cells['O']]] if cells.get('O') in by_id else []
        elif label in ('Kandidatë klinikë','Furnizime laboratorike'):
            targets=[r for r in records if r.get('reference')==cells.get('G') and r.get('title')==cells.get('C') and r.get('supplier')==cells.get('D')]
        else: targets=[]
        for r in targets:
            entry={**overlay,'resolved_row':number}
            if entry not in r['overlays']: r['overlays'].append(entry)
            if 'classification_overlay' not in r['audit_flags']: r['audit_flags'].append('classification_overlay')
            if label in ('Kandidatë klinikë','Furnizime laboratorike'): r['category']=overlay['Etiketa_e_rekomanduar']
            matches.append(r['row_key'])
    overlay_matches.append({**overlay,'matched_record_ids':sorted(set(matches)), 'status':'budget_note' if label=='Buxheti komunal' else 'applied' if matches else 'unmatched'})
assert all(x['status']!='unmatched' for x in overlay_matches), overlay_matches

catalogue=read('private_data/catalogue/beolab_reference_catalogue.json')
clinical=read('quality/clinical-safety-review.json')
for entry in catalogue['analyses']:
    review=clinical['entriesBySourceId'].get(str(entry['sourceId']))
    if review:
        entry['originalReviewedFields']={k:entry.get(k) for k in review.get('fieldOverrides',{})}
        entry.update(review.get('fieldOverrides',{})); entry['clinicalReview']=review
    entry['humanPlus']['publicationApproved']=False
assert len(catalogue['analyses'])==1071 and len(catalogue['categories'])==23
assert collections.Counter(x['kind'] for x in catalogue['analyses'])=={'analysis':957,'panel':102,'service':12}
employers=read('private_data/partners/employer_prospects.json'); assert len(employers['records'])==200
workbook=read('private_data/finance/workbook_cells_and_formulas.json')
finance_sheets={s['name']:{c['address']:c for c in s['cells']} for s in workbook['sheets']}
actions=[]
for n in range(8,16):
    c=finance_sheets['Plani 2026']
    actions.append({'id':f'action-{n}','title':c[f'C{n}']['value'],'dueSuggestion':c[f'D{n}']['value'],'outcome':c[f'E{n}']['value'],'dependency':c[f'F{n}']['value'],'owner':None,'due':None,'status':'Propozim për miratim','source':f'Plani 2026!C{n}:F{n}'})
documents=[]; objects={}
def stage(key, value, content_type='application/json'):
    body=(json.dumps(value,ensure_ascii=False,separators=(',',':')).encode() if not isinstance(value,bytes) else value)
    dest=out/key; dest.parent.mkdir(parents=True,exist_ok=True); dest.write_bytes(body)
    objects[key]={'sha256':sha(body),'bytes':len(body),'contentType':content_type}
mime={'.pdf':'application/pdf','.xlsx':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','.docx':'application/vnd.openxmlformats-officedocument.wordprocessingml.document','.csv':'text/csv; charset=utf-8','.txt':'text/plain; charset=utf-8','.json':'application/json'}
manifest=read('manifest.json'); source_meta={x['path']:x for x in manifest['source_files']}
for i,item in enumerate(index):
    p=root/item['path']
    if not item['path'].startswith(('private_documents/','private_data/','quality/','config/','private_document_text/')): continue
    key=f'documents/{i:03d}{p.suffix}'
    stage(key,p.read_bytes(),mime.get(p.suffix,'application/octet-stream'))
    textpath=root/item['path'].replace('private_documents/','private_document_text/')
    textpath=textpath.with_suffix('.txt')
    text=(p.read_text(encoding='utf-8-sig') if p.suffix=='.txt' else textpath.read_text() if textpath.exists() else '')
    meta=source_meta.get(item['path'],{})
    documents.append({'id':key,'name':meta.get('source_filename',p.name),'category':meta.get('category',p.parent.name),'path':item['path'],'bytes':item['bytes'],'sha256':item['sha256'],'date':meta.get('packaged_at','2026-10-17'),'status':meta.get('status','Material burimor për shqyrtim'),'text':text})
budget={k:read(f'private_data/market/{k}.json') for k in ['central_budget','municipal_budget','capital_projects','execution_2023']}
budget['supplement']=read('private_data/public_budget/budget_supplement.json');budget['overlays']=[x for x in overlay_matches if x['status']=='budget_note']
stage('data/market.json',{'records':records,'coverage':read('quality/coverage.json')})
stage('data/budget.json',budget)
stage('data/catalogue.json',{**catalogue,'packages':read('private_data/catalogue/human_package_drafts.json')})
stage('data/employers.json',{'records':employers['records']})
stage('data/institutions.json',{'records':read('private_data/partners/HumanPlus_B2B_Partnere_Kosove_2026-10-05_Kualifikuar.json')+read('private_data/partners/HumanPlus_B2B_Partnere_Kosove_2026-10-05_Rezervë.json')})
stage('data/doctors.json',{'records':read('private_data/partners/HumanPlus_50_Mjeke_Kosove_Kontaktet_Kontaktet.json'),'profiles':read('private_data/partners/HumanPlus_50_Mjeke_Kosove_Kontaktet_Profilet.json'),'sources':read('private_data/partners/HumanPlus_50_Mjeke_Kosove_Kontaktet_Burimet.json')})
stage('data/registry.json',{'records':read('private_data/partners/Mjeket_Kosove_Regjistri_OMK_Mjekët.json'),'contacts':read('private_data/partners/Mjeket_Kosove_Regjistri_OMK_Kontaktet.json')})
stage('data/finance.json',{'template':read('private_data/finance/scenario_inputs_template.json'),'inputStatus':read('private_data/finance/input_status.json'),'workbook':workbook})
stage('data/documents.json',{'records':documents})
stage('data/plan.json',{'actions':actions,'documents':[d for d in documents if d['category']=='strategy']})
stage('data/quality.json',{'coverage':read('quality/coverage.json'),'overlays':overlay_matches,'clinical':clinical['metadata'],'package':read('quality/package_qa.json'),'publicQueue':read('public_safe/content_approval_queue.json')})
stage('data/overview.json',{'asOf':'2026-10-17','counts':{'market':3613,'employers':200,'catalogue':1071,'registry':5781,'doctors':50,'institutions':100,'documents':len(documents)},'coverage':read('quality/coverage.json'),'actions':actions,'targets':read('private_data/finance/scenario_inputs_template.json')['owner_targets'],'cashShares':budget['supplement']['health_actual_share']})
# This content-addressed allowlist contains no source rows or contact data.
(app/'lib').mkdir(exist_ok=True)
(app/'lib/import-manifest.json').write_text(json.dumps(objects,indent=2))
receipt={'verifiedFiles':len(index),'datasets':len(datasets),'objects':len(objects),'bytes':sum(x['bytes'] for x in objects.values()),'counts':{'market':len(records),'employers':len(employers['records']),'catalogue':len(catalogue['analyses'])},'overlayGroups':len(overlay_matches),'overlayAffectedRecords':sum(bool(x['overlays']) for x in records),'publicApproved':len(read('public_safe/content_approval_queue.json')['approvedItems'])}
(out/'validation.json').write_text(json.dumps(receipt,indent=2)); print(json.dumps(receipt,indent=2))
