"""Verify the complete private HTML opens on a clean browser with no import or network."""
import os,json,pathlib,re,hashlib,csv
from playwright.sync_api import sync_playwright

ROOT=pathlib.Path(__file__).resolve().parents[2]
PANEL=ROOT/'artifacts/HumanPlus-Presentation-Ready.html'
DATA=ROOT/'private/expanded-objects/data'
checks=[];errors=[];network=[]
with sync_playwright() as p:
 env=dict(os.environ,LD_LIBRARY_PATH='/home/codex/projects/.browser-libs/root/usr/lib/x86_64-linux-gnu:/home/codex/projects/.browser-engines/deps/root/usr/lib/x86_64-linux-gnu')
 browser=p.chromium.launch(executable_path=os.environ['CHROMIUM_PATH'],headless=True,env=env)
 context=browser.new_context(viewport={'width':1500,'height':1000},accept_downloads=True)
 context.route('http://**',lambda r:(network.append(r.request.url),r.abort()))
 context.route('https://**',lambda r:(network.append(r.request.url),r.abort()))
 page=context.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
 def opened():page.get_by_role('heading',name='Prezantimi HumanPlus',exact=True).wait_for(timeout=60000)
 def chapter(name):page.get_by_role('tab',name=name,exact=True).click()
 def navigate(name):
  if page.viewport_size['width']<761:page.get_by_role('button',name='Hap menunë',exact=True).click()
  page.get_by_role('navigation').get_by_role('button',name=name,exact=True).click()
 try:
  page.add_init_script("IDBFactory.prototype.open=function(){throw new DOMException('Unavailable','SecurityError')}")
  page.goto(PANEL.as_uri(),wait_until='load');opened();page.get_by_role('heading',name='Nga njoftimi te evidenca e vendimit',exact=True).wait_for()
  assert not page.get_by_label('Hap paketën private HumanPlus').count()
  assert [int(re.sub(r'\D','',s)) for s in page.locator('.stats .stat strong').all_inner_texts()][:2]==[117,96]
  checks.append('clean file:// open loads all data with IndexedDB unavailable and no package picker')
  page.screenshot(path=str(ROOT/'artifacts/presentation-desktop.png'))
  page.get_by_label('Kategoria e prezantimit',exact=True).select_option('Laborator dhe diagnostikë')
  expected=[r for r in json.loads((DATA/'medical.json').read_text())['notices'] if r['category_sq']=='Laborator dhe diagnostikë']
  assert int(page.locator('.stats .stat strong').first.inner_text())==len(expected)
  with page.expect_download() as dl:page.get_by_role('button',name='Eksporto pamjen',exact=True).click()
  with pathlib.Path(dl.value.path()).open(encoding='utf-8-sig',newline='') as f:export=list(csv.DictReader(f))
  assert {r['notice_id'] for r in export}=={r['notice_id'] for r in expected}
  page.get_by_role('button',name='Shfaq evidencën dhe burimet',exact=True).click();page.locator('tbody .icon-button').first.click();page.get_by_role('button',name='Të gjitha fushat',exact=True).click();assert page.locator('dialog').get_by_text('related evidence',exact=True).count();page.keyboard.press('Escape')
  checks.append('filtered KPI, findings, CSV and procedure evidence reconcile')
  page.get_by_role('button',name='Pastro përzgjedhjen',exact=True).click()
  page.get_by_role('button',name='Nis prezantimin',exact=True).click();assert not page.get_by_role('navigation').is_visible();page.keyboard.press('ArrowRight');assert page.get_by_role('tab',name='Historiku i prokurimit',exact=True).get_attribute('aria-selected')=='true';page.keyboard.press('Escape');assert page.get_by_role('navigation').is_visible()
  chapter('Skenari i drejtimit');assert 'Mungojnë hyrjet' in page.locator('.stats').inner_text()
  for label,value in [('Shërbime në muaj','100'),('Çmimi neto mesatar · EUR','25'),('Kosto variabël për shërbim · EUR','10'),('Kosto fikse mujore · EUR','1001')]:page.get_by_label(label,exact=True).fill(value)
  assert [int(re.sub(r'\D','',s)) for s in page.locator('.stats .stat strong').all_inner_texts()]==[2500,499,15,67]
  page.get_by_role('button',name='Ruaj hyrjet',exact=True).click();page.get_by_text('Hyrjet u ruajtën në këtë pajisje.',exact=True).wait_for()
  with page.expect_download() as dl:page.get_by_role('button',name='Eksporto briefin',exact=True).click()
  brief=json.loads(pathlib.Path(dl.value.path()).read_text());assert brief['scenario']['operating']==499;assert len(brief['sourceFiles'])==218
  page.reload(wait_until='load');opened();chapter('Skenari i drejtimit');assert page.get_by_label('Shërbime në muaj',exact=True).input_value()=='100'
  checks.append('presentation controls, editable scenario, export and saved inputs work after reload')
  for name in ['Pamja mjekësore','Historiku i prokurimit','Ekosistemi','Skenari i drejtimit','Burimet dhe hapat']:
   chapter(name);page.set_viewport_size({'width':320,'height':780});page.wait_for_timeout(300);assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),name
  chapter('Pamja mjekësore');page.screenshot(path=str(ROOT/'artifacts/presentation-mobile.png'));page.set_viewport_size({'width':1500,'height':1000})
  navigate('Lidhjet e të dhënave');page.get_by_text('Të gjitha të dhënat janë përfshirë',exact=True).wait_for();assert page.locator('.connection-card').get_by_text('Lidhur',exact=True).count()==17
  for i,month in enumerate(['2027-01','2027-02']):
   for label,value in [('Muaji i hyrjes direkte',month),('Të ardhurat reale · EUR','1000'),('Kosto variabël reale · EUR','200'),('Kosto fikse reale · EUR','300'),('Referenca e rezultatit mujor','Synthetic QA only')]:page.get_by_label(label,exact=True).fill(value)
   page.get_by_role('button',name='Shqyrto muajin',exact=True).click();page.get_by_role('button',name='Konfirmo importin' if i==0 else 'Konfirmo zëvendësimin',exact=True).click();page.get_by_text(f'{i+1} muaj të importuar',exact=True).wait_for()
  actual=page.evaluate("JSON.parse(localStorage.getItem('humanplus-pages-actuals-v1'))");assert [r['month'] for r in actual['dataset']['records']]==['2027-01','2027-02']
  checks.append('17 datasets connected; manual monthly entry needs no CSV and preserves earlier months')
  navigate('Dokumentet dhe burimet');page.get_by_label('Formati',exact=True).select_option('xlsx');link=page.locator('tbody a[download]').first;name=link.get_attribute('aria-label').removeprefix('Shkarko ')
  doc=next(r for r in json.loads((DATA/'documents.json').read_text())['records'] if r['name']==name)
  with page.expect_download() as dl:link.click()
  assert hashlib.sha256(pathlib.Path(dl.value.path()).read_bytes()).hexdigest()==doc['sha256']
  checks.append('original embedded document download matches source SHA-256')
  assert not errors,errors;assert not network,network
  context.close();context=browser.new_context();page=context.new_page();page.goto(PANEL.as_uri(),wait_until='load');opened();assert not page.get_by_label('Hap paketën private HumanPlus').count();checks.append('another clean browser profile opens preloaded without setup')
  receipt={'checks':checks,'uncaughtErrors':errors,'networkRequests':network,'htmlBytes':PANEL.stat().st_size};(ROOT/'artifacts/presentation-verification.json').write_text(json.dumps(receipt,indent=2));print(json.dumps(receipt),flush=True)
 except Exception:
  page.screenshot(path=str(ROOT/'artifacts/presentation-failure.png'));print('ERRORS',errors,'NETWORK',network,flush=True);raise
 finally:context.close();browser.close()
