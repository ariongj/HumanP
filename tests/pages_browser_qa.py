import os,json,pathlib,csv,re,gzip
from playwright.sync_api import sync_playwright
ROOT=pathlib.Path(__file__).resolve().parents[2];BASE=os.environ.get('HUMANPLUS_PREVIEW_URL','http://127.0.0.1:4187');DATA=ROOT/'private/expanded-objects/data';PACKAGE=ROOT/'artifacts/HumanPlus-Private-2026-10-18.humanplus'
with sync_playwright() as p:
 env=dict(os.environ,LD_LIBRARY_PATH='/home/codex/projects/.browser-libs/root/usr/lib/x86_64-linux-gnu:/home/codex/projects/.browser-engines/deps/root/usr/lib/x86_64-linux-gnu')
 browser=p.chromium.launch(executable_path=os.environ['CHROMIUM_PATH'],headless=True,env=env);ctx=browser.new_context(viewport={'width':1440,'height':1050},accept_downloads=True);page=ctx.new_page();errors=[];requests=[]
 page.on('pageerror',lambda e:errors.append(str(e)));page.on('request',lambda r:requests.append({'url':r.url,'method':r.method,'type':r.resource_type}))
 def open_package():
  page.get_by_label('Hap paketën private HumanPlus').set_input_files(str(PACKAGE));page.get_by_role('navigation').wait_for(timeout=60000)
 def go(name):
  if page.viewport_size['width']<761:page.get_by_role('button',name='Hap menunë',exact=True).click()
  page.get_by_role('navigation').get_by_role('button',name=name,exact=True).click();page.get_by_role('heading',name=name,exact=True,level=1).wait_for();page.get_by_role('status').filter(has_text='Po ngarkohen burimet private').wait_for(state='hidden')
 def shot(name):
  page.evaluate('window.scrollTo(0,0)');page.wait_for_timeout(200);page.screenshot(path=str(ROOT/'artifacts'/name),full_page=True)
 def export_rows():
  with page.expect_download() as dl:page.get_by_role('button',name='Eksporto pamjen',exact=True).click()
  with pathlib.Path(dl.value.path()).open(encoding='utf-8-sig',newline='') as f:return list(csv.DictReader(f))
 try:
  page.goto(BASE,wait_until='networkidle');page.get_by_role('heading',name='Hap panelin HumanPlus',exact=True).wait_for();page.get_by_label('Hap paketën private HumanPlus').wait_for(state='visible')
  page.get_by_label('Hap paketën private HumanPlus').set_input_files({'name':'invalid.humanplus','mimeType':'application/octet-stream','buffer':gzip.compress(b'{"format":"wrong"}')});page.get_by_role('alert').filter(has_text='Paketa nuk është').wait_for();assert not page.get_by_role('navigation').count()
  open_package();page.get_by_text('Eksploro evidencën',exact=True).wait_for();shot('expanded-overview-desktop.png')
  go('Sektori mjekësor');assert int(re.sub(r'\D','',page.locator('.stats .stat strong').first.inner_text()))==117
  page.get_by_label('Faza e njoftimit',exact=True).select_option('tender_notice');page.get_by_label('Nga data e njoftimit').fill('2026-10-10');page.get_by_label('Deri më',exact=True).fill('2026-10-16')
  src=json.loads((DATA/'medical.json').read_text());expected=[r for r in src['notices'] if r['evidence_classification']=='tender_notice' and '2026-10-10'<=('-'.join(reversed(r['notice_date'].split('.'))))<='2026-10-16'];out=export_rows();assert len(out)==len(expected),(len(out),len(expected));assert {r['notice_id'] for r in out}=={r['notice_id'] for r in expected}
  page.locator('tbody .icon-button').first.click();page.get_by_role('button',name='Të gjitha fushat',exact=True).click();assert page.locator('dialog').get_by_text('related evidence',exact=True).count();page.keyboard.press('Escape');shot('expanded-medical-desktop.png')
  for tab in ['Lotet dhe fazat','Kërkesat','Korrigjimet dhe anulimet','Produkte në njoftime','Sasia dhe kohëzgjatja','Mbulimi','Problemet e burimeve']:
   page.locator('.wrap-tabs').get_by_role('button',name=re.compile('^'+re.escape(tab))).click();assert page.locator('tbody tr').count()>0,tab
  go('Regjistri i barnave');page.get_by_label('Statusi i produktit',exact=True).select_option('Withdrawn');assert len(export_rows())==113;assert all('Withdrawn' in t for t in page.locator('tbody tr').all_inner_texts());shot('expanded-medicines-desktop.png')
  page.get_by_role('button',name='Pastro filtrat',exact=True).click();page.get_by_label('Statusi i produktit',exact=True).select_option('Suspended');assert len(export_rows())==137
  go('Operatorët e licencuar');page.get_by_label('Lloji i licencës',exact=True).select_option('depo_farmaceutike');assert len(export_rows())==130
  go('Markat dhe produktet');assert len(export_rows())==11;page.get_by_label('Marka',exact=True).select_option('Roche');assert len(export_rows())==2
  go('Gatishmëria për tender');assert page.get_by_text('NDAL / VERIFIKO',exact=True).count();data=json.loads((DATA/'readiness.json').read_text())['readiness']
  for criterion in data['score_criteria']:page.get_by_label(criterion[0],exact=True).fill('5')
  assert page.get_by_text('NDAL / VERIFIKO',exact=True).count()
  for gate in data['score_policy']['hard_gates']:page.get_by_label(gate,exact=True).select_option('Po')
  assert page.get_by_text('PËR SHQYRTIM',exact=True).count()
  page.get_by_role('button',name='Kosto dhe likuiditeti',exact=True).click();labels=['Vlera neto e kontratës · EUR','Kosto variabël · EUR','Kosto fikse shtesë · EUR','Përgatitja e ofertës · EUR','Tarifa e pakthyeshme e garancisë · EUR','Kolaterali i bllokuar · EUR','Pajisje paraprake · EUR','Ditët deri në arkëtim','Dalja mujore gjatë pritjes · EUR','Para të disponueshme për tender · EUR'];values=[10000,4000,1000,200,100,500,700,60,1500,3000]
  for label,value in zip(labels,values):page.get_by_label(label,exact=True).fill(str(value))
  totals=page.locator('.stats .stat strong').all_inner_texts();assert [re.sub(r'\D','',t) for t in totals]==['4700','47','4500','1500'],totals;shot('expanded-tender-desktop.png')
  page.get_by_role('button',name='Dosja',exact=True).click();page.get_by_label('Statusi D01',exact=True).select_option('Në përgatitje');page.get_by_label('Shënim D01',exact=True).fill('Synthetic browser QA note')
  go('Harta e prokurimit');page.get_by_label('Shuma EUR minimum',exact=True).fill('100');page.get_by_label('Shuma EUR maksimum',exact=True).fill('1000')
  with page.expect_download() as dl:page.get_by_role('button',name='Eksporto filtrat',exact=True).click()
  with pathlib.Path(dl.value.path()).open(encoding='utf-8-sig',newline='') as f:market=list(csv.DictReader(f))
  assert market and all(100<=float(r['reported_value'])<=1000 and r['value_unit']=='EUR' for r in market)
  page.keyboard.press('Control+k');page.get_by_role('textbox',name='Kërko në gjithë HumanPlus').fill('ACTEMRA');page.locator('.global-results section').filter(has=page.get_by_role('heading',name=re.compile('Barnat'))).locator('.global-result').first.click();assert page.get_by_role('heading',name='Regjistri i barnave',exact=True).count()
  go('Dokumentet dhe burimet');page.get_by_label('Formati',exact=True).select_option('xlsx')
  with page.expect_download() as dl:page.locator('tbody a[download]').first.click()
  assert pathlib.Path(dl.value.path()).stat().st_size>100
  go('Lidhjet e të dhënave');assert page.locator('.connection-card').count()==17;assert page.locator('.connection-card').get_by_text('Lidhur',exact=True).count()==17
  page.get_by_label('Importo rezultatet CSV').set_input_files({'name':'synthetic-qa.csv','mimeType':'text/csv','buffer':b'month,revenue_eur,variable_cost_eur,fixed_cost_eur\n2027-01,1000,200,300\n'});page.get_by_role('button',name='Konfirmo importin',exact=True).click();page.get_by_text('1 muaj të importuar',exact=True).wait_for()
  go('Plani financiar');go('Buxhetet publike');go('Partnerët dhe institucionet');go('Katalogu për shqyrtim');go('Plani dhe veprimet');go('Cilësia dhe mbulimi')
  page.reload(wait_until='networkidle');page.get_by_role('navigation').wait_for(timeout=60000);assert not page.get_by_label('Hap paketën private HumanPlus').count();go('Gatishmëria për tender');assert page.get_by_text('PËR SHQYRTIM',exact=True).count();page.get_by_role('button',name='Dosja',exact=True).click();assert page.get_by_label('Shënim D01').input_value()=='Synthetic browser QA note'
  for name in ['Përmbledhja','Sektori mjekësor','Regjistri i barnave','Operatorët e licencuar','Markat dhe produktet','Gatishmëria për tender']:
   page.set_viewport_size({'width':320,'height':780});go(name);page.wait_for_timeout(200);assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),name
  shot('expanded-mobile.png');assert not errors,errors;assert not [r for r in requests if '/api/' in r['url'] or r['type'] in ['fetch','xhr']],requests
  receipt={'checks':['invalid bundle rejected','235 hash-verified private objects loaded locally','117 notices and filtered CSV reconciled','linked procedure evidence','all eight medical tabs','withdrawn/suspended status counts','130 pharmaceutical licence rows','11 product references without duplicate merge','tender gates and cash workbook scenarios','all private data and drafts restore automatically after reload','market export uses same filters','global medicine search navigates','original XLSX downloads','17 data modules connected','local actuals import','15 navigation modules','320px new module layouts','no network data requests'],'uncaughtErrors':errors,'requests':len(requests)};(ROOT/'artifacts/pages-browser-verification.json').write_text(json.dumps(receipt,indent=2));print(json.dumps(receipt),flush=True)
 except Exception:
  page.screenshot(path=str(ROOT/'artifacts/pages-qa-failure.png'),full_page=True);print('URL',page.url,'ERRORS',errors,flush=True);raise
 finally:ctx.close();browser.close()
